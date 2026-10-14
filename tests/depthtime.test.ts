// the depth × time anomaly card (explore#28): x the cruise season, y the 10 m depth bin, the colour the mean departure
// from the 1993–2013 normal on the map lenses' diverging ramp. One small fixture per rule:
//   · sql/anom_depth_time.sql reads #22's slice_anom (no baseline of its own), pools each cell's departures, keeps a cell
//     with no baseline as a blank (anom NULL, never 0) and answers to every filter in force — years, season, depth band,
//     datasets, Area — and to the month / season baseline
//   · depthtime.ts: the grid (a missing season is a blank column, a filtered-out quarter is no column), the colour window
//     symmetric about 0 on the balance ramp, the hover, and why the card is empty
//   · the card is in the URL (`show=depthtime`, `base=season`) and round-trips; a link from before it never opens it
//   · Share › Copy code hands over its two statements against the release's climatology objects
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, datasetFilterSql, type Params } from "../src/sqltpl";
import { anomTokens } from "../src/anomaly";
import { areaSql, parseArea } from "../src/area";
import { RAMPS, rampPlotly } from "../src/ramps";
import { binLabel, dtEmpty, dtGrid, dtHover, dtRange, dtTrace, seasonLabel, seasonX, wrapText, type DtRow } from "../src/depthtime";
import { DEFAULTS, fromUrl, toUrl, type Sel } from "../src/state";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
// the lens parameters App.tsx builds for an env variable: every year, every season, the default 0–500 m band, everywhere
const P = (over: Params = {}): Params => ({ val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", bin: "year",
  d0: 0, d1: 500, stage: null, dataset_filter: datasetFilterSql(null), zeros: true, area_filter: "TRUE", ...over });
const cells = (over: Params = {}) => db.exec(render("anom_depth_time", P(over))).map((r) => [r.year, r.quarter, r.depth_bin, r.anom, r.n, r.n_obs]);
const STD = areaSql(parseArea("std"), { gridKeys: new Map([["standard", ["st60-ln93.3"]], ["extended", ["st26.7-ln93.3"]]]), spatialSrc: "sp" })!;

beforeAll(async () => {
  db = await openDuck();
  // two cruises: 2020-07 (Q3) and 2021-01 (Q1). Station 60 is on the standard grid, 26.7 is not (here). CTD at 10 m has two
  // casts' worth (14, 16), bottle one (15); 20 m has a value with no normal; 600 m is under the default band's floor.
  db.exec(`CREATE TABLE obs_env AS SELECT obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime,
      year(datetime)::SMALLINT AS year, quarter(datetime)::TINYINT AS quarter, depth_bin::DOUBLE AS depth_min_m, depth_bin::DOUBLE AS depth_max_m, depth_bin,
      NULL::VARCHAR AS taxon_key, NULL::VARCHAR AS life_stage, 'temp_x' AS measurement_type, 'degC' AS units, value, NULL::VARCHAR AS measurement_qual, TRUE AS qual_ok,
      NULL::VARCHAR AS tow_type, NULL::DOUBLE AS std_haul_factor, NULL::DOUBLE AS prop_sorted, NULL::DOUBLE AS volume_sampled_m3,
      NULL::DOUBLE AS density_per_10m2, NULL::DOUBLE AS density_per_1000m3, NULL::VARCHAR AS effort_class, 600000000000000000::UBIGINT AS hex7
    FROM (VALUES
      (1::BIGINT, 'calcofi_ctd-cast', 1, 'st60-ln93.3',   '093.3 060.0', '2020-07-2020', 34.0::DOUBLE, -122.0::DOUBLE, TIMESTAMP '2020-07-10 08:00:00', 10, 14.0::DOUBLE),
      (2::BIGINT, 'calcofi_ctd-cast', 2, 'st60-ln93.3',   '093.3 060.0', '2020-07-2020', 34.0, -122.0, TIMESTAMP '2020-07-10 09:00:00', 10, 16.0),
      (3::BIGINT, 'calcofi_bottle',   3, 'st60-ln93.3',   '093.3 060.0', '2020-07-2020', 34.0, -122.0, TIMESTAMP '2020-07-10 09:00:00', 10, 15.0),
      (4::BIGINT, 'calcofi_ctd-cast', 1, 'st60-ln93.3',   '093.3 060.0', '2020-07-2020', 34.0, -122.0, TIMESTAMP '2020-07-10 08:00:00', 20, 11.0),
      (5::BIGINT, 'calcofi_ctd-cast', 4, 'st26.7-ln93.3', '093.3 026.7', '2020-07-2020', 35.1, -120.9, TIMESTAMP '2020-06-30 22:00:00', 10, 20.0),
      (6::BIGINT, 'calcofi_ctd-cast', 5, 'st60-ln93.3',   '093.3 060.0', '2021-01-2021', 34.0, -122.0, TIMESTAMP '2021-01-20 08:00:00', 10, 13.0),
      (7::BIGINT, 'calcofi_ctd-cast', 5, 'st60-ln93.3',   '093.3 060.0', '2021-01-2021', 34.0, -122.0, TIMESTAMP '2021-01-20 08:00:00', 600, 5.0)
    ) t(obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, depth_bin, value)`);
  db.exec(render("slice_env", { src: "obs_env" }));
  // the normals (calcofi4db 4.24.0 columns): July 12 at 60 / 10 m for both datasets, 15 at 26.7; January 14 at 60; Q3 13 at 60
  db.exec(`CREATE TABLE clim AS SELECT dataset_key, site_key, grid_key, month::TINYINT AS month, depth_bin, clim_mean, 0.5 AS clim_sd, clim_n, 8 AS n_cruises,
      1993::SMALLINT AS clim_yr_min, 2013::SMALLINT AS clim_yr_max, season_mean, 0.1 AS season_sd, season_n, 15 AS season_n_cruises, 'temp_x' AS measurement_type
    FROM (VALUES
      ('calcofi_ctd-cast', '093.3 060.0', 'st60-ln93.3',   7, 10, 12.0::DOUBLE, 40, 13.0::DOUBLE, 90),
      ('calcofi_bottle',   '093.3 060.0', 'st60-ln93.3',   7, 10, 12.0,         40, 13.0,         90),
      ('calcofi_ctd-cast', '093.3 026.7', 'st26.7-ln93.3', 7, 10, 15.0,         40, NULL,         NULL),
      ('calcofi_ctd-cast', '093.3 060.0', 'st60-ln93.3',   1, 10, 14.0,         40, 14.0,         90)
    ) t(dataset_key, site_key, grid_key, month, depth_bin, clim_mean, clim_n, season_mean, season_n)`);
  db.exec(render("anom_slice", anomTokens("clim", "month", "bin")));
});
afterAll(() => db.close());

describe("sql/anom_depth_time.sql — season × 10 m bin over #22's slice_anom", () => {
  it("each cell pools its observations' own departures; a cell with no baseline is blank (NULL, n 0), never 0", () => {
    // 2020 Q3 10 m: ctd 14−12, 16−12, bottle 15−12, 26.7's 20−15 → (2 + 4 + 3 + 5) / 4 = 3.5; 20 m has no normal
    expect(cells()).toEqual([[2020, 3, 10, 3.5, 4, 4], [2020, 3, 20, null, 0, 1], [2021, 1, 10, -1, 1, 1]]);
    expect(db.exec(render("anom_depth_time", P()))[0].cruises).toBe("2020-07-2020");
  });
  it("the Area filter (#31): the standard grid leaves station 26.7 out", () => {
    expect(render("anom_depth_time", P({ area_filter: STD }))).toContain("grid_key IN ('st60-ln93.3')");
    expect(cells({ area_filter: STD })).toEqual([[2020, 3, 10, 3, 3, 3], [2020, 3, 20, null, 0, 1], [2021, 1, 10, -1, 1, 1]]);
  });
  it("the dataset pills: CTD only", () => {
    expect(cells({ area_filter: STD, dataset_filter: datasetFilterSql(["calcofi_ctd-cast"]) })[0]).toEqual([2020, 3, 10, 3, 2, 2]);
  });
  it("the season filter, the month-resolved years and the depth band", () => {
    expect(cells({ quarter_filter: "quarter IN (1)" })).toEqual([[2021, 1, 10, -1, 1, 1]]);
    expect(cells({ ym0: 202101, ym1: 202112 })).toEqual([[2021, 1, 10, -1, 1, 1]]);
    expect(cells({ d0: 20, d1: 500 })).toEqual([[2020, 3, 20, null, 0, 1]]);
    expect(cells({ d0: 0, d1: 1000 }).map((r) => r[2])).toContain(600);   // 600 m has no normal: in the grid, blank
  });
  it("the seasonal baseline (base=season) subtracts season_mean: 60's Q3 normal is 13, and 26.7 has none", () => {
    db.exec(render("anom_slice", anomTokens("clim", "season", "bin")));
    // (14 − 13) + (16 − 13) + (15 − 13) over 3 → 2; 26.7's 20 has no Q3 normal, so it is counted in n_obs only
    expect(cells()[0]).toEqual([2020, 3, 10, 2, 3, 4]);
    db.exec(render("anom_slice", anomTokens("clim", "month", "bin")));
  });
  it("it reads slice_anom and derives no baseline of its own", () => {
    const sql = render("anom_depth_time", P());
    expect(sql).toContain("FROM slice_anom"); expect(sql).not.toMatch(/clim_mean|season_mean|climatology/);
    expect(sql).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("depthtime.ts — the grid, the window, the hover, the empty card", () => {
  const row = (year: number, quarter: number, depth_bin: number, anom: number | null, n = 1): DtRow => ({ year, quarter, depth_bin, anom, n, n_obs: Math.max(n, 1), cruises: `${year}-0${quarter * 3 - 2}-X` });
  it("a season with no row is a blank column; a bin with no row is a blank row; a bin is drawn at its centre", () => {
    const g = dtGrid([row(2020, 3, 10, 1), row(2021, 1, 30, -2), row(2020, 3, 20, null)]);
    expect(g.seasons).toEqual([[2020, 3], [2020, 4], [2021, 1]]);
    expect(g.x).toEqual([seasonX(2020, 3), seasonX(2020, 4), seasonX(2021, 1)]);
    expect(g.x[0]).toBe(2020.625);
    expect(g.bins).toEqual([10, 20, 30]); expect(g.y).toEqual([15, 25, 35]);
    expect(g.z).toEqual([[1, null, null], [null, null, null], [null, null, -2]]);   // the no-baseline cell is null, not 0
    expect(g.cell[1][0]?.anom).toBeNull();
  });
  it("a season filter draws only the kept quarters (q=3: one column a year, no blank Q4/Q1/Q2 between)", () => {
    const g = dtGrid([row(2019, 3, 0, 1), row(2021, 3, 0, 2)], [3]);
    expect(g.seasons).toEqual([[2019, 3], [2020, 3], [2021, 3]]);
    expect(dtGrid([], null).x).toEqual([]);
  });
  it("the window is symmetric about 0 from the larger 5–95 % end, never zero-width", () => {
    const [lo, hi] = dtRange([-0.5, 0.1, 0.2, 2, null]);
    expect(lo).toBe(-hi); expect(hi).toBeGreaterThan(0.5); expect(hi).toBeLessThanOrEqual(2);
    expect(dtRange([1, 1, 1])).toEqual([-1, 1]);
    expect(dtRange([0, 0])[1]).toBeGreaterThan(0);
    expect(dtRange([])).toEqual([-1, 1]);
  });
  it("the trace: the balance ramp (#22's anomaly ramp) with 0 at its neutral midpoint, no smoothing", () => {
    const t = dtTrace(dtGrid([row(2020, 3, 10, 1), row(2020, 4, 10, -3)]), "degC", "month", null);
    expect(t.colorscale).toEqual(rampPlotly("balance"));
    expect(t.zmin).toBe(-t.zmax!); expect(t.zmid).toBe(0); expect(t.zsmooth).toBe(false);
    expect(t.colorscale[5]).toEqual([0.5, "rgb(241,236,235)"]);   // balance's middle stop, #F1ECEB: the normal itself
    expect(RAMPS.balance.kind).toBe("diverging");
    expect(t.colorbar.title.text).toBe("Δ degC");
    expect(dtTrace(dtGrid([row(2020, 3, 10, 1)]), "degC", "month", "curl").colorscale).toEqual(rampPlotly("curl")); // a `ramp=` link wins, as on the map
  });
  it("the hover names the season, the bin, the anomaly with its unit, n — or why the cell is blank", () => {
    expect(seasonLabel(2015, 3)).toBe("2015 Q3 (Jul–Sep)"); expect(binLabel(50)).toBe("50–60 m");
    const h = dtHover({ year: 2015, quarter: 3, depth_bin: 50, anom: 0.42, n: 12, n_obs: 15, cruises: "2015-07-RL" }, [2015, 3], 50, "degC", "month");
    expect(h).toContain("2015 Q3 (Jul–Sep) · 50–60 m"); expect(h).toContain("+0.42 degC"); expect(h).toContain("n 12 observations (of 15");
    expect(h).toContain("cruise 2015-07-RL");
    expect(dtHover({ year: 2015, quarter: 3, depth_bin: 50, anom: -1, n: 1, n_obs: 1, cruises: null }, [2015, 3], 50, "degC", "month")).toContain("−1 degC");
    expect(dtHover({ year: 2015, quarter: 3, depth_bin: 50, anom: null, n: 0, n_obs: 3, cruises: null }, [2015, 3], 50, "degC", "season")).toContain("no seasonal normal for its 3 observations");
    expect(dtHover(null, [2015, 4], 50, "degC", "month")).toContain("no observations");
  });
  it("why the card is empty: an organism, a per-cast variable, no baseline, the filters", () => {
    expect(dtEmpty({ realm: "bio", cast: false, anomAvail: false, rows: null })).toMatch(/Environment variable.*climatology/);
    expect(dtEmpty({ realm: "env", cast: true, anomAvail: true, rows: null })).toMatch(/per-cast/);
    expect(dtEmpty({ realm: "env", cast: false, anomAvail: false, anomWhyNot: "no table", rows: null })).toBe("no table");
    expect(dtEmpty({ realm: "env", cast: false, anomAvail: true, rows: null })).toBeNull();            // loading
    expect(dtEmpty({ realm: "env", cast: false, anomAvail: true, rows: [], filters: ["Q1"] })).toMatch(/under these filters: Q1/);
    expect(dtEmpty({ realm: "env", cast: false, anomAvail: true, rows: [row(2020, 3, 10, null)] })).toMatch(/had a 1993–2013 normal/);
    expect(dtEmpty({ realm: "env", cast: false, anomAvail: true, rows: [row(2020, 3, 10, 1)] })).toBeNull();
    expect(wrapText("aa bb cc", 5)).toBe("aa bb<br>cc");
  });
});

describe("the card in the URL — `show=depthtime`, its baseline, round-trip", () => {
  let href = "/explore/";
  const open = (qs: string) => { href = `/explore/?${qs}`; vi.stubGlobal("location", { pathname: "/explore/", get search() { return href.split("?")[1] ? `?${href.split("?")[1]}` : ""; } }); };
  beforeAll(() => vi.stubGlobal("history", { replaceState: (_: unknown, __: string, u: string) => { href = u; } }));
  afterAll(() => vi.unstubAllGlobals());
  const round = (qs: string): { sel: Sel; url: string } => { open(qs); const sel = fromUrl(); toUrl(sel); return { sel, url: href }; };
  it("folded by default: a link from before the card never opens it", () => {
    open("lens=station&var=temperature");
    expect(fromUrl().hide).toEqual(["depth", "depthtime"]);
    open("lens=station&var=temperature&hide=years");
    expect(fromUrl().hide).toContain("depthtime");
    expect(DEFAULTS.hide).toContain("depthtime");
  });
  it("show=depthtime opens it, with the Area and the seasonal baseline, and the link writes back as it came", () => {
    const { sel, url } = round("lens=station&var=nitrate&area=std&show=depthtime&base=season");
    expect(sel.hide).toEqual(["depth"]); expect(sel.base).toBe("season"); expect(sel.area).toBe("std");
    expect(url).toContain("show=depthtime"); expect(url).toContain("base=season"); expect(url).toContain("area=std");
    expect(round(url.split("?")[1]).url).toBe(url);
  });
  it("the card carries the baseline without anom=1 (any lens); a closed card on a non-anomaly lens drops it", () => {
    expect(round("lens=station&var=temperature&show=depthtime&base=season").url).not.toContain("anom=1");
    expect(round("lens=station&var=temperature&base=season").url).not.toContain("base=");
  });
  it("opened together with the Depth panel and a band, both stay open", () => {
    const { sel, url } = round("lens=hex&var=temperature&depth=0-200&show=depth,depthtime");
    expect(sel.hide).toEqual([]); expect(round(url.split("?")[1]).sel.hide).toEqual([]);
  });
});
