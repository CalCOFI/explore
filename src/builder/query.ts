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
// download's notes): change the rule here and ruleLines() in the same commit, with its test.
//
// EVERY SAMPLE, WITH SPECIES (Ben, 2026-11-17: "We need a time, xy distance, z depth filter for matching, and preference
// for matching by time vs distance, and the calculation included in each row"). Under Stations › Every sample a table
// that holds a species is ONE ROW PER NET (netRows), and each water dataset gives that row the values of ONE cast: the
// best cast inside a time window and a distance window, measured on the samples' own times and positions, never on
// station labels or calendar dates (netSql). The row carries the calculation: which cast, how many hours and km from the
// net, and the depths its value is taken over (matchColumns). Steps 2 and 3 above then do not apply: nothing is keyed
// by station × date and no water value is a mean over several casts. Every other shape (yearly, seasonal, monthly, the
// Hexagons and Regions lenses, and Every sample with no species) keeps the aggregate rule, and says it does not pair.
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
export type Prefer = "time" | "distance";
/** how a net is paired with a cast: inside both windows, the nearest in `prefer` (the other breaks a tie) */
export interface Match { hours: number; km: number; prefer: Prefer }
/** the defaults, chosen on release v2026.11.14 (README § Query Builder › How a net is matched has the numbers): a station
 *  visit's bottle cast is a median 0.4 km and 1.0 h from its ichthyoplankton net, and 98% of the casts taken are within
 *  2 km. 5 km keeps the visits whose two positions were logged a few km apart; only 15 of 262 stations have another
 *  station that close. 12 h holds the visit's own cast even on the CTD cruises of 1993–2007 whose cast times sit 8–9 h
 *  from the net's (a 6 h window loses 6,216 of 15,711 CTD pairs), and a ship is rarely back on a station within 12 h.
 *  Nearest in time, as Ben asked. */
export const MATCH_DEFAULT: Match = { hours: 12, km: 5, prefer: "time" };
/** the depth range of the water value beside a net until the reader sets one: the first 10 m step, 0 to 10 m */
export const MATCH_DEPTH: [number, number] = [0, 10];

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
  match?: Match;             // Every sample with species (netRows): the windows and the preference; absent = MATCH_DEFAULT
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

/** the 10 m depth steps a range takes: those that START at d0 or deeper and before d1 — so "0 to 10 m" is one step, the
 *  first (bottles at 0–9 m, the CTD's 0–10 m value), and "0 to 500 m" is the fifty steps down to 500 m. Until 2026-11-17
 *  the last step was included as well (depth_bin BETWEEN d0 AND d1, the Explorer's convention), so "0 to 10 m" pooled
 *  0–20 m and the page had to say "so down to 20 m". A range no wider than a step (d1 <= d0) is the step that starts at d0. */
export const depthTo = (spec: Pick<Spec, "depth">): number => Math.max(spec.depth[1], spec.depth[0] + 10);
export const stepsIn = (spec: Pick<Spec, "depth">): number => Math.max(1, Math.ceil((depthTo(spec) - spec.depth[0]) / 10));
export const binWhere = (spec: Pick<Spec, "depth">): string => `(depth_bin IS NULL OR (depth_bin >= ${spec.depth[0]} AND depth_bin < ${depthTo(spec)}))`;
/** the same range in words: "the 10 m depth step from 0 to 10 m", "the 10 m depth steps from 0 to 500 m" */
export const stepsWord = (spec: Pick<Spec, "depth">): string => `the 10 m depth step${stepsIn(spec) === 1 ? "" : "s"} from ${spec.depth[0]} to ${depthTo(spec)} m`;

/** the depth band on one pick's slice. Water: the 10 m steps of the range (binWhere). Species: the same, OR the sample's
 *  own depth range overlaps the band — in the release a net tow's depth_bin is 0 (the bin of its upper end), not NULL, so
 *  the bin test alone dropped every tow as soon as the band started below 10 m and the species column went blank
 *  (2026-11-17: sardine larvae beside temperature at 50–100 m). A depth-resolved organism sample (eDNA, picoplankton,
 *  taken from a bottle) has depth_min_m = depth_max_m and so passes exactly when its depth is in the band. */
export function depthWhere(spec: Spec, realm: "bio" | "env"): string {
  const d0 = spec.depth[0], hi = depthTo(spec);
  return realm === "env" ? binWhere(spec) : `(${binWhere(spec).slice(1, -1)} OR (depth_min_m < ${hi} AND depth_max_m >= ${d0}))`;
}

/** the WHERE of one pick's slice: the same rules as sql/_filters.sql, with several life stages allowed */
export function pickWhere(spec: Spec, p: Item, stage: string | null, withDepth = true): string {
  const w: string[] = [];
  if (p.dataset) w.push(`dataset_key = ${lit(p.dataset)}`);
  if (spec.qualOnly) w.push("qual_ok");
  w.push(`year BETWEEN ${spec.years[0]} AND ${spec.years[1]}`);
  if (spec.seasons?.length && spec.seasons.length < 4) w.push(`quarter IN (${spec.seasons.join(", ")})`);
  // withDepth false: the per-net table (netSql) — the range is the WATER value's (applied cast by cast there), and a net
  // is one value for the whole depth it fished, so it is not filtered by it
  if (withDepth) w.push(depthWhere(spec, p.realm));
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

// ---- every sample, with species: one row per net, each water dataset's one best cast beside it ----

const isBio = (p: Item): p is BioPick => p.realm === "bio";
type Shape = Pick<Spec, "lens" | "place" | "time"> & { picks?: Item[]; match?: Match };
/** the table is one row per net: Stations, per station, every sample, with at least one species picked. (Every sample
 *  with water alone stays one row per station × date × 10 m step: its rows are the casts' values, as before.) */
export const netRows = (spec: Shape): boolean => spec.lens === "station" && spec.place === "station" && spec.time === "sample" && !!spec.picks?.some(isBio);
/** the widest windows a table takes: beyond them every net is compared with thousands of casts, and nothing is a "match" */
export const MATCH_MAX = { hours: 240, km: 500 };
/** the windows and the preference in force: the spec's where they are usable numbers, else the defaults */
export function matchOf(spec: { match?: Match }): Match {
  const m = spec.match ?? MATCH_DEFAULT, num = (v: number, d: number, hi: number) => Number.isFinite(v) && v > 0 ? Math.min(v, hi) : d;
  return { hours: num(m.hours, MATCH_DEFAULT.hours, MATCH_MAX.hours), km: num(m.km, MATCH_DEFAULT.km, MATCH_MAX.km), prefer: m.prefer === "distance" ? "distance" : "time" };
}

/** the water datasets of a table, in the order first picked: each is matched to the nets on its own, and its
 *  measurements all come from the one cast it is given. `sfx` ends its columns (_bottle), as it ends its measurements'. */
export interface Water { g: number; dataset: string | null; name: string; sfx: string; picks: { p: EnvPick; i: number }[] }
export function waters(picks: Item[]): Water[] {
  const out: Water[] = [];
  picks.forEach((p, i) => {
    if (p.realm !== "env") return;
    let w = out.find((x) => (x.dataset ?? "") === (p.dataset ?? ""));
    if (!w) out.push(w = { g: out.length, dataset: p.dataset ?? null, name: p.tag ?? p.dataset ?? "water", sfx: p.tag ? `_${slug(p.tag)}` : p.dataset ? `_${slug(p.dataset)}` : "", picks: [] });
    w.picks.push({ p, i });
  });
  // two datasets under one short name: their number keeps the two sets of columns apart
  for (const w of out) if (out.some((o) => o !== w && o.sfx === w.sfx)) w.sfx += `_${w.g + 1}`;
  return out;
}
/** THE CALCULATION IN EACH ROW: the columns that say which cast a water dataset's values came from and how far it was
 *  from the net. One set per water dataset (not per measurement: its measurements share the cast). `expr` reads the
 *  matched cast's row (alias m). */
export const MATCH_COLS: { stem: string; expr: string; what: string }[] = [
  { stem: "cast_id", expr: "m.cast_id", what: "the cast matched to this net: its id in the release (blank = no cast inside the windows)" },
  { stem: "cast_time", expr: "strftime(m.t, '%Y-%m-%d %H:%M')", what: "that cast's time, UTC (of its first value in the depth range)" },
  { stem: "cast_station", expr: "m.station", what: "that cast's own line and station" },
  { stem: "cast_hours", expr: "round(m.hours, 2)", what: "cast time minus net time, hours (negative = the cast was taken before the net)" },
  { stem: "cast_km", expr: "round(m.km, 2)", what: "great-circle distance between the net and the cast, km" },
  { stem: "cast_depth_min_m", expr: "m.depth_min_m", what: "shallowest depth of the cast's values used, m" },
  { stem: "cast_depth_max_m", expr: "m.depth_max_m", what: "deepest depth of the cast's values used, m" },
  { stem: "cast_n_depths", expr: "m.n_depths", what: "how many depths of the cast, inside the depth range, the values are taken over" },
];
export const matchColumns = (w: Water): { col: string; expr: string; what: string }[] => MATCH_COLS.map((c) => ({ col: `${c.stem}${w.sfx}`, expr: c.expr, what: c.what }));
/** the net's own columns, which open every row of the per-net table */
export const NET_COLS: { col: string; expr: string; what: string }[] = [
  { col: "date", expr: "strftime(n.t, '%Y-%m-%d')", what: "the net's calendar date, UTC" },
  { col: "cruise", expr: "n.cruise", what: "the cruise (YYYY-MM-ship)" },
  { col: "line", expr: "n.line", what: "CalCOFI line of the net's grid cell" },
  { col: "station", expr: "n.station", what: "CalCOFI station number of the net's grid cell" },
  { col: "net_id", expr: "n.net_id", what: "the net (the sample the species were counted in): its id in the release" },
  { col: "net_time", expr: "strftime(n.t, '%Y-%m-%d %H:%M')", what: "the net's time, UTC" },
  { col: "latitude", expr: "round(n.lat, 5)", what: "the net's own position, decimal degrees north" },
  { col: "longitude", expr: "round(n.lon, 5)", what: "the net's own position, decimal degrees east" },
  { col: "tow_type", expr: "n.tow_type", what: "the kind of tow, as the dataset records it" },
];
/** great-circle distance in km between two positions in decimal degrees (haversine on the mean Earth radius) */
export const kmSql = (lat1: string, lon1: string, lat2: string, lon2: string): string =>
  `2 * 6371.0088 * asin(sqrt(least(1.0, pow(sin(radians(${lat2} - ${lat1}) / 2), 2) + cos(radians(${lat1})) * cos(radians(${lat2})) * pow(sin(radians(${lon2} - ${lon1}) / 2), 2))))`;
/** which of a water pick's values a cast can give: the pick's dataset, quality, and the 10 m steps of the depth range.
 *  Not the years, season or stations: those choose the NETS, and a net's cast is found from the net's time and position. */
export function castWhere(spec: Spec, p: EnvPick): string {
  const w: string[] = [];
  if (p.dataset) w.push(`dataset_key = ${lit(p.dataset)}`);
  if (spec.datasets?.length) w.push(`dataset_key IN (${spec.datasets.map(lit).join(", ")})`);
  if (spec.qualOnly) w.push("qual_ok");
  w.push("value IS NOT NULL", binWhere(spec));
  return w.join(" AND ");
}

/** the per-net table's statements; the last returns it.
 *   bld_long   every species value of every net that passes the filters (as longSql, tagged with its column)
 *   bld_nets   one row per net: its time, position and labels, and one column per species pick
 *   bld_casts  one row per cast of each water dataset that has a value in the depth range: its time and position (of
 *              those values), the depths they span, and one column per measurement (the statistic over that ONE cast)
 *   bld_match  for each net × water dataset, the ONE best cast inside both windows
 *  A net and a cast can only be within H hours when their H-hour time buckets are the same or adjacent, so the nets are
 *  joined to the casts on three buckets (a hash join) and the exact tests run on those few candidates. */
export function netSql(spec: Spec): string[] {
  const m = matchOf(spec), W = waters(spec.picks), stat = STAT_SQL[spec.stat], S = Math.max(60, Math.round(m.hours * 3600));
  const bucket = (t: string) => `CAST(floor(epoch(${t}) / ${S}) AS BIGINT)`;
  const bio = spec.picks.flatMap((p, i) => !isBio(p) ? [] : pickColumns(p, spec).map(({ col, stage }) =>
    `SELECT dataset_key AS net_dataset, sample_id AS net_id, datetime, latitude, longitude, cruise_key, line, station, tow_type, ${lit(col)} AS col, ${pickDen(p, spec)} AS v\n  FROM bld_${i}\n  WHERE ${pickWhere(spec, p, stage, W.length === 0)}`));
  const bioCols = spec.picks.flatMap((p) => isBio(p) ? pickColumns(p, spec).map((c) => c.col) : []);
  const out = [
    `CREATE OR REPLACE TABLE bld_long AS\n${bio.join("\nUNION ALL\n")}`,
    `CREATE OR REPLACE TABLE bld_nets AS
SELECT net_dataset, net_id, min(datetime) AS t, min(latitude) AS lat, min(longitude) AS lon, min(cruise_key) AS cruise, min(line) AS line, min(station) AS station, min(tow_type) AS tow_type,
       ${bioCols.map((c) => `${stat("v")} FILTER (WHERE col = ${lit(c)}) AS "${c}"`).join(",\n       ")}
FROM bld_long
GROUP BY net_dataset, net_id`,
  ];
  if (W.length) {
    const env = W.flatMap((w) => w.picks.map(({ p, i }) =>
      `SELECT ${w.g} AS g, dataset_key, sample_id, datetime, latitude, longitude, site_key, depth_min_m, depth_max_m, ${lit(pickColumns(p, spec)[0].col)} AS col, value AS v\n  FROM bld_${i}\n  WHERE ${castWhere(spec, p)}`));
    const envCols = W.flatMap((w) => w.picks.map(({ p }) => pickColumns(p, spec)[0].col));
    const order = m.prefer === "time" ? "abs(hours), km" : "km, abs(hours)";
    out.push(
      `CREATE OR REPLACE TABLE bld_casts AS
SELECT g, dataset_key, sample_id AS cast_id, min(datetime) AS t, avg(latitude) AS lat, avg(longitude) AS lon, min(site_key) AS station,
       min(depth_min_m) AS depth_min_m, max(depth_max_m) AS depth_max_m, count(DISTINCT depth_min_m) AS n_depths, ${bucket("min(datetime)")} AS tb,
       ${envCols.map((c) => `${stat("v")} FILTER (WHERE col = ${lit(c)}) AS "${c}"`).join(",\n       ")}
FROM (
${env.join("\nUNION ALL\n")}
)
GROUP BY g, dataset_key, sample_id
HAVING min(datetime) IS NOT NULL AND avg(latitude) IS NOT NULL AND avg(longitude) IS NOT NULL`,
      `CREATE OR REPLACE TABLE bld_match AS
SELECT * EXCLUDE (rk) FROM (
  SELECT *, row_number() OVER (PARTITION BY net_dataset, net_id, g ORDER BY ${order}, t, cast_id) AS rk FROM (
    SELECT n.net_dataset, n.net_id, c.* EXCLUDE (tb),
           (epoch(c.t) - epoch(n.t)) / 3600.0 AS hours,
           ${kmSql("n.lat", "n.lon", "c.lat", "c.lon")} AS km
    FROM (SELECT net_dataset, net_id, t, lat, lon, unnest([tb - 1, tb, tb + 1]) AS jb
          FROM (SELECT net_dataset, net_id, t, lat, lon, ${bucket("t")} AS tb FROM bld_nets WHERE t IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL)) n
    JOIN bld_casts c ON c.tb = n.jb AND abs(c.lat - n.lat) <= ${m.km} / 110.0
  )
  WHERE abs(hours) <= ${m.hours} AND km <= ${m.km}
)
WHERE rk = 1`);
  }
  // the columns: the net's own, then the picks in the order picked, each water dataset's match columns after its last measurement
  const sel = NET_COLS.map((c) => `${c.expr} AS ${c.col}`);
  spec.picks.forEach((p, i) => {
    const w = W.find((x) => x.picks.some((y) => y.i === i));
    for (const { col } of pickColumns(p, spec)) sel.push(`${w ? `m${w.g}` : "n"}."${col}"`);
    if (w && w.picks[w.picks.length - 1].i === i) for (const c of matchColumns(w)) sel.push(`${c.expr.replace(/\bm\./g, `m${w.g}.`)} AS ${c.col}`);
  });
  const joins = W.map((w) => `\nLEFT JOIN bld_match m${w.g} ON m${w.g}.g = ${w.g} AND m${w.g}.net_dataset = n.net_dataset AND m${w.g}.net_id = n.net_id`).join("");
  out.push(`SELECT ${sel.join(",\n       ")}\nFROM bld_nets n${joins}\nORDER BY n.t, n.cruise, n.line, n.station, n.net_id`);
  return out;
}

/** how many picks one table takes. Each pick is its own slice in the browser's memory (for a species, every net of its
 *  dataset, zero-filled: ~50,000 rows), so "Select all" over the 1,600 species of a release cannot be built; the page says
 *  so before it tries, instead of the tab running out of memory. */
export const MAX_PICKS = 40;
export const tooMany = (n: number): string | null => n > MAX_PICKS ? `${n.toLocaleString("en-US")} columns are selected; one table takes up to ${MAX_PICKS}. Untick some, or download the whole dataset from its page.` : null;
/** the tables one build leaves behind, dropped once its rows are read (bld_0 … bld_n-1, bld_long, the per-net table's three and the last slice) */
export const cleanupSql = (n: number): string[] => [...Array.from({ length: n }, (_, i) => `DROP TABLE IF EXISTS bld_${i}`), "DROP TABLE IF EXISTS bld_long", "DROP TABLE IF EXISTS bld_nets", "DROP TABLE IF EXISTS bld_casts", "DROP TABLE IF EXISTS bld_match", "DROP TABLE IF EXISTS slice"];

/** every statement, in order; the last one returns the table */
export function builderSql(spec: Spec, ctx: Ctx): string[] {
  if (!spec.picks.length) throw new Error("pick at least one column");
  if (spec.picks.length > MAX_PICKS) throw new Error(tooMany(spec.picks.length)!);
  return [...slicesSql(spec, ctx), ...tableSql(spec, ctx)];
}
/** the two halves of builderSql(): the page builds the slices, asks each what it holds (probeSql → resolveSpec), then
 *  shapes the table from the RESOLVED spec, so no column is blank for want of a unit its dataset never carried */
export const slicesSql = (spec: Spec, ctx: Ctx): string[] => spec.picks.flatMap((p, i) => sliceSql(p, i, ctx));
/** the table's statements from the built slices; the LAST returns it (run the others first) */
export const tableSql = (spec: Spec, ctx: Ctx): string[] => netRows(spec) ? netSql(spec) : [longSql(spec, ctx), pivotSql(spec)];

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

/** the windows and the preference in a few words: "within ± 12 hours and 5 km of the net, the nearest in time" */
const num = (v: number) => String(Math.round(v * 100) / 100);
const hoursWord = (m: Match) => `± ${num(m.hours)} hour${m.hours === 1 ? "" : "s"}`;
const nearestWord = (m: Match) => m.prefer === "time" ? "nearest in time" : "nearest in distance";
/** one line for the page and for "About this table › Rows kept": the windows, the preference and the water's depth range */
export function matchLine(spec: Shape & Pick<Spec, "depth">): string | null {
  if (!netRows(spec) || !waters(spec.picks ?? []).length) return null;
  const m = matchOf(spec);
  return `Each net is given one cast per water dataset: the ${nearestWord(m)} within ${hoursWord(m)} and ${num(m.km)} km of the net; water values from ${spec.depth[0]} to ${depthTo(spec)} m`;
}

/** the plain-English sentence under the controls */
export function sentence(spec: Pick<Spec, "lens" | "place" | "time" | "depthBy" | "stat"> & Partial<Pick<Spec, "picks" | "match" | "depth">>, raw: boolean): string {
  if (netRows(spec)) {
    const m = matchOf(spec), d = { depth: spec.depth ?? MATCH_DEPTH };
    return waters(spec.picks ?? []).length
      ? `Each row is one net. Beside it, each water dataset gives the ${STAT_WORD[spec.stat]} of one cast from ${d.depth[0]} to ${depthTo(d)} m: the ${nearestWord(m)} within ${hoursWord(m)} and ${num(m.km)} km of the net.`
      : "Each row is one net, with what it caught. Pick a water measurement and each net is given the nearest cast.";
  }
  // "every sample, as measured" with no species is still a table keyed by station × date × 10 m step: two casts on one
  // date share a row and are averaged — so it never said "nothing is combined" truthfully
  if (raw) return `Each row is one station on one sampling date at one 10 m depth step. Where several values share it, the row shows their ${STAT_WORD[spec.stat]}.`;
  const PW: Record<Place, string> = { station: "one station", line: "one CalCOFI line", hex: "one hexagon", region: "one region", all: spec.lens === "station" ? "all stations together" : spec.lens === "hex" ? "all hexagons together" : "all regions together" };
  const TW: Record<TimeBy, string> = { sample: "each time it was sampled", month: "per month", season: "per season", year: "per year", decade: "per decade", all: "across all years" };
  const DW: Record<DepthBy, string> = { avg: "over the whole depth range", "10": "for each 10 m of depth" };
  return `Each row shows the ${STAT_WORD[spec.stat]} of all samples for ${PW[spec.place]}, ${TW[spec.time]}, ${DW[spec.depthBy]}.`;
}

/** HOW ROWS ARE MATCHED, as this file's SQL does it — the page's fold of that name and the notes saved beside a download.
 *  A combined table needs an explicit matching rule (Ben to Ed Weber, 2026-11-10). Two rules are in force:
 *   · the per-net table (netRows): each net is given one cast per water dataset, inside a time and a distance window
 *     (netSql); the lines carry the windows, the preference, the depth range and the statistic the SQL was made from
 *   · every other shape: values are grouped by the row's keys and never paired net to cast (keys, pickWhere, pivotSql)
 *  tests/builder.rule.test.ts pins each line to the spec that produces it. `picks` and `match` are optional so the page
 *  can ask before anything is picked; without a species pick the shape is never the per-net table. */
export type RuleSpec = Pick<Spec, "lens" | "place" | "time" | "depthBy" | "stat" | "depth" | "zeros"> & Partial<Pick<Spec, "picks" | "match">>;
/** what the aggregate shapes say about pairing, so no reader takes a shared row for a net beside its cast */
export const NOT_PAIRED = "Nets are not paired with casts in this shape: for that, choose Stations and Every sample.";
export function ruleLines(spec: RuleSpec): string[] {
  if (netRows(spec)) return netRuleLines(spec);
  const TK: Record<TimeBy, string | null> = { sample: "sampling date and cruise", month: "year and month", season: "year and season", year: "year", decade: "decade", all: null };
  const PK: Record<Place, string | null> = { station: "station (line and station number)", line: "CalCOFI line", hex: "hexagon", region: "region", all: null };
  const ks = [PK[spec.place], TK[spec.time], spec.depthBy === "10" ? "10 m depth step" : null].filter((x): x is string => !!x);
  const out = [ks.length ? `One row for each ${ks.join(" × ")} that any column has a sample for.` : "One row: every sample that passes the filters, together."];
  out.push(`Each column is one species or measurement from one dataset. A cell is the ${STAT_WORD[spec.stat]} of that column's values in the row; values are not averaged per net or per cast first.`);
  const T: Record<TimeBy, string> = {
    sample: "Values share a row when their samples have the same cruise, place and calendar date. The date is in UTC, so two samples of one station visit made either side of 00:00 UTC (4 or 5 pm Pacific) fall on two rows.",
    month: "Species and water values share a row when their cruises fall in the same year and month.",
    season: "Species and water values share a row when their cruises fall in the same season of the same year.",
    year: "Species and water values share a row when they were sampled in the same year, not necessarily on the same cruise or day: a spring net and a fall cast can sit side by side.",
    decade: "Species and water values share a row when they were sampled in the same decade, not on the same cruise or day.",
    all: "All years are pooled: a column's value can come from different years than its neighbour's.",
  };
  out.push(`${T[spec.time]} ${NOT_PAIRED}`);
  if (spec.place === "station" || spec.place === "line") out.push("A species sample is placed at its grid cell's line and station, a water sample at the station it was taken at. Where one cell holds several stations, and on the coarse historical cells, the two can fall on different rows.");
  else if (spec.place === "region" || spec.lens === "region") out.push(`A sample counts in every region of the layer it falls inside${spec.place === "all" ? ", so a sample inside two overlapping regions counts twice" : ""}.`);
  out.push(spec.depthBy === "10"
    ? `Water values are per 10 m depth step, for ${stepsWord(spec)} (depth_m is the top of the step). A net tow is one value for the whole depth it fished and sits on the depth_m = 0 row.`
    : `Water values are pooled over ${stepsWord(spec)}; every value of every cast counts once, so a deep cast weighs more than a shallow one. A net tow is one value for the whole depth it fished, kept when that reaches into this range.`);
  out.push(spec.zeros
    ? "A blank cell means that column has no sample in the row. A 0 means a net was sorted for that life stage and held none of the species (filled in only for datasets that record catches alone); it is never a missing value."
    : "A blank cell means that column has no sample in the row, or a net with no catch: nets with no catch are left out.");
  return out;
}
/** the per-net table's rule (netSql), from the same parameters */
function netRuleLines(spec: RuleSpec): string[] {
  const m = matchOf(spec), W = waters(spec.picks ?? []), other = m.prefer === "time" ? "nearest in distance" : "nearest in time";
  const zero = spec.zeros
    ? "A 0 in a species column means the net was sorted for that life stage and held none of the species (filled in only for datasets that record catches alone); it is never a missing value."
    : "Nets with no catch of any picked species are left out.";
  const own = `A species column is the net's own value${spec.stat === "avg" ? "" : ` (the ${STAT_WORD[spec.stat]}, where one column holds several values of a net)`}.`;
  if (!W.length) return [
    "One row for each net (the sample the species were counted in) that passes the filters. Two nets of one station visit are two rows.",
    own,
    "No water measurement is picked, so nothing is matched to the nets. Pick one and each net is given the nearest cast inside a time and a distance window.",
    `A net is kept when the depth it fished reaches into the range from ${spec.depth[0]} to ${depthTo(spec)} m.`,
    zero,
  ];
  const names = W.map((w) => w.name);
  return [
    `One row for each net (the sample the species were counted in) that passes the filters, whether or not a cast is found for it. Two nets of one station visit are two rows. ${own}`,
    `${W.length === 1 ? `The water dataset (${names[0]}) is matched to each net` : `Each water dataset (${names.join(", ")}) is matched to each net on its own`}: of its casts taken within ${hoursWord(m)} and ${num(m.km)} km of the net, the row takes ONE, the ${nearestWord(m)} (the ${other} breaks a tie).`,
    "Hours and kilometres are measured between the samples themselves: their recorded times (UTC) and positions (great-circle distance). Station numbers, calendar dates and cruise names play no part, so a net and a cast either side of midnight, or filed under different station numbers, still pair.",
    `A water value is the ${STAT_WORD[spec.stat]} of that one cast's values in ${stepsWord(spec)}; it is never taken over several casts. Only casts with a value of the picked measurements in that range are candidates.`,
    `Beside ${W.length === 1 ? "the water dataset's" : "each water dataset's"} values the row says which cast and how far: ${MATCH_COLS.map((c) => c.stem).join(", ")}. cast_hours is cast time minus net time, so a negative number means the cast was taken first.`,
    `A net with no cast inside both windows keeps its row, with ${W.length === 1 ? "the water" : "that dataset's"} columns blank; so does a measurement the matched cast lacks in the depth range. Two nets may be given the same cast.`,
    "The years, season and stations choose the nets; the depth range is the water's and does not filter the nets.",
    zero,
  ];
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
  const net = netRows(spec), W = net ? waters(spec.picks) : [];
  const keyCols = [...(spec.place === "region" ? [PK.region[0]] : []), ...TK[spec.time], ...(spec.place === "region" ? [PK.region[1]] : PK[spec.place]), ...(spec.depthBy === "10" ? [["depth_m", "top of the 10 m depth step, m"] as [string, string]] : [])];
  const cols: AboutCol[] = net ? NET_COLS.map(({ col, what }) => ({ col, what })) : keyCols.map(([col, what]) => ({ col, what }));
  spec.picks.forEach((p, i) => {
    const w = W.find((x) => x.picks.some((y) => y.i === i));
    for (const { col, stage } of pickColumns(p, spec)) {
      const from = p.dataset ? `dataset ${p.dataset}${p.tag && p.tag !== p.dataset ? ` (${p.tag})` : ""}` : "every dataset that holds it, pooled";
      if (p.realm === "env") { cols.push({ col, what: `${p.label}${p.units ? `, ${p.units}` : ""}; ${from}${w ? `; of the one cast matched to the net (cast_id${w.sfx})` : ""}` }); continue; }
      const st = stage ?? (pickStages(p, spec)?.length === 1 ? pickStages(p, spec)![0] : null), den = pickDen(p, spec);
      const stWord = st ?? (pickStages(p, spec) === null ? null : pickStages(p, spec)?.length ? pickStages(p, spec)!.join(" + ") : "all life stages");
      cols.push({ col, what: `${p.label}${stWord ? `, ${stWord}` : ""}, ${den === "value" ? `as counted${p.units ? ` (${p.units})` : ""}` : DEN_WORD[den]}; ${from}` });
    }
    if (w && w.picks[w.picks.length - 1].i === i) for (const c of matchColumns(w)) cols.push({ col: c.col, what: `${c.what}; ${w.name}` });
  });
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
