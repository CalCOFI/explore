// the Query Builder's pick links (src/builder/picks.ts): builder.html?pick=bio:<dataset>:<taxon>&download=1, as calcofi.io's
// dataset pages write them (assets/dataset-page.js: "?pick=" + encodeURIComponent("bio:" + dataset + ":" + key) + "&download=1")
import { describe, expect, it } from "vitest";
import { normalizePick, parsePicks, pickHref, unknownNotice, withoutDownload } from "../src/builder/picks";

const KNOWN = new Set(["bio:swfsc_ichthyo:worms:217452", "bio:swfsc_cufes:worms:217452", "env:calcofi_bottle:temperature", "env:calcofi_ctd-cast:temperature"]);
const known = (id: string) => KNOWN.has(id);

describe("one pick, as the site writes it", () => {
  it("a species id keeps its taxon key's own colon", () => {
    const link = "?pick=" + encodeURIComponent("bio:swfsc_ichthyo:worms:217452") + "&download=1";
    expect(parsePicks(link, known)).toEqual({ picked: ["bio:swfsc_ichthyo:worms:217452"], unknown: [], download: true });
  });
  it("a measurement id, not encoded", () => {
    expect(parsePicks("?pick=env:calcofi_bottle:temperature", known)).toEqual({ picked: ["env:calcofi_bottle:temperature"], unknown: [], download: false });
  });
  it("no pick: nothing picked, and download=1 alone downloads nothing", () => {
    expect(parsePicks("?download=1", known)).toEqual({ picked: [], unknown: [], download: false });
    expect(parsePicks("", known)).toEqual({ picked: [], unknown: [], download: false });
  });
});

describe("several picks", () => {
  it("the parameter repeated, or ids separated by commas, in the order asked and each once", () => {
    const a = parsePicks("?pick=bio:swfsc_ichthyo:worms:217452&pick=env:calcofi_bottle:temperature&pick=bio:swfsc_ichthyo:worms:217452", known);
    expect(a.picked).toEqual(["bio:swfsc_ichthyo:worms:217452", "env:calcofi_bottle:temperature"]);
    const b = parsePicks("?pick=env:calcofi_ctd-cast:temperature,bio:swfsc_cufes:worms:217452", known);
    expect(b.picked).toEqual(["env:calcofi_ctd-cast:temperature", "bio:swfsc_cufes:worms:217452"]);
  });
});

describe("a pick the release does not hold", () => {
  it("is reported, and stops the automatic download even when another pick is known", () => {
    const r = parsePicks("?pick=env:calcofi_ctd-derived:mld_temperature_02&pick=env:calcofi_bottle:temperature&download=1", known);
    expect(r).toEqual({ picked: ["env:calcofi_bottle:temperature"], unknown: ["env:calcofi_ctd-derived:mld_temperature_02"], download: false });
    expect(unknownNotice(r.unknown)).toContain("env:calcofi_ctd-derived:mld_temperature_02");
    expect(unknownNotice(r.unknown)).toContain("nothing was downloaded");
  });
  it("a value that is not shaped like an id is reported as it was written", () => {
    expect(parsePicks("?pick=sardine", known).unknown).toEqual(["sardine"]);
    expect(normalizePick("bio:swfsc_ichthyo")).toBeNull();
    expect(normalizePick("taxon:swfsc_ichthyo:worms:1")).toBeNull();
  });
  it("no notice when every pick is known", () => { expect(unknownNotice([])).toBeNull(); });
});

describe("writing links", () => {
  it("pickHref round-trips through parsePicks", () => {
    const href = pickHref("builder.html", ["bio:swfsc_ichthyo:worms:217452", "env:calcofi_bottle:temperature"], true);
    expect(href).toBe("builder.html?pick=bio%3Aswfsc_ichthyo%3Aworms%3A217452&pick=env%3Acalcofi_bottle%3Atemperature&download=1");
    expect(parsePicks(href.slice(href.indexOf("?")), known)).toEqual({ picked: ["bio:swfsc_ichthyo:worms:217452", "env:calcofi_bottle:temperature"], unknown: [], download: true });
    expect(pickHref("builder.html", [], true)).toBe("builder.html");
  });
  it("download=1 is dropped from the address once it has run; the picks and the release stay", () => {
    expect(withoutDownload("?pick=env:calcofi_bottle:temperature&download=1&release=v2026.11.14")).toBe("?pick=env%3Acalcofi_bottle%3Atemperature&release=v2026.11.14");
    expect(withoutDownload("?download=1")).toBe("");
  });
});
