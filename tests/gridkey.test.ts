// the station grid redrawn in v2026.10.04 (one Voronoi cell per official station, SCCOOS inshore stations each on a
// "line" of its own, decimals in grid_key, a grid_crosswalk from the previous grid). One small fixture per rule.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nearestSectionLine, parseGridKey, resolveStation, sectionLines, REDRAWN_FRAC, type CrosswalkRow } from "../src/gridkey";
import { render } from "../src/sqltpl";
import { openDuck, type Duck } from "./helpers/duck";

// a slice of the staging grid: line 90's inshore stations, line 93.3 + SCCOOS 93.4, a historical cell, line 88.5's lone cell
const GRID = [
  { grid_key: "st27.7-ln90", line: 90, station: 27.7 }, { grid_key: "st28-ln90", line: 90, station: 28 }, { grid_key: "st30-ln90", line: 90, station: 30 },
  { grid_key: "st26.7-ln93.3", line: 93.3, station: 26.7 }, { grid_key: "st28-ln93.3", line: 93.3, station: 28 },
  { grid_key: "st26.4-ln93.4", line: 93.4, station: 26.4 }, { grid_key: "st30.1-ln88.5", line: 88.5, station: 30.1 },
  { grid_key: "st-20-ln130_hist", line: 130, station: -20 }, { grid_key: "st0-ln130_hist", line: 130, station: 0 },
];
const KEYS = new Set(GRID.map((g) => g.grid_key));

describe("sectionLines — a section needs two stations", () => {
  it("offers every line with two cells or more, ascending", () => expect(sectionLines(GRID)).toEqual([90, 93.3, 130]));
  it("a station on a line of its own (SCCOOS 93.4 26.4, 88.5 30.1) is never a section", () => {
    expect(sectionLines(GRID)).not.toContain(93.4); expect(sectionLines(GRID)).not.toContain(88.5);
  });
  it("an empty grid offers nothing", () => expect(sectionLines([])).toEqual([]));
  it("nearestSectionLine sends a lone line to its neighbour (93.4 → 93.3, 88.5 → 90)", () => {
    expect(nearestSectionLine(93.4, [90, 93.3, 130])).toBe(93.3);
    expect(nearestSectionLine(88.5, [90, 93.3, 130])).toBe(90);
    expect(nearestSectionLine(91.5, [90, 93])).toBe(90); // a tie goes to the lower line
    expect(nearestSectionLine(90, [])).toBeNull();
  });
});

describe("parseGridKey — decimal-, sign- and suffix-safe", () => {
  it("reads decimals in station and line", () => {
    expect(parseGridKey("st26.4-ln93.4")).toEqual({ line: 93.4, station: 26.4 });
    expect(parseGridKey("st30.1-ln88.5")).toEqual({ line: 88.5, station: 30.1 });
  });
  it("reads a negative station and ignores the _hist suffix", () => expect(parseGridKey("st-20-ln130_hist")).toEqual({ line: 130, station: -20 }));
  it("is null for anything that is not a grid key", () => { expect(parseGridKey("90.0 30.0")).toBeNull(); expect(parseGridKey("")).toBeNull(); });
  it("agrees with the grid's own line / station columns for every fixture cell", () => {
    for (const g of GRID) expect(parseGridKey(g.grid_key), g.grid_key).toEqual({ line: g.line, station: g.station });
  });
});

describe("resolveStation — a saved ?station= link never silently names a different area", () => {
  // rows as the staging grid_crosswalk carries them (v2026.10.01 → v2026.10.04)
  const XW: CrosswalkRow[] = [
    { prev_grid_key: "st30-ln90", grid_key: "st30-ln90", prev_frac: 0.5196 },
    { prev_grid_key: "st30-ln90", grid_key: "st30.1-ln88.5", prev_frac: 0.2009 },
    { prev_grid_key: "st28-ln90", grid_key: "st28-ln90", prev_frac: 0.998 },
    { prev_grid_key: "st30-ln88.5_old", grid_key: "st28-ln90", prev_frac: 0.3 },
    { prev_grid_key: "st30-ln88.5_old", grid_key: "st30.1-ln88.5", prev_frac: 0.6 },
    { prev_grid_key: "st30-ln88.5_old", grid_key: "st99-ln99_gone", prev_frac: 0.9 }, // not in this grid: never a target
  ];
  it("a key of this grid that kept its cell is used as is, with no note", () => {
    expect(resolveStation("st28-ln90", KEYS, XW)).toEqual({ kind: "same", key: "st28-ln90", note: null });
    expect(resolveStation("st27.7-ln90", KEYS, XW).kind).toBe("same"); // a new key: no crosswalk row at all
    expect(resolveStation("st28-ln90", KEYS, null).kind).toBe("same");  // a release with no crosswalk
  });
  it(`a kept key whose cell was redrawn below ${REDRAWN_FRAC} of the old one stays, and says how much it holds`, () => {
    const r = resolveStation("st30-ln90", KEYS, XW, "v2026.10.04");
    expect(r.kind).toBe("redrawn"); expect(r.key).toBe("st30-ln90");
    expect(r.note).toBe("st30-ln90 was redrawn in v2026.10.04's grid: it holds 52 % of the cell a link from an earlier release named");
  });
  it("a key gone from this grid goes to the new cell holding the largest share of it that IS in this grid", () => {
    const r = resolveStation("st30-ln88.5_old", KEYS, XW, "v2026.10.04");
    expect(r).toMatchObject({ kind: "moved", key: "st30.1-ln88.5", from: "st30-ln88.5_old", frac: 0.6 });
    expect(r.note).toBe("st30-ln88.5_old is not a cell of v2026.10.04's grid — showing st30.1-ln88.5, which holds 60 % of its area");
  });
  it("a key neither grid nor crosswalk knows stays selected and says so (the card opens empty, never elsewhere)", () => {
    expect(resolveStation("st1-ln1", KEYS, XW, "v2026.10.04")).toEqual({ kind: "missing", key: "st1-ln1", note: "st1-ln1 is not a cell of v2026.10.04's grid (nor of its crosswalk from the previous grid)" });
    expect(resolveStation("st1-ln1", KEYS, null).note).toBe("st1-ln1 is not a cell of this release's grid");
  });
});

// the bio slice reads line / station out of grid_key (obs_bio carries no line / station column; `grid` does, and the
// regex agrees with it for all 225 staging cells): decimals, a negative station and the _hist suffix
describe("slice_bio.sql — line / station from a redrawn grid_key", () => {
  let db: Duck;
  beforeAll(async () => {
    db = await openDuck();
    db.exec(`CREATE TABLE bio AS SELECT obs_id::BIGINT AS obs_id, 'swfsc_ichthyo' AS dataset_key, obs_id::INTEGER AS root_id, grid_key,
      NULL::VARCHAR AS site_key, '2020-01-33RL' AS cruise_key, 32.0 AS latitude, -120.0 AS longitude, TIMESTAMP '2020-01-15' AS datetime,
      2020::SMALLINT AS year, 1::TINYINT AS quarter, 0.0 AS depth_min_m, 210.0 AS depth_max_m, NULL::INTEGER AS depth_bin,
      'worms:1' AS taxon_key, 'larva' AS life_stage, 'larvae_count' AS measurement_type, 'count' AS units, 2.0 AS value,
      NULL::VARCHAR AS measurement_qual, TRUE AS qual_ok, 'CB' AS tow_type, 1.0 AS std_haul_factor, 1.0 AS prop_sorted, 100.0 AS volume_sampled_m3,
      2.0 AS density_per_10m2, NULL::DOUBLE AS density_per_1000m3, 'per_10m2' AS effort_class, NULL::UBIGINT AS hex7
      FROM (VALUES (1, 'st27.7-ln90'), (2, 'st26.4-ln93.4'), (3, 'st-20-ln130_hist'), (4, 'st30-ln90')) t(obs_id, grid_key)`);
    db.exec(render("slice_bio", { src: "bio", taxon: "worms:1" }));
  });
  afterAll(() => db.close());
  it("each row's line / station is the cell's, decimals and all", () => {
    expect(db.exec("SELECT grid_key, line, station FROM slice ORDER BY obs_id")).toEqual([
      { grid_key: "st27.7-ln90", line: 90, station: 27.7 }, { grid_key: "st26.4-ln93.4", line: 93.4, station: 26.4 },
      { grid_key: "st-20-ln130_hist", line: 130, station: -20 }, { grid_key: "st30-ln90", line: 90, station: 30 }]);
  });
  it("section_bio.sql on line 90 holds its two inshore stations and never the SCCOOS 93.4 cell", () => {
    const P = { val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: null, dataset_filter: "TRUE", zeros: true };
    expect(db.exec(render("section_bio", { ...P, line: 90 })).map((r) => r.station)).toEqual([27.7, 30]);
    expect(db.exec(render("section_bio", { ...P, line: 93.4 })).map((r) => r.station)).toEqual([26.4]);
  });
});
