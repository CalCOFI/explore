// what the Query Builder lists and loads: the release's coverage sidecar (every species and measurement, before any WASM),
// the station grid (for the standard / extended patterns and the lines), and — only when a table is built — the
// observation objects of the picks, registered in the Explorer's engine under the Explorer's names.
import { engine, type Row } from "../engine";
import { fetchCatalog, resolveVersion, sidecarUrl, sources, type Catalog } from "../release";
import { cruiseSrcSql, type Params } from "../sqltpl";
import { CATEGORY_ORDER, DATASET_CATEGORY_FALLBACK, envCategory } from "../categories";
import { fixDisplayName, titleCaseCommonName } from "../names";
import { UNIFIED } from "../variables";

// one pickable column: a species or a water measurement IN ONE DATASET (Betty 2026-11-13: the same species or measurement
// comes from several datasets — ichthyo and ZooScan, bottle and CTD — so each is listed, and picked, under its dataset)
export interface ListItem { realm: "bio" | "env"; id: string; key: string; dataset: string; category: string; label: string; sub: string | null; members: string[]; units: string | null; stages: string[]; n: number }
export interface Group { dataset: string; category: string; realm: "bio" | "env"; items: ListItem[] }
// gridDatasets: the datasets with at least one sample on the station grid (coverage.json stations[].datasets); a dataset
// outside it (the phytoplankton net samples) has nothing under the Stations lens
export interface Boot { version: string; catalog: Catalog; groups: Group[]; gridKeys: Map<string, string[]>; allKeys: string[]; years: [number, number]; gridDatasets: Set<string> }

const q = (name: string) => `'${name}'`;
export const REG = { obs_bio: "obs_bio.parquet", sample_spatial: "sample_spatial.parquet", cruise: "cruise.parquet" } as const;
export const envReg = (m: string) => `obs_env_${m}.parquet`;
export const envSrc = (ms: string[]) => `(${ms.map((m) => `SELECT *, '${m}' AS measurement_type FROM ${q(envReg(m))}`).join(" UNION ALL ")})`;

export async function boot(release: string | null): Promise<Boot> {
  const version = await resolveVersion(release);
  const catalog = await fetchCatalog(version);
  const [cov, grid] = await Promise.all([
    fetch(sidecarUrl(version, "coverage.json")).then((r) => r.json()),
    fetch(sidecarUrl(version, "grid.geojson")).then((r) => r.json()),
  ]);
  // the station grid: its pattern (standard / extended) and every cell key, for the Stations choices (src/area.ts)
  const gridKeys = new Map<string, string[]>(), allKeys: string[] = [];
  for (const f of grid.features ?? []) {
    const k = f.properties.grid_key, p = f.properties.pattern;
    allKeys.push(k);
    if (p) (gridKeys.get(p) ?? gridKeys.set(p, []).get(p)!).push(k);
  }
  const envCat = new Map<string, string>();
  // the water measurements the release holds a per-bin object for (the builder reads those; a per-cast-only type is not listed)
  const parts = catalog.tables.some((t) => t.name === "obs_env") ? sources(catalog, "obs_env").partitions : new Map<string, string>();
  const byKey = new Map<string, ListItem>();
  for (const v of cov.variables ?? []) {
    if (v.realm !== "env" || !parts.has(v.measurement_type)) continue;
    const key = v.variable || v.measurement_type, id = `env:${v.dataset_key}:${key}`;
    const unified = UNIFIED.find((u) => u.key === key);
    const it: ListItem = byKey.get(id) ?? { realm: "env" as const, id, key, dataset: v.dataset_key, category: "", label: unified?.label.replace(/\s*\(.*\)$/, "") ?? fixDisplayName(v.measurement_type), sub: null,
      members: [], units: unified?.label.match(/\(([^)]*)\)$/)?.[1] ?? null, stages: [], n: 0 };
    if (!it.members.includes(v.measurement_type)) it.members.push(v.measurement_type);
    it.n += v.n_obs ?? 0;
    byKey.set(id, it);
    envCat.set(v.dataset_key, v.category || envCat.get(v.dataset_key) || envCategory(v.measurement_type));
  }
  // every species, once per dataset that holds it
  const bio: ListItem[] = (cov.taxa ?? []).flatMap((t: any) => {
    const common = titleCaseCommonName(t.common_name);
    return (t.datasets ?? []).map((d: any): ListItem => ({ realm: "bio", id: `bio:${d.dataset_key}:${t.taxon_key}`, key: t.taxon_key, dataset: d.dataset_key, category: "",
      label: common ?? t.scientific_name ?? t.taxon_key, sub: common ? t.scientific_name : null, members: [], units: null, stages: t.life_stages ?? [], n: d.n_obs ?? 0 }));
  });
  const order = (g: string) => { const i = (CATEGORY_ORDER as readonly string[]).indexOf(g); return i === -1 ? 99 : i; };
  const catOf = (ds: string, realm: "bio" | "env") => DATASET_CATEGORY_FALLBACK[ds] ?? (realm === "env" ? envCat.get(ds) : null) ?? "Other";
  const groupsOf = (items: ListItem[], realm: "bio" | "env"): Group[] => {
    const m = new Map<string, ListItem[]>();
    for (const it of items) (m.get(it.dataset) ?? m.set(it.dataset, []).get(it.dataset)!).push(it);
    return [...m.entries()].map(([dataset, its]) => { const category = catOf(dataset, realm); its.forEach((it) => { it.category = category; }); return { dataset, category, realm, items: its.sort((a, b) => b.n - a.n) }; })
      .sort((a, b) => order(a.category) - order(b.category) || a.dataset.localeCompare(b.dataset));
  };
  const ys: number[] = (cov.datasets ?? []).flatMap((d: any) => [Number(d.year_min), Number(d.year_max)]).filter((y: number) => Number.isFinite(y));
  const gridDatasets = new Set<string>((cov.stations ?? []).flatMap((st: any) => (st.datasets ?? []).map((d: any) => String(d.dataset_key))));
  return { version, catalog, groups: [...groupsOf(bio, "bio"), ...groupsOf([...byKey.values()], "env")], gridKeys, allKeys, gridDatasets,
    years: ys.length ? [Math.min(...ys), Math.max(...ys)] : [1949, new Date().getFullYear()] };
}

/** fetch a release object whole and register it under its short name, once */
const loads = new Map<string, Promise<void>>();
export function ensure(cat: Catalog, name: string): Promise<void> {
  if (!loads.has(name)) {
    const url = name.startsWith("obs_env_") ? sources(cat, "obs_env").partitions.get(name.slice(8, -8)) : sources(cat, name.replace(/\.parquet$/, "")).urls[0];
    if (!url) return Promise.reject(new Error(`${name} is not in release ${cat.version}`));
    // a failed fetch is not remembered: the next build tries again instead of failing until the page is reloaded
    const p = engine.load(name, url); p.catch(() => loads.delete(name));
    loads.set(name, p);
  }
  return loads.get(name)!;
}

/** the cruise table's median month (v2026.11+) and the per-net zero-fill key, each probed once like App.tsx does.
 *  TWO memos, not one: a single memo kept the first call's answer, so a table of water measurements built first
 *  (needBio false → netKey "root_id") left every species added afterwards zero-filled per station VISIT, not per net —
 *  other numbers than the Explorer's and than the same picks made in the other order (2026-11-17; scripts/builder_check.mjs
 *  `order_independent`). */
let cruiseProbe: Promise<Params> | null = null, netProbe: Promise<string> | null = null;
export async function probe(cat: Catalog, needBio: boolean): Promise<{ cruiseSrc: Params; netKey: string }> {
  const cruiseSrc = await (cruiseProbe ??= (async (): Promise<Params> => {
    if (!cat.tables.some((t) => t.name === "cruise")) return {};
    await ensure(cat, REG.cruise);
    const r = await engine.exec(`SELECT count(*) AS n FROM (DESCRIBE SELECT * FROM ${q(REG.cruise)}) WHERE column_name = 'month_median'`, "probe:cruise.month_median");
    return Number(r[0]?.n) > 0 ? { cruise_src: cruiseSrcSql(q(REG.cruise)) } : {};
  })());
  if (!needBio) return { cruiseSrc, netKey: "root_id" };
  const netKey = await (netProbe ??= (async () => {
    await ensure(cat, REG.obs_bio);
    const r = await engine.exec(`SELECT count(*) AS n FROM (DESCRIBE SELECT * FROM ${q(REG.obs_bio)}) WHERE column_name = 'sample_key'`, "probe:obs_bio.sample_key");
    return Number(r[0]?.n) > 0 ? "sample_key" : "root_id";
  })());
  return { cruiseSrc, netKey };
}

/** the regions of every boundary layer the release intersected with its samples (sql/area_regions.sql) */
export async function regions(cat: Catalog): Promise<Map<string, string[]>> {
  await ensure(cat, REG.sample_spatial);
  const rows = await engine.query("area_regions", { spatial_src: q(REG.sample_spatial) });
  const m = new Map<string, string[]>();
  for (const r of rows) {
    if (!m.has(r.layer)) m.set(r.layer, []);
    if (!Number(r.whole) && r.spatial_name != null) m.get(r.layer)!.push(String(r.spatial_name));
  }
  return m;
}

/** the URL each registered name was fetched from, so the copied SQL runs anywhere */
export function urlOf(cat: Catalog, name: string): string | null {
  try { return name.startsWith("obs_env_") ? sources(cat, "obs_env").partitions.get(name.slice(8, -8)) ?? null : sources(cat, name.replace(/\.parquet$/, "")).urls[0] ?? null; }
  catch { return null; }
}

/** the datasets' short names and categories (the release's dataset table, as the Explorer's Sources line names them) */
export interface DatasetInfo { name: string; category: string | null; row: Row }   // row: the release's dataset row, for its citation and licence (src/cite.ts)
export async function datasetInfo(cat: Catalog): Promise<Map<string, DatasetInfo>> {
  await ensure(cat, "dataset.parquet");
  const rows = await engine.exec(`SELECT * FROM 'dataset.parquet'`, "dataset");
  return new Map(rows.map((d) => [String(d.dataset_key), { name: String(d.dataset_name_short || d.dataset_name || d.dataset_key), category: d.category ?? null, row: d }]));
}
