// the SQL templates and their renderer — pure (no engine, no worker), so vitest can render a lens template and run it
// in duckdb-wasm's node build against a synthetic fixture (tests/castgrain.sql.test.ts). engine.ts re-exports all of it.
const templates = import.meta.glob("../sql/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export function template(name: string): string {
  const k = Object.keys(templates).find((p) => p.endsWith(`/${name}.sql`));
  if (!k) throw new Error(`no template ${name}`);
  return templates[k];
}
export type Param = string | number | boolean | null;
export interface Params { [k: string]: Param }
// tokens substituted VERBATIM (table expressions, column names, predicates); every other token is a quoted literal.
// sm_src / mt_src / qual_ok belong to the per-cast slice (sql/slice_cast.sql): sample_measurement, the measurement_type
// registry and the quality predicate (src/qual.ts qualOkSQL()); root_hex7 is `r.hex7` or `NULL::UBIGINT` (App.tsx castTokens)
// tbl is the table a map lens summarizes: `slice`, or `slice_anom` (sql/anom_slice.sql) when it draws an anomaly;
// clim_loc is the slice column a baseline cell is found by (anomaly.ts anomLoc()), clim_period the slice's cruise month or
// season ({{cruise_month}} / {{cruise_quarter}}, anomaly.ts anomTokens())
const RAW = new Set(["val", "hex", "where", "where_nodepth", "where_noyear", "src", "taxon_src", "root_src", "spatial_src", "clim_src", "dataset_filter", "quarter_filter", "bin", "sm_src", "mt_src", "qual_ok", "root_hex7", "tbl", "clim_loc", "clim_period", "area_filter",
  "cruise_month", "cruise_quarter", "cruise_year", "cruise_src", "key_month", "key_year", "key_quarter", "cs_year", "cs_quarter", "cs_month"]);

// THE CRUISE'S MONTH AND SEASON. Since release v2026.11 (calcofi4db 4.34.0; Rasmus Swalethorp 2026-10-16, Ben Best
// 2026-10-20) a cruise's month is its MEDIAN cast month — `cruise.month_median`, with `date_median`, `season` and
// `season_year` beside it — never the MM its `YYYY-MM-NODC` key designates and never the calendar date a station was worked
// (a July cruise works its first stations on 30 June: explore#17); the seasons are DJF / MAM / JJA / SON, numbered 1–4
// (`quarter`), December counting toward the following year's winter (`season_year`). The slice templates join the
// release's cruise table ({{cruise_src}}, the registered `cruise` object when it carries month_median — App.tsx probes
// it; the typed empty relation below otherwise, so the join is a no-op) and fall back to the key rule ({{key_month}},
// {{key_year}}, {{key_quarter}}) on a release before v2026.11 or a cruise the table does not know. Every lens template
// then reads the slice's own columns through the built-in tokens: {{cruise_month}} = cruise_month, {{cruise_quarter}} =
// quarter (1 = DJF … 4 = SON), {{cruise_year}} = year. The same rule as calcofi4db's build_obs_slim() at release.
const CRUISE_KEY_OK = "regexp_matches(cruise_key, '^[0-9]{4}-(0[1-9]|1[0-2])-')";
/** the DJF / MAM / JJA / SON season of a month expression, numbered 1–4 (calcofi4db::cruise_quarter_sql()) */
export const djfSql = (m: string) => `(CASE WHEN ${m} IN (12, 1, 2) THEN 1 WHEN ${m} IN (3, 4, 5) THEN 2 WHEN ${m} IN (6, 7, 8) THEN 3 WHEN ${m} IN (9, 10, 11) THEN 4 END)`;
/** the key rule: the cruise's month / year from its YYYY-MM-NODC key, NULL for a malformed key (the fallback) */
export const KEY_MONTH_SQL = `(CASE WHEN ${CRUISE_KEY_OK} THEN CAST(substr(cruise_key, 6, 2) AS INTEGER) END)`;
export const KEY_YEAR_SQL = `(CASE WHEN ${CRUISE_KEY_OK} THEN CAST(substr(cruise_key, 1, 4) AS INTEGER) END)`;
export const KEY_QUARTER_SQL = djfSql(KEY_MONTH_SQL);
/** the slice's own columns, which every lens template keys on */
export const CRUISE_MONTH_SQL = "cruise_month";
export const CRUISE_QUARTER_SQL = "quarter";
export const CRUISE_YEAR_SQL = "year";
/** a cruise table with none of the median columns: the slice join finds nothing and the key rule stands */
export const NO_CRUISE_SRC = "(SELECT NULL::VARCHAR AS cruise_key, NULL::DATE AS date_median, NULL::TINYINT AS month_median, NULL::SMALLINT AS season_year WHERE FALSE)";
// {{tbl}} defaults to the slice itself; a map lens drawing an anomaly passes slice_anom
const BUILTIN: Params = { cruise_month: CRUISE_MONTH_SQL, cruise_quarter: CRUISE_QUARTER_SQL, cruise_year: CRUISE_YEAR_SQL, tbl: "slice", area_filter: "TRUE",
  cruise_src: NO_CRUISE_SRC, key_month: KEY_MONTH_SQL, key_year: KEY_YEAR_SQL, key_quarter: KEY_QUARTER_SQL,
  // the cruise table's own month / season / season year (sql/cruise_seasons.sql, cruise_ref.sql): the key rule unless App.tsx
  // has probed the median columns and passes month_median / season_year
  cs_month: KEY_MONTH_SQL, cs_year: KEY_YEAR_SQL, cs_quarter: KEY_QUARTER_SQL }; // and the Area filter (src/area.ts) is everywhere unless a caller says
export const datasetFilterSql = (ds: string[] | null | undefined) => ds?.length ? `dataset_key IN (${ds.map((d) => lit(d)).join(", ")})` : "TRUE";

// an H3 parent as plain bit arithmetic (calcofi4db::h3_parent_sql): resolution in bits 52–55, one
// 3-bit digit per resolution, unused digits = 7. printf('%x') is the standard H3 string.
export function h3ParentSql(hex: string, res: number): string {
  if (res < 0 || res > 15) throw new Error(`h3 res ${res}`);
  return `(((${hex} & ~(15::UBIGINT << 52)) | (${res}::UBIGINT << 52)) | ((1::UBIGINT << ${3 * (15 - res)}) - 1))`;
}
export function hexExpr(res: number): string { return res >= 7 ? "printf('%x', hex7)" : `printf('%x', ${h3ParentSql("hex7", res)})`; }
export function lit(v: Param): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function filterFragment(drop: RegExp | null): string {
  return template("_filters")
    .split("\n").filter((l) => !l.trim().startsWith("--") && l.trim() !== "" && !(drop && drop.test(l)))
    .join("\n  ");
}
export function render(name: string, params: Params): string {
  const p: Params = { ...BUILTIN, ...params };
  const sub = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in p)) throw new Error(`template ${name}: missing param ${k}`);
    return RAW.has(k) ? String(p[k]) : lit(p[k]);
  });
  // the shared filter, three ways: whole / without depth (depth strip) / without year (year strip)
  const body = template(name);
  if (body.includes("{{where}}")) p.where = sub(filterFragment(null));
  if (body.includes("{{where_nodepth}}")) p.where_nodepth = sub(filterFragment(/depth_bin/));
  if (body.includes("{{where_noyear}}")) p.where_noyear = sub(filterFragment(/\{\{ym0\}\}/));
  return sub(body).trim();
}
