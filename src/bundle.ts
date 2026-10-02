// D10: the download is the app handing over what it just ran — the bytes, the exact SQL against the
// release's content-addressed object URLs, the citations, and R/Python code that runs the same SQL.
import JSZip from "jszip";
import { engine, type Row } from "./engine";
import { cellToBoundary } from "h3-js";
import { members } from "./variables";

import { csv, saveBlob } from "./export";
import { citationMd } from "./cite";
// the SQL the view ran against the release's URLs, and the R / Python that runs it: pure, in reproduce.ts
import { copyAs, isCast, pyBody, rBody, resolvedSql, whereSql, type ReproCtx } from "./reproduce";
export { saveBlob, copyAs, resolvedSql };

export interface BundleCtx extends ReproCtx {
  summary: Row[]; summaryKey: string; grid: { grid_key: string; line: number; station: number; home: [number, number] }[];
  regionFeatures: any[]; datasets: Row[]; unit: string; envFile: string | null; bioSrcName: string; hexRes: number;
  onStatus?: (s: string) => void;
}
const today = () => new Date().toISOString().slice(0, 10);

export async function buildBundle(ctx: BundleCtx): Promise<{ blob: Blob; name: string }> {
  const { sel, version, catalog } = ctx;
  const say = (s: string) => ctx.onStatus?.(s);
  const zip = new JSZip();
  const url = location.href;
  const sqls = resolvedSql(ctx);
  for (const [f, s] of sqls) zip.file(`query/${f}`, `-- CalCOFI Explorer · release ${version} · ${today()}\n-- ${url}\n${s}\n`);
  zip.file("query/selection.json", JSON.stringify({ url, release: version, params: Object.fromEntries(new URLSearchParams(location.search)), generated_at: new Date().toISOString() }, null, 2));
  // every object the SQL reads, with its catalog bytes / sha256 / content_hash — the query is pinned to these
  const cast = isCast(ctx);
  const used = cast ? ["sample_measurement", "sample_root", "measurement_type", "sample_spatial"] : ["obs_bio", "sample_root", "sample_spatial", "taxon", ...(sel.realm === "env" ? ["obs_env"] : [])];
  zip.file("query/objects.json", JSON.stringify({ release: version, layout: catalog.layout, objects: used.flatMap((t) => (catalog.tables.find((x) => x.name === t)?.objects ?? []).filter((o) => t !== "obs_env" || members(sel.var).includes(String(o.partition_value))).map((o) => ({ table: t, ...o }))) }, null, 2));
  // 2. the observation rows behind the view (CSV under 300k rows; parquet always)
  say("observations…");
  const where = whereSql(ctx); // the filter the lens applied (was read off sqls[2], the depth-strip query a per-cast variable does not have)
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
  if (sel.lens === "station" || (sel.lens === "contour" && !("latitude" in (ctx.summary[0] ?? {})))) {
    const cells = new Map(ctx.grid.map((c) => [c.grid_key, c]));
    zip.file(`data/summary/${sel.lens}.geojson`, JSON.stringify({ type: "FeatureCollection", features: ctx.summary.map((r) => ({ type: "Feature", properties: r, geometry: { type: "Point", coordinates: cells.get(r.grid_key)?.home ?? null } })) }));
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
  // the same per-dataset block the Sources modal and Cite this data show (src/cite.ts): one builder, so a
  // dataset that gains a DOI or a contact cannot say one thing in the bundle and another on the screen
  const cite = ds.map(citationMd).join("\n");
  zip.file("CITATION.md", `# Citations\n\nEvery row in \`data/observations\` carries \`dataset_key\`; cite each dataset it came from, and the CalCOFI integrated database release **${version}** (https://calcofi.io/db-schema/#erd?v=${version}).\n\n${cite}`);
  const filt = [
    `release: ${version} (release_date ${catalog.release_date ?? "—"}; every object read, with bytes / sha256 / content_hash, is in query/objects.json)`,
    sel.realm === "bio" ? `taxon: ${sel.taxon} · life stage: ${sel.stage ?? "all"} · denominator: ${sel.den} (${ctx.unit}) · zeros: ${sel.zeros ? "a sampled tow with no catch counts as 0" : "positive tows only (zeros=0)"}` : cast ? `variable: ${sel.var} (${ctx.unit}) — a per-cast variable: one value per cast, sample_measurement joined to the cast's sample_root row (query/01_slice.sql); it has no depth, so no depth band applies`
      : `variable: ${sel.var} = ${members(sel.var).join(" + ")} (${ctx.unit})`,
    ...(sel.datasets ? [`datasets: ${sel.datasets.join(", ")} (pill filter)`] : []),
    `quality: qual_ok (calcofi4r::cc_qual_ok_sql) · years ${sel.months ? `${sel.years[0]}-${String(sel.months[0]).padStart(2, "0")} to ${sel.years[1]}-${String(sel.months[1]).padStart(2, "0")} (month-resolved)` : `${sel.years[0]}–${sel.years[1]}`}${sel.q?.length && sel.q.length < 4 ? ` · quarters ${sel.q.join(", ")}` : ""}${cast ? "" : ` · depth band ${sel.depth[0]}–${sel.depth[1]} m`}`,
    `lens: ${sel.lens}${sel.lens === "hex" ? ` (H3 res ${ctx.hexRes})` : ""}${sel.lens === "region" ? ` (layer ${sel.layer}; membership = sample_spatial, exact per root sample)` : ""}${sel.cruise ? ` · cruise ${sel.cruise}` : ""}${sel.lens === "section" ? ` · line ${sel.line}` : ""}${sel.lens === "contour" ? ` (surface: ${sel.interp} over the station summary; ${sel.surface}; the CSV is the station table the surface interpolates)` : ""}`,
    `observation rows: ${nObs.toLocaleString()}${nFilled ? ` (+ ${nFilled.toLocaleString()} zero-filled tows, obs_id NULL)` : ""}${nObs + nFilled > 300000 ? " (CSV omitted above 300,000 rows; parquet included)" : ""}`,
  ];
  zip.file("README.md", `# CalCOFI Explorer bundle · ${sel.lens} · ${version}\n\nGenerated ${new Date().toISOString()} from\n\n    ${url}\n\n${filt.map((f) => `- ${f}`).join("\n")}\n\n## Layout\n\n- \`data/summary/\` — the lens table as shown (CSV, + GeoJSON for map grains)\n- \`data/observations/\` — the filtered observation rows behind it (parquet${nObs + nFilled <= 300000 ? " + CSV" : ""}); every row carries dataset_key, life_stage, effort_class, the density columns, measurement_qual, depth_min_m/max_m; a row with obs_id NULL is a zero-filled absence — a tow a positive-only dataset sampled with no catch of the taxon (see query/01_slice.sql)\n- \`data/reference/\` — dataset (with citations), measurement_type and taxon rows used\n- \`query/\` — the exact SQL the browser ran, table tokens resolved to the release's canonical object URLs (content-addressed: this query runs unchanged in ten years); \`selection.json\` is the URL, verbatim\n- \`reproduce.R\` / \`reproduce.py\` — the same SQL in R (calcofi4r) and Python (calcofi4py)\n- \`CITATION.md\` — per dataset in the selection\n\nThe density columns follow plan D8: \`density_per_10m2\` (areal, depth-integrated) and \`density_per_1000m3\` (volumetric) are derived once in the release from each sample's own effort and are never converted into each other; \`effort_class\` says what a row can be standardized to.\n`);
  // 6. reproduce.R / reproduce.py: run the same SQL files in order against the same URLs
  zip.file("reproduce.R", rBody(version, sel.lens, sqls, false, cast));
  zip.file("reproduce.py", pyBody(version, sel.lens, sqls, false, cast));
  // the notebooks: the same cells, so the number in the notebook is the number on the screen
  zip.file("reproduce.qmd", `---\ntitle: "CalCOFI Explorer · ${sel.lens} · ${version}"\nformat: html\n---\n\nSelection: ${url}\n\n\`\`\`{r}\n${rBody(version, sel.lens, sqls, false, cast).replace(/^# .*\n/, "")}head(summary)\n\`\`\`\n\n\`\`\`{r}\nplot(years$year, years$mean, type = "b", xlab = "year", ylab = "${ctx.unit}")\n\`\`\`\n`);
  zip.file("reproduce.ipynb", JSON.stringify({ cells: [
    { cell_type: "markdown", metadata: {}, source: [`# CalCOFI Explorer · ${sel.lens} · ${version}\n`, `Selection: ${url}\n`] },
    { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: pyBody(version, sel.lens, sqls, false, cast).split("\n").map((l) => l + "\n") },
    { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: ["summary.head()\n"] },
  ], metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } }, nbformat: 4, nbformat_minor: 5 }, null, 1));
  say("zipping…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, name: `calcofi_explore_${sel.lens}_${version}_${today().replace(/-/g, "")}.zip` };
}

