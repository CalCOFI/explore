// the release catalog is the only source of object URLs (never build a releases/{v}/parquet/ path by
// hand). port of calcofi4r::cc_release_sources() / calcofi4py.release_sources(): canonical objects[]
// first (content-addressed, immutable, cacheable forever), the legacy compat path as the fallback.
export const BASE = ((import.meta.env.VITE_DATA_URL as string | undefined) ?? "https://storage.googleapis.com/calcofi-db/").replace(/\/?$/, "/");
export const PREFIX = ((import.meta.env.VITE_RELEASE_PREFIX as string | undefined) ?? "ducklake/releases").replace(/\/$/, "");

export interface CatalogObject {
  path: string; bytes: number; sha256?: string; content_hash?: string; since?: string;
  partition_by?: string; partition_value?: string; compat_path?: string;
}
export interface CatalogTable {
  name: string; rows: number; partitioned: boolean; supplemental?: boolean; content_hash?: string; bytes?: number;
  objects?: CatalogObject[]; compat_path?: string;
}
export interface Catalog { version: string; release_date?: string; layout?: string; total_rows?: number; total_size?: number; tables: CatalogTable[] }
export interface Sources {
  table: string; urls: string[]; hive: boolean; partition_by: string | null;
  partitions: Map<string, string>;     // partition_value -> url (partitioned tables)
  single_file: string | null;          // a single-file twin of a partitioned table, if published
  canonical: boolean; bytes: number;
}

export const objectUrl = (path: string) => BASE + path.replace(/^\//, "");
export const releaseDir = (version: string) => `${BASE}${PREFIX}/${version}/`;
export const sidecarUrl = (version: string, name: string) => releaseDir(version) + name;

export async function resolveVersion(v: string | null | undefined): Promise<string> {
  if (v && v !== "latest") return v;
  const r = await fetch(`${BASE}${PREFIX}/latest.txt`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`latest.txt: ${r.status}`);
  return (await r.text()).trim();
}
export async function fetchVersions(): Promise<{ version: string; release_date?: string; retired?: boolean }[]> {
  const r = await fetch(`${BASE}${PREFIX}/versions.json`, { cache: "no-cache" });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.versions ?? j) as any[];
}
export async function fetchCatalog(version: string): Promise<Catalog> {
  const r = await fetch(sidecarUrl(version, "catalog.json"), { cache: "no-cache" });
  if (!r.ok) throw new Error(`catalog.json ${version}: ${r.status}`);
  return (await r.json()) as Catalog;
}

export function sources(cat: Catalog, table: string): Sources {
  const t = cat.tables.find((x) => x.name === table);
  if (!t) throw new Error(`table ${table} is not in the ${cat.version} catalog`);
  const objs = t.objects ?? [];
  const partitions = new Map<string, string>();
  let single: string | null = null;
  const urls: string[] = [];
  if (objs.length) {
    for (const o of objs) {
      const u = objectUrl(o.path);
      if (t.partitioned && o.partition_value != null) { partitions.set(String(o.partition_value), u); urls.push(u); }
      else if (t.partitioned) single = u;           // the single-file twin (obs.parquet)
      else urls.push(u);
    }
    return { table, urls, hive: t.partitioned && partitions.size > 0, partition_by: objs[0]?.partition_by ?? null,
             partitions, single_file: single, canonical: true, bytes: objs.reduce((a, o) => a + (o.bytes ?? 0), 0) };
  }
  // legacy catalog (no objects[]): one file per unpartitioned table under the release's parquet/
  const legacy = `${PREFIX}/${cat.version}/parquet/${table}.parquet`;
  return { table, urls: [objectUrl(t.compat_path ?? legacy)], hive: false, partition_by: null, partitions, single_file: null, canonical: false, bytes: t.bytes ?? 0 };
}

/** the DuckDB read expression for a table's sources — hive-partitioned tables are an explicit file list */
export function readParquetSql(src: Sources, urls = src.urls): string {
  if (urls.length === 1 && !src.hive) return `read_parquet('${urls[0]}')`;
  return `read_parquet([${urls.map((u) => `'${u}'`).join(", ")}], hive_partitioning = true)`;
}
