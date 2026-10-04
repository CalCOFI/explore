// Share › Copy code hands over "the same SQL the browser ran" against the release's own object URLs (src/reproduce.ts).
// For a per-cast variable (plan 2026-10-02 D2, explore#13) that is the sample_measurement ⋈ sample_root join — in SQL,
// and inside the R and Python it copies. The copied SQL is RUN here (its object URLs swapped for fixture tables) and
// must give the lens table the app's own render gives.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, datasetFilterSql, type Params } from "../src/sqltpl";
import { qualOkSQL } from "../src/qual";
import { DEFAULTS, type Sel } from "../src/state";
import { openDuck, type Duck } from "./helpers/duck";

const BASE = "https://example.test/bucket/";
const obj = (name: string) => ({ name, rows: 1, partitioned: false, objects: [{ path: `tables/${name}/abc123/${name}.parquet`, bytes: 1 }] });
const CATALOG = { version: "v0000.00.00", tables: [obj("obs_bio"), obj("sample_root"), obj("sample_spatial"), obj("taxon"), obj("sample_measurement"), obj("measurement_type"),
  { name: "obs_env", rows: 1, partitioned: true, objects: [{ path: "tables/obs_env/measurement_type=nitrate/def456/data_0.parquet", bytes: 1, partition_by: "measurement_type", partition_value: "nitrate" }] }] };
const url = (name: string) => `${BASE}tables/${name}/abc123/${name}.parquet`;
const PARAMS: Params = { val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", bin: "year", d0: 0, d1: 500, stage: null, dataset_filter: datasetFilterSql(null), zeros: true };
const sel = (over: Partial<Sel>): Sel => ({ ...DEFAULTS, realm: "env", lens: "station", ...over });

let R: typeof import("../src/reproduce");
let db: Duck;
beforeAll(async () => {
  // release.ts reads its bucket root from the build env and `window.__early` at import: give it both before importing
  vi.stubGlobal("window", {}); vi.stubEnv("VITE_DATA_URL", BASE);
  R = await import("../src/reproduce");
  db = await openDuck();
  db.exec(`CREATE TABLE root AS SELECT * FROM (VALUES
    (1, 'calcofi_ctd-cast:cast:A', 'st60-ln90', '2020-01-33RL', 32.0::DOUBLE, -120.0::DOUBLE, TIMESTAMP '2020-01-15 10:00:00'),
    (2, 'calcofi_ctd-cast:cast:B', 'st60-ln90', '2021-07-33RL', 32.0::DOUBLE, -120.0::DOUBLE, TIMESTAMP '2021-07-20 04:00:00')
  ) t(root_id, root_sample_key, grid_key, cruise_key, latitude, longitude, datetime)`);
  db.exec(`CREATE TABLE sm AS SELECT * FROM (VALUES
    (1::BIGINT, 'calcofi_ctd-cast:cast:A', 'calcofi_ctd-derived', 'mld_x', 20.0::DOUBLE, NULL::VARCHAR),
    (2::BIGINT, 'calcofi_ctd-cast:cast:B', 'calcofi_ctd-derived', 'mld_x', 40.0::DOUBLE, NULL::VARCHAR)
  ) t(sample_measurement_id, sample_key, dataset_key, measurement_type, measurement_value, measurement_qual)`);
  db.exec(`CREATE TABLE mt AS SELECT 'mld_x' AS measurement_type, 'm' AS units`);
});
afterAll(() => { db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const ctx = (grain: "bin" | "cast", v: string) => ({ sel: sel({ var: v }), catalog: CATALOG as any, version: CATALOG.version, params: PARAMS, lensParams: {}, lensTemplate: "station", grain });
const code = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"); // the statement, without its comment lines
// the copied SQL with the release's object URLs swapped for the fixture's tables — nothing else is touched
const local = (sql: string) => sql.replaceAll(`read_parquet('${url("sample_measurement")}')`, "sm").replaceAll(`read_parquet('${url("sample_root")}')`, "root").replaceAll(`read_parquet('${url("measurement_type")}')`, "mt");

describe("Copy code for a per-cast variable — the same join, three runtimes", () => {
  it("hands over the slice, the lens table and the years — no depth-strip query (there is no depth axis)", () => {
    expect(R.resolvedSql(ctx("cast", "mld_x")).map(([f]) => f)).toEqual(["01_slice.sql", "02_station.sql", "04_years.sql"]);
  });
  it("the slice reads sample_measurement, sample_root and the registry by their catalog URLs, and no obs_env", () => {
    const s = R.resolvedSql(ctx("cast", "mld_x"))[0][1];
    for (const t of ["sample_measurement", "sample_root", "measurement_type"]) expect(s).toContain(`read_parquet('${url(t)}')`);
    expect(s).toContain("r.root_sample_key = sm.sample_key");
    expect(s).toContain("WHERE sm.measurement_type = 'mld_x'");
    expect(code(s)).not.toContain("obs_env"); // (its header comment says why not; the statement reads none)
    expect(s).not.toMatch(/\{\{\w+\}\}/); // every token resolved
  });
  it("measurement_qual goes through qualOkSQL(\"sm\") — the predicate calcofi4r and calcofi4py build", () => {
    expect(R.resolvedSql(ctx("cast", "mld_x"))[0][1]).toContain(`${qualOkSQL("sm")} AS qual_ok`);
  });
  it("the copied SQL, run, gives the lens table the app's own render gives", () => {
    const [slice, lens] = R.resolvedSql(ctx("cast", "mld_x")).map(([, s]) => local(s));
    db.exec(slice);
    const copied = db.exec(lens);
    db.exec(render("slice_cast", { sm_src: "sm", root_src: "root", mt_src: "mt", type: "mld_x", qual_ok: qualOkSQL("sm"), root_hex7: "NULL::UBIGINT" }));
    const app = db.exec(render("station", PARAMS));
    expect(copied).toEqual(app);
    expect(copied.map(({ grid_key, n, mean }) => ({ grid_key, n, mean }))).toEqual([{ grid_key: "st60-ln90", n: 2, mean: 30 }]);
  });
  // v2026.10.04+: sample_root carries hex7, and the copied slice takes the cast's cell from it as the browser did
  it("the copied slice takes hex7 from sample_root when the release carries it, NULL before", () => {
    expect(R.resolvedSql(ctx("cast", "mld_x"))[0][1]).toContain("NULL::UBIGINT AS hex7");
    expect(R.resolvedSql({ ...ctx("cast", "mld_x"), rootHex7: true })[0][1]).toContain("r.hex7 AS hex7");
  });
  it("Copy SQL is those statements, in order, each ended", () => {
    const text = R.copyAs("sql", ctx("cast", "mld_x"));
    expect(text.match(/^-- 0\d_\w+\.sql$/gm)).toEqual(["-- 01_slice.sql", "-- 02_station.sql", "-- 04_years.sql"]);
    for (const stmt of text.split(/;\n/).filter((x) => x.trim())) db.exec(local(stmt)); // each statement runs
  });
  it("Copy R and Copy Python embed that same SQL, say what the join is, and run no depth strip", () => {
    const sqls = R.resolvedSql(ctx("cast", "mld_x"));
    for (const kind of ["r", "py"] as const) {
      const code = R.copyAs(kind, ctx("cast", "mld_x"));
      for (const [, s] of sqls) expect(code).toContain(JSON.stringify(s));
      expect(code).toContain("a per-cast variable: one value per cast, from sample_measurement joined to the cast's row in sample_root");
      expect(code).not.toContain("03_depth_strip"); expect(code).not.toMatch(/depth_strip\s*(<-|=)/);
    }
  });
});

describe("Copy code for a per-bin variable — unchanged by the per-cast grain", () => {
  it("still hands over four queries, the depth strip among them, reading the variable's obs_env object", () => {
    const sqls = R.resolvedSql(ctx("bin", "nitrate"));
    expect(sqls.map(([f]) => f)).toEqual(["01_slice.sql", "02_station.sql", "03_depth_strip.sql", "04_years.sql"]);
    expect(sqls[0][1]).toContain(`read_parquet('${BASE}tables/obs_env/measurement_type=nitrate/def456/data_0.parquet')`);
    expect(sqls[0][1]).not.toContain("sample_measurement");
  });
  it("an absent grain is per-bin (a caller that predates the per-cast grain)", () => {
    const { grain, ...noGrain } = ctx("bin", "nitrate");
    expect(R.resolvedSql(noGrain).map(([f]) => f)).toEqual(["01_slice.sql", "02_station.sql", "03_depth_strip.sql", "04_years.sql"]);
  });
  it("R and Python still run the depth strip, and carry no per-cast note", () => {
    for (const kind of ["r", "py"] as const) { const code = R.copyAs(kind, ctx("bin", "nitrate")); expect(code).toContain("# --- 03_depth_strip.sql"); expect(code).not.toContain("a per-cast variable"); }
  });
  it("the bundle's observation filter (whereSql) is the lens filter without the depth-strip's own clause", () => {
    const w = R.whereSql({ params: PARAMS });
    expect(w).toContain("qual_ok"); expect(w).not.toContain("depth_bin IS NOT NULL AND"); expect(w).not.toMatch(/GROUP BY/);
  });
});
