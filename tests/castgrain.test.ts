// the per-cast grain's registry rules (plan 2026-10-02 D2, explore#13) — what is a per-cast variable, which family
// it belongs to, what the UI says about it. Keyed on the release's measurement_type registry and on which dataset
// publishes the rows, NEVER on a measurement_type name: the headline MLD is renamed and the chl-max definition
// changes at the next release (workflows#101, #102), and the app must follow without an edit.
import { describe, expect, it } from "vitest";
import { castVariables, derivedFamily, derivedTip, grainCount, grainWord, variableGrain, DERIVED_DATASETS, DERIVED_FAMILY, type CastCensusRow, type RegistryRow } from "../src/castgrain";

const reg = (rows: Partial<RegistryRow>[]) => new Map(rows.map((r) => [r.measurement_type!, { description: null, units: null, derivation: null, grain: null, category: null, ...r } as RegistryRow]));
const REG = reg([
  { measurement_type: "mld_x", description: "Mixed-layer depth, a criterion", units: "m", derivation: "ctd_mld(threshold = 0.03)", grain: "sample", category: "Physical Oceanography" },
  { measurement_type: "chl_y", description: "Chlorophyll-a at its maximum", units: "ug/L", derivation: "ctd_chl_max()", grain: "sample", category: "Productivity & Pigments" },
  { measurement_type: "wind_z", description: "Wind speed", units: "knots", grain: "sample", category: "Meteorology & Sea State" },
  { measurement_type: "spice_w", description: "Spice", units: "kg/m3", derivation: "ctd_spice()", grain: "obs", category: "Physical Oceanography" },
]);
const CENSUS: CastCensusRow[] = [
  { dataset_key: "calcofi_ctd-derived", measurement_type: "mld_x", n: 9078 },
  { dataset_key: "calcofi_ctd-derived", measurement_type: "chl_y", n: 9008 },
  { dataset_key: "calcofi_bottle", measurement_type: "wind_z", n: 33965 },
  { dataset_key: "swfsc_ichthyo", measurement_type: "std_haul_factor", n: 76512 },
];

describe("castVariables() — the per-cast variables the picker lists", () => {
  it("lists a type when the registry says grain = sample AND a derived dataset publishes it", () => {
    expect(castVariables(REG, CENSUS).map((v) => v.key)).toEqual(["chl_y", "mld_x"]);
  });
  it("takes label, units, derivation and category from the registry row, the datasets and count from the release", () => {
    expect(castVariables(REG, CENSUS).find((v) => v.key === "mld_x")).toEqual({
      key: "mld_x", label: "Mixed-layer depth, a criterion", units: "m", derivation: "ctd_mld(threshold = 0.03)", category: "Physical Oceanography",
      datasets: ["calcofi_ctd-derived"], n: 9078, n_placed: null, y0: null, y1: null });
  });
  it("carries the years and the placed count once cast_list.sql has run (sample_root loaded)", () => {
    const v = castVariables(REG, [{ dataset_key: "calcofi_ctd-derived", measurement_type: "mld_x", n: 9078, n_placed: 9078, y0: 1993, y1: 2025 }])[0];
    expect([v.n, v.n_placed, v.y0, v.y1]).toEqual([9078, 9078, 1993, 2025]);
  });
  it("a per-sample type of a dataset outside the derived family is not listed (bottle weather, tow effort)", () => {
    const keys = castVariables(REG, CENSUS).map((v) => v.key);
    expect(keys).not.toContain("wind_z"); expect(keys).not.toContain("std_haul_factor");
  });
  it("a type the registry does not describe is not listed — no fallback to its name", () => {
    expect(castVariables(REG, [{ dataset_key: "calcofi_ctd-derived", measurement_type: "mld_unregistered", n: 5 }])).toEqual([]);
  });
  it("a type the registry calls per-observation is not a per-cast variable, whoever publishes it", () => {
    expect(castVariables(REG, [{ dataset_key: "calcofi_ctd-derived", measurement_type: "spice_w", n: 5 }])).toEqual([]);
  });
  // the churn ahead (workflows#101): the headline MLD becomes another type. Nothing in the app names the old one.
  it("a renamed or new type appears with no code change", () => {
    const r2 = reg([{ measurement_type: "mld_sigma_theta_002_below_10m", description: "Mixed-layer depth (+0.02 kg/m3 below 10 m)", units: "m", derivation: "ctd_mld(threshold = 0.02)", grain: "sample", category: "Physical Oceanography" }]);
    expect(castVariables(r2, [{ dataset_key: "calcofi_ctd-derived", measurement_type: "mld_sigma_theta_002_below_10m", n: 9000 }]).map((v) => v.label)).toEqual(["Mixed-layer depth (+0.02 kg/m3 below 10 m)"]);
  });
  it("is empty before the registry or the census has arrived", () => { expect(castVariables(new Map(), CENSUS)).toEqual([]); expect(castVariables(REG, [])).toEqual([]); });
});

describe("variableGrain() — which slice a `var=` builds", () => {
  it("a variable with an obs_env object is per-bin: the existing path, whatever the registry says", () => {
    expect(variableGrain("temperature", true, REG)).toBe("bin"); expect(variableGrain("mld_x", true, REG)).toBe("bin");
  });
  it("a variable with no obs_env object whose registry row says grain = sample is per-cast", () => expect(variableGrain("mld_x", false, REG)).toBe("cast"));
  it("anything else is unknown (null) — the caller reports it, it does not guess", () => {
    expect(variableGrain("spice_w", false, REG)).toBeNull(); expect(variableGrain("nope", false, REG)).toBeNull(); expect(variableGrain("mld_x", false, null)).toBeNull();
  });
});

describe("the Derived (hydrographic) family", () => {
  it("is the measurement types the derived dataset publishes — one dataset key, no type names", () => {
    expect(DERIVED_DATASETS).toEqual(["calcofi_ctd-derived"]); expect(DERIVED_FAMILY).toBe("Derived (hydrographic)");
  });
  it("derivedFamily(): a variable belongs when ANY dataset that publishes it is derived", () => {
    expect(derivedFamily(["calcofi_ctd-derived"])).toBe(DERIVED_FAMILY);
    expect(derivedFamily(["calcofi_bottle", "calcofi_ctd-cast"])).toBeNull(); expect(derivedFamily([])).toBeNull();
  });
});

describe("the words", () => {
  it("grainWord(): what one value stands for", () => { expect(grainWord("cast")).toBe("one value per cast"); expect(grainWord("bin")).toBe("one value per depth bin"); });
  it("grainCount(): what the count counts", () => {
    expect(grainCount("cast", 9078)).toBe("9,078 casts"); expect(grainCount("cast", 1)).toBe("1 cast"); expect(grainCount("bin", 663077)).toBe("663,077 observations");
  });
  it("derivedTip(): the definition a hover shows — the registry's description and derivation, verbatim", () => {
    expect(derivedTip({ label: "Mixed-layer depth, a criterion", units: "m", derivation: "ctd_mld(threshold = 0.03)" }, "cast", "CTD Derived Products")).toBe(
      "Mixed-layer depth, a criterion (m)\nDerived, not measured — one value per cast · CTD Derived Products\nHow: ctd_mld(threshold = 0.03)");
  });
  it("derivedTip(): no derivation in the registry = no 'How' line, never an invented one", () => {
    expect(derivedTip({ label: "X", units: null, derivation: null }, "bin")).toBe("X\nDerived, not measured — one value per depth bin");
  });
});
