// D10: the download is the app handing over what it just ran — the bytes, the exact SQL against the
// release's content-addressed object URLs, the citations, and R/Python code that runs the same SQL.
import JSZip from "jszip";
import { engine, render, type Params, type Row } from "./engine";
import { sources, readParquetSql, type Catalog } from "./release";
import { cellToBoundary } from "h3-js";
import type { Sel } from "./state";

export interface BundleCtx {
  sel: Sel; version: string; catalog: Catalog; params: Params; lensParams: Params; lensTemplate: string;
  summary: Row[]; summaryKey: string; grid: { grid_key: string; line: number; station: number; home: [number, number] }[];
  regionFeatures: any[]; datasets: Row[]; unit: string; envFile: string | null; bioSrcName: string; hexRes: number;
  onStatus?: (s: string) => void;
}

function csv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => v == null ? "" : typeof v === "number" ? String(v) : (v instanceof Date ? v.toISOString() : `"${String(v).replace(/"/g, '""')}"`);
  return cols.join(",") + "\n" + rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n") + "\n";
}
const today = () => new Date().toISOString().slice(0, 10);

export async function buildBundle(ctx: BundleCtx): Promise<{ blob: Blob; name: string }> {
  const { sel, version, catalog } = ctx;
  const say = (s: string) => ctx.onStatus?.(s);
  const zip = new JSZip();
  const url = location.href;
  // the object URLs the SQL will read — canonical, content-addressed, immutable
  const bioSrc = sources(catalog, "obs_bio"), envSrc = sources(catalog, "obs_env"), rootSrc = sources(catalog, "sample_root"), spSrc = sources(catalog, "sample_spatial"), txSrc = sources(catalog, "taxon");
  const envUrl = sel.realm === "env" ? envSrc.partitions.get(sel.var) : null;
  const srcSql = sel.realm === "bio" ? readParquetSql(bioSrc) : `read_parquet('${envUrl}')`;
  const tokens: Params = {
    src: srcSql, taxon_src: readParquetSql(txSrc), root_src: readParquetSql(rootSrc), spatial_src: readParquetSql(spSrc),
  };
  // 1. the exact SQL, in order, with the browser's registered file names replaced by the URLs
  const sqls: [string, string][] = [];
  sqls.push(["01_slice.sql", sel.realm === "bio" ? render("slice_bio", { ...tokens, taxon: sel.taxon }) : render("slice_env", { ...tokens, var: sel.var })]);
  sqls.push([`02_${ctx.lensTemplate}.sql`, render(ctx.lensTemplate, { ...ctx.params, ...ctx.lensParams, ...tokens })]);
  sqls.push(["03_depth_strip.sql", render("depth_strip", { ...ctx.params, ...tokens })]);
  sqls.push(["04_years.sql", render("years", { ...ctx.params, ...tokens })]);
  for (const [f, s] of sqls) zip.file(`query/${f}`, `-- CalCOFI Explorer · release ${version} · ${today()}\n-- ${url}\n${s}\n`);
  zip.file("query/selection.json", JSON.stringify({ url, release: version, params: Object.fromEntries(new URLSearchParams(location.search)), generated_at: new Date().toISOString() }, null, 2));
  // every object the SQL reads, with its catalog bytes / sha256 / content_hash — the query is pinned to these
  const used = ["obs_bio", "sample_root", "sample_spatial", "taxon", ...(sel.realm === "env" ? ["obs_env"] : [])];
  zip.file("query/objects.json", JSON.stringify({ release: version, layout: catalog.layout, objects: used.flatMap((t) => (catalog.tables.find((x) => x.name === t)?.objects ?? []).filter((o) => t !== "obs_env" || o.partition_value === sel.var).map((o) => ({ table: t, ...o }))) }, null, 2));
  // 2. the observation rows behind the view (CSV under 300k rows; parquet always)
  say("observations…");
  const where = render("depth_strip", { ...ctx.params, ...tokens }).split("WHERE")[1].split("GROUP BY")[0].replace(/depth_bin IS NOT NULL AND/, "");
  const nObs = (await engine.exec(`SELECT count(*) AS n FROM slice WHERE ${where}`, "bundle_count"))[0].n as number;
  await engine.exec(`COPY (SELECT * FROM slice WHERE ${where} ORDER BY obs_id) TO 'bundle_obs.parquet' (FORMAT parquet, COMPRESSION zstd)`, "bundle_parquet");
  zip.file("data/observations/observations.parquet", await engine.db.copyFileToBuffer("bundle_obs.parquet"));
  if (nObs <= 300000) {
    await engine.exec(`COPY (SELECT * FROM slice WHERE ${where} ORDER BY obs_id) TO 'bundle_obs.csv' (FORMAT csv, HEADER)`, "bundle_csv");
    zip.file("data/observations/observations.csv", await engine.db.copyFileToBuffer("bundle_obs.csv"));
  }
  // 3. the summary as shown, plus geometry for map grains
  say("summary…");
  zip.file(`data/summary/${sel.lens}.csv`, csv(ctx.summary));
  if (sel.lens === "station") {
    const cells = new Map(ctx.grid.map((c) => [c.grid_key, c]));
    zip.file("data/summary/station.geojson", JSON.stringify({ type: "FeatureCollection", features: ctx.summary.map((r) => ({ type: "Feature", properties: r, geometry: { type: "Point", coordinates: cells.get(r.grid_key)?.home ?? null } })) }));
  } else if (sel.lens === "hex") {
    zip.file("data/summary/hex.geojson", JSON.stringify({ type: "FeatureCollection", features: ctx.summary.map((r) => ({ type: "Feature", properties: r, geometry: { type: "Polygon", coordinates: [cellToBoundary(r.hex, true)] } })) }));
  } else if (sel.lens === "region") {
    const st = new Map(ctx.summary.map((r) => [r.spatial_key, r]));
    zip.file("data/summary/region.geojson", JSON.stringify({ type: "FeatureCollection", features: ctx.regionFeatures.map((f) => ({ ...f, properties: { ...f.properties, ...(st.get(f.properties.spatial_key) ?? { n: 0 }) } })) }));
  }
  // 4. reference rows: the datasets in the selection (with citations), the measurement types and taxon used
  const dsKeys = [...new Set((await engine.exec(`SELECT DISTINCT dataset_key FROM slice WHERE ${where}`, "bundle_datasets")).map((r) => r.dataset_key))];
  const ds = ctx.datasets.filter((d) => dsKeys.includes(d.dataset_key));
  zip.file("data/reference/dataset.csv", csv(ds));
  zip.file("data/reference/measurement_type.csv", csv(await engine.exec(`SELECT m.* FROM 'measurement_type.parquet' m WHERE measurement_type IN (SELECT DISTINCT measurement_type FROM slice WHERE ${where})`, "bundle_mt")));
  if (sel.realm === "bio") zip.file("data/reference/taxon.csv", csv(await engine.exec(`SELECT * FROM 'taxon.parquet' WHERE taxon_key = '${sel.taxon}'`, "bundle_taxon")));
  // 5. CITATION.md and README.md
  const cite = ds.map((d) => `## ${d.dataset_name ?? d.dataset_key} (\`${d.dataset_key}\`)\n\n${d.citation_main ? `${d.citation_main}\n\n` : ""}${d.citation_others ? `Also cite: ${d.citation_others}\n\n` : ""}${d.license ? `License: ${d.license}  \n` : ""}${d.pi_names ? `PIs: ${d.pi_names}  \n` : ""}${d.link_data_source ? `Source: ${d.link_data_source}  \n` : ""}${d.link_calcofi_org ? `CalCOFI: ${d.link_calcofi_org}\n` : ""}`).join("\n");
  zip.file("CITATION.md", `# Citations\n\nEvery row in \`data/observations\` carries \`dataset_key\`; cite each dataset it came from, and the CalCOFI integrated database release **${version}** (https://calcofi.io/db-schema/#erd?v=${version}).\n\n${cite}`);
  const filt = [
    `release: ${version} (release_date ${catalog.release_date ?? "—"}; every object read, with bytes / sha256 / content_hash, is in query/objects.json)`,
    sel.realm === "bio" ? `taxon: ${sel.taxon} · life stage: ${sel.stage ?? "all"} · denominator: ${sel.den} (${ctx.unit})` : `variable: ${sel.var} (${ctx.unit})`,
    `quality: qual_ok (calcofi4r::cc_qual_ok_sql) · years ${sel.years[0]}–${sel.years[1]} · depth band ${sel.depth[0]}–${sel.depth[1]} m`,
    `lens: ${sel.lens}${sel.lens === "hex" ? ` (H3 res ${ctx.hexRes})` : ""}${sel.lens === "region" ? ` (layer ${sel.layer}; membership = sample_spatial, exact per root sample)` : ""}${sel.cruise ? ` · cruise ${sel.cruise}` : ""}${sel.lens === "section" ? ` · line ${sel.line}` : ""}`,
    `observation rows: ${nObs.toLocaleString()}${nObs > 300000 ? " (CSV omitted above 300,000 rows; parquet included)" : ""}`,
  ];
  zip.file("README.md", `# CalCOFI Explorer bundle · ${sel.lens} · ${version}\n\nGenerated ${new Date().toISOString()} from\n\n    ${url}\n\n${filt.map((f) => `- ${f}`).join("\n")}\n\n## Layout\n\n- \`data/summary/\` — the lens table as shown (CSV, + GeoJSON for map grains)\n- \`data/observations/\` — the filtered observation rows behind it (parquet${nObs <= 300000 ? " + CSV" : ""}); every row carries dataset_key, life_stage, effort_class, the density columns, measurement_qual, depth_min_m/max_m\n- \`data/reference/\` — dataset (with citations), measurement_type and taxon rows used\n- \`query/\` — the exact SQL the browser ran, table tokens resolved to the release's canonical object URLs (content-addressed: this query runs unchanged in ten years); \`selection.json\` is the URL, verbatim\n- \`reproduce.R\` / \`reproduce.py\` — the same SQL in R (calcofi4r) and Python (calcofi4py)\n- \`CITATION.md\` — per dataset in the selection\n\nThe density columns follow plan D8: \`density_per_10m2\` (areal, depth-integrated) and \`density_per_1000m3\` (volumetric) are derived once in the release from each sample's own effort and are never converted into each other; \`effort_class\` says what a row can be standardized to.\n`);
  // 6. reproduce.R / reproduce.py: run the same SQL files in order against the same URLs
  zip.file("reproduce.R", `# CalCOFI Explorer · ${sel.lens} · release ${version} — the same SQL the browser ran
# install.packages("duckdb"); remotes::install_github("calcofi/calcofi4r")
library(DBI)
con <- dbConnect(duckdb::duckdb())
dbExecute(con, "INSTALL httpfs; LOAD httpfs")          # the object URLs are https; no other extension is needed
run <- function(f) { sql <- paste(readLines(file.path("query", f)), collapse = "\\n"); if (grepl("^\\\\s*(--.*\\\\n)*\\\\s*CREATE", sql)) dbExecute(con, sql) else dbGetQuery(con, sql) }
for (f in c(${sqls.slice(0, 1).map(([f]) => `"${f}"`).join(", ")})) run(f)          # the slice (one taxon or one variable)
summary     <- run("${sqls[1][0]}")                      # the lens table, as in data/summary/
depth_strip <- run("03_depth_strip.sql")
years       <- run("04_years.sql")
# the same release through calcofi4r (catalog-resolved URLs):
# cat <- calcofi4r::cc_catalog("${version}"); calcofi4r::cc_read_parquet_sql(calcofi4r::cc_release_sources(cat, "obs_bio"))
# the quality predicate and the density expression used by the release: calcofi4r::cc_qual_ok_sql(), calcofi4r::cc_density_sql()
head(summary)
`);
  zip.file("reproduce.py", `# CalCOFI Explorer · ${sel.lens} · release ${version} — the same SQL the browser ran
# pip install duckdb calcofi4py
import re, duckdb
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs")
def run(f):
    sql = open(f"query/{f}").read()
    return con.execute(sql) if re.match(r"^\\s*(--.*\\n)*\\s*CREATE", sql) else con.execute(sql).df()
run("${sqls[0][0]}")                                       # the slice (one taxon or one variable)
summary = run("${sqls[1][0]}")                              # the lens table, as in data/summary/
depth_strip = run("03_depth_strip.sql")
years = run("04_years.sql")
# the same release through calcofi4py: import calcofi4py as cc; cat = cc.cc_catalog("${version}"); cc.read_parquet_sql(cc.release_sources(cat, "obs_bio"))
# quality predicate + density expression used by the release: cc.qual_ok_sql(), cc.density_sql()
print(summary.head())
`);
  say("zipping…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, name: `calcofi_explore_${sel.lens}_${version}_${today().replace(/-/g, "")}.zip` };
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
