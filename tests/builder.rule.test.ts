// what the Query Builder SAYS about its table (src/builder/query.ts): the sentence under the controls, "How rows are matched"
// (ruleLines) and the notes saved beside a download (aboutText). A combined table needs an explicit matching rule; these
// pin the words to the spec that produces them, so the SQL and its description are changed together.
import { describe, expect, it } from "vitest";
import { aboutColumns, aboutText, ruleLines, sentence, type Spec } from "../src/builder/query";

const BASE: Spec = {
  picks: [{ realm: "bio", taxon: "worms:217452", label: "Pacific Sardine", dataset: "swfsc_ichthyo", tag: "Ichthyoplankton", units: "count" },
    { realm: "env", key: "temperature", label: "Sea temperature", members: ["temperature"], units: "degC", dataset: "calcofi_bottle", tag: "Bottle" }],
  lens: "station", place: "station", hexRes: 5, layer: null, regionNames: null, area: "TRUE",
  years: [1949, 2026], seasons: null, depth: [0, 500], time: "year", depthBy: "avg", stat: "avg",
  stages: ["larva"], den: "density_per_10m2", zeros: true, qualOnly: true, datasets: null,
};
const rule = (over: Partial<Spec> = {}) => ruleLines({ ...BASE, ...over }).join("\n");

describe("the sentence under the controls", () => {
  it("every sample: says what a row is, and no longer that nothing is combined (a visit's nets and casts are averaged)", () => {
    const s = sentence({ lens: "station", place: "station", time: "sample", depthBy: "10", stat: "avg" }, true);
    expect(s).toBe("Each row is one station on one sampling date at one 10 m depth step. Where several values share it, the row shows their average.");
    expect(s).not.toMatch(/Nothing is combined/);
  });
  it("yearly averages per station", () => {
    expect(sentence(BASE, false)).toBe("Each row shows the average of all samples for one station, per year, over the whole depth range.");
  });
});

describe("how rows are matched, as the SQL does it", () => {
  it("names the row's keys", () => {
    expect(ruleLines(BASE)[0]).toBe("One row for each station (line and station number) × year that any column has a sample for.");
    expect(ruleLines({ ...BASE, time: "sample", depthBy: "10" })[0]).toBe("One row for each station (line and station number) × sampling date and cruise × 10 m depth step that any column has a sample for.");
    expect(ruleLines({ ...BASE, place: "all", time: "all" })[0]).toBe("One row: every sample that passes the filters, together.");
  });
  it("by year: a net and a cast need not be from the same cruise", () => {
    expect(rule()).toMatch(/same year, not necessarily on the same cruise or day/);
  });
  it("by sample date: same cruise, station and UTC date, and what that splits", () => {
    expect(rule({ time: "sample" })).toMatch(/same cruise, station and calendar date\. The date is in UTC/);
    expect(rule({ time: "sample" })).toMatch(/fall on two rows/);
  });
  it("stations: a species is placed at its grid cell, water at its real station", () => {
    expect(rule()).toMatch(/species sample is placed at its grid cell's line and station, a water sample at the station it was taken at/);
    expect(rule({ lens: "hex", place: "hex" })).not.toMatch(/grid cell/);
  });
  it("regions together: an overlap counts twice", () => {
    expect(rule({ lens: "region", place: "all" })).toMatch(/counts twice/);
    expect(rule({ lens: "region", place: "region" })).toMatch(/every region of the layer it falls inside\./);
  });
  it("depth: pooled over the range the reader set, or per 10 m with the tow on the 0 m row", () => {
    expect(rule({ depth: [0, 100] })).toMatch(/pooled over the 10 m depth steps that start between 0 and 100 m \(so down to 110 m\); every value of every cast counts once/);
    expect(rule({ depthBy: "10" })).toMatch(/A net tow is one value for the whole depth it fished and sits on the depth_m = 0 row/);
  });
  it("the statistic is over values, not over nets or casts", () => {
    expect(rule({ stat: "median" })).toMatch(/A cell is the median of that column's values in the row; values are not averaged per net or per cast first/);
  });
  it("a blank is not a zero", () => {
    expect(rule()).toMatch(/A blank cell means that column has no sample in the row\. A 0 means a net was sorted/);
    expect(rule({ zeros: false })).toMatch(/nets with no catch are left out/);
  });
});

describe("the notes saved beside a download", () => {
  it("each column: its keys, then each pick with its stage, units and dataset", () => {
    expect(aboutColumns(BASE)).toEqual([
      { col: "year", what: "the cruise's year" }, { col: "line", what: "CalCOFI line" }, { col: "station", what: "CalCOFI station number on the line" },
      { col: "pacific_sardine_larva_per_10m2_ichthyoplankton", what: "Pacific Sardine, larva, per 10 m² of sea surface; dataset swfsc_ichthyo (Ichthyoplankton)" },
      { col: "sea_temperature_bottle", what: "Sea temperature, degC; dataset calcofi_bottle (Bottle)" },
    ]);
  });
  it("a pick resolved to its own unit and no life stage says so", () => {
    const bird: Spec = { ...BASE, picks: [{ realm: "bio", taxon: "worms:1", label: "Sooty Shearwater", dataset: "farallon_bird-mammal", tag: "Bird & mammal", den: "value", stages: null, units: "individuals" }] };
    expect(aboutColumns(bird).at(-1)).toEqual({ col: "sooty_shearwater_count_bird_mammal", what: "Sooty Shearwater, as counted (individuals); dataset farallon_bird-mammal (Bird & mammal)" });
  });
  it("regions: the layer first, as the table has it; hexagons name their resolution", () => {
    expect(aboutColumns({ ...BASE, lens: "region", place: "region", layer: "Wind" }).slice(0, 3).map((c) => c.col)).toEqual(["layer", "year", "region"]);
    expect(aboutColumns({ ...BASE, lens: "hex", place: "hex" })[1]).toEqual({ col: "hexagon", what: "H3 cell id, resolution 5" });
  });
  it("the text: release, columns, rows kept, the rule, the notes and how to cite", () => {
    const t = aboutText({ version: "v2026.11.14", when: "2026-11-17", url: "https://calcofi.io/explore/builder.html", spec: BASE, kept: ["Years 1949–2026, all seasons"],
      notes: ["Sooty Shearwater is given as counted."], cite: ["CalCOFI (2026). CalCOFI Integrated Database, release v2026.11.14 [Data set]."] });
    expect(t).toMatch(/^CalCOFI Query Builder: about this table\nRelease v2026\.11\.14, made 2026-11-17\nhttps:\/\/calcofi\.io\/explore\/builder\.html\n/);
    for (const h of ["Columns", "Rows kept", "How rows are matched", "Notes on some columns", "How to cite"]) expect(t).toContain(`\n${h}\n`);
    expect(t).toContain("- One row for each station (line and station number) × year");
    expect(t).toContain("  sea_temperature_bottle");
  });
  it("no notes: that section is left out", () => {
    expect(aboutText({ version: "v1", when: "d", url: "u", spec: BASE, kept: [], notes: [], cite: [] })).not.toContain("Notes on some columns");
  });
});
