// the anomaly is matched on the CRUISE's month (the MM of its YYYY-MM-NODC cruise_key), never the calendar month a
// cast was occupied in. Regression: cruise 2026-07-3322 worked line 93.3's inshore stations on 2026-06-30; matched on
// the calendar month they looked up a June baseline (none: no June cruise 1993–2013) and the inshore half of the
// section went blank although the release holds July baselines for them. sql/section.sql runs in the engine the
// browser ships, against a small fixture; src/anomaly.ts is the key both renderers use.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, datasetFilterSql, type Params } from "../src/sqltpl";
import { anomalyOf, climLookup, cruiseMonth } from "../src/anomaly";
import type { SectionCell } from "../src/charts";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // two stations of one cruise designated July: station 30 occupied on June 30, station 60 on July 1
  db.exec(`CREATE TABLE slice AS SELECT * FROM (VALUES
    ('093.3 030.0', 'st30-ln93.3', 93.3::DOUBLE, 30.0::DOUBLE, '2026-07-3322', TIMESTAMP '2026-06-30 22:00:00', 2026::SMALLINT, 2::TINYINT, 10, 14.0::DOUBLE, TRUE),
    ('093.3 030.0', 'st30-ln93.3', 93.3, 30.0, '2026-07-3322', TIMESTAMP '2026-06-30 22:00:00', 2026, 2, 10, 16.0, TRUE),
    ('093.3 060.0', 'st60-ln93.3', 93.3, 60.0, '2026-07-3322', TIMESTAMP '2026-07-01 08:00:00', 2026, 3, 10, 17.0, TRUE)
  ) t(site_key, grid_key, line, station, cruise_key, datetime, year, quarter, depth_bin, value, qual_ok)`);
  db.exec(`ALTER TABLE slice ADD COLUMN dataset_key VARCHAR DEFAULT 'calcofi_ctd-cast'`);
  db.exec(`ALTER TABLE slice ADD COLUMN obs_id BIGINT DEFAULT 1`); db.exec(`ALTER TABLE slice ADD COLUMN life_stage VARCHAR`);
  db.exec(`ALTER TABLE slice ADD COLUMN depth_min_m DOUBLE`); db.exec(`UPDATE slice SET depth_min_m = depth_bin`);
  db.exec(`ALTER TABLE slice ADD COLUMN depth_max_m DOUBLE`); db.exec(`UPDATE slice SET depth_max_m = depth_bin`);
});
afterAll(() => db.close());

const P = (over: Params = {}): Params => ({ val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500,
  stage: null, dataset_filter: datasetFilterSql(null), zeros: true, line: 93.3, cruise: "2026-07-3322", ...over });

describe("cruiseMonth()", () => {
  it("reads MM from a YYYY-MM-NODC key", () => { expect(cruiseMonth("2026-07-3322")).toBe(7); expect(cruiseMonth("1950-09-31CR")).toBe(9); });
  it("a malformed key has no month", () => { expect(cruiseMonth("2026-13-3322")).toBeNull(); expect(cruiseMonth("x")).toBeNull(); expect(cruiseMonth(null)).toBeNull(); });
});

describe("section.sql + anomalyOf() — the cruise's month, never the cast's calendar month", () => {
  let cells: SectionCell[];
  beforeAll(() => {
    cells = db.exec(render("section", P())).map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n, month: r.month }));
  });
  it("a cast dated 2026-06-30 on cruise 2026-07-3322 carries month 7", () => {
    expect(cells.map((c) => [c.station, c.month])).toEqual([[30, 7], [60, 7]]);
  });
  it("is matched to the month-7 baseline and draws (a June-only baseline would not)", () => {
    const clim = climLookup([
      { station: 30, y: 10, v: 12.0, n: 40, month: 7 },
      { station: 30, y: 10, v: 99.0, n: 40, month: 6 },   // a June baseline must never be used for a July cruise
      { station: 60, y: 10, v: 16.5, n: 40, month: 7 },
    ]);
    expect(cells.map((c) => anomalyOf(c, clim))).toEqual([3, 0.5]);
  });
  it("no baseline for the cruise's month is blank, never 0", () => {
    const clim = climLookup([{ station: 30, y: 10, v: 12.0, n: 40, month: 6 }]);
    expect(anomalyOf(cells[0], clim)).toBeNull();
  });
});
