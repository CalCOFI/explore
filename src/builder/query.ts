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
//
// The matching rule this implements is said to the reader by ruleLines() (the page's "How rows are matched" and the
// download's notes). It is an OPEN DECISION (Ben, Betty, Erin, Mark; the "CalCOFI Dataset Finder Overview" thread,
// 2026-11-10): change the rule here and ruleLines() in the same commit, with its test.
//
// Units and life stages are per pick (2026-11-17): the page's one "Species units" and "Life stage" choice cannot hold for
// every dataset — only the ichthyoplankton and euphausiid tows carry per 10 m², birds and phytoplankton carry no life
// stage — and a pick the choice does not fit used to come out as a blank column with no word why. probeSql() asks each
// built slice what its dataset holds; resolvePick() keeps the reader's choice where it holds and otherwise falls back
// (per 10 m² → per 1000 m³ → as counted; no stage filter for a dataset with no stages), naming the column for what it
// is and returning a note for the page.
import { hexExpr, lit, render, type Params } from "../sqltpl";

export type Lens = "station" | "hex" | "region";
export type Place = "station" | "line" | "hex" | "region" | "all";
export type TimeBy = "sample" | "month" | "season" | "year" | "decade" | "all";
export type DepthBy = "avg" | "10";
export type Stat = "avg" | "median" | "min" | "max" | "sum" | "count" | "stddev";
export type Den = "density_per_10m2" | "density_per_1000m3" | "value";

// a pick is one species or measurement FROM ONE DATASET (dataset: its key; tag: the short name its column carries).
// dataset null = every dataset that holds it, pooled (the tests' and the old behaviour)
// den / stages: this pick's own unit and life stages once resolvePick() has looked at its slice (undefined = the page's choice;
// stages null = the dataset records no life stage, so none is filtered or named)
export interface BioPick { realm: "bio"; taxon: string; label: string; dataset?: string | null; tag?: string | null; den?: Den; stages?: string[] | null; units?: string | null }
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
  stagesStrict?: boolean;    // the reader set the life stages (not the page's default): a pick with none of them stays blank
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
  // count() counts VALUES (every 10 m value of every cast, every net × life stage), so it does not say "samples"
  avg: "average", median: "median", min: "lowest value", max: "highest value", sum: "total", count: "number of values", stddev: "spread (standard deviation)",
};
export const DEN_SUFFIX: Record<Den, string> = { density_per_10m2: "per_10m2", density_per_1000m3: "per_1000m3", value: "count" };
const SEASON_CASE = "(CASE quarter WHEN 1 THEN 'Winter' WHEN 2 THEN 'Spring' WHEN 3 THEN 'Summer' WHEN 4 THEN 'Fall' END)";

/** a column name a person and R / Python can both read: "Northern Anchovy" + larva → northern_anchovy_larva */
export const slug = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/σθ/g, "sigma_theta").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "col";

/** the output columns of one pick: one per life stage for a species when several stages are kept */
export const pickDen = (p: BioPick, spec: Spec): Den => p.den ?? spec.den;
export const pickStages = (p: BioPick, spec: Spec): string[] | null => p.stages !== undefined ? p.stages : spec.stages;
/** two picks that would be named alike (two taxa of one dataset under one common name: the release has 11 such pairs, e.g.
 *  two "Octopus" in the ichthyoplankton tows) each carry their own key in the column name; alike names made ONE column
 *  holding both taxa's values */
const pickId = (p: Item) => `${p.realm}|${p.dataset ?? ""}|${p.realm === "bio" ? p.taxon : p.key}`;
const sameName = (a: Item, b: Item) => a.realm === b.realm && slug(a.label) === slug(b.label) && (a.tag ?? "") === (b.tag ?? "");
export function pickColumns(p: Item, spec: Spec): { col: string; stage: string | null }[] {
  const twin = spec.picks.some((o) => pickId(o) !== pickId(p) && sameName(o, p));
  const ds = `${p.tag ? `_${slug(p.tag)}` : ""}${twin ? `_${slug(p.realm === "bio" ? p.taxon : p.key)}` : ""}`;
  if (p.realm === "env") return [{ col: `${slug(p.label)}${ds}`, stage: null }];
  const st = pickStages(p, spec);
  const name = (s: string | null) => `${slug(p.label)}${s ? `_${slug(s)}` : ""}_${DEN_SUFFIX[pickDen(p, spec)]}${ds}`;
  if (!st || st.length <= 1) return [{ col: name(st?.length === 1 ? st[0] : null), stage: null }];
  return st.map((s) => ({ col: name(s), stage: s }));
}

/** the key columns of a row, as they read in the long table (select) and as the pivot groups and orders by them (names) */
export function keys(spec: Spec): { select: string[]; names: string[] } {
  const sel: string[] = [], names: string[] = [];
  const add = (expr: string, name: string) => { sel.push(`${expr} AS ${name}`); names.push(name); };
  switch (spec.time) {
    // the date as text (1960-03-10): a DATE reaches the page as a number of milliseconds, and the CSV and the preview printed
    // it so (1554163200000); text sorts the same and reads in a spreadsheet, R and Python alike
    case "sample": add("strftime(CAST(datetime AS DATE), '%Y-%m-%d')", "date"); add("cruise_key", "cruise"); break;
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

/** the depth band on one pick's slice. Water: the 10 m bins d0 … d1 (sql/_filters.sql). Species: the same, OR the sample's
 *  own depth range overlaps the band — in the release a net tow's depth_bin is 0 (the bin of its upper end), not NULL, so
 *  the bin test alone dropped every tow as soon as the band started below 10 m and the species column went blank
 *  (2026-11-17: sardine larvae beside temperature at 50–100 m). A depth-resolved organism sample (eDNA, picoplankton,
 *  taken from a bottle) has depth_min_m = depth_max_m and so passes exactly when its depth is in the band. */
export function depthWhere(spec: Spec, realm: "bio" | "env"): string {
  const [d0, d1] = spec.depth;
  const bin = `depth_bin IS NULL OR depth_bin BETWEEN ${d0} AND ${d1}`;
  return realm === "env" ? `(${bin})` : `(${bin} OR (depth_min_m < ${d1 + 10} AND depth_max_m >= ${d0}))`;
}

/** the WHERE of one pick's slice: the same rules as sql/_filters.sql, with several life stages allowed */
export function pickWhere(spec: Spec, p: Item, stage: string | null): string {
  const w: string[] = [];
  if (p.dataset) w.push(`dataset_key = ${lit(p.dataset)}`);
  if (spec.qualOnly) w.push("qual_ok");
  w.push(`year BETWEEN ${spec.years[0]} AND ${spec.years[1]}`);
  if (spec.seasons?.length && spec.seasons.length < 4) w.push(`quarter IN (${spec.seasons.join(", ")})`);
  w.push(depthWhere(spec, p.realm));
  if (spec.datasets?.length) w.push(`dataset_key IN (${spec.datasets.map(lit).join(", ")})`);
  if (spec.area && spec.area !== "TRUE") w.push(spec.area);
  // Stations: only samples taken on the station grid. Hexagons: every sample that has a cell. Regions: the join decides.
  if (spec.lens === "station") w.push("grid_key IS NOT NULL");
  if (spec.place === "hex") w.push("hex7 IS NOT NULL");
  if (p.realm === "bio") {
    const st = pickStages(p, spec);
    if (!spec.zeros) w.push("obs_id IS NOT NULL");
    if (stage) w.push(`life_stage = ${lit(stage)}`);
    else if (st?.length) w.push(`life_stage IN (${st.map(lit).join(", ")})`);
    w.push(`${pickDen(p, spec)} IS NOT NULL`);
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
    const v = p.realm === "bio" ? pickDen(p, spec) : "value";
    return `SELECT ${[...k.select, `${lit(col)} AS col`, `${v} AS v`].join(", ")}\n  FROM bld_${i}${join}\n  WHERE ${pickWhere(spec, p, stage)}`;
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

/** how many picks one table takes. Each pick is its own slice in the browser's memory (for a species, every net of its
 *  dataset, zero-filled: ~50,000 rows), so "Select all" over the 1,600 species of a release cannot be built; the page says
 *  so before it tries, instead of the tab running out of memory. */
export const MAX_PICKS = 40;
export const tooMany = (n: number): string | null => n > MAX_PICKS ? `${n.toLocaleString("en-US")} columns are selected; one table takes up to ${MAX_PICKS}. Untick some, or download the whole dataset from its page.` : null;
/** the tables one build leaves behind, dropped once its rows are read (bld_0 … bld_n-1, bld_long and the last slice) */
export const cleanupSql = (n: number): string[] => [...Array.from({ length: n }, (_, i) => `DROP TABLE IF EXISTS bld_${i}`), "DROP TABLE IF EXISTS bld_long", "DROP TABLE IF EXISTS slice"];

/** every statement, in order; the last one returns the table */
export function builderSql(spec: Spec, ctx: Ctx): string[] {
  if (!spec.picks.length) throw new Error("pick at least one column");
  if (spec.picks.length > MAX_PICKS) throw new Error(tooMany(spec.picks.length)!);
  return [...slicesSql(spec, ctx), ...tableSql(spec, ctx)];
}
/** the two halves of builderSql(): the page builds the slices, asks each what it holds (probeSql → resolveSpec), then
 *  shapes the table from the RESOLVED spec, so no column is blank for want of a unit its dataset never carried */
export const slicesSql = (spec: Spec, ctx: Ctx): string[] => spec.picks.flatMap((p, i) => sliceSql(p, i, ctx));
export const tableSql = (spec: Spec, ctx: Ctx): string[] => [longSql(spec, ctx), pivotSql(spec)];

/** what one pick's built slice holds, per life stage: its records (zero-fill rows are not records), how many of them each
 *  denominator can serve, and the units the release states. One row per life stage (NULL = the dataset records none). */
export interface PickFacts { stage: string | null; n: number; n_10m2: number; n_1000m3: number; units: string | null }
export function probeSql(p: Item, i: number): string {
  const ds = p.dataset ? ` AND dataset_key = ${lit(p.dataset)}` : "";
  return `SELECT life_stage AS stage, count(*) AS n, count(density_per_10m2) AS n_10m2, count(density_per_1000m3) AS n_1000m3, any_value(units) AS units
FROM bld_${i} WHERE obs_id IS NOT NULL${ds} GROUP BY life_stage ORDER BY n DESC`;
}
const DEN_WORD: Record<Den, string> = { density_per_10m2: "per 10 m² of sea surface", density_per_1000m3: "per 1000 m³ of water", value: "as counted" };
const pickName = (p: Item) => `${p.label}${p.tag ? ` (${p.tag})` : ""}`;

/** one pick, with the unit and life stages its dataset can serve. The reader's choice stands wherever the dataset holds it:
 *   · units: the chosen one if any record of the kept stages carries it, else per 10 m², else per 1000 m³, else as counted
 *     (the Explorer's defaultDen() order, src/state.ts) — the column name's suffix says which
 *   · life stage: a dataset that records none (birds, phytoplankton, ZooScan …) is not filtered by stage and its column
 *     names none; a dataset that records stages keeps those of the chosen ones it has. If it has none of them: while the
 *     choice is still the page's default (larva) the pick is given at its most-recorded stage (CUFES eggs, krill adults),
 *     named in the column; once the reader has set the stages (spec.stagesStrict) the column stays as chosen — blank —
 *     and the note names the stages the dataset does record
 *  `notes` are sentences for the page; an empty slice (nothing in the release for this pick) says so too. */
export function resolvePick(p: Item, spec: Spec, facts: PickFacts[]): { pick: Item; notes: string[] } {
  const rows = facts.filter((f) => Number(f.n) > 0), units = rows[0]?.units ?? null;
  if (!rows.length) return { pick: p, notes: [`${pickName(p)}: the release holds no records for it.`] };
  if (p.realm === "env") return { pick: { ...p, units: p.units ?? units }, notes: [] };
  const notes: string[] = [];
  const have = rows.map((f) => f.stage).filter((x): x is string => x != null);
  let stages: string[] | null | undefined = undefined, kept = rows;
  if (!have.length) stages = null;
  else if (spec.stages?.length) {
    const hit = spec.stages.filter((x) => have.includes(x));
    if (!hit.length && spec.stagesStrict) { kept = []; notes.push(`${pickName(p)}: no ${spec.stages.join(" or ")} records, so its column is blank. This dataset records it as ${have.join(", ")}; tick that under More options › Life stage.`); }
    else if (!hit.length) {
      const top = rows.find((f) => f.stage != null)!.stage!;   // facts come most-recorded first (probeSql)
      stages = [top]; kept = rows.filter((f) => f.stage === top);
      notes.push(`${pickName(p)} is given as ${top}: this dataset has no ${spec.stages.join(" or ")} records of it${have.length > 1 ? ` (it records ${have.join(", ")}; choose under More options › Life stage)` : ""}.`);
    }
    else { kept = rows.filter((f) => f.stage != null && hit.includes(f.stage)); if (hit.length < spec.stages.length) stages = hit; }
  }
  const n = (k: "n_10m2" | "n_1000m3") => kept.reduce((a, f) => a + Number(f[k] ?? 0), 0);
  const can: Record<Den, boolean> = { density_per_10m2: n("n_10m2") > 0, density_per_1000m3: n("n_1000m3") > 0, value: true };
  let den: Den = spec.den;
  if (kept.length && !can[den]) {
    den = can.density_per_10m2 ? "density_per_10m2" : can.density_per_1000m3 ? "density_per_1000m3" : "value";
    notes.push(`${pickName(p)} is given ${DEN_WORD[den]}${den === "value" && units ? ` (${units})` : ""}: this dataset has no values ${DEN_WORD[spec.den]}.`);
  }
  const out: BioPick = { ...p, units, ...(den !== spec.den ? { den } : {}), ...(stages !== undefined ? { stages } : {}) };
  return { pick: out, notes };
}
/** the spec with every pick resolved against its slice's facts (facts[i] = the rows of probeSql(picks[i], i)) */
export function resolveSpec(spec: Spec, facts: PickFacts[][]): { spec: Spec; notes: string[] } {
  const r = spec.picks.map((p, i) => resolvePick(p, spec, facts[i] ?? []));
  return { spec: { ...spec, picks: r.map((x) => x.pick) }, notes: r.flatMap((x) => x.notes) };
}

/** the plain-English sentence under the controls */
export function sentence(spec: Pick<Spec, "lens" | "place" | "time" | "depthBy" | "stat">, raw: boolean): string {
  // "every sample, as measured" is still a table keyed by station × date × 10 m step: several nets of one station visit, or
  // two casts on one date, share a row and are averaged — so it never said "nothing is combined" truthfully
  if (raw) return `Each row is one station on one sampling date at one 10 m depth step. Where several values share it, the row shows their ${STAT_WORD[spec.stat]}.`;
  const PW: Record<Place, string> = { station: "one station", line: "one CalCOFI line", hex: "one hexagon", region: "one region", all: spec.lens === "station" ? "all stations together" : spec.lens === "hex" ? "all hexagons together" : "all regions together" };
  const TW: Record<TimeBy, string> = { sample: "each time it was sampled", month: "per month", season: "per season", year: "per year", decade: "per decade", all: "across all years" };
  const DW: Record<DepthBy, string> = { avg: "over the whole depth range", "10": "for each 10 m of depth" };
  return `Each row shows the ${STAT_WORD[spec.stat]} of all samples for ${PW[spec.place]}, ${TW[spec.time]}, ${DW[spec.depthBy]}.`;
}

/** HOW ROWS ARE MATCHED, as this file's SQL does it — the page's fold of that name and the notes saved beside a download.
 *  A combined table needs an explicit matching rule (Ben to Ed Weber, 2026-11-10); which rule is still open, so this says
 *  the one in force rather than leaving the reader to assume net-to-cast pairing. Keep it in step with keys(), pickWhere()
 *  and pivotSql(): tests/builder.rule.test.ts pins each line to the spec that produces it. */
export function ruleLines(spec: Pick<Spec, "lens" | "place" | "time" | "depthBy" | "stat" | "depth" | "zeros">): string[] {
  const TK: Record<TimeBy, string | null> = { sample: "sampling date and cruise", month: "year and month", season: "year and season", year: "year", decade: "decade", all: null };
  const PK: Record<Place, string | null> = { station: "station (line and station number)", line: "CalCOFI line", hex: "hexagon", region: "region", all: null };
  const ks = [PK[spec.place], TK[spec.time], spec.depthBy === "10" ? "10 m depth step" : null].filter((x): x is string => !!x);
  const out = [ks.length ? `One row for each ${ks.join(" × ")} that any column has a sample for.` : "One row: every sample that passes the filters, together."];
  out.push(`Each column is one species or measurement from one dataset. A cell is the ${STAT_WORD[spec.stat]} of that column's values in the row; values are not averaged per net or per cast first.`);
  const T: Record<TimeBy, string> = {
    sample: "Species and water values share a row when their samples have the same cruise, station and calendar date. The date is in UTC, so a net and a cast of one station visit made either side of 00:00 UTC (4 or 5 pm Pacific) fall on two rows.",
    month: "Species and water values share a row when their cruises fall in the same year and month. A net and a cast are not paired one to one.",
    season: "Species and water values share a row when their cruises fall in the same season of the same year. A net and a cast are not paired one to one.",
    year: "Species and water values share a row when they were sampled in the same year, not necessarily on the same cruise or day: a spring net and a fall cast can sit side by side.",
    decade: "Species and water values share a row when they were sampled in the same decade, not on the same cruise or day.",
    all: "All years are pooled: a column's value can come from different years than its neighbour's.",
  };
  out.push(T[spec.time]);
  if (spec.place === "station" || spec.place === "line") out.push("A species sample is placed at its grid cell's line and station, a water sample at the station it was taken at. Where one cell holds several stations, and on the coarse historical cells, the two can fall on different rows.");
  else if (spec.place === "region" || spec.lens === "region") out.push(`A sample counts in every region of the layer it falls inside${spec.place === "all" ? ", so a sample inside two overlapping regions counts twice" : ""}.`);
  out.push(spec.depthBy === "10"
    ? `Water values are per 10 m depth step, for the steps that start between ${spec.depth[0]} and ${spec.depth[1]} m (depth_m is the top of the step). A net tow is one value for the whole depth it fished and sits on the depth_m = 0 row.`
    : `Water values are pooled over the 10 m depth steps that start between ${spec.depth[0]} and ${spec.depth[1]} m (so down to ${spec.depth[1] + 10} m); every value of every cast counts once, so a deep cast weighs more than a shallow one. A net tow is one value for the whole depth it fished, kept when that reaches into this range.`);
  out.push(spec.zeros
    ? "A blank cell means that column has no sample in the row. A 0 means a net was sorted for that life stage and held none of the species (filled in only for datasets that record catches alone); it is never a missing value."
    : "A blank cell means that column has no sample in the row, or a net with no catch: nets with no catch are left out.");
  return out;
}

/** the notes saved beside a download ("About this table"): what each column is, which rows were kept, how rows are
 *  matched, what changed for some columns, and how to cite. Plain text; the caller supplies the words only it knows. */
export interface AboutCol { col: string; what: string }
export function aboutColumns(spec: Spec): AboutCol[] {
  const TK: Record<TimeBy, [string, string][]> = {
    sample: [["date", "the sample's calendar date, UTC"], ["cruise", "the cruise (YYYY-MM-ship)"]], month: [["year", "the cruise's year"], ["month", "the cruise's month (its median cast month)"]],
    season: [["year", "the season's year (December counts toward the next winter)"], ["season", "Winter (Dec–Feb), Spring (Mar–May), Summer (Jun–Aug) or Fall (Sep–Nov)"]], year: [["year", "the cruise's year"]], decade: [["decade", "the decade's first year"]], all: [],
  };
  const PK: Record<Place, [string, string][]> = {
    station: [["line", "CalCOFI line"], ["station", "CalCOFI station number on the line"]], line: [["line", "CalCOFI line"]],
    hex: [["hexagon", `H3 cell id, resolution ${spec.hexRes}`]], region: [["layer", "the boundary layer"], ["region", "the region's name"]], all: [],
  };
  const keyCols = [...(spec.place === "region" ? [PK.region[0]] : []), ...TK[spec.time], ...(spec.place === "region" ? [PK.region[1]] : PK[spec.place]), ...(spec.depthBy === "10" ? [["depth_m", "top of the 10 m depth step, m"] as [string, string]] : [])];
  const cols: AboutCol[] = keyCols.map(([col, what]) => ({ col, what }));
  for (const p of spec.picks) for (const { col, stage } of pickColumns(p, spec)) {
    const from = p.dataset ? `dataset ${p.dataset}${p.tag && p.tag !== p.dataset ? ` (${p.tag})` : ""}` : "every dataset that holds it, pooled";
    if (p.realm === "env") { cols.push({ col, what: `${p.label}${p.units ? `, ${p.units}` : ""}; ${from}` }); continue; }
    const st = stage ?? (pickStages(p, spec)?.length === 1 ? pickStages(p, spec)![0] : null), den = pickDen(p, spec);
    const stWord = st ?? (pickStages(p, spec) === null ? null : pickStages(p, spec)?.length ? pickStages(p, spec)!.join(" + ") : "all life stages");
    cols.push({ col, what: `${p.label}${stWord ? `, ${stWord}` : ""}, ${den === "value" ? `as counted${p.units ? ` (${p.units})` : ""}` : DEN_WORD[den]}; ${from}` });
  }
  return cols;
}
export function aboutText(a: { version: string; when: string; url: string; spec: Spec; kept: string[]; notes: string[]; cite: string[] }): string {
  const cols = aboutColumns(a.spec), w = Math.min(64, Math.max(...cols.map((c) => c.col.length)));
  const sec = (title: string, lines: string[]) => lines.length ? `${title}\n${lines.map((l) => `  ${l}`).join("\n")}\n` : "";
  return [
    `CalCOFI Query Builder: about this table\nRelease ${a.version}, made ${a.when}\n${a.url}\n`,
    sec("Columns", cols.map((c) => `${c.col.padEnd(w)}  ${c.what}`)),
    sec("Rows kept", a.kept),
    sec("How rows are matched", ruleLines(a.spec).map((l) => `- ${l}`)),
    sec("Notes on some columns", a.notes.map((l) => `- ${l}`)),
    sec("How to cite", a.cite),
  ].filter(Boolean).join("\n");
}
