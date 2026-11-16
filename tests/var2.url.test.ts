// "Add a variable" (`var2=`, PR #53) in the link: it rides beside the first pick of either realm and never displaces it.
// Regression: toUrl's `if (s.var2) … else { taxon … }` swallowed the realm's else, so a species with an added variable
// lost taxon / stage / den / zeros (a reload fell back to Pacific sardine) and every variable's link carried a taxon.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, fromUrl, toUrl, type Sel } from "../src/state";

let written = "";
const at = (search: string) => {
  vi.stubGlobal("location", { pathname: "/explore/", search });
  vi.stubGlobal("history", { replaceState: (_: unknown, __: string, url: string) => { written = url; }, pushState: (_: unknown, __: string, url: string) => { written = url; } });
};
const params = () => new URLSearchParams(written.split("?")[1] ?? "");
const roundTrip = (s: Sel) => { at(""); toUrl(s); at(`?${written.split("?")[1]}`); return fromUrl(); };
afterEach(() => { vi.unstubAllGlobals(); written = ""; });

describe("var2= beside the first pick", () => {
  it("a species with an added variable keeps its taxon, stage, units and zeros", () => {
    const s: Sel = { ...DEFAULTS, lens: "hex", realm: "bio", taxon: "worms:272295", stage: "larva", den: "per_10m2", zeros: false, var2: "temperature" };
    at(""); toUrl(s);
    const p = params();
    expect(p.get("taxon")).toBe("worms:272295");
    expect(p.get("stage")).toBe("larva");
    expect(p.get("den")).toBe("per_10m2");
    expect(p.get("zeros")).toBe("0");
    expect(p.get("var2")).toBe("temperature");
    expect(p.has("var")).toBe(false);
    const r = roundTrip(s);
    expect([r.realm, r.taxon, r.stage, r.den, r.zeros, r.var2]).toEqual(["bio", "worms:272295", "larva", "per_10m2", false, "temperature"]);
  });
  it("a variable with an added variable carries both, and no taxon", () => {
    const s: Sel = { ...DEFAULTS, lens: "hex", realm: "env", var: "temperature", var2: "salinity" };
    at(""); toUrl(s);
    const p = params();
    expect([p.get("var"), p.get("var2"), p.has("taxon")]).toEqual(["temperature", "salinity", false]);
    const r = roundTrip(s);
    expect([r.realm, r.var, r.var2]).toEqual(["env", "temperature", "salinity"]);
  });
  it("a variable alone carries no taxon (the realm's else is its own again)", () => {
    at(""); toUrl({ ...DEFAULTS, realm: "env", var: "oxygen_ml_l" });
    expect(params().has("taxon")).toBe(false);
    expect(params().has("var2")).toBe(false);
  });
  it("a species alone carries its taxon and no var2", () => {
    at(""); toUrl({ ...DEFAULTS });
    expect(params().get("taxon")).toBe(DEFAULTS.taxon);
    expect(params().has("var2")).toBe(false);
  });
  // review 2026-11-16: "coloured by the added variable" was React state only, so a reload went back to the first pick's colours
  it("colour by the added variable rides in the link (color=var2), only in Hexagons and only with var2", () => {
    const s: Sel = { ...DEFAULTS, lens: "hex", realm: "bio", var2: "temperature", color2: true };
    at(""); toUrl(s);
    expect(params().get("color")).toBe("var2");
    expect(roundTrip(s).color2).toBe(true);
    at(""); toUrl({ ...s, lens: "station" }); expect(params().has("color")).toBe(false);
    at(""); toUrl({ ...s, var2: null }); expect(params().has("color")).toBe(false);
    at("?lens=hex&color=var2"); expect(fromUrl().color2).toBe(false);   // no var2: nothing to colour by
  });
});
