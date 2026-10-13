// the Area filter (explore#20, src/area.ts): the URL token, the predicate every lens reads as {{area_filter}}, and that
// predicate run in duckdb-wasm against a small slice — one fixture per kind
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { areaSql, areaToUrl, areaWord, parseArea } from "../src/area";
import { render } from "../src/sqltpl";
import { openDuck, type Duck } from "./helpers/duck";

describe("parseArea / areaToUrl", () => {
  it("round-trips each kind", () => {
    for (const s of ["std", "std,ext", "box:-121.5,32,-117,35", "in:National Marine Sanctuaries|Channel Islands"]) expect(areaToUrl(parseArea(s))).toBe(s);
  });
  it("orders patterns and drops unknown codes", () => { expect(parseArea("ext,std,zzz")).toEqual({ kind: "pattern", patterns: ["standard", "extended"] }); expect(parseArea("zzz")).toBeNull(); });
  it("rejects a malformed or inside-out box", () => { expect(parseArea("box:1,2,3")).toBeNull(); expect(parseArea("box:-117,32,-121,35")).toBeNull(); });
  it("keeps a region name that contains the separator", () => expect(parseArea("in:L|A|B")).toEqual({ kind: "region", layer: "L", name: "A|B" }));
  it("rounds a frozen map view to 0.001°", () => expect(areaToUrl({ kind: "box", bbox: [-121.123456, 32.98765, -117, 35] })).toBe("box:-121.123,32.988,-117,35"));
  it("words each kind for the title sentence", () => {
    expect(areaWord(parseArea("std"))).toBe("within the standard station pattern");
    expect(areaWord(parseArea("in:National Marine Sanctuaries|Channel Islands"))).toBe("within Channel Islands (National Marine Sanctuaries)");
    expect(areaWord(parseArea("box:-121.5,32,-117,35"))).toBe("within 121.5°W–117°W, 32°N–35°N");
  });
});

describe("areaSql", () => {
  const ctx = { gridKeys: new Map([["standard", ["a", "b"]], ["extended", ["c"]]]), spatialSrc: "sp" };
  it("everywhere is TRUE", () => expect(areaSql(null, ctx)).toBe("TRUE"));
  it("a pattern waits for the grid (null), never filters to everything", () => expect(areaSql(parseArea("std"), { ...ctx, gridKeys: null })).toBeNull());
  it("a pattern with no cells matches nothing", () => expect(areaSql(parseArea("std"), { ...ctx, gridKeys: new Map() })).toBe("FALSE"));
  it("quotes a region name", () => expect(areaSql(parseArea("in:L|O'Neill"), ctx)).toContain("spatial_name = 'O''Neill'"));
});

let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // four bottle values at three stations: a, b on the standard pattern, c on the extended lines, d off the grid
  db.exec(`CREATE TABLE slice AS SELECT * FROM (VALUES
    (1, 1, 'a', 33.0, -118.0, 10.0), (2, 2, 'b', 34.0, -120.0, 20.0), (3, 3, 'c', 36.0, -122.0, 30.0), (4, 4, NULL, 30.0, -125.0, 40.0)
  ) t(obs_id, root_id, grid_key, latitude, longitude, value)`);
  db.exec(`CREATE TABLE sp AS SELECT * FROM (VALUES (1, 'Sanctuaries', 'Channel Islands'), (2, 'Sanctuaries', 'Monterey Bay'), (1, 'Counties', 'Santa Barbara')) t(root_id, layer, spatial_name)`);
});
afterAll(() => db.close());

describe("{{area_filter}} on a slice", () => {
  const ctx = { gridKeys: new Map([["standard", ["a", "b"]], ["extended", ["c"]]]), spatialSrc: "sp" };
  const ids = (area: string | null) => db.exec(`SELECT obs_id FROM slice WHERE ${areaSql(parseArea(area), ctx)} ORDER BY 1`).map((r) => r.obs_id);
  it("everywhere keeps all four", () => expect(ids(null)).toEqual([1, 2, 3, 4]));
  it("the standard pattern keeps a and b", () => expect(ids("std")).toEqual([1, 2]));
  it("with the extended lines adds c", () => expect(ids("std,ext")).toEqual([1, 2, 3]));
  it("a box keeps what lies inside it", () => expect(ids("box:-121,32.5,-117.5,35")).toEqual([1, 2]));
  it("a region keeps its sample_spatial members only, of that layer", () => { expect(ids("in:Sanctuaries|Channel Islands")).toEqual([1]); expect(ids("in:Counties|Monterey Bay")).toEqual([]); });
  it("render() puts it in every {{where}} and defaults to everywhere", () => {
    const P = { val: "value", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: null, dataset_filter: "TRUE", zeros: true, bin: "year" };
    expect(render("station", P)).toMatch(/AND TRUE\s*\n?/);
    expect(render("station", { ...P, area_filter: "grid_key IN ('a')" })).toContain("AND grid_key IN ('a')");
  });
});
