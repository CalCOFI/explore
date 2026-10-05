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
const RAW = new Set(["val", "hex", "where", "where_nodepth", "where_noyear", "src", "taxon_src", "root_src", "spatial_src", "clim_src", "dataset_filter", "quarter_filter", "bin", "sm_src", "mt_src", "qual_ok", "root_hex7"]);
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
  const p: Params = { ...params };
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
