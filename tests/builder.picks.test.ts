// the Query Builder's pick links (src/builder/picks.ts): builder.html?pick=bio:<dataset>:<taxon>&download=1, as calcofi.io's
// dataset pages write them (assets/dataset-page.js: "?pick=" + encodeURIComponent("bio:" + dataset + ":" + key) + "&download=1")
import { describe, expect, it } from "vitest";
import { normalizePick, offGridNotice, parsePicks, parseShape, pickHref, startLens, unknownNotice, withoutDownload } from "../src/builder/picks";

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

describe("a link can name the table's starting shape", () => {
  it("rows, stations and lens, each from its own short list", () => {
    expect(parseShape("?pick=x&rows=sample&stations=all&lens=hex")).toEqual({ rows: "sample", stations: "all", lens: "hex" });
    expect(parseShape("?stations=ext&lens=Regions")).toEqual({ rows: null, stations: "std,ext", lens: "region" });
  });
  it("nothing named, or a word it does not know: the page's defaults stand", () => {
    expect(parseShape("?pick=x")).toEqual({ rows: null, stations: null, lens: null });
    expect(parseShape("?rows=custom&stations=everything&lens=map")).toEqual({ rows: null, stations: null, lens: null });
  });
});

// REGRESSION (2026-11-17, release v2026.11.14): none of calcofi_phytoplankton's 155,553 records has a grid cell, so a link to one
// of its 305 taxa opened on Stations and downloaded nothing
describe("a dataset sampled off the station grid", () => {
  const onGrid = (d: string) => d !== "calcofi_phytoplankton";
  it("a link whose picks are all off the grid starts on Hexagons; one pick on the grid keeps Stations", () => {
    expect(startLens(null, ["calcofi_phytoplankton"], onGrid)).toBe("hex");
    expect(startLens(null, ["calcofi_phytoplankton", "swfsc_ichthyo"], onGrid)).toBe("station");
    expect(startLens(null, [], onGrid)).toBe("station");
  });
  it("the lens a link names always stands", () => {
    expect(startLens("region", ["calcofi_phytoplankton"], onGrid)).toBe("region");
    expect(startLens("station", ["calcofi_phytoplankton"], onGrid)).toBe("station");
  });
  it("under Stations the page says whose columns are blank, and why", () => {
    expect(offGridNotice(["Phytoplankton", "Phytoplankton"])).toBe("Phytoplankton is sampled off CalCOFI's station grid, so under Stations its columns are blank. Choose Hexagons or Regions.");
    expect(offGridNotice([])).toBeNull();
  });
});
