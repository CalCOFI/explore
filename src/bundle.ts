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
  regionCols?: RegionCols | null;
  var2Cols?: Var2Cols | null;
  onStatus?: (s: string) => void;
}
const today = () => new Date().toISOString().slice(0, 10);

/** the region columns (Betty 2026-11-10): when a boundary layer is in play (Where › Regions from, or the Regions view), every
 *  row says which region it falls in — `region` (the layer, e.g. "Wind Energy Area") and `region_name` (e.g. "OCS-P 0563
 *  Commercial – Equinor Wind US LLC"), from the release's sample_spatial membership. A sample in two overlapping regions
 *  is one row per region; a row in none of the layer's regions has both empty */
export interface RegionCols { layer: string; names: string[] | null; src: string }
/** "Add a variable" (Betty 2026-11-11): the second water variable, matched by hexagon (`hex` = its H3 expression at the map's size) */
export interface Var2Cols { key: string; hex: string; km: string; where: string }
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** the column dictionary the zip carries (Betty 2026-11-11: "value" alone does not say it is the raw sardine count) */
const DICT: Record<string, string> = {
  obs_id: "observation id in the release; blank = a tow that sampled this taxon's dataset but caught none (zero-filled)",
  dataset_key: "the dataset the row comes from (names and citations: data/reference/dataset.csv)",
  root_id: "the sample (tow or cast) the observation belongs to",
  grid_key: "CalCOFI station-grid cell; blank = taken off the station grid",
  site_key: "line and station as recorded (\"LLL.L SSS.S\")",
  line: "CalCOFI line number (from site_key)", station: "CalCOFI station number (from site_key)",
  cruise_key: "cruise id", latitude: "where the sample was taken, decimal degrees north", longitude: "where the sample was taken, decimal degrees east (negative = west)",
  datetime: "date and time of the sample, as recorded", year: "the cruise's year (its median date)",
  quarter: "the cruise's season: 1 = Dec–Feb, 2 = Mar–May, 3 = Jun–Aug, 4 = Sep–Nov",
  depth_min_m: "top of the sample, m", depth_max_m: "bottom of the sample, m", depth_bin: "the sample's 10 m depth bin, m",
  taxon_key: "taxon id (worms:<AphiaID> = World Register of Marine Species)", scientific_name: "the taxon's scientific name", common_name: "the taxon's common name",
  life_stage: "life stage (e.g. egg, larva)", measurement_type: "what `value` measures (definitions: data/reference/measurement_type.csv)", units: "the units of `value`",
  value: "the measurement as recorded, in `units` — for a species, the raw count in the sample, NOT standardized (see density_per_10m2 / density_per_1000m3)",
  measurement_qual: "quality flag as recorded by the provider", qual_ok: "passed the release's quality check (every row here does)",
  tow_type: "net / gear code of the tow", std_haul_factor: "standard haul factor = 10 × tow depth (m) ÷ volume strained (m³)",
  prop_sorted: "fraction of the sample that was sorted", volume_sampled_m3: "volume of water filtered, m³",
  density_per_10m2: "count standardized per 10 m² of sea surface (areal, depth-integrated); blank where the tow cannot be standardized this way",
  density_per_1000m3: "count standardized per 1000 m³ of water filtered (volumetric)", effort_class: "what the row can be standardized to",
  hex7: "H3 hexagon cell at resolution 7, as an integer (internal)", cruise_month: "the cruise's month (its median cast month)",
  season_year: "the season's year (December counts toward the next winter)",
  hex: "the map's hexagon this row falls in (H3 index)", hex_size_km: "that hexagon's size, km",
  hex_mean: "mean of the map's value in this hexagon (map's units)", hex_median: "median of the map's value in this hexagon", hex_n: "records in this hexagon (for a species: samples that caught it — zero-filled tows are in the mean, not in this count)",
  station_mean: "mean of the map's value at this station (map's units)", station_median: "median of the map's value at this station", station_n: "records at this station (for a species: samples that caught it — zero-filled tows are in the mean, not in this count)",
  region: "the boundary layer (e.g. Marine Protected Areas)", region_name: "the region within it this sample falls in; a sample in two overlapping regions is one row per region",
  region_mean: "mean of the map's value in this region (map's units)", region_median: "median of the map's value in this region", region_n: "records in this region (for a species: samples that caught it — zero-filled tows are in the mean, not in this count)",
};
const describeCol = (c: string, unit: string) => {
  const m = /^(.+)_hex_(mean|n)$/.exec(c);
  if (m && !(c in DICT)) return m[2] === "mean" ? `the added variable (${m[1]}): its mean in this row's hexagon, same years, seasons, area and depth band` : `the added variable (${m[1]}): its observations in this row's hexagon`;
  const d = DICT[c] ?? "";
  return d.replace("(map's units)", unit ? `(${unit})` : "");
};
const HEX_KM: Record<number, string> = { 3: "60", 4: "23", 5: "8.5", 6: "3.2", 7: "1.2" };
/** the rows behind the view, with the view's own grouping on every row (Betty 2026-11-10: one plain CSV should hold what a
 *  person needs — no second file): the hexagon at the chosen size (Hexagon), the station (Stations / Contours) or the region
 *  (a boundary layer in play), each with the mean, median and count the map shows for that group. The group's numbers are
 *  computed over `statsWhere` — the map's own filter — so unticking the zero-filled tows in the CSV does not change them */
const viewRows = (where: string, ctx: ReproCtx, rc: RegionCols | null | undefined, statsWhere = where, v2?: Var2Cols | null) => {
  const val = String(ctx.params.val ?? "value");
  const lens = ctx.sel.lens;
  const hexE = lens === "hex" && ctx.lensParams.hex ? String(ctx.lensParams.hex) : null;
  const sel: string[] = ["f.*"], joins: string[] = [];
  const stats = (alias: string, key: string, src: string, pre: string) => {
    joins.push(`LEFT JOIN (SELECT ${key} AS k, avg(${val}) AS mean, median(${val}) AS med, count(obs_id) AS n FROM ${src} GROUP BY 1) ${alias} ON ${alias}.k = ${pre}`);
    sel.push(`${alias}.mean AS ${alias}_mean`, `${alias}.med AS ${alias}_median`, `${alias}.n AS ${alias}_n`);
  };
  // the species by name, not only its WoRMS id (Betty 2026-11-11)
  if (ctx.sel.realm === "bio") {
    joins.push(`LEFT JOIN (SELECT taxon_key AS tk, any_value(scientific_name) AS scientific_name, any_value(common_name) AS common_name FROM 'taxon.parquet' GROUP BY 1) tx ON tx.tk = f.taxon_key`);
    sel.push("tx.scientific_name", "tx.common_name");
  }
  if (hexE) {
    sel.push(`CASE WHEN f.hex7 IS NOT NULL THEN ${hexE.replace(/\bhex7\b/g, "f.hex7")} END AS hex`, `CASE WHEN f.hex7 IS NOT NULL THEN '${HEX_KM[ctx.sel.res] ?? ""}' END AS hex_size_km`);
    stats("hex", hexE, `slice WHERE hex7 IS NOT NULL AND ${statsWhere}`, `CASE WHEN f.hex7 IS NOT NULL THEN ${hexE.replace(/\bhex7\b/g, "f.hex7")} END`);
  } else if (lens === "station" || lens === "contour") stats("station", "grid_key", `slice WHERE grid_key IS NOT NULL AND ${statsWhere}`, "f.grid_key");
  if (rc) {
    const spSel = `SELECT DISTINCT root_id, layer, spatial_name FROM ${rc.src} WHERE layer = ${lit(rc.layer)}${rc.names?.length ? ` AND spatial_name IN (${rc.names.map(lit).join(", ")})` : ""}`;
    joins.unshift(`LEFT JOIN (${spSel}) sp USING (root_id)`);
    sel.push("sp.layer AS region", "sp.spatial_name AS region_name");
    stats("region", "sp2.spatial_name", `(SELECT * FROM slice WHERE ${statsWhere}) s2 JOIN (${spSel}) sp2 USING (root_id)`, "sp.spatial_name");
  }
  // the second variable: its mean and count in the same hexagon as the row (the hexagon at the map's size, named on the row)
  if (v2) {
    const fx = `CASE WHEN f.hex7 IS NOT NULL THEN ${v2.hex.replace(/\bhex7\b/g, "f.hex7")} END`;
    if (!hexE) sel.push(`${fx} AS hex`, `CASE WHEN f.hex7 IS NOT NULL THEN '${v2.km}' END AS hex_size_km`);
    const nm = v2.key.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
    joins.push(`LEFT JOIN (SELECT ${v2.hex} AS k, avg(value) AS mean, count(obs_id) AS n FROM slice2 WHERE hex7 IS NOT NULL AND ${v2.where} GROUP BY 1) v2 ON v2.k = ${fx}`);
    sel.push(`v2.mean AS ${nm}_hex_mean`, `v2.n AS ${nm}_hex_n`);
  }
  return `SELECT ${sel.join(", ")} FROM (SELECT * FROM slice WHERE ${where}) f ${joins.join(" ")} ORDER BY f.obs_id${rc ? ", region_name" : ""}`;
};

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
  // the depth × time anomaly card's statements (explore#28) read the variable's climatology objects too
  const dtClim = sqls.some(([f]) => f === "05_anom_slice.sql") ? ctx.depthTime?.clim ?? [] : [];
  const used = cast ? ["sample_measurement", "sample_root", "measurement_type", "sample_spatial"] : ["obs_bio", "sample_root", "sample_spatial", "taxon", ...(sel.realm === "env" ? ["obs_env"] : []), ...(dtClim.length ? ["climatology"] : [])];
  const partOk = (t: string, v: unknown) => t === "obs_env" ? members(sel.var).includes(String(v)) : t === "climatology" ? dtClim.includes(String(v)) : true;
  zip.file("query/objects.json", JSON.stringify({ release: version, layout: catalog.layout, objects: used.flatMap((t) => (catalog.tables.find((x) => x.name === t)?.objects ?? []).filter((o) => partOk(t, o.partition_value)).map((o) => ({ table: t, ...o }))) }, null, 2));
  // 2. the observation rows behind the view (CSV under 300k rows; parquet always)
  say("observations…");
  const ft = `bundle_obs_${Date.now()}`;
  const where = whereSql(ctx); // the filter the lens applied (was read off sqls[2], the depth-strip query a per-cast variable does not have)
  const cnt = (await engine.exec(`SELECT count(obs_id) AS n, count(*) FILTER (WHERE obs_id IS NULL) AS n_filled FROM slice WHERE ${where}`, "bundle_count"))[0];
  const nObs = cnt.n as number, nFilled = cnt.n_filled as number;
  await engine.exec(`COPY (${viewRows(where, ctx, ctx.regionCols, where, ctx.var2Cols)}) TO '${ft}.parquet' (FORMAT parquet, COMPRESSION zstd)`, "bundle_parquet");
  zip.file("data/observations/observations.parquet", await takeFile(`${ft}.parquet`));
  const obsCols = (await engine.exec(`DESCRIBE ${viewRows(where, ctx, ctx.regionCols, where, ctx.var2Cols)}`, "bundle_columns")).map((r) => String(r.column_name));
  zip.file("data/observations/column_dictionary.csv", csv(obsCols.map((c) => ({ column: c, description: describeCol(c, ctx.unit) }))));
  if (nObs + nFilled <= 300000) {
    await engine.exec(`COPY (${viewRows(where, ctx, ctx.regionCols, where, ctx.var2Cols)}) TO '${ft}.csv' (FORMAT csv, HEADER)`, "bundle_csv");
    zip.file("data/observations/observations.csv", await takeFile(`${ft}.csv`));
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
    ...(ctx.var2Cols ? [`added variable: ${ctx.var2Cols.key}, matched by hexagon (${ctx.var2Cols.km} km): its mean and count in the row's hexagon, same years, seasons, area and depth band`] : []),
    ...(ctx.regionCols ? [`regions: ${ctx.regionCols.layer}${ctx.regionCols.names?.length ? ` (${ctx.regionCols.names.join("; ")})` : " (every region of the layer)"}; each observation row carries region and region_name (one row per region a sample falls in)`] : []),
    `observation rows: ${nObs.toLocaleString()}${nFilled ? ` (+ ${nFilled.toLocaleString()} zero-filled tows, obs_id NULL)` : ""}${nObs + nFilled > 300000 ? " (CSV omitted above 300,000 rows; parquet included)" : ""}`,
  ];
  zip.file("README.md", `# CalCOFI Explorer bundle · ${sel.lens} · ${version}\n\nGenerated ${new Date().toISOString()} from\n\n    ${url}\n\n${filt.map((f) => `- ${f}`).join("\n")}\n\n## Layout\n\n- \`data/summary/\` — the lens table as shown (CSV, + GeoJSON for map grains)\n- \`data/observations/\` — the filtered observation rows behind it, and \`column_dictionary.csv\` (what every column means) (parquet${nObs + nFilled <= 300000 ? " + CSV" : ""}); every row carries dataset_key, life_stage, effort_class, the density columns, measurement_qual, depth_min_m/max_m; a row with obs_id NULL is a zero-filled absence — a tow a positive-only dataset sampled with no catch of the taxon (see query/01_slice.sql)\n- \`data/reference/\` — dataset (with citations), measurement_type and taxon rows used\n- \`query/\` — the exact SQL the browser ran, table tokens resolved to the release's canonical object URLs (content-addressed: this query runs unchanged in ten years); \`selection.json\` is the URL, verbatim\n- \`reproduce.R\` / \`reproduce.py\` — the same SQL in R (calcofi4r) and Python (calcofi4py)\n- \`CITATION.md\` — per dataset in the selection\n\nThe density columns follow plan D8: \`density_per_10m2\` (areal, depth-integrated) and \`density_per_1000m3\` (volumetric) are derived once in the release from each sample's own effort and are never converted into each other; \`effort_class\` says what a row can be standardized to.\n`);
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


/** read an exported virtual file out of DuckDB-WASM and DROP it. The old fixed names ('obs_only.csv') were reused, and a
 *  shorter second export left the first one's length behind: a 2021-2026 CSV came out the size of the 2000-2026 one before it */
async function takeFile(name: string): Promise<Uint8Array> {
  const buf = await engine.db.copyFileToBuffer(name);
  try { await engine.db.dropFile(name); } catch { /* already gone */ }
  return buf;
}

/** the lean layout's Download CSV: the filtered observation rows behind the view as one CSV — the same `slice` and filter
 *  the zip package's observations/ folder is written from, without the zip. Refuses past a million rows (a CSV that big
 *  is the wrong container: the package carries parquet) */
/** how many of the CSV's rows are zero-filled tows (no catch, obs_id NULL) under the same filters and lens line — the panel says it beside the count */
export async function countZeroRows(ctx: ReproCtx): Promise<{ rows: number; zeros: number }> {
  const q = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`;
  const own: string[] = [];
  if (ctx.sel.lens === "section" && Number.isFinite(Number(ctx.sel.line))) {
    own.push(`line = ${Number(ctx.sel.line)}`);
    if (ctx.sel.realm !== "bio" && ctx.sel.cruise) own.push(`cruise_key = ${q(ctx.sel.cruise)}`);
  } else if (ctx.sel.lens === "cruise" && ctx.sel.cruise) own.push(`cruise_key = ${q(ctx.sel.cruise)}`);
  const where = [whereSql(ctx), ...own].join(" AND ");
  const r = (await engine.exec(`SELECT count(*) AS n, count(*) FILTER (WHERE obs_id IS NULL) AS z FROM slice WHERE ${where}`, "csv_zero_count"))[0];
  return { rows: Number(r.n), zeros: Number(r.z) };
}

export async function buildObservationsCsv(ctx: ReproCtx, opts: { zeros?: boolean; regionCols?: RegionCols | null; var2Cols?: Var2Cols | null } = {}): Promise<{ blob: Blob; name: string; n: number }> {
  const fn = `obs_only_${Date.now()}`;
  // the file is what the screen shows: the lens's own line / cruise on top of the filters, and — when the person unticks it —
  // without the zero-filled tows (obs_id NULL), which are most of the rows of a common taxon
  const q = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`;
  const own: string[] = [];
  if (ctx.sel.lens === "section" && Number.isFinite(Number(ctx.sel.line))) {
    own.push(`line = ${Number(ctx.sel.line)}`);
    if (ctx.sel.realm !== "bio" && ctx.sel.cruise) own.push(`cruise_key = ${q(ctx.sel.cruise)}`);
  } else if (ctx.sel.lens === "cruise" && ctx.sel.cruise) own.push(`cruise_key = ${q(ctx.sel.cruise)}`);
  const statsWhere = [whereSql(ctx), ...own].join(" AND ");
  if (opts.zeros === false) own.push("obs_id IS NOT NULL");
  const where = [whereSql(ctx), ...own].join(" AND ");
  const cnt = (await engine.exec(`SELECT count(*) AS n FROM slice WHERE ${where}`, "csv_count"))[0];
  const n = Number(cnt.n);
  if (n > 1_000_000) throw new Error(`${n.toLocaleString()} rows is too many for one CSV — use "Everything as a package", which carries parquet`);
  await engine.exec(`COPY (${viewRows(where, ctx, opts.regionCols, statsWhere, opts.var2Cols)}) TO '${fn}.csv' (FORMAT csv, HEADER)`, "obs_csv");
  const buf = await takeFile(`${fn}.csv`);
  const what = String(ctx.sel.realm === "bio" ? ctx.sel.taxon : ctx.sel.var).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
  return { blob: new Blob([buf as BlobPart], { type: "text/csv" }), name: `calcofi_${what}_${ctx.version}_${today().replace(/-/g, "")}.csv`, n };
}
