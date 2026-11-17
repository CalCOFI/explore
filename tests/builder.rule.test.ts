// what the Query Builder SAYS about its table (src/builder/query.ts): the sentence under the controls, "How rows are matched"
// (ruleLines) and the notes saved beside a download (aboutText). A combined table needs an explicit matching rule; these
// pin the words to the spec that produces them, so the SQL and its description are changed together.
import { describe, expect, it } from "vitest";
import { aboutColumns, aboutText, matchLine, ruleLines, sentence, MATCH_COLS, NET_COLS, NOT_PAIRED, type Item, type Spec } from "../src/builder/query";

const BASE: Spec = {
  picks: [{ realm: "bio", taxon: "worms:217452", label: "Pacific Sardine", dataset: "swfsc_ichthyo", tag: "Ichthyoplankton", units: "count" },
    { realm: "env", key: "temperature", label: "Sea temperature", members: ["temperature"], units: "degC", dataset: "calcofi_bottle", tag: "Bottle" }],
  lens: "station", place: "station", hexRes: 5, layer: null, regionNames: null, area: "TRUE",
  years: [1949, 2026], seasons: null, depth: [0, 500], time: "year", depthBy: "avg", stat: "avg",
  stages: ["larva"], den: "density_per_10m2", zeros: true, qualOnly: true, datasets: null,
};
const rule = (over: Partial<Spec> = {}) => ruleLines({ ...BASE, ...over }).join("\n");
const WATER = BASE.picks[1], CTD: Item = { realm: "env", key: "temperature", label: "Sea temperature", members: ["temperature_ave"], units: "degC", dataset: "calcofi_ctd-cast", tag: "CTD cast" };
// Stations › Every sample with a species picked: the per-net table (query.ts netRows), at the page's defaults
const NETS: Spec = { ...BASE, time: "sample", depthBy: "10", depth: [0, 10] };

describe("the sentence under the controls", () => {
  it("every sample of water alone: says what a row is, and not that nothing is combined (two casts of a date are averaged)", () => {
    const s = sentence({ lens: "station", place: "station", time: "sample", depthBy: "10", stat: "avg", picks: [WATER] }, true);
    expect(s).toBe("Each row is one station on one sampling date at one 10 m depth step. Where several values share it, the row shows their average.");
    expect(s).not.toMatch(/Nothing is combined/);
  });
  it("every sample with a species and water: one net per row, and the windows, the preference and the depth in force", () => {
    expect(sentence(NETS, true)).toBe("Each row is one net. Beside it, each water dataset gives the average of one cast from 0 to 10 m: the nearest in time within ± 12 hours and 5 km of the net.");
    expect(sentence({ ...NETS, depth: [0, 50], stat: "max", match: { hours: 1, km: 2.5, prefer: "distance" } }, true))
      .toBe("Each row is one net. Beside it, each water dataset gives the highest value of one cast from 0 to 50 m: the nearest in distance within ± 1 hour and 2.5 km of the net.");
  });
  it("every sample with a species alone: one net per row, nothing matched", () => {
    expect(sentence({ ...NETS, picks: [BASE.picks[0]] }, true)).toBe("Each row is one net, with what it caught. Pick a water measurement and each net is given the nearest cast.");
  });
  it("yearly averages per station", () => {
    expect(sentence(BASE, false)).toBe("Each row shows the average of all samples for one station, per year, over the whole depth range.");
  });
});

describe("how rows are matched, as the SQL does it", () => {
  it("names the row's keys", () => {
    expect(ruleLines(BASE)[0]).toBe("One row for each station (line and station number) × year that any column has a sample for.");
    expect(ruleLines({ ...BASE, picks: [WATER], time: "sample", depthBy: "10" })[0]).toBe("One row for each station (line and station number) × sampling date and cruise × 10 m depth step that any column has a sample for.");
    expect(ruleLines({ ...BASE, place: "all", time: "all" })[0]).toBe("One row: every sample that passes the filters, together.");
  });
  it("by year: a net and a cast need not be from the same cruise", () => {
    expect(rule()).toMatch(/same year, not necessarily on the same cruise or day/);
  });
  it("by sample date with no species (the rows are casts): same cruise, place and UTC date, and what that splits", () => {
    expect(rule({ picks: [WATER], time: "sample" })).toMatch(/same cruise, place and calendar date\. The date is in UTC/);
    expect(rule({ picks: [WATER], time: "sample" })).toMatch(/fall on two rows/);
  });
  it("every shape but the per-net table says it does not pair nets with casts", () => {
    expect(NOT_PAIRED).toBe("Nets are not paired with casts in this shape: for that, choose Stations and Every sample.");
    for (const time of ["month", "season", "year", "decade", "all"] as const) expect(rule({ time })).toContain(NOT_PAIRED);
    expect(rule({ lens: "hex", place: "hex", time: "sample" })).toContain(NOT_PAIRED);        // every sample, but by hexagon
    expect(rule({ lens: "region", place: "region", time: "sample" })).toContain(NOT_PAIRED);
    expect(rule({ place: "line", time: "sample" })).toContain(NOT_PAIRED);                     // Custom: per line
    expect(rule({ picks: [WATER], time: "sample" })).toContain(NOT_PAIRED);                    // no species: nothing to pair
    expect(rule({ time: "sample" })).not.toContain(NOT_PAIRED);                                // the per-net table pairs
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
    expect(rule({ depth: [0, 100] })).toMatch(/pooled over the 10 m depth steps from 0 to 100 m; every value of every cast counts once/);
    expect(rule({ depth: [0, 10] })).toMatch(/pooled over the 10 m depth step from 0 to 10 m;/);          // one step, and no longer "so down to 20 m"
    expect(rule({ depth: [0, 100] })).not.toMatch(/so down to/);
    expect(rule({ picks: [WATER], time: "sample", depthBy: "10", depth: [0, 50] })).toMatch(/per 10 m depth step, for the 10 m depth steps from 0 to 50 m \(depth_m is the top of the step\)/);
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

describe("how a net is matched to a cast: the per-net table's rule, from the parameters the SQL is made from", () => {
  const L = ruleLines(NETS);
  it("at the defaults, line by line", () => {
    expect(L).toEqual([
      "One row for each net (the sample the species were counted in) that passes the filters, whether or not a cast is found for it. Two nets of one station visit are two rows. A species column is the net's own value.",
      "The water dataset (Bottle) is matched to each net: of its casts taken within ± 12 hours and 5 km of the net, the row takes ONE, the nearest in time (the nearest in distance breaks a tie).",
      "Hours and kilometres are measured between the samples themselves: their recorded times (UTC) and positions (great-circle distance). Station numbers, calendar dates and cruise names play no part, so a net and a cast either side of midnight, or filed under different station numbers, still pair.",
      "A water value is the average of that one cast's values in the 10 m depth step from 0 to 10 m; it is never taken over several casts. Only casts with a value of the picked measurements in that range are candidates.",
      "Beside the water dataset's values the row says which cast and how far: cast_id, cast_time, cast_station, cast_hours, cast_km, cast_depth_min_m, cast_depth_max_m, cast_n_depths. cast_hours is cast time minus net time, so a negative number means the cast was taken first.",
      "A net with no cast inside both windows keeps its row, with the water columns blank; so does a measurement the matched cast lacks in the depth range. Two nets may be given the same cast.",
      "The years, season and stations choose the nets; the depth range is the water's and does not filter the nets.",
      "A 0 in a species column means the net was sorted for that life stage and held none of the species (filled in only for datasets that record catches alone); it is never a missing value.",
    ]);
  });
  it("the windows, the preference, the depth range and the statistic are the spec's", () => {
    const r = ruleLines({ ...NETS, depth: [0, 50], stat: "median", match: { hours: 3, km: 2, prefer: "distance" } }).join("\n");
    expect(r).toMatch(/within ± 3 hours and 2 km of the net, the row takes ONE, the nearest in distance \(the nearest in time breaks a tie\)/);
    expect(r).toMatch(/A water value is the median of that one cast's values in the 10 m depth steps from 0 to 50 m/);
    expect(r).toMatch(/A species column is the net's own value \(the median, where one column holds several values of a net\)/);
  });
  it("two water datasets: each is matched on its own", () => {
    const r = ruleLines({ ...NETS, picks: [...NETS.picks, CTD] }).join("\n");
    expect(r).toMatch(/Each water dataset \(Bottle, CTD cast\) is matched to each net on its own/);
    expect(r).toMatch(/keeps its row, with that dataset's columns blank/);
  });
  it("no water picked: one row per net, and it says nothing is matched", () => {
    const r = ruleLines({ ...NETS, picks: [NETS.picks[0]], depth: [0, 500] });
    expect(r[0]).toBe("One row for each net (the sample the species were counted in) that passes the filters. Two nets of one station visit are two rows.");
    expect(r.join("\n")).toMatch(/No water measurement is picked, so nothing is matched to the nets/);
    expect(r.join("\n")).toMatch(/A net is kept when the depth it fished reaches into the range from 0 to 500 m/);
  });
  it("catches only says which nets are left out", () => {
    expect(ruleLines({ ...NETS, zeros: false }).at(-1)).toBe("Nets with no catch of any picked species are left out.");
  });
  it("the line for the page and for Rows kept; none where nothing is matched", () => {
    expect(matchLine(NETS)).toBe("Each net is given one cast per water dataset: the nearest in time within ± 12 hours and 5 km of the net; water values from 0 to 10 m");
    expect(matchLine({ ...NETS, picks: [NETS.picks[0]] })).toBeNull();
    expect(matchLine(BASE)).toBeNull();
  });
});

describe("the notes saved beside a download", () => {
  it("the per-net table: the net's own columns, each pick, and one set of match columns after each water dataset", () => {
    const c = aboutColumns({ ...NETS, picks: [...NETS.picks, CTD] });
    expect(c.map((x) => x.col)).toEqual([...NET_COLS.map((x) => x.col), "pacific_sardine_larva_per_10m2_ichthyoplankton",
      "sea_temperature_bottle", ...MATCH_COLS.map((x) => `${x.stem}_bottle`), "sea_temperature_ctd_cast", ...MATCH_COLS.map((x) => `${x.stem}_ctd_cast`)]);
    expect(c.find((x) => x.col === "sea_temperature_bottle")!.what).toBe("Sea temperature, degC; dataset calcofi_bottle (Bottle); of the one cast matched to the net (cast_id_bottle)");
    expect(c.find((x) => x.col === "cast_hours_ctd_cast")!.what).toBe("cast time minus net time, hours (negative = the cast was taken before the net); CTD cast");
    expect(c.find((x) => x.col === "net_time")!.what).toBe("the net's time, UTC");
  });
  it("the per-net table's text carries the rule with its windows", () => {
    const t = aboutText({ version: "v2026.11.14", when: "2026-11-17", url: "u", spec: NETS, kept: [matchLine(NETS)!], notes: [], cite: [] });
    expect(t).toContain("  Each net is given one cast per water dataset: the nearest in time within ± 12 hours and 5 km of the net; water values from 0 to 10 m");
    expect(t).toContain("- The water dataset (Bottle) is matched to each net: of its casts taken within ± 12 hours and 5 km of the net");
    expect(t).toContain("  cast_km_bottle");
  });
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
