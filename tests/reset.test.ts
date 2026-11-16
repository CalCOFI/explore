// "Reset all" (state.ts resetPatch): every filter and view setting goes back, the pick stays — with its life stage, units
// and zeros. Regressions (review 2026-11-16): Reset dropped the life stage and per-10-m², and left Lines and var2 behind
import { describe, expect, it } from "vitest";
import { DEFAULTS, resetPatch, type Sel } from "../src/state";

describe("resetPatch", () => {
  const busy: Sel = { ...DEFAULTS, realm: "bio", taxon: "worms:272295", stage: "egg", den: "per_1000m3", zeros: false, lens: "hex", res: 7, years: [1990, 2000], q: [2], area: "std",
    cruises: ["2019-07-RL"], depth: [0, 100], lines: true, obs: "on", effort: true, var2: "temperature", datasets: ["swfsc_ichthyo"], stat: "median" };
  const r = { ...busy, ...resetPatch() };
  it("keeps the pick, its life stage, units and zeros", () => {
    expect([r.realm, r.taxon, r.stage, r.den, r.zeros]).toEqual(["bio", "worms:272295", "egg", "per_1000m3", false]);
  });
  it("clears every filter and view setting", () => {
    expect(r.lens).toBe("station"); expect(r.years).toEqual(DEFAULTS.years); expect(r.q).toBeNull(); expect(r.area).toBeNull();
    expect(r.cruises).toBeNull(); expect(r.depth).toEqual(DEFAULTS.depth); expect(r.datasets).toBeNull(); expect(r.stat).toBe("mean");
  });
  it("turns the Lines, Observations and Effort layers off and drops the added variable", () => {
    expect([r.lines, r.obs, r.effort, r.var2]).toEqual([false, null, false, null]);
  });
});
