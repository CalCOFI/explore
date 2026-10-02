// the app's SQL, run in the SAME engine the browser ships: duckdb-wasm's node build (blocking API), in-process, no
// network. A test renders a template with src/sqltpl.ts and runs it here against a small synthetic fixture.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
export type Row = Record<string, any>;
export interface Duck { exec: (sql: string) => Row[]; close: () => void; version: string }

export async function openDuck(): Promise<Duck> {
  const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
  const dist = path.dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs"));
  const bundles = {
    mvp: { mainModule: path.join(dist, "duckdb-mvp.wasm"), mainWorker: path.join(dist, "duckdb-node-mvp.worker.cjs") },
    eh: { mainModule: path.join(dist, "duckdb-eh.wasm"), mainWorker: path.join(dist, "duckdb-node-eh.worker.cjs") },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  const conn = db.connect();
  // rows as plain objects, BIGINT as number — what src/engine.ts hands the app
  const exec = (sql: string): Row[] => conn.query(sql).toArray().map((r: any) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r.toJSON())) o[k] = typeof v === "bigint" ? Number(v) : v;
    return o;
  });
  return { exec, close: () => conn.close(), version: String(exec("SELECT version() AS v")[0].v) };
}
