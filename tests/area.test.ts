// the Area filter (explore#20, src/area.ts): the URL token, the predicate every lens reads as {{area_filter}}, and that
// predicate run in duckdb-wasm against a small slice — one fixture per kind
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { areaSql, areaToUrl, areaWord, featureNameFields, featuresBbox, filterSortRegions, nameMatchExpr, regionMatchExpr, regionsOfFeatureProps, parseArea, pickedArea, prefixNames, regionOutline, regionsOfFeature, resolveArea, resolveRegionNames } from "../src/area";
import { render } from "../src/sqltpl";
import { openDuck, type Duck } from "./helpers/duck";

describe("parseArea / areaToUrl", () => {
  it("round-trips each kind", () => {
    for (const s of ["std", "std,ext", "box:-121.5,32,-117,35", "in:National Marine Sanctuaries|Channel Islands"]) expect(areaToUrl(parseArea(s))).toBe(s);
  });
  it("orders patterns and drops unknown codes", () => { expect(parseArea("ext,std,zzz")).toEqual({ kind: "pattern", patterns: ["standard", "extended"] }); expect(parseArea("zzz")).toBeNull(); });
  it("rejects a malformed or inside-out box", () => { expect(parseArea("box:1,2,3")).toBeNull(); expect(parseArea("box:-117,32,-121,35")).toBeNull(); });
  it("keeps a region name that contains the separator", () => expect(parseArea("in:L|A|B")).toEqual({ kind: "region", layer: "L", names: ["A|B"] }));
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
  it("a single region keeps its exact predicate", () =>
    expect(areaSql(parseArea("in:L|N"), ctx)).toBe("root_id IN (SELECT root_id FROM sp WHERE layer = 'L' AND spatial_name = 'N')"));
  it("the whole layer is layer = L, no name", () => expect(areaSql(parseArea("in:L"), ctx)).toBe("root_id IN (SELECT root_id FROM sp WHERE layer = 'L')"));
  it("a set is spatial_name IN (…), each quoted", () =>
    expect(areaSql(parseArea("ins:L|A,O'Neill"), ctx)).toBe("root_id IN (SELECT root_id FROM sp WHERE layer = 'L' AND spatial_name IN ('A', 'O''Neill'))"));
  it("an empty set (built by hand) matches nothing", () => expect(areaSql({ kind: "region", layer: "L", names: [] }, ctx)).toBe("FALSE"));
});

// whole layer and multi-select (Ben, 2026-10-14; explore#20 · #16): the URL grammar, old permalinks unchanged
describe("region areas — whole layer, a set, the single form unchanged", () => {
  it("in:L|N parses exactly as before: everything after the first | is the one name", () => {
    expect(parseArea("in:National Marine Sanctuaries|Channel Islands")).toEqual({ kind: "region", layer: "National Marine Sanctuaries", names: ["Channel Islands"] });
    expect(parseArea("in:L|a, b|c%2C")).toEqual({ kind: "region", layer: "L", names: ["a, b|c%2C"] }); // no unescaping in the single form
    expect(areaToUrl(parseArea("in:L|a, b|c%2C"))).toBe("in:L|a, b|c%2C");
    expect(parseArea("in:L|")).toBeNull();
    expect(parseArea("in:|N")).toBeNull();
  });
  it("in:L (no |) is the whole layer", () => {
    expect(parseArea("in:CA Counties")).toEqual({ kind: "region", layer: "CA Counties", names: null });
    expect(areaToUrl(parseArea("in:CA Counties"))).toBe("in:CA Counties");
  });
  it("ins:L|A,B is a set; a name with a comma, a percent or a bar round-trips", () => {
    const a = { kind: "region" as const, layer: "L", names: ["Santa Barbara, CA", "100% reef", "x|y", "%2C literal", "plain"] };
    const u = areaToUrl(a)!;
    expect(u).toBe("ins:L|Santa Barbara%2C CA,100%25 reef,x|y,%252C literal,plain");
    expect(parseArea(u)).toEqual(a);
  });
  it("a set of one is written in the single form; duplicates and empties drop", () => {
    expect(areaToUrl({ kind: "region", layer: "L", names: ["Only"] })).toBe("in:L|Only");
    expect(parseArea("ins:L|A,,A,B")).toEqual({ kind: "region", layer: "L", names: ["A", "B"] });
    expect(parseArea("ins:L|")).toBeNull();
    expect(parseArea("ins:L")).toBeNull();
  });
  it("round-trips every form", () => {
    for (const s of ["in:L|N", "in:L", "ins:L|A,B,C", "in:L|A|B"]) expect(areaToUrl(parseArea(s))).toBe(s);
  });
  it("words each form for the title sentence", () => {
    expect(areaWord(parseArea("in:National Marine Sanctuaries|Channel Islands"))).toBe("within Channel Islands (National Marine Sanctuaries)");
    expect(areaWord(parseArea("in:National Marine Sanctuaries"))).toBe("within all of National Marine Sanctuaries");
    expect(areaWord(parseArea("ins:CA Counties|Ventura,Santa Barbara,Los Angeles"))).toBe("within 3 regions of CA Counties");
  });
  it("pickedArea: none = no area, every region = the whole layer, else the set in the release's order", () => {
    const av = ["A", "B", "C"];
    expect(pickedArea("L", [], av)).toBeNull();
    expect(pickedArea("L", ["C", "A", "B"], av)).toEqual({ kind: "region", layer: "L", names: null });
    expect(pickedArea("L", ["C", "A", "zzz"], av)).toEqual({ kind: "region", layer: "L", names: ["A", "C"] });
    expect(areaToUrl(pickedArea("L", ["B"], av))).toBe("in:L|B");
  });
  it("regionOutline: the chosen regions' polygons of that layer, or all of the layer", () => {
    const fs = [["L", "A"], ["L", "B"], ["M", "A"]].map(([layer, name]) => ({ properties: { layer, name } }));
    expect(regionOutline({ kind: "region", layer: "L", names: ["A", "B"] }, fs)).toHaveLength(2);
    expect(regionOutline({ kind: "region", layer: "L", names: ["B"] }, fs)).toEqual([fs[1]]);
    expect(regionOutline({ kind: "region", layer: "M", names: null }, fs)).toEqual([fs[2]]);
  });
  it("featuresBbox: the box around polygons and multipolygons; null for none", () => {
    const poly = (c: number[][]) => ({ geometry: { type: "Polygon", coordinates: [c] } });
    expect(featuresBbox([poly([[-120, 33], [-119, 34], [-120, 34]]), { geometry: { type: "MultiPolygon", coordinates: [[[[-118, 32], [-117.5, 32.5], [-118, 32.5]]]] } }])).toEqual([-120, 32, -117.5, 34]);
    expect(featuresBbox([])).toBeNull();
    // across the antimeridian: the narrower Pacific box, not the world
    expect(featuresBbox([poly([[-180, 25], [-175, 28], [-180, 28]]), poly([[179, 24], [180, 26], [179.5, 26]]), poly([[-121, 34], [-119, 35], [-120, 35]])]))
      .toEqual([-181, 24, -119, 35]);
  });
});

// explore#34: the sanctuaries now come from the gazetteer, whose names are longer ("Channel Islands National Marine
// Sanctuary - Northern Section"); a permalink with the old short name resolves to every region it is a word-boundary
// prefix of, and a polygon on the modal's map stands for the release's regions that prefix it
describe("old names against new ones — resolveArea, regionsOfFeature, nameMatchExpr", () => {
  const NEW = ["Channel Islands National Marine Sanctuary - Northern Section", "Channel Islands National Marine Sanctuary - Santa Barbara Section",
    "Chumash Heritage National Marine Sanctuary", "Monterey Bay National Marine Sanctuary"];
  const OLD = ["Channel Islands", "Cordell Bank", "Monterey Bay"];
  it("prefixNames: case-insensitive, at a word boundary only", () => {
    expect(prefixNames("Channel Islands", NEW[0])).toBe(true);
    expect(prefixNames("channel islands", NEW[1])).toBe(true);
    expect(prefixNames("Channel Island", NEW[0])).toBe(false);
    expect(prefixNames("Monterey Bay", "Monterey Bay")).toBe(true);
    expect(prefixNames("", NEW[0])).toBe(false);
  });
  it("resolveRegionNames: the exact name wins, else every prefixed region, else none", () => {
    expect(resolveRegionNames("Channel Islands", NEW)).toEqual(NEW.slice(0, 2));
    expect(resolveRegionNames("Monterey Bay", NEW)).toEqual([NEW[3]]);
    expect(resolveRegionNames("Monterey Bay", OLD)).toEqual(["Monterey Bay"]);
    expect(resolveRegionNames("Cordell Bank", NEW)).toEqual([]);
  });
  it("resolveArea: in:L|Channel Islands becomes the two-section set; an exact or unknown name, a set or the whole layer stay", () => {
    const a = parseArea("in:National Marine Sanctuaries|Channel Islands")!;
    const r = resolveArea(a, NEW);
    expect(r).toEqual({ kind: "region", layer: "National Marine Sanctuaries", names: NEW.slice(0, 2) });
    expect(areaToUrl(r)).toBe(`ins:National Marine Sanctuaries|${NEW[0]},${NEW[1]}`);
    expect(areaToUrl(resolveArea(parseArea("in:National Marine Sanctuaries|Monterey Bay"), NEW))).toBe(`in:National Marine Sanctuaries|${NEW[3]}`);
    expect(resolveArea(a, OLD)).toBe(a);              // v2026.10.13: the old name is a region, unchanged
    expect(resolveArea(a, null)).toBe(a);             // not known yet
    const u = parseArea("in:L|Nowhere")!; expect(resolveArea(u, NEW)).toBe(u);
    const w = parseArea("in:L")!; expect(resolveArea(w, NEW)).toBe(w);
    const s = parseArea("ins:L|Channel Islands,Monterey Bay")!; expect(resolveArea(s, NEW)).toBe(s);
  });
  it("regionsOfFeature: a polygon is its own region, else the regions that prefix its name", () => {
    expect(regionsOfFeature(NEW[0], OLD)).toEqual(["Channel Islands"]);
    expect(regionsOfFeature(NEW[2], OLD)).toEqual([]);             // Chumash Heritage: no samples in v2026.10.13
    expect(regionsOfFeature("Monterey Bay", OLD)).toEqual(["Monterey Bay"]);
    expect(regionsOfFeature(null, OLD)).toEqual([]);
  });
  it("regionsOfFeatureProps: the row's name_field first, then name, then source_id (the AOA gazetteer tiles)", () => {
    const AOAS = ["CN1-A", "N2-D", "N2-E"];
    const tile = { name: "Southern California AOA N2-E", source_id: "N2-E", status: "identified" }; // no AOA column in the tiles
    expect(featureNameFields("AOA")).toEqual(["AOA", "name", "source_id"]);
    expect(featureNameFields(null)).toEqual(["name", "source_id"]);
    expect(regionsOfFeatureProps(tile, "AOA", AOAS)).toEqual(["N2-E"]);
    expect(regionsOfFeatureProps({ AOA: "N2-D", name: "Southern California AOA N2-D" }, "AOA", AOAS)).toEqual(["N2-D"]);
    expect(regionsOfFeatureProps({ name: NEW[0], source_id: NEW[0] }, "name", OLD)).toEqual(["Channel Islands"]);
    expect(regionsOfFeatureProps({ name: "Southern California AOA X9" , source_id: "X9" }, "AOA", AOAS)).toEqual([]);
    expect(regionsOfFeatureProps(null, "AOA", AOAS)).toEqual([]);
  });
  it("regionMatchExpr: one nameMatchExpr per name property; none = false", () => {
    expect(regionMatchExpr([], ["a"], "AOA")).toBe(false);
    const e = regionMatchExpr(["N2-E"], ["N2-E"], "AOA");
    expect(e[0]).toBe("any");
    expect(e.slice(1)).toEqual(["AOA", "name", "source_id"].map((f) => nameMatchExpr(["N2-E"], ["N2-E"], f)));
  });
  it("nameMatchExpr: exact names, or a prefix for a feature that is not itself a region; none = false", () => {
    expect(nameMatchExpr([], OLD)).toBe(false);
    const e = nameMatchExpr(["Channel Islands"], OLD);
    expect(e[0]).toBe("any");
    expect(e[1]).toEqual(["in", ["to-string", ["get", "name"]], ["literal", ["Channel Islands"]]]);
    expect(e[2][1]).toEqual(["!", ["in", ["to-string", ["get", "name"]], ["literal", OLD]]]);
    expect(e[2][2]).toEqual(["any", ["==", ["slice", ["downcase", ["to-string", ["get", "name"]]], 0, 16], "channel islands "]]);
  });
});

describe("filterSortRegions — the modal's table", () => {
  const rows = [
    { name: "OCS-P 0561", n: 120, status: "relinquished", status_date: "2026-09-03" },
    { name: "OCS-P 0562", n: 40, status: "active", status_date: "2024-01-01" },
    { name: "Alpha", n: 500, status: null, status_date: null },
  ];
  it("sorts by name, by n (descending) and by status with missing values last", () => {
    expect(filterSortRegions(rows, "", "name", false).map((r) => r.name)).toEqual(["Alpha", "OCS-P 0561", "OCS-P 0562"]);
    expect(filterSortRegions(rows, "", "n", true).map((r) => r.n)).toEqual([500, 120, 40]);
    expect(filterSortRegions(rows, "", "status", false).map((r) => r.name)).toEqual(["OCS-P 0562", "OCS-P 0561", "Alpha"]);
    expect(filterSortRegions(rows, "", "status_date", true).map((r) => r.name)).toEqual(["OCS-P 0561", "OCS-P 0562", "Alpha"]);
  });
  it("searches name or status, case-insensitively", () => {
    expect(filterSortRegions(rows, "ocs", "name", false)).toHaveLength(2);
    expect(filterSortRegions(rows, "RELINQ", "name", false).map((r) => r.name)).toEqual(["OCS-P 0561"]);
    expect(filterSortRegions(rows, "  ", "name", false)).toHaveLength(3);
  });
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
  it("the whole layer keeps every member of any of its regions; a set keeps the members of its names", () => {
    expect(ids("in:Sanctuaries")).toEqual([1, 2]);
    expect(ids("ins:Sanctuaries|Channel Islands,Monterey Bay")).toEqual([1, 2]);
    expect(ids("ins:Sanctuaries|Monterey Bay,Nowhere")).toEqual([2]);
    expect(ids("in:Counties")).toEqual([1]);
  });
  it("area_regions.sql: per region, and one whole-layer row with its distinct count (not the sum)", () => {
    db.exec(`CREATE TABLE sp2 AS SELECT * FROM (VALUES (1, 'S', 'A'), (2, 'S', 'A'), (2, 'S', 'B'), (3, 'C', 'X')) t(root_id, layer, spatial_name)`);
    const r = db.exec(render("area_regions", { spatial_src: "sp2" }));
    expect(r.map((x) => [x.layer, x.spatial_name, x.n, x.whole])).toEqual([["C", null, 1, 1], ["C", "X", 1, 0], ["S", null, 2, 1], ["S", "A", 2, 0], ["S", "B", 1, 0]]);
  });
  it("render() puts it in every {{where}} and defaults to everywhere", () => {
    const P = { val: "value", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: null, dataset_filter: "TRUE", zeros: true, bin: "year" };
    expect(render("station", P)).toMatch(/AND TRUE\s*\n?/);
    expect(render("station", { ...P, area_filter: "grid_key IN ('a')" })).toContain("AND grid_key IN ('a')");
  });
});
