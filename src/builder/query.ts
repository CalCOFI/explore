// the Query Builder's SQL (Betty 2026-11-13, after Rasmus Swalethorp: "a gui … that allows you to structure your query from
// the integrated database in a simple user friendly way (think MS Access style) … pull several environmental and biological
// parameters at the same time"). Pure, like sqltpl.ts: the page renders it and engine.ts runs it; tests/builder.sql.test.ts
// runs it in duckdb-wasm's node build against a fixture.
//
// How a table is made:
//   1. every pick becomes its own slice, built by the SAME templates the Explorer uses (sql/slice_bio.sql with its per-net
//      zero-fill, sql/slice_env.sql), so a value here is the value the Explorer shows: CREATE TABLE bld_<i> AS … FROM slice
//   2. each slice is filtered (years, seasons, depth band, datasets, quality, Area, and for species the life stages, units
//      and "no catch = 0") and keyed by the chosen place × time × depth into one long table (col, keys…, v)
//   3. the long table is pivoted: one row per key, one column per pick, each cell the chosen statistic of its values.
//      A cell is blank when that pick has no value for that row (not measured), never 0 — a 0 comes only from the zero-fill.
import { hexExpr, lit, render, type Params } from "../sqltpl";

export type Lens = "station" | "hex" | "region";
export type Place = "station" | "line" | "hex" | "region" | "all";
export type TimeBy = "sample" | "month" | "season" | "year" | "decade" | "all";
export type DepthBy = "avg" | "10";
export type Stat = "avg" | "median" | "min" | "max" | "sum" | "count" | "stddev";
export type Den = "density_per_10m2" | "density_per_1000m3" | "value";

// a pick is one species or measurement FROM ONE DATASET (dataset: its key; tag: the short name its column carries).
// dataset null = every dataset that holds it, pooled (the tests' and the old behaviour)
export interface BioPick { realm: "bio"; taxon: string; label: string; dataset?: string | null; tag?: string | null }
export interface EnvPick { realm: "env"; key: string; label: string; members: string[]; units?: string | null; dataset?: string | null; tag?: string | null }
export type Item = BioPick | EnvPick;

export interface Spec {
  picks: Item[];
  lens: Lens;
  place: Place;              // station | line (Stations), hex (Hexagons), region (Regions), or all = no split by place
  hexRes: number;            // 3..7, Hexagons only
  layer: string | null;      // Regions: the boundary layer (sample_spatial.layer)
  regionNames: string[] | null; // Regions: the regions picked (null = every region of the layer)
  area: string;              // the Region / Stations filter as a predicate (src/area.ts areaSql), "TRUE" = anywhere
  years: [number, number];
  seasons: number[] | null;  // 1 = DJF … 4 = SON; null = all
  depth: [number, number];   // m; a row with no depth bin (a net tow) always passes, as in sql/_filters.sql
  time: TimeBy;
  depthBy: DepthBy;
  stat: Stat;
  stages: string[] | null;   // species: life stages kept; null = all (one column per taxon × stage when more than one)
  den: Den;                  // species: per 10 m², per 1000 m³ or as counted
  zeros: boolean;            // species: a sampled net with no catch counts as 0
  qualOnly: boolean;         // quality-checked values only (qual_ok)
  datasets: string[] | null;
}

export interface Ctx {
  bioSrc: string;            // the registered obs_bio object, quoted
  envSrc: (members: string[]) => string; // a table expression unioning a variable's obs_env objects (with measurement_type)
  spatialSrc: string;        // the registered sample_spatial object, quoted
  cruiseSrc?: Params;        // { cruise_src } when the release's cruise table carries the median month (sqltpl.ts)
  netKey?: string;           // sample_key when obs_bio carries it, else root_id (sql/slice_bio.sql)
}

export const STAT_SQL: Record<Stat, (v: string) => string> = {
  avg: (v) => `avg(${v})`, median: (v) => `median(${v})`, min: (v) => `min(${v})`, max: (v) => `max(${v})`,
  sum: (v) => `sum(${v})`, count: (v) => `count(${v})`, stddev: (v) => `stddev_samp(${v})`,
};
export const STAT_WORD: Record<Stat, string> = {
  avg: "average", median: "median", min: "lowest value", max: "highest value", sum: "total", count: "number of samples", stddev: "spread (standard deviation)",
};
export const DEN_SUFFIX: Record<Den, string> = { density_per_10m2: "per_10m2", density_per_1000m3: "per_1000m3", value: "count" };
const SEASON_CASE = "(CASE quarter WHEN 1 THEN 'Winter' WHEN 2 THEN 'Spring' WHEN 3 THEN 'Summer' WHEN 4 THEN 'Fall' END)";

/** a column name a person and R / Python can both read: "Northern Anchovy" + larva → northern_anchovy_larva */
export const slug = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/σθ/g, "sigma_theta").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "col";

/** the output columns of one pick: one per life stage for a species when several stages are kept */
export function pickColumns(p: Item, spec: Spec): { col: string; stage: string | null }[] {
  const ds = p.tag ? `_${slug(p.tag)}` : "";
  if (p.realm === "env") return [{ col: `${slug(p.label)}${ds}`, stage: null }];
  const st = spec.stages;
  const name = (s: string | null) => `${slug(p.label)}${s ? `_${slug(s)}` : ""}_${DEN_SUFFIX[spec.den]}${ds}`;
  if (!st || st.length <= 1) return [{ col: name(st?.length === 1 ? st[0] : null), stage: null }];
  return st.map((s) => ({ col: name(s), stage: s }));
}

/** the key columns of a row, as they read in the long table (select) and as the pivot groups and orders by them (names) */
export function keys(spec: Spec): { select: string[]; names: string[] } {
  const sel: string[] = [], names: string[] = [];
  const add = (expr: string, name: string) => { sel.push(`${expr} AS ${name}`); names.push(name); };
  switch (spec.time) {
    case "sample": add("CAST(datetime AS DATE)", "date"); add("cruise_key", "cruise"); break;
    case "month": add("year", "year"); add("cruise_month", "month"); break;
    case "season": add("season_year", "year"); add("quarter", "season_n"); break;
    case "year": add("year", "year"); break;
    case "decade": add("(year // 10) * 10", "decade"); break;
    case "all": break;
  }
  switch (spec.place) {
    case "station": add("line", "line"); add("station", "station"); break;
    case "line": add("line", "line"); break;
    case "hex": add(hexExpr(spec.hexRes), "hexagon"); break;
    case "region": add("r.region", "region"); break;
    case "all": break;
  }
  if (spec.depthBy === "10") add("depth_bin", "depth_m");
  return { select: sel, names };
}

/** the WHERE of one pick's slice: the same rules as sql/_filters.sql, with several life stages allowed */
export function pickWhere(spec: Spec, realm: "bio" | "env", stage: string | null, dataset: string | null = null): string {
  const w: string[] = [];
  if (dataset) w.push(`dataset_key = ${lit(dataset)}`);
  if (spec.qualOnly) w.push("qual_ok");
  w.push(`year BETWEEN ${spec.years[0]} AND ${spec.years[1]}`);
  if (spec.seasons?.length && spec.seasons.length < 4) w.push(`quarter IN (${spec.seasons.join(", ")})`);
  w.push(`(depth_bin IS NULL OR depth_bin BETWEEN ${spec.depth[0]} AND ${spec.depth[1]})`);
  if (spec.datasets?.length) w.push(`dataset_key IN (${spec.datasets.map(lit).join(", ")})`);
  if (spec.area && spec.area !== "TRUE") w.push(spec.area);
  // Stations: only samples taken on the station grid. Hexagons: every sample that has a cell. Regions: the join decides.
  if (spec.lens === "station") w.push("grid_key IS NOT NULL");
  if (spec.place === "hex") w.push("hex7 IS NOT NULL");
  if (realm === "bio") {
    if (!spec.zeros) w.push("obs_id IS NOT NULL");
    if (stage) w.push(`life_stage = ${lit(stage)}`);
    else if (spec.stages?.length) w.push(`life_stage IN (${spec.stages.map(lit).join(", ")})`);
    w.push(`${spec.den} IS NOT NULL`);
  } else w.push("value IS NOT NULL");
  return w.join("\n    AND ");
}

/** the statements that build one pick's slice into bld_<i> (run in order) */
export function sliceSql(p: Item, i: number, ctx: Ctx): string[] {
  const make = p.realm === "bio"
    ? render("slice_bio", { src: ctx.bioSrc, taxon: p.taxon, net_key: ctx.netKey ?? "root_id", ...(ctx.cruiseSrc ?? {}) })
    : render("slice_env", { src: ctx.envSrc(p.members), ...(ctx.cruiseSrc ?? {}) });
  return [make, `CREATE OR REPLACE TABLE bld_${i} AS SELECT * FROM slice`];
}

/** the long table: one row per value, tagged with its output column */
export function longSql(spec: Spec, ctx: Ctx): string {
  const k = keys(spec);
  const join = spec.place === "region" || spec.lens === "region"
    ? ` JOIN (SELECT root_id, spatial_name AS region FROM ${ctx.spatialSrc} WHERE layer = ${lit(spec.layer ?? "")}${spec.regionNames?.length ? ` AND spatial_name IN (${spec.regionNames.map(lit).join(", ")})` : ""}) r USING (root_id)`
    : "";
  const parts = spec.picks.flatMap((p, i) => pickColumns(p, spec).map(({ col, stage }) => {
    const v = p.realm === "bio" ? spec.den : "value";
    return `SELECT ${[...k.select, `${lit(col)} AS col`, `${v} AS v`].join(", ")}\n  FROM bld_${i}${join}\n  WHERE ${pickWhere(spec, p.realm, stage, p.dataset ?? null)}`;
  }));
  return `CREATE OR REPLACE TABLE bld_long AS\n${parts.join("\nUNION ALL\n")}`;
}

/** the pivot: one row per key, one column per pick */
export function pivotSql(spec: Spec): string {
  const k = keys(spec);
  const cols = spec.picks.flatMap((p) => pickColumns(p, spec).map((c) => c.col));
  const agg = cols.map((c) => `${STAT_SQL[spec.stat]("v")} FILTER (WHERE col = ${lit(c)}) AS "${c}"`);
  const head = k.names.map((n) => n === "season_n" ? `${SEASON_CASE.replace(/quarter/g, "season_n")} AS season` : n);
  const layer = spec.place === "region" ? [`${lit(spec.layer ?? "")} AS layer`] : [];
  const sel = [...layer, ...head, ...agg].join(",\n       ");
  const by = k.names.length ? `\nGROUP BY ${k.names.join(", ")}\nORDER BY ${k.names.join(", ")}` : "";
  return `SELECT ${sel}\nFROM bld_long${by}`;
}

/** every statement, in order; the last one returns the table */
export function builderSql(spec: Spec, ctx: Ctx): string[] {
  if (!spec.picks.length) throw new Error("pick at least one column");
  return [...spec.picks.flatMap((p, i) => sliceSql(p, i, ctx)), longSql(spec, ctx), pivotSql(spec)];
}

/** the plain-English sentence under the controls */
export function sentence(spec: Pick<Spec, "lens" | "place" | "time" | "depthBy" | "stat">, raw: boolean): string {
  if (raw) return "Each row is one sample, as measured. Nothing is combined.";
  const PW: Record<Place, string> = { station: "one station", line: "one CalCOFI line", hex: "one hexagon", region: "one region", all: spec.lens === "station" ? "all stations together" : spec.lens === "hex" ? "all hexagons together" : "all regions together" };
  const TW: Record<TimeBy, string> = { sample: "each time it was sampled", month: "per month", season: "per season", year: "per year", decade: "per decade", all: "across all years" };
  const DW: Record<DepthBy, string> = { avg: "over the whole depth range", "10": "for each 10 m of depth" };
  return `Each row shows the ${STAT_WORD[spec.stat]} of all samples for ${PW[spec.place]}, ${TW[spec.time]}, ${DW[spec.depthBy]}.`;
}
