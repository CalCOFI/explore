// the Observations layer's URL rule (`obs=`; Erin, 2026-10-05: the casts as black dots over the sea floor, no temperature).
// One small fixture per rule.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, OBS_COLOR, fromUrl, parseObs, toUrl } from "../src/state";

describe("parseObs — on, a colour, or off", () => {
  it("`on` is black", () => expect(parseObs("on")).toBe(OBS_COLOR));
  it("six hex digits are that colour, lower-cased", () => expect(parseObs("FF8800")).toBe("ff8800"));
  it("absent, empty or `off` is off", () => { expect(parseObs(null)).toBeNull(); expect(parseObs("")).toBeNull(); expect(parseObs("off")).toBeNull(); });
  it("garbage is off, never a broken colour", () => { expect(parseObs("#000000")).toBeNull(); expect(parseObs("red")).toBeNull(); expect(parseObs("12345")).toBeNull(); });
});

describe("obs= round-trips through the URL", () => {
  let written = "";
  const at = (search: string) => {
    vi.stubGlobal("location", { pathname: "/explore/", search });
    vi.stubGlobal("history", { replaceState: (_: unknown, __: string, url: string) => { written = url; } });
  };
  afterEach(() => { vi.unstubAllGlobals(); written = ""; });

  it("default off: the link carries no obs=", () => { at(""); toUrl({ ...DEFAULTS }); expect(written).not.toContain("obs="); });
  it("black is written `obs=on`, and reads back black", () => {
    at(""); toUrl({ ...DEFAULTS, obs: OBS_COLOR }); expect(written).toContain("obs=on");
    at("?obs=on"); expect(fromUrl().obs).toBe(OBS_COLOR);
  });
  it("another colour is written as its hex", () => { at(""); toUrl({ ...DEFAULTS, obs: "ffffff" }); expect(written).toContain("obs=ffffff"); });
  it("obs survives data=off: sites over the sea floor alone", () => {
    at("?lens=station&data=off&obs=on"); const s = fromUrl(); expect(s.data).toBe(false); expect(s.obs).toBe(OBS_COLOR);
  });
});

describe("lines= round-trips through the URL (the 2-D map's Lines layer)", () => {
  let written = "";
  const at = (search: string) => {
    vi.stubGlobal("location", { pathname: "/explore/", search });
    vi.stubGlobal("history", { replaceState: (_: unknown, __: string, url: string) => { written = url; } });
  };
  afterEach(() => { vi.unstubAllGlobals(); written = ""; });
  it("off by default, and the link carries no lines=", () => { at(""); expect(fromUrl().lines).toBe(false); toUrl({ ...DEFAULTS }); expect(written).not.toContain("lines="); });
  it("on is written `lines=on` and reads back on, with Data off", () => {
    at(""); toUrl({ ...DEFAULTS, lines: true }); expect(written).toContain("lines=on");
    at("?data=off&obs=on&lines=on"); const s = fromUrl(); expect(s.lines).toBe(true); expect(s.data).toBe(false);
  });
  it("anything but `on` is off", () => { at("?lines=1"); expect(fromUrl().lines).toBe(false); });
});
