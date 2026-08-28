// DuckDB-WASM in a Web Worker, self-hosted bundles, no extensions. objects are fetched whole and
// registered as in-memory buffers; every lens is a SQL template in ../sql rendered with named params.
import * as duckdb from "@duckdb/duckdb-wasm";
import eh_wasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvp_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";


// ── timing panel ──────────────────────────────────────────────────────────────
export interface Mark { name: string; ms: number; at: number; note?: string }
type Listener = () => void;
class Timing {
  marks: Mark[] = [];
  private ls = new Set<Listener>();
  add(name: string, ms: number, note?: string) {
    this.marks = [...this.marks, { name, ms: Math.round(ms * 10) / 10, at: Math.round(performance.now() - window.__t0), note }];
    (window as any).__marks = this.marks; // spike: readable by the verify script
    this.ls.forEach((l) => l());
  }
  first(name: string) { return this.marks.find((m) => m.name === name); }
  subscribe(l: Listener) { this.ls.add(l); return () => this.ls.delete(l); }
}
export const timing = new Timing();

// ── templates ─────────────────────────────────────────────────────────────────
const templates = import.meta.glob("../sql/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export function template(name: string): string {
  const k = Object.keys(templates).find((p) => p.endsWith(`/${name}.sql`));
  if (!k) throw new Error(`no template ${name}`);
  return templates[k];
}
export type Param = string | number | boolean | null;
export interface Params { [k: string]: Param }
const RAW = new Set(["val", "hex", "where", "where_nodepth", "where_noyear", "env_file"]);
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
  if (body.includes("{{where_noyear}}")) p.where_noyear = sub(filterFragment(/year BETWEEN/));
  return sub(body).trim();
}

// ── engine ────────────────────────────────────────────────────────────────────
export type Row = Record<string, any>;
function rows(t: any): Row[] {
  const out: Row[] = new Array(t.numRows);
  const cols: string[] = t.schema.fields.map((f: any) => f.name);
  let i = 0;
  for (const r of t) {
    const o: Row = {};
    for (const c of cols) { const v = r[c]; o[c] = typeof v === "bigint" ? Number(v) : v; }
    out[i++] = o;
  }
  return out;
}

export class Engine {
  db!: duckdb.AsyncDuckDB;
  conn!: duckdb.AsyncDuckDBConnection;
  ready: Promise<void>;
  files = new Map<string, { bytes: number; ms: number; cached: boolean }>();
  lastSql = "";
  nQueries = 0;
  private q: Promise<any> = Promise.resolve(); // serialize queries on the one connection

  constructor() { this.ready = this.init(); }

  private async init() {
    const t = performance.now();
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: mvp_wasm, mainWorker: mvp_worker },
      eh: { mainModule: eh_wasm, mainWorker: eh_worker },
    });
    const worker = new Worker(bundle.mainWorker!);
    this.db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    this.conn = await this.db.connect();
    // the bundle is fetched by the worker, so the main thread has no resource entry for it: ask its size
    const head = await fetch(bundle.mainModule, { method: "HEAD" }).catch(() => null);
    const cl = head?.headers.get("content-length");
    timing.add("wasm_init", performance.now() - t, `${bundle.mainModule.includes("-eh") ? "eh" : "mvp"} bundle${cl ? " " + (Number(cl) / 1e6).toFixed(1) + " MB" : ""}`);
  }

  // fetch an object whole (one GET) and register it as an in-memory buffer. runs in parallel with init.
  async load(name: string, url: string) {
    const t = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const ms = performance.now() - t;
    const entry = performance.getEntriesByName(res.url)[0] as PerformanceResourceTiming | undefined;
    const cached = !!entry && entry.transferSize < Math.max(1024, entry.decodedBodySize / 10); // memory cache or a 304
    this.files.set(name, { bytes: buf.byteLength, ms, cached });
    timing.add(`fetch:${name}`, ms, `${(buf.byteLength / 1e6).toFixed(1)} MB${cached ? ", from cache" : ""}`);
    await this.ready;
    const t2 = performance.now();
    await this.db.registerFileBuffer(name, buf);
    timing.add(`register:${name}`, performance.now() - t2);
  }

  exec(sql: string, label = "exec"): Promise<Row[]> {
    const run = async () => {
      await this.ready;
      const t = performance.now();
      this.lastSql = sql;
      const res = await this.conn.query(sql);
      const ms = performance.now() - t;
      this.nQueries++;
      timing.add(`query:${label}`, ms, `${res.numRows} rows`);
      return rows(res);
    };
    this.q = this.q.then(run, run);
    return this.q;
  }
  query(name: string, params: Params) { return this.exec(render(name, params), name); }
}

export const engine = new Engine();
