// where the Query Builder and the Explorer live in a build, the links between them, and the redirect the old address
// leaves behind (src/queryurl.ts): pure rules, pinned here; scripts/builder_check.mjs follows the redirect in Chrome.
import { describe, expect, it } from "vitest";
import { appOf, exploreBase, queryAddress, queryBase, queryHref, redirectHtml, redirectTo, viewLens, viewPicks, QUERY_LIVE } from "../src/queryurl";

describe("which app a build is", () => {
  it("only VITE_APP=query is the Query Builder alone", () => {
    expect(appOf("query")).toBe("query"); expect(appOf(" query ")).toBe("query");
    for (const v of [undefined, null, "", "explore", "Query", "builder"]) expect(appOf(v)).toBe("explore");
  });
  it("VITE_QUERY_URL is a folder address with one closing slash; unset is none", () => {
    expect(queryAddress("https://calcofi.io/query")).toBe(QUERY_LIVE);
    expect(queryAddress("https://calcofi.io/query///")).toBe(QUERY_LIVE);
    expect(queryAddress("/query/")).toBe("/query/");
    for (const v of [undefined, null, "", "  "]) expect(queryAddress(v)).toBe("");
  });
});

describe("links between the two apps", () => {
  it("from the Explorer: builder.html beside it, or the Query Builder's own address once it has one", () => {
    expect(queryBase("explore", undefined)).toBe("./builder.html");
    expect(queryBase("explore", "https://calcofi.io/query")).toBe(QUERY_LIVE);
    expect(queryBase("explore", "/query/")).toBe("/query/");
  });
  it("from the Query Builder to itself: its own page, never the redirect", () => {
    expect(queryBase("query", QUERY_LIVE, "query")).toBe("./");
    expect(queryBase("query", undefined, "query")).toBe("./");
    expect(queryBase("explore", QUERY_LIVE, "query")).toBe("./builder.html");
    expect(queryBase("explore", undefined, "query")).toBe("./builder.html");
  });
  it("to the Explorer: ./ beside it; from the Query Builder's own build, the site's /explore/ or the address given", () => {
    expect(exploreBase("explore", undefined)).toBe("./");
    expect(exploreBase("explore", "https://x/")).toBe("./");
    expect(exploreBase("query", undefined)).toBe("https://calcofi.io/explore/");
    expect(exploreBase("query", undefined, "/")).toBe("/explore/");
    expect(exploreBase("query", "http://localhost:5178")).toBe("http://localhost:5178/");
  });
  it("a link with picks and a shape, as src/builder/picks.ts reads it", () => {
    expect(queryHref("./builder.html")).toBe("./builder.html");
    expect(queryHref(QUERY_LIVE, ["bio:swfsc_ichthyo:worms:217452", "env:calcofi_bottle:temperature"], { lens: "hex" }))
      .toBe("https://calcofi.io/query/?pick=bio%3Aswfsc_ichthyo%3Aworms%3A217452&pick=env%3Acalcofi_bottle%3Atemperature&lens=hex");
    expect(queryHref("/query/", [], { lens: "station", rows: "sample", stations: "all" })).toBe("/query/?lens=station&rows=sample&stations=all");
    expect(queryHref("/query/", ["env:calcofi_bottle:temperature"], { lens: null })).toBe("/query/?pick=env%3Acalcofi_bottle%3Atemperature");
  });
});

describe("what the Explorer's view carries into the Query Builder", () => {
  const V = { realm: "bio" as const, taxon: "worms:217452", variable: "temperature", datasets: ["swfsc_ichthyo"], listed: true };
  it("a species: one pick per dataset in view, as the builder's ids", () => {
    expect(viewPicks(V)).toEqual(["bio:swfsc_ichthyo:worms:217452"]);
    expect(viewPicks({ ...V, datasets: ["swfsc_ichthyo", "swfsc_cufes", "swfsc_ichthyo"] })).toEqual(["bio:swfsc_ichthyo:worms:217452", "bio:swfsc_cufes:worms:217452"]);
  });
  it("a measurement: the variable's key, per dataset", () => {
    expect(viewPicks({ ...V, realm: "env", datasets: ["calcofi_bottle", "calcofi_ctd-cast"] })).toEqual(["env:calcofi_bottle:temperature", "env:calcofi_ctd-cast:temperature"]);
  });
  it("nothing while no dataset is in view, and nothing for a measurement the builder does not list", () => {
    expect(viewPicks({ ...V, datasets: [] })).toEqual([]);
    expect(viewPicks({ ...V, realm: "env", listed: false, datasets: ["calcofi_ctd-cast"] })).toEqual([]);
    expect(viewPicks({ ...V, taxon: "" })).toEqual([]);
  });
  it("the lens: Stations, Hexagons and Regions carry over; Cruises and Sections do not", () => {
    expect(["station", "hex", "region", "cruise", "section"].map(viewLens)).toEqual(["station", "hex", "region", null, null]);
  });
  it("the whole link, as the Explorer builds it", () => {
    expect(queryHref(queryBase("explore", "/query/"), viewPicks(V), { lens: viewLens("hex") })).toBe("/query/?pick=bio%3Aswfsc_ichthyo%3Aworms%3A217452&lens=hex");
    expect(queryHref(queryBase("explore", undefined), viewPicks({ ...V, datasets: [] }), { lens: viewLens("section") })).toBe("./builder.html");
  });
});

describe("the redirect the old address leaves behind", () => {
  const PICK = "?pick=bio:swfsc_ichthyo:worms:217452&rows=sample&stations=all&download=1";
  it("carries the query string and the fragment unchanged", () => {
    expect(redirectTo(QUERY_LIVE, PICK, "")).toBe(`https://calcofi.io/query/${PICK}`);
    expect(redirectTo("/query/", "?pick=env%3Acalcofi_bottle%3Atemperature", "#top")).toBe("/query/?pick=env%3Acalcofi_bottle%3Atemperature#top");
    expect(redirectTo(QUERY_LIVE, "", "#x")).toBe("https://calcofi.io/query/#x");
  });
  it("a bare address goes to the bare address", () => {
    expect(redirectTo(QUERY_LIVE, "", "")).toBe(QUERY_LIVE);
    expect(redirectTo(QUERY_LIVE, "?", "#")).toBe(QUERY_LIVE);
  });
  it("a target that carries its own query string keeps it, and its fragment gives way to the link's", () => {
    expect(redirectTo("https://x/q/?v=2", "?pick=a", "")).toBe("https://x/q/?v=2&pick=a");
    expect(redirectTo("https://x/q/#old", "?pick=a", "#new")).toBe("https://x/q/?pick=a#new");
  });
  it("the page: the same function, the target, canonical, noindex and a plain link", () => {
    const h = redirectHtml("https://calcofi.io/query");
    expect(h).toContain('<meta name="robots" content="noindex">');
    expect(h).toContain('<link rel="canonical" href="https://calcofi.io/query/">');
    expect(h).toContain('<a href="https://calcofi.io/query/">');
    expect(h).toContain('<noscript><meta http-equiv="refresh" content="0; url=https://calcofi.io/query/"></noscript>');
    expect(h).toMatch(/location\.replace\(\(function redirectTo\(queryUrl, search, hash\)/);
    expect(h).toContain('("https://calcofi.io/query/", location.search, location.hash)');
  });
  it("the page's own script, run as the browser runs it, lands on the new address with the link's picks", () => {
    const h = redirectHtml("/query/"), js = /<script>([\s\S]*?)<\/script>/.exec(h)![1];
    let went = "";
    new Function("location", js)({ search: PICK, hash: "#a", replace: (u: string) => { went = u; } });
    expect(went).toBe(`/query/${PICK}#a`);
    expect(h).toContain('<link rel="canonical" href="https://calcofi.io/query/">');   // a preview's path is not a canonical: the live address is
  });
});
