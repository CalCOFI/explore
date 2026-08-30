// D10: the download is the app handing over what it just ran — the bytes, the exact SQL against the
// release's content-addressed object URLs, the citations, and R/Python code that runs the same SQL.
import JSZip from "jszip";
import { engine, render, type Params, type Row } from "./engine";
import { sources, readParquetSql, type Catalog } from "./release";
import { cellToBoundary } from "h3-js";
import type { Sel } from "./state";
import { members } from "./variables";

export interface BundleCtx {
  sel: Sel; version: string; catalog: Catalog; params: Params; lensParams: Params; lensTemplate: string;
  summary: Row[]; summaryKey: string; grid: { grid_key: string; line: number; station: number; home: [number, number] }[];
  regionFeatures: any[]; datasets: Row[]; unit: string; envFile: string | null; bioSrcName: string; hexRes: number;
  onStatus?: (s: string) => void;
}

import { csv, saveBlob } from "./export";
export { saveBlob };
const today = () => new Date().toISOString().slice(0, 10);

/** the SQL the view ran, in order, with the browser's registered file names replaced by the release's URLs */
export function resolvedSql(ctx: Pick<BundleCtx, "sel" | "catalog" | "params" | "lensParams" | "lensTemplate">): [string, string][] {
  const { sel, catalog } = ctx;
  const bioSrc = sources(catalog, "obs_bio"), envSrc = sources(catalog, "obs_env"), rootSrc = sources(catalog, "sample_root"), spSrc = sources(catalog, "sample_spatial"), txSrc = sources(catalog, "taxon");
  // an env variable = the union of its member objects, each stamped with its measurement_type (the hive key)
  const envUnion = sel.realm === "env" ? `(${members(sel.var).map((m) => `SELECT *, '${m}' AS measurement_type FROM read_parquet('${envSrc.partitions.get(m)}')`).join(" UNION ALL ")})` : null;
  const tokens: Params = {
    src: sel.realm === "bio" ? readParquetSql(bioSrc) : envUnion!,
    taxon_src: readParquetSql(txSrc), root_src: readParquetSql(rootSrc), spatial_src: readParquetSql(spSrc),
  };
  return [
    ["01_slice.sql", sel.realm === "bio" ? render("slice_bio", { ...tokens, taxon: sel.taxon }) : render("slice_env", tokens)],
    [`02_${ctx.lensTemplate}.sql`, render(ctx.lensTemplate, { ...ctx.params, ...ctx.lensParams, ...tokens })],
    ["03_depth_strip.sql", render("depth_strip", { ...ctx.params, ...tokens })],
    ["04_years.sql", render("years", { ...ctx.params, ...tokens })],
  ];
}
const rBody = (version: string, lens: string, sqls: [string, string][], inline: boolean) => `# CalCOFI Explorer · ${lens} · release ${version} — the same SQL the browser ran
# install.packages("duckdb"); remotes::install_github("calcofi/calcofi4r")
library(DBI)
con <- dbConnect(duckdb::duckdb())
dbExecute(con, "INSTALL httpfs; LOAD httpfs")          # the object URLs are https; no other extension is needed
${inline
  ? sqls.map(([f, s]) => `# --- ${f}\n${f.startsWith("01") ? "dbExecute" : (f.split("_")[1].replace(".sql", "")) + " <- dbGetQuery"}(con, ${JSON.stringify(s)})`).join("\n")
  : `run <- function(f) { sql <- paste(readLines(file.path("query", f)), collapse = "\\n"); if (grepl("^\\\\s*(--.*\\\\n)*\\\\s*CREATE", sql)) dbExecute(con, sql) else dbGetQuery(con, sql) }
run("${sqls[0][0]}")                                       # the slice (one taxon or one variable)
summary     <- run("${sqls[1][0]}")                        # the lens table, as in data/summary/
depth_strip <- run("03_depth_strip.sql")
years       <- run("04_years.sql")`}
# the same release through calcofi4r (catalog-resolved URLs):
# cat <- calcofi4r::cc_catalog("${version}"); calcofi4r::cc_read_parquet_sql(calcofi4r::cc_release_sources(cat, "obs_bio"))
# the quality predicate and the density expression the release used: calcofi4r::cc_qual_ok_sql(), calcofi4r::cc_density_sql()
${inline ? "" : "head(summary)\n"}`;
const pyBody = (version: string, lens: string, sqls: [string, string][], inline: boolean) => `# CalCOFI Explorer · ${lens} · release ${version} — the same SQL the browser ran
# pip install duckdb calcofi4py
import re, duckdb
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs")
${inline
  ? sqls.map(([f, s]) => `# --- ${f}\n${f.startsWith("01") ? "con.execute(" : (f.split("_")[1].replace(".sql", "")) + " = con.execute("}${JSON.stringify(s)})${f.startsWith("01") ? "" : ".df()"}`).join("\n")
  : `def run(f):
    sql = open(f"query/{f}").read()
    return con.execute(sql) if re.match(r"^\\s*(--.*\\n)*\\s*CREATE", sql) else con.execute(sql).df()
run("${sqls[0][0]}")                                       # the slice (one taxon or one variable)
summary = run("${sqls[1][0]}")                              # the lens table, as in data/summary/
depth_strip = run("03_depth_strip.sql")
years = run("04_years.sql")`}
# the same release through calcofi4py: import calcofi4py as cc; cat = cc.cc_catalog("${version}"); cc.read_parquet_sql(cc.release_sources(cat, "obs_bio"))
# quality predicate + density expression the release used: cc.qual_ok_sql(), cc.density_sql()
${inline ? "" : "print(summary.head())\n"}`;
/** "Copy as…": the whole reproduction as one pasteable text */
export function copyAs(kind: "sql" | "r" | "py", ctx: Pick<BundleCtx, "sel" | "catalog" | "params" | "lensParams" | "lensTemplate" | "version">): string {
  const sqls = resolvedSql(ctx);
  if (kind === "sql") return sqls.map(([f, s]) => `-- ${f}\n${s};`).join("\n\n") + "\n";
  return kind === "r" ? rBody(ctx.version, ctx.sel.lens, sqls, true) : pyBody(ctx.version, ctx.sel.lens, sqls, true);
}

export async function buildBundle(ctx: BundleCtx): Promise<{ blob: Blob; name: string }> {
  const { sel, version, catalog } = ctx;
  const say = (s: string) => ctx.onStatus?.(s);
  const zip = new JSZip();
  const url = location.href;
  const sqls = resolvedSql(ctx);
  for (const [f, s] of sqls) zip.file(`query/${f}`, `-- CalCOFI Explorer · release ${version} · ${today()}\n-- ${url}\n${s}\n`);
  zip.file("query/selection.json", JSON.stringify({ url, release: version, params: Object.fromEntries(new URLSearchParams(location.search)), generated_at: new Date().toISOString() }, null, 2));
  // every object the SQL reads, with its catalog bytes / sha256 / content_hash — the query is pinned to these
  const used = ["obs_bio", "sample_root", "sample_spatial", "taxon", ...(sel.realm === "env" ? ["obs_env"] : [])];
  zip.file("query/objects.json", JSON.stringify({ release: version, layout: catalog.layout, objects: used.flatMap((t) => (catalog.tables.find((x) => x.name === t)?.objects ?? []).filter((o) => t !== "obs_env" || members(sel.var).includes(String(o.partition_value))).map((o) => ({ table: t, ...o }))) }, null, 2));
  // 2. the observation rows behind the view (CSV under 300k rows; parquet always)
  say("observations…");
  const where = sqls[2][1].split("WHERE")[1].split("GROUP BY")[0].replace(/depth_bin IS NOT NULL AND/, "");
  const cnt = (await engine.exec(`SELECT count(obs_id) AS n, count(*) FILTER (WHERE obs_id IS NULL) AS n_filled FROM slice WHERE ${where}`, "bundle_count"))[0];
  const nObs = cnt.n as number, nFilled = cnt.n_filled as number;
  await engine.exec(`COPY (SELECT * FROM slice WHERE ${where} ORDER BY obs_id) TO 'bundle_obs.parquet' (FORMAT parquet, COMPRESSION zstd)`, "bundle_parquet");
  zip.file("data/observations/observations.parquet", await engine.db.copyFileToBuffer("bundle_obs.parquet"));
  if (nObs + nFilled <= 300000) {
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
    sel.realm === "bio" ? `taxon: ${sel.taxon} · life stage: ${sel.stage ?? "all"} · denominator: ${sel.den} (${ctx.unit})` : `variable: ${sel.var} = ${members(sel.var).join(" + ")} (${ctx.unit})`,
    ...(sel.datasets ? [`datasets: ${sel.datasets.join(", ")} (pill filter)`] : []),
    `quality: qual_ok (calcofi4r::cc_qual_ok_sql) · years ${sel.months ? `${sel.years[0]}-${String(sel.months[0]).padStart(2, "0")} to ${sel.years[1]}-${String(sel.months[1]).padStart(2, "0")} (month-resolved)` : `${sel.years[0]}–${sel.years[1]}`}${sel.q?.length && sel.q.length < 4 ? ` · quarters ${sel.q.join(", ")}` : ""} · depth band ${sel.depth[0]}–${sel.depth[1]} m`,
    `lens: ${sel.lens}${sel.lens === "hex" ? ` (H3 res ${ctx.hexRes})` : ""}${sel.lens === "region" ? ` (layer ${sel.layer}; membership = sample_spatial, exact per root sample)` : ""}${sel.cruise ? ` · cruise ${sel.cruise}` : ""}${sel.lens === "section" ? ` · line ${sel.line}` : ""}`,
    `observation rows: ${nObs.toLocaleString()}${nFilled ? ` (+ ${nFilled.toLocaleString()} zero-filled tows, obs_id NULL)` : ""}${nObs + nFilled > 300000 ? " (CSV omitted above 300,000 rows; parquet included)" : ""}`,
  ];
  zip.file("README.md", `# CalCOFI Explorer bundle · ${sel.lens} · ${version}\n\nGenerated ${new Date().toISOString()} from\n\n    ${url}\n\n${filt.map((f) => `- ${f}`).join("\n")}\n\n## Layout\n\n- \`data/summary/\` — the lens table as shown (CSV, + GeoJSON for map grains)\n- \`data/observations/\` — the filtered observation rows behind it (parquet${nObs + nFilled <= 300000 ? " + CSV" : ""}); every row carries dataset_key, life_stage, effort_class, the density columns, measurement_qual, depth_min_m/max_m; a row with obs_id NULL is a zero-filled absence — a tow a positive-only dataset sampled with no catch of the taxon (see query/01_slice.sql)\n- \`data/reference/\` — dataset (with citations), measurement_type and taxon rows used\n- \`query/\` — the exact SQL the browser ran, table tokens resolved to the release's canonical object URLs (content-addressed: this query runs unchanged in ten years); \`selection.json\` is the URL, verbatim\n- \`reproduce.R\` / \`reproduce.py\` — the same SQL in R (calcofi4r) and Python (calcofi4py)\n- \`CITATION.md\` — per dataset in the selection\n\nThe density columns follow plan D8: \`density_per_10m2\` (areal, depth-integrated) and \`density_per_1000m3\` (volumetric) are derived once in the release from each sample's own effort and are never converted into each other; \`effort_class\` says what a row can be standardized to.\n`);
  // 6. reproduce.R / reproduce.py: run the same SQL files in order against the same URLs
  zip.file("reproduce.R", rBody(version, sel.lens, sqls, false));
  zip.file("reproduce.py", pyBody(version, sel.lens, sqls, false));
  // the notebooks: the same cells, so the number in the notebook is the number on the screen
  zip.file("reproduce.qmd", `---\ntitle: "CalCOFI Explorer · ${sel.lens} · ${version}"\nformat: html\n---\n\nSelection: ${url}\n\n\`\`\`{r}\n${rBody(version, sel.lens, sqls, false).replace(/^# .*\n/, "")}head(summary)\n\`\`\`\n\n\`\`\`{r}\nplot(years$year, years$mean, type = "b", xlab = "year", ylab = "${ctx.unit}")\n\`\`\`\n`);
  zip.file("reproduce.ipynb", JSON.stringify({ cells: [
    { cell_type: "markdown", metadata: {}, source: [`# CalCOFI Explorer · ${sel.lens} · ${version}\n`, `Selection: ${url}\n`] },
    { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: pyBody(version, sel.lens, sqls, false).split("\n").map((l) => l + "\n") },
    { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: ["summary.head()\n"] },
  ], metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } }, nbformat: 4, nbformat_minor: 5 }, null, 1));
  say("zipping…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, name: `calcofi_explore_${sel.lens}_${version}_${today().replace(/-/g, "")}.zip` };
}

