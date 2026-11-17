// which brand a build wears and where it loads it from (src/brandurl.ts): the head block vite.config.ts injects and the
// URLs src/brand.ts hands the header and the capture follow the same two variables
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { BRAND_BASE, brandBase, brandOf, brandUrls, headFor, waveOver } from "../src/brandurl";

describe("VITE_BRAND", () => {
  it("is v3 unless v1 or v2 is asked for", () => {
    expect(brandOf(undefined)).toBe("v3");
    expect(brandOf("")).toBe("v3");
    expect(brandOf("v3")).toBe("v3");
    expect(brandOf("v4")).toBe("v3");
    expect(brandOf("v2")).toBe("v2");
    expect(brandOf("v1")).toBe("v1");
  });
});

describe("VITE_BRAND_URL", () => {
  it("defaults to calcofi.io and always ends in one slash", () => {
    expect(brandBase(undefined)).toBe("https://calcofi.io/brand/");
    expect(brandBase("  ")).toBe(BRAND_BASE);
    expect(brandBase("/brand")).toBe("/brand/");
    expect(brandBase("/brand//")).toBe("/brand/");
    expect(brandBase("http://localhost:4000/brand/")).toBe("http://localhost:4000/brand/");
  });
});

describe("the folders a build reads", () => {
  it("v3 keeps v2's logos, fonts and tokens and adds its own header and words", () => {
    expect(brandUrls("v3")).toEqual({ root: "https://calcofi.io/brand/v3/", assets: "https://calcofi.io/brand/v2/", nav: "https://calcofi.io/brand/v3/nav.json" });
  });
  it("v2 and v1 are self-contained and have no shared words", () => {
    expect(brandUrls("v2")).toEqual({ root: "https://calcofi.io/brand/v2/", assets: "https://calcofi.io/brand/v2/", nav: null });
    expect(brandUrls("v1")).toEqual({ root: "https://calcofi.io/brand/v1/", assets: "https://calcofi.io/brand/v1/", nav: null });
  });
  it("a preview's own copy moves every folder", () => {
    expect(brandUrls("v3", "/brand")).toEqual({ root: "/brand/v3/", assets: "/brand/v2/", nav: "/brand/v3/nav.json" });
  });
});

describe("the head block", () => {
  const v3 = fs.readFileSync("brand/v3.head.html", "utf8");
  it("v3 loads v2's tokens, then v3's header, theme.js and header.js", () => {
    const h = headFor(v3);
    const at = (s: string) => h.indexOf(s);
    expect(at("https://calcofi.io/brand/v2/theme.css")).toBeGreaterThan(0);
    expect(at("https://calcofi.io/brand/v3/header.css")).toBeGreaterThan(at("https://calcofi.io/brand/v2/theme.css"));
    expect(h).toContain('<script defer src="https://calcofi.io/brand/v3/theme.js"></script>');
    expect(h).toContain('<script defer src="https://calcofi.io/brand/v3/header.js"></script>');
    expect(h).not.toContain("https://calcofi.io/brand/v2/theme.js");
  });
  it("an app keeps the app-scale meta; a page (builder.html) drops it", () => {
    const tag = /^<meta name="cc-scale" content="app">$/m;   // the tag itself, not the comment that quotes it
    expect(headFor(v3, { scale: "app" })).toMatch(tag);
    expect(headFor(v3)).toMatch(tag);
    expect(headFor(v3, { scale: "page" })).not.toMatch(tag);
    expect(headFor(v3, { scale: "page" })).toContain("brand/v3/header.css");
  });
  it("every brand URL follows VITE_BRAND_URL, and nothing still points at calcofi.io's copy", () => {
    const h = headFor(v3, { base: "/brand/" });
    expect(h).not.toContain("https://calcofi.io/brand/");
    expect(h).toContain('href="/brand/v2/theme.css"');
    expect(h).toContain('href="/brand/v3/header.css"');
    expect(h).toContain('src="/brand/v3/header.js"');
    expect(h).toContain('href="/brand/v2/fonts/SourceSans3-VF.woff2"');
  });
  it("v2's block is unchanged by the default base", () => {
    const v2 = fs.readFileSync("brand/v2.head.html", "utf8");
    expect(headFor(v2)).toBe(v2.trim());
  });
});

describe("the wave over the map: how far the brand's strip lies over what follows", () => {
  it("is the strip's own negative bottom margin (brand v3 .cc-wave-over: 15 px in an app, 34 px on a page)", () => {
    expect(waveOver("-15px")).toBe(15);
    expect(waveOver("-34px")).toBe(34);
    expect(waveOver("-14.5px")).toBe(14.5);
  });
  it("is 0 when the strip is in the flow: a brand copy without the variant, v1 or v2, or no value", () => {
    for (const v of ["0px", "", "auto", "12px", null, undefined]) expect(waveOver(v)).toBe(0);
  });
});
