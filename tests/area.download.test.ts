// Download CSV / Zip with a region picked (Ben, 2026-11-10: "downloading with a region selected" did not work): a region's
// Area filter is a subquery with a WHERE of its own, which whereSql() cut in half; and the copied code read the browser's
// registered sample_spatial file instead of the release's object.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { datasetFilterSql, type Params } from "../src/sqltpl";
import { DEFAULTS, type Sel } from "../src/state";

const BASE = "https://example.test/bucket/";
const obj = (name: string) => ({ name, rows: 1, partitioned: false, objects: [{ path: `tables/${name}/abc123/${name}.parquet`, bytes: 1 }] });
const CATALOG = { version: "v0000.00.00", tables: ["obs_bio", "obs_env", "sample_root", "sample_spatial", "taxon"].map(obj) };
const REGION = "root_id IN (SELECT root_id FROM 'sample_spatial.parquet' WHERE layer = 'National Marine Sanctuaries')";
const PARAMS: Params = { val: "density_per_10m2", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", bin: "year", d0: 0, d1: 500, stage: null, dataset_filter: datasetFilterSql(null), zeros: true, area_filter: REGION };
const sel: Sel = { ...DEFAULTS, realm: "bio", lens: "station", taxon: "worms:217452" } as Sel;

let R: typeof import("../src/reproduce");
beforeAll(async () => { vi.stubGlobal("window", {}); vi.stubEnv("VITE_DATA_URL", BASE); R = await import("../src/reproduce"); });
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("the download filter keeps a region's whole subquery", () => {
  expect(R.whereSql({ params: PARAMS }).replace(/\s+/g, " ")).toContain(`AND ${REGION}`);
});
it("the copied code reads the release's sample_spatial, not the browser's file", () => {
  const sqls = R.resolvedSql({ sel, catalog: CATALOG as any, params: PARAMS, lensParams: {}, lensTemplate: "station" });
  const all = sqls.map(([, s]) => s).join("\n");
  expect(all).not.toContain("'sample_spatial.parquet'");
  expect(all).toContain(`read_parquet('${BASE}tables/sample_spatial/abc123/sample_spatial.parquet')`);
});
