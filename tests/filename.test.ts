// the downloads' file names say which subset they hold (src/filename.ts): two downloads of one pick under different
// filters never share a name, and a filter that is not in force never appears in it
import { describe, expect, it } from "vitest";
import { areaPart, slug, subsetName, type NameParts } from "../src/filename";
import { parseArea } from "../src/area";

const base: NameParts = { what: "Pacific Sardine (Pilchard)", realm: "bio", stage: "larva", den: "per_10m2", zeros: true, years: [1949, 2100], yearOpen: 2100, lens: "station", release: "v2026.11.14", date: "20261116" };

describe("subsetName", () => {
  it("names the pick, its stage and units, the view and the release", () => {
    expect(subsetName(base, "csv")).toBe("calcofi_pacific-sardine_larva_per10m2_station_v2026.11.14_20261116.csv");
  });
  it("adds every filter in force, and only those", () => {
    const n = subsetName({ ...base, years: [1990, 2005], q: [3, 2], area: "std", zeros: false, lens: "hex", res: 4 }, "csv");
    expect(n).toBe("calcofi_pacific-sardine_larva_per10m2_positive-only_1990-2005_spring-summer_75-station-grid_hex4_v2026.11.14_20261116.csv");
  });
  it("an open-ended year range reads 'now', a month-resolved one keeps its months", () => {
    expect(subsetName({ ...base, years: [2010, 2100] }, "csv")).toContain("_2010-now_");
    expect(subsetName({ ...base, years: [2010, 2012], months: [3, 8] }, "csv")).toContain("_2010-03-to-2012-08_");
  });
  it("the depth band only when it is not the default", () => {
    const env: NameParts = { ...base, what: "Temperature", realm: "env", depth: [0, 500], depthDefault: [0, 500] };
    expect(subsetName(env, "csv")).toBe("calcofi_temperature_station_v2026.11.14_20261116.csv");
    expect(subsetName({ ...env, depth: [0, 100] }, "csv")).toContain("_0-100m_");
  });
  it("the dataset only when there was a choice; pooled says so", () => {
    const env: NameParts = { ...base, what: "Temperature", realm: "env", datasets: ["calcofi_bottle"], dsShort: () => "Bottle" };
    expect(subsetName({ ...env, nDatasets: 1 }, "csv")).not.toContain("bottle");
    expect(subsetName({ ...env, nDatasets: 3 }, "csv")).toContain("_bottle_");
    expect(subsetName({ ...env, datasets: null, pool: true, nDatasets: 3 }, "csv")).toContain("_all-datasets_");
  });
  it("the view's own choice: the layer, the cruise, the line", () => {
    expect(subsetName({ ...base, lens: "region", layer: "National Marine Sanctuaries" }, "zip")).toContain("_by-national-marine-sanctuaries_");
    expect(subsetName({ ...base, lens: "cruise", cruise: "2019-07-RL" }, "csv")).toContain("_cruise-2019-07-rl_");
    expect(subsetName({ ...base, realm: "env", what: "Temperature", lens: "section", line: 90, cruise: "2019-07-RL" }, "csv")).toContain("_section-line90-2019-07-rl_");
  });
  it("the added variable and the cruises picked in When", () => {
    expect(subsetName({ ...base, var2: "temperature", cruises: ["2019-07-RL"] }, "csv")).toContain("_2019-07-rl_station_with-temperature_");
    expect(subsetName({ ...base, cruises: ["a", "b", "c"] }, "csv")).toContain("_3-cruises_");
  });
});

describe("areaPart", () => {
  it("names each kind of area", () => {
    expect(areaPart(parseArea("std,ext"))).toBe("113-station-grid");
    expect(areaPart(parseArea("in:National Marine Sanctuaries"))).toBe("national-marine-sanctuaries");
    expect(areaPart(parseArea("in:National Marine Sanctuaries|Monterey Bay National Marine Sanctuary"))).toBe("national-marine-sanctuaries-monterey-bay");
    expect(areaPart(parseArea("ins:BOEM Wind Leases|A,B,C"))).toBe("boem-wind-leases-3-regions");
    expect(areaPart(parseArea("ln:90/55"))).toBe("line90-st55");
    expect(areaPart(parseArea("ln:76.7,80,90"))).toBe("3-lines");
    expect(areaPart(parseArea("box:-121,32,-117,35"))).toBe("box");
    expect(areaPart(parseArea("poly:-121,32~-117,32~-119,35"))).toBe("drawn-area");
    expect(areaPart(null)).toBe(null);
  });
  it("slug keeps a decimal line number and drops accents and brackets", () => {
    expect(slug("Line 76.7 (north)")).toBe("line-76.7");
    expect(slug("Señorita")).toBe("senorita");
  });
});
