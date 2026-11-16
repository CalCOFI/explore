// combining datasets (`pool`, review 2026-11-16): one dataset is the default; combining is an explicit choice that
// round-trips through the link — `datasets=all` (every dataset) or a list of two or more (classic's pills)
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, datasetsParam, fromUrl, parseDatasets, toUrl, type Sel } from "../src/state";

let written = "";
const at = (search: string) => {
  vi.stubGlobal("location", { pathname: "/explore/", search });
  vi.stubGlobal("history", { replaceState: (_: unknown, __: string, url: string) => { written = url; }, pushState: (_: unknown, __: string, url: string) => { written = url; } });
};
const roundTrip = (s: Sel) => { at(""); toUrl(s); at(`?${written.split("?")[1]}`); return fromUrl(); };
afterEach(() => { vi.unstubAllGlobals(); written = ""; });

describe("datasets= and pooling", () => {
  it("absent: one dataset, the app's pick (not pooled)", () => expect(parseDatasets(null)).toEqual({ datasets: null, pool: false }));
  it("one key: that dataset", () => expect(parseDatasets("calcofi_bottle")).toEqual({ datasets: ["calcofi_bottle"], pool: false }));
  it("all: every dataset combined", () => expect(parseDatasets("all")).toEqual({ datasets: null, pool: true }));
  it("two or more keys: those combined", () => expect(parseDatasets("a,b")).toEqual({ datasets: ["a", "b"], pool: true }));
  it("writes all / the list / nothing", () => {
    expect(datasetsParam({ datasets: null, pool: true })).toBe("all");
    expect(datasetsParam({ datasets: ["a", "b"], pool: true })).toBe("a,b");
    expect(datasetsParam({ datasets: ["a"], pool: false })).toBe("a");
    expect(datasetsParam({ datasets: null, pool: false })).toBeNull();
  });
  it("a pooled view survives the link", () => {
    const s: Sel = { ...DEFAULTS, realm: "env", var: "temperature", datasets: null, pool: true };
    const b = roundTrip(s);
    expect(written).toContain("datasets=all");
    expect([b.datasets, b.pool]).toEqual([null, true]);
  });
  it("a single dataset survives the link unpooled", () => {
    const b = roundTrip({ ...DEFAULTS, realm: "env", var: "temperature", datasets: ["calcofi_ctd"], pool: false });
    expect([b.datasets, b.pool]).toEqual([["calcofi_ctd"], false]);
  });
});
