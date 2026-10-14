// "the same SQL the browser ran", resolved against the release's own object URLs — what Share › Copy code copies (SQL, R,
// Python) and what the download bundle writes under query/ and as reproduce.R / .py. Pure: no engine, no worker, so
// tests/reproduce.test.ts can render the copied SQL and RUN it (it lived in bundle.ts, which imports the engine).
import { render, type Params } from "./sqltpl";
import { sources, readParquetSql, type Catalog } from "./release";
import type { Sel } from "./state";
import { members } from "./variables";
import type { VarGrain } from "./castgrain";
import { qualOkSQL } from "./qual";
import { anomTokens, type ClimBase } from "./anomaly";

export interface ReproCtx {
  sel: Sel; version: string; catalog: Catalog; params: Params; lensParams: Params; lensTemplate: string;
  grain?: VarGrain | null;     // an env variable's grain: "cast" reads sample_measurement ⋈ sample_root (sql/slice_cast.sql); absent / "bin" = obs_env
  rootHex7?: boolean;          // the release's sample_root carries hex7 (v2026.10.04+): the per-cast slice takes the cast's H3 cell from it
  // the depth × time anomaly card is open (explore#28): hand over its two statements too — the per-observation subtraction
  // (sql/anom_slice.sql, over the variable's climatology objects `clim`, the member types that have one) and the card's grid
  depthTime?: { base: ClimBase; clim: string[] } | null;
}
export const isCast = (ctx: Pick<ReproCtx, "sel" | "grain">) => ctx.sel.realm === "env" && ctx.grain === "cast";

/** the SQL the view ran, in order, with the browser's registered file names replaced by the release's URLs */
export function resolvedSql(ctx: Pick<ReproCtx, "sel" | "catalog" | "params" | "lensParams" | "lensTemplate" | "grain" | "rootHex7" | "depthTime">): [string, string][] {
  const { sel, catalog } = ctx;
  const cast = isCast(ctx);
  const bioSrc = sources(catalog, "obs_bio"), envSrc = sources(catalog, "obs_env"), rootSrc = sources(catalog, "sample_root"), spSrc = sources(catalog, "sample_spatial"), txSrc = sources(catalog, "taxon");
  // an env variable = the union of its member objects, each stamped with its measurement_type (the hive key)
  const envUnion = sel.realm === "env" && !cast ? `(${members(sel.var).map((m) => `SELECT *, '${m}' AS measurement_type FROM read_parquet('${envSrc.partitions.get(m)}')`).join(" UNION ALL ")})` : null;
  const tokens: Params = {
    src: sel.realm === "bio" ? readParquetSql(bioSrc) : envUnion ?? "", // a per-cast slice reads no {{src}}: its sources are sm_src / root_src / mt_src
    taxon_src: readParquetSql(txSrc), root_src: readParquetSql(rootSrc), spatial_src: readParquetSql(spSrc),
  };
  // a per-cast variable: the same join the browser ran — sample_measurement ⋈ sample_root, units from the registry,
  // the quality predicate qualOkSQL("sm") — against the release's own object URLs (sql/slice_cast.sql)
  const sliceSql = sel.realm === "bio" ? render("slice_bio", { ...tokens, taxon: sel.taxon })
    : cast ? render("slice_cast", { ...tokens, sm_src: readParquetSql(sources(catalog, "sample_measurement")), mt_src: readParquetSql(sources(catalog, "measurement_type")), type: sel.var, qual_ok: qualOkSQL("sm"), root_hex7: ctx.rootHex7 ? "r.hex7" : "NULL::UBIGINT" })
    : render("slice_env", tokens);
  return [
    ["01_slice.sql", sliceSql],
    [`02_${ctx.lensTemplate}.sql`, render(ctx.lensTemplate, { ...ctx.params, ...ctx.lensParams, ...tokens })],
    // a per-cast variable has no depth axis: no depth-strip query to hand over (it would return nothing)
    ...(cast ? [] : [["03_depth_strip.sql", render("depth_strip", { ...ctx.params, ...tokens })] as [string, string]]),
    ["04_years.sql", render("years", { ...ctx.params, ...tokens })],
    ...depthTimeSql(ctx, tokens),
  ];
}
/** the depth × time anomaly card's statements (explore#28), when it is open on a per-bin env variable with a baseline:
 * slice_anom — every observation minus its own cell's normal, the release's climatology objects read by their URLs, the
 * same tokens the browser passed (anomaly.ts anomTokens()) — then the card's season × depth-bin grid over it */
function depthTimeSql(ctx: Pick<ReproCtx, "sel" | "catalog" | "params" | "grain" | "depthTime">, tokens: Params): [string, string][] {
  const dt = ctx.depthTime;
  if (!dt || ctx.sel.realm !== "env" || isCast(ctx) || !dt.clim.length) return [];
  const parts = sources(ctx.catalog, "climatology").partitions;
  const clim = `(${dt.clim.map((m) => `SELECT *, '${m}' AS measurement_type FROM read_parquet('${parts.get(m)}')`).join(" UNION ALL ")})`;
  return [
    ["05_anom_slice.sql", render("anom_slice", anomTokens(clim, dt.base, "bin"))],
    ["06_anom_depth_time.sql", render("anom_depth_time", { ...ctx.params, ...tokens })],
  ];
}
/** the shared filter as the lens applied it, for the observation rows behind a view (the bundle's data/observations) */
export const whereSql = (ctx: Pick<ReproCtx, "params">) => render("depth_strip", { ...ctx.params }).split("WHERE")[1].split("GROUP BY")[0].replace(/depth_bin IS NOT NULL AND/, "");
// a per-cast variable hands over no depth-strip query (resolvedSql()), so reproduce.R / .py run one only when it is there
const hasDepthSql = (sqls: [string, string][]) => sqls.some(([f]) => f === "03_depth_strip.sql");
const hasDtSql = (sqls: [string, string][]) => sqls.some(([f]) => f === "06_anom_depth_time.sql");
// a statement that builds a table (the slice, slice_anom) is executed; every other one returns a table, named by its file
const isCreate = (s: string) => /^\s*(--.*\n)*\s*CREATE/.test(s);
const stem = (f: string) => f.replace(/^\d+_/, "").replace(/\.sql$/, "");
const CAST_NOTE = "a per-cast variable: one value per cast, from sample_measurement joined to the cast's row in sample_root (root_sample_key = sample_key); the same value joins to `sample` on sample_key";
export const rBody = (version: string, lens: string, sqls: [string, string][], inline: boolean, cast = false) => `# CalCOFI Explorer · ${lens} · release ${version} — the same SQL the browser ran${cast ? `\n# ${CAST_NOTE}` : ""}
# install.packages("duckdb"); remotes::install_github("calcofi/calcofi4r")
library(DBI)
con <- dbConnect(duckdb::duckdb())
dbExecute(con, "INSTALL httpfs; LOAD httpfs")          # the object URLs are https; no other extension is needed
${inline
  ? sqls.map(([f, s]) => `# --- ${f}\n${isCreate(s) ? "dbExecute" : stem(f) + " <- dbGetQuery"}(con, ${JSON.stringify(s)})`).join("\n")
  : `run <- function(f) { sql <- paste(readLines(file.path("query", f)), collapse = "\\n"); if (grepl("^\\\\s*(--.*\\\\n)*\\\\s*CREATE", sql)) dbExecute(con, sql) else dbGetQuery(con, sql) }
run("${sqls[0][0]}")                                       # the slice (one taxon or one variable)
summary     <- run("${sqls[1][0]}")                        # the lens table, as in data/summary/${hasDepthSql(sqls) ? `\ndepth_strip <- run("03_depth_strip.sql")` : ""}
years       <- run("04_years.sql")${hasDtSql(sqls) ? `
run("05_anom_slice.sql")                                   # slice_anom: every observation minus its own cell's 1993–2013 normal
anom_depth_time <- run("06_anom_depth_time.sql")           # the depth × time anomaly card: cruise season × 10 m bin` : ""}`}
# the same release through calcofi4r (catalog-resolved URLs):
# cat <- calcofi4r::cc_catalog("${version}"); calcofi4r::cc_read_parquet_sql(calcofi4r::cc_release_sources(cat, "obs_bio"))
# the quality predicate and the density expression the release used: calcofi4r::cc_qual_ok_sql(), calcofi4r::cc_density_sql()
${lens === "contour" ? `# the Contours lens: the same surface the map drew (calcofi4r >= 1.21.0; the point set, method and grain are in selection.json)
# s <- calcofi4r::cc_interpolate(data.frame(lon = summary$longitude %||% grid$lon, lat = summary$latitude %||% grid$lat, z = summary$mean), method = "ok"); terra::plot(calcofi4r::cc_interpolate_rast(s))
` : ""}${inline ? "" : "head(summary)\n"}`;
export const pyBody = (version: string, lens: string, sqls: [string, string][], inline: boolean, cast = false) => `# CalCOFI Explorer · ${lens} · release ${version} — the same SQL the browser ran${cast ? `\n# ${CAST_NOTE}` : ""}
# pip install duckdb calcofi4py
import re, duckdb
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs")
${inline
  ? sqls.map(([f, s]) => `# --- ${f}\n${isCreate(s) ? "con.execute(" : stem(f) + " = con.execute("}${JSON.stringify(s)})${isCreate(s) ? "" : ".df()"}`).join("\n")
  : `def run(f):
    sql = open(f"query/{f}").read()
    return con.execute(sql) if re.match(r"^\\s*(--.*\\n)*\\s*CREATE", sql) else con.execute(sql).df()
run("${sqls[0][0]}")                                       # the slice (one taxon or one variable)
summary = run("${sqls[1][0]}")                              # the lens table, as in data/summary/${hasDepthSql(sqls) ? `\ndepth_strip = run("03_depth_strip.sql")` : ""}
years = run("04_years.sql")${hasDtSql(sqls) ? `
run("05_anom_slice.sql")                                    # slice_anom: every observation minus its own cell's 1993–2013 normal
anom_depth_time = run("06_anom_depth_time.sql")             # the depth × time anomaly card: cruise season × 10 m bin` : ""}`}
# the same release through calcofi4py: import calcofi4py as cc; cat = cc.cc_catalog("${version}"); cc.read_parquet_sql(cc.release_sources(cat, "obs_bio"))
# quality predicate + density expression the release used: cc.qual_ok_sql(), cc.density_sql()
${lens === "contour" ? `# the Contours lens: the same surface the map drew (calcofi4py >= 0.8.0, pip install "calcofi4py[interp]")
# s = cc.interpolate(summary.rename(columns={"longitude": "lon", "latitude": "lat", "mean": "z"}), method="ok"); s.values
` : ""}${inline ? "" : "print(summary.head())\n"}`;
/** "Copy as…": the whole reproduction as one pasteable text */
export function copyAs(kind: "sql" | "r" | "py", ctx: Pick<ReproCtx, "sel" | "catalog" | "params" | "lensParams" | "lensTemplate" | "version" | "grain" | "rootHex7" | "depthTime">): string {
  const sqls = resolvedSql(ctx), cast = isCast(ctx);
  if (kind === "sql") return sqls.map(([f, s]) => `-- ${f}\n${s};`).join("\n\n") + "\n";
  return kind === "r" ? rBody(ctx.version, ctx.sel.lens, sqls, true, cast) : pyBody(ctx.version, ctx.sel.lens, sqls, true, cast);
}
