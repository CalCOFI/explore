// the season is the CRUISE's quarter (explore#17), and the anomaly can subtract a monthly or a seasonal normal, in the
// Section lens and — per observation, before pooling — in the map lenses (Rasmus Swalethorp, 2026-10-06 / 10-07).
// One small fixture per rule, run in the engine the browser ships (duckdb-wasm's node build):
//   · a station of a July cruise worked on 30 June is in Q3 and its cruise's year/month, in slice_env and slice_cast
//   · a NULL clim_mean is "no monthly baseline", exactly like an absent row; the seasonal baseline reads season_*
//   · a per-cast value (depth_bin NULL) finds its baseline NULL-safely, by grid_key; one with none drops out, never 0
//   · a release whose climatology has no season_* columns (v2026.10.08) still draws the monthly anomaly
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, datasetFilterSql, hexExpr, type Params } from "../src/sqltpl";
import { qualOkSQL } from "../src/qual";
import { anomTokens, anomalyOf, baselineWord, climBaseSql, climLookup, cruiseQuarter, hasSeasonCols, periodOf } from "../src/anomaly";
import type { SectionCell } from "../src/charts";
import { openDuck, type Duck, type Row } from "./helpers/duck";

let db: Duck;
// lens parameters as App.tsx builds them for an env variable: every year, every season, the default 0–500 m band
const P = (over: Params = {}): Params => ({ val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", bin: "year",
  d0: 0, d1: 500, stage: null, dataset_filter: datasetFilterSql(null), zeros: true, line: 93.3, cruise: "2026-07-3322", ...over });
const q = (name: string, over: Params = {}) => db.exec(render(name, P(over)));
const by = (k: string) => (a: Row, b: Row) => String(a[k]).localeCompare(String(b[k]));

// an obs_env object (the columns slice_env.sql reads). The release's own year / quarter are the CALENDAR's here, as in
// v2026.10.08: the 30 June cast says quarter 2
function obsEnv(rows: string) {
  db.exec(`CREATE OR REPLACE TABLE obs_env AS SELECT obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime,
      year(datetime)::SMALLINT AS year, quarter(datetime)::TINYINT AS quarter, depth_bin::DOUBLE AS depth_min_m, depth_bin::DOUBLE AS depth_max_m, depth_bin,
      NULL::VARCHAR AS taxon_key, NULL::VARCHAR AS life_stage, 'temp_x' AS measurement_type, 'degC' AS units, value, NULL::VARCHAR AS measurement_qual, TRUE AS qual_ok,
      NULL::VARCHAR AS tow_type, NULL::DOUBLE AS std_haul_factor, NULL::DOUBLE AS prop_sorted, NULL::DOUBLE AS volume_sampled_m3,
      NULL::DOUBLE AS density_per_10m2, NULL::DOUBLE AS density_per_1000m3, NULL::VARCHAR AS effort_class, 600000000000000000::UBIGINT AS hex7
    FROM (VALUES ${rows}) t(obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, depth_bin, value)`);
  db.exec(render("slice_env", { src: "obs_env" }));
}
// the climatology object of one type, the next release's columns (calcofi4db 4.24.0); `season = false` drops season_*
function clim(rows: string, season = true) {
  db.exec(`CREATE OR REPLACE TABLE clim AS SELECT dataset_key, site_key, grid_key, month::TINYINT AS month, depth_bin, clim_mean, clim_sd, clim_n, n_cruises,
      1993::SMALLINT AS clim_yr_min, 2013::SMALLINT AS clim_yr_max, ((month - 1) // 3 + 1)::TINYINT AS quarter, season_mean, 0.1 AS season_sd, season_n, season_n_cruises, measurement_type
    FROM (VALUES ${rows}) t(dataset_key, site_key, grid_key, month, depth_bin, clim_mean, clim_sd, clim_n, n_cruises, season_mean, season_n, season_n_cruises, measurement_type)`);
  if (!season) db.exec(`ALTER TABLE clim DROP COLUMN season_mean; ALTER TABLE clim DROP COLUMN season_sd; ALTER TABLE clim DROP COLUMN season_n;
    ALTER TABLE clim DROP COLUMN season_n_cruises; ALTER TABLE clim DROP COLUMN quarter`);
}

beforeAll(async () => { db = await openDuck(); });
afterAll(() => db.close());

describe("the season is the cruise's quarter (explore#17)", () => {
  it("cruiseQuarter(): a July cruise is Q3, whatever day its stations were worked", () => {
    expect(cruiseQuarter("2026-07-3322")).toBe(3);
    expect(cruiseQuarter("2026-06-3322")).toBe(2);
    expect(cruiseQuarter("1950-12-31CR")).toBe(4);
    expect(cruiseQuarter("x")).toBeNull();
  });
  beforeAll(() => obsEnv(`
    (1::BIGINT, 'calcofi_ctd-cast', 1, 'st26.7-ln93.3', '093.3 026.7', '2026-07-3322', 35.1::DOUBLE, -120.9::DOUBLE, TIMESTAMP '2026-06-30 22:00:00', 10, 14.0::DOUBLE),
    (2::BIGINT, 'calcofi_ctd-cast', 2, 'st60-ln93.3',   '093.3 060.0', '2026-07-3322', 34.0, -122.0, TIMESTAMP '2026-07-02 08:00:00', 10, 17.0),
    (3::BIGINT, 'calcofi_ctd-cast', 3, 'st60-ln93.3',   '093.3 060.0', '2026-01-3322', 34.0, -122.0, TIMESTAMP '2025-12-31 20:00:00', 10, 13.0),
    (4::BIGINT, 'calcofi_ctd-cast', 4, 'st60-ln93.3',   '093.3 060.0', 'no-key',       34.0, -122.0, TIMESTAMP '2026-06-30 20:00:00', 10, 15.0)`));
  it("slice_env: the 30 June station of cruise 2026-07-3322 is in Q3, though the release row says Q2", () => {
    const r = db.exec(`SELECT obs_id, year, quarter FROM slice ORDER BY obs_id`);
    expect(r).toEqual([{ obs_id: 1, year: 2026, quarter: 3 }, { obs_id: 2, year: 2026, quarter: 3 },
      { obs_id: 3, year: 2026, quarter: 1 },                // a January cruise's 31 December station: the cruise's year and Q1
      { obs_id: 4, year: 2026, quarter: 2 }]);              // a malformed key keeps the release's (calendar) values
  });
  it("the season filter Q3 keeps the inshore 30 June station (it vanished before)", () => {
    expect(q("station", { quarter_filter: "quarter IN (3)" }).sort(by("grid_key")).map((r) => [r.grid_key, r.n])).toEqual([["st26.7-ln93.3", 1], ["st60-ln93.3", 1]]);
  });
  it("the month-resolved year filter reads the cruise's month too (a January cruise's 31 December station is in its January)", () => {
    expect(q("station", { ym0: 202601, ym1: 202601 }).map((r) => [r.grid_key, r.n, r.mean])).toEqual([["st60-ln93.3", 1, 13]]);
  });
  it("slice_cast: a per-cast value of a 30 June cast on a July cruise is quarter 3, and falls back to the calendar on a bad key", () => {
    db.exec(`CREATE OR REPLACE TABLE root AS SELECT * FROM (VALUES
      (1, 'calcofi_ctd-cast:cast:A', 'calcofi_ctd-cast', 'st26.7-ln93.3', '2026-07-3322', 35.1::DOUBLE, -120.9::DOUBLE, TIMESTAMP '2026-06-30 22:00:00'),
      (2, 'calcofi_ctd-cast:cast:B', 'calcofi_ctd-cast', 'st60-ln93.3',   'bad',          34.0, -122.0, TIMESTAMP '2026-06-30 23:00:00')
    ) t(root_id, root_sample_key, dataset_key, grid_key, cruise_key, latitude, longitude, datetime)`);
    db.exec(`CREATE OR REPLACE TABLE sm AS SELECT * FROM (VALUES
      (1::BIGINT, 'calcofi_ctd-cast:cast:A', 'calcofi_ctd-derived', 'mld_x', 20.0::DOUBLE, NULL::VARCHAR),
      (2::BIGINT, 'calcofi_ctd-cast:cast:B', 'calcofi_ctd-derived', 'mld_x', 30.0, NULL::VARCHAR)
    ) t(sample_measurement_id, sample_key, dataset_key, measurement_type, measurement_value, measurement_qual)`);
    db.exec(`CREATE OR REPLACE TABLE mt AS SELECT 'mld_x' AS measurement_type, 'm' AS units`);
    db.exec(render("slice_cast", { sm_src: "sm", root_src: "root", mt_src: "mt", type: "mld_x", qual_ok: qualOkSQL("sm"), root_hex7: "NULL::UBIGINT" }));
    expect(db.exec(`SELECT obs_id, year, quarter FROM slice ORDER BY obs_id`)).toEqual([{ obs_id: 1, year: 2026, quarter: 3 }, { obs_id: 2, year: 2026, quarter: 2 }]);
  });
});

describe("the baseline: monthly (clim_*) or seasonal (season_*), a NULL mean is no baseline", () => {
  // line 93.3 station 26.7, 10 m: July has its own normal (12); August's month is under the floor (clim_mean NULL) but its
  // quarter passes — Q3's normal is 12.5 on all three months. Station 60: June only, no Q2 season (NULL).
  const rows = `
    ('calcofi_ctd-cast', '093.3 026.7', 'st26.7-ln93.3', 7, 10, 12.0::DOUBLE, 0.5::DOUBLE, 40, 8, 12.5::DOUBLE, 90, 15, 'temp_x'),
    ('calcofi_ctd-cast', '093.3 026.7', 'st26.7-ln93.3', 8, 10, NULL, NULL, NULL, NULL, 12.5, 90, 15, 'temp_x'),
    ('calcofi_ctd-cast', '093.3 026.7', 'st26.7-ln93.3', 9, 10, 13.0, 0.5, 30, 6, 12.5, 90, 15, 'temp_x'),
    ('calcofi_ctd-cast', '093.3 060.0', 'st60-ln93.3', 6, 10, 15.5, 0.5, 20, 5, NULL, NULL, NULL, 'temp_x')`;
  beforeAll(() => clim(rows));
  const sectionClim = (base: "month" | "season") => db.exec(render("section_clim", P({ clim_src: climBaseSql("clim", base) })))
    .map((r) => ({ station: r.station, month: r.month, y: r.depth_bin, v: r.v, n: Number(r.n) }));
  it("monthly: the NULL August mean is left out (not a 0, not a row); July and September keep their own", () => {
    expect(sectionClim("month")).toEqual([
      { station: 26.7, month: 7, y: 10, v: 12, n: 40 }, { station: 26.7, month: 9, y: 10, v: 13, n: 30 }, { station: 60, month: 6, y: 10, v: 15.5, n: 20 }]);
  });
  it("seasonal: season_mean per quarter, its three repeated month rows counted once; a NULL season_mean is left out", () => {
    expect(sectionClim("season")).toEqual([{ station: 26.7, month: 3, y: 10, v: 12.5, n: 90 }]);
  });
  it("anomalyOf(): an August cruise has no monthly normal at 26.7 but has the Jul–Sep one", () => {
    const cell: SectionCell = { station: 26.7, y: 10, v: 14, n: 1, month: 8 };
    const mon = climLookup(sectionClim("month")), sea = climLookup(sectionClim("season"));
    expect(anomalyOf(cell, mon, "month")).toBeNull();
    expect(anomalyOf(cell, sea, "season")).toBe(1.5);
    expect(anomalyOf({ ...cell, month: 7 }, mon)).toBe(2);   // the default is the month
  });
  it("periodOf() / baselineWord(): the words the captions use", () => {
    expect(periodOf(8, "season")).toBe(3); expect(periodOf(8, "month")).toBe(8); expect(periodOf(null, "month")).toBeNull();
    expect(baselineWord("month", 7)).toBe("July"); expect(baselineWord("season", 7)).toBe("Jul–Sep"); expect(baselineWord("season", 12)).toBe("Oct–Dec");
  });
  it("a release before the seasonal baseline (no season_* columns): the probe says so, and the monthly anomaly still draws", () => {
    clim(rows, false);
    expect(hasSeasonCols(db.exec(`SELECT column_name FROM (DESCRIBE SELECT * FROM clim)`).map((r) => r.column_name))).toBe(false);
    expect(sectionClim("month").length).toBe(3);
    clim(rows);
    expect(hasSeasonCols(db.exec(`SELECT column_name FROM (DESCRIBE SELECT * FROM clim)`).map((r) => r.column_name))).toBe(true);
  });
});

describe("anom_slice.sql — the map lenses subtract each observation's own cell before pooling", () => {
  const share = () => db.exec(render("anom_share", P()))[0];
  it("per-bin: each value minus its station × cruise month × bin; no baseline drops out (never 0); the share says so", () => {
    // obs 1 (26.7, 30 June, July cruise) → July 12.0 ⇒ +2; obs 2 (60, July cruise) → no July row at 60 ⇒ NULL
    obsEnv(`
      (1::BIGINT, 'calcofi_ctd-cast', 1, 'st26.7-ln93.3', '093.3 026.7', '2026-07-3322', 35.1::DOUBLE, -120.9::DOUBLE, TIMESTAMP '2026-06-30 22:00:00', 10, 14.0::DOUBLE),
      (2::BIGINT, 'calcofi_ctd-cast', 2, 'st60-ln93.3',   '093.3 060.0', '2026-07-3322', 34.0, -122.0, TIMESTAMP '2026-07-02 08:00:00', 10, 17.0),
      (3::BIGINT, 'calcofi_ctd-cast', 3, 'st26.7-ln93.3', '093.3 026.7', '2026-07-3322', 35.1, -120.9, TIMESTAMP '2026-06-30 22:00:00', 20, 11.0)`);
    clim(`
      ('calcofi_ctd-cast', '093.3 026.7', 'st26.7-ln93.3', 7, 10, 12.0::DOUBLE, 0.5::DOUBLE, 40, 8, 12.5::DOUBLE, 90, 15, 'temp_x'),
      ('calcofi_ctd-cast', '093.3 060.0', 'st60-ln93.3', 6, 10, 15.5, 0.5, 20, 5, 16.0, 60, 12, 'temp_x')`);
    db.exec(render("anom_slice", anomTokens("clim", "month", "bin")));
    expect(db.exec(`SELECT obs_id, anom FROM slice_anom ORDER BY obs_id`)).toEqual([{ obs_id: 1, anom: 2 }, { obs_id: 2, anom: null }, { obs_id: 3, anom: null }]);
    // the station summary over departures: only obs 1 is in it; the other station has none to draw (not a 0)
    expect(q("station", { tbl: "slice_anom", val: "anom" }).map((r) => [r.grid_key, r.n, r.mean])).toEqual([["st26.7-ln93.3", 1, 2]]);
    expect(share()).toEqual({ n: 3, n_base: 1 });
  });
  it("the season toggle chooses season_*: station 60's July cruise finds the Jul–Sep normal it lacks as a month", () => {
    // station 60's season columns sit on its June (Q2) row, so its July cruise still has none; 26.7's Q3 is 12.5
    db.exec(render("anom_slice", anomTokens("clim", "season", "bin")));
    expect(db.exec(`SELECT obs_id, anom FROM slice_anom ORDER BY obs_id`)).toEqual([{ obs_id: 1, anom: 1.5 }, { obs_id: 2, anom: null }, { obs_id: 3, anom: null }]);
    expect(anomTokens("clim", "season", "bin").clim_src).toContain("season_mean");
    expect(anomTokens("clim", "month", "bin").clim_src).not.toContain("season_");
  });
  it("per-cast: the depth_bin NULL baseline is joined NULL-safely, by the cast's grid_key, and Hexagons pool the departures", () => {
    db.exec(`CREATE OR REPLACE TABLE root AS SELECT *, 600000000000000000::UBIGINT AS hex7 FROM (VALUES
      (1, 'calcofi_ctd-cast:cast:A', 'calcofi_ctd-cast', 'st26.7-ln93.3', '2026-07-3322', 35.1::DOUBLE, -120.9::DOUBLE, TIMESTAMP '2026-06-30 22:00:00'),
      (2, 'calcofi_ctd-cast:cast:B', 'calcofi_ctd-cast', 'st26.7-ln93.3', '2025-07-3322', 35.1, -120.9, TIMESTAMP '2025-07-12 10:00:00'),
      (3, 'calcofi_ctd-cast:cast:C', 'calcofi_ctd-cast', 'st60-ln93.3',   '2026-07-3322', 34.0, -122.0, TIMESTAMP '2026-07-02 08:00:00')
    ) t(root_id, root_sample_key, dataset_key, grid_key, cruise_key, latitude, longitude, datetime)`);
    db.exec(`CREATE OR REPLACE TABLE sm AS SELECT * FROM (VALUES
      (1::BIGINT, 'calcofi_ctd-cast:cast:A', 'calcofi_ctd-derived', 'mld_x', 30.0::DOUBLE, NULL::VARCHAR),
      (2::BIGINT, 'calcofi_ctd-cast:cast:B', 'calcofi_ctd-derived', 'mld_x', 20.0, NULL::VARCHAR),
      (3::BIGINT, 'calcofi_ctd-cast:cast:C', 'calcofi_ctd-derived', 'mld_x', 50.0, NULL::VARCHAR)
    ) t(sample_measurement_id, sample_key, dataset_key, measurement_type, measurement_value, measurement_qual)`);
    db.exec(render("slice_cast", { sm_src: "sm", root_src: "root", mt_src: "mt", type: "mld_x", qual_ok: qualOkSQL("sm"), root_hex7: "r.hex7" }));
    // the per-cast cells: depth_bin NULL, July mean 25 at 26.7; a per-BIN row of the same type at 10 m must never match
    clim(`
      ('calcofi_ctd-derived', '093.3 026.7', 'st26.7-ln93.3', 7, NULL::INTEGER, 25.0::DOUBLE, 5.0::DOUBLE, 30, 10, 24.0::DOUBLE, 80, 20, 'mld_x'),
      ('calcofi_ctd-derived', '093.3 026.7', 'st26.7-ln93.3', 7, 10, 99.0, 5.0, 30, 10, 99.0, 80, 20, 'mld_x')`);
    db.exec(render("anom_slice", anomTokens("clim", "month", "cast")));
    expect(db.exec(`SELECT obs_id, depth_bin, anom FROM slice_anom ORDER BY obs_id`)).toEqual([
      { obs_id: 1, depth_bin: null, anom: 5 }, { obs_id: 2, depth_bin: null, anom: -5 }, { obs_id: 3, depth_bin: null, anom: null }]);
    // one hexagon holds all three casts: its mean departure is over the two with a baseline, (5 − 5) / 2 = 0 — not (5 − 5 + 0) / 3
    expect(q("hex", { tbl: "slice_anom", val: "anom", hex: hexExpr(5) }).map((r) => [r.n, r.mean])).toEqual([[2, 0]]);
    expect(share()).toEqual({ n: 3, n_base: 2 });
  });
});
