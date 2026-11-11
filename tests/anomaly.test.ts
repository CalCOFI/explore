// the anomaly is matched on the CRUISE's month (the slice's cruise_month: the cruise table's median cast month since
// v2026.11, the MM of its YYYY-MM-NODC cruise_key before), never the calendar month a cast was occupied in. Regression: cruise 2026-07-3322 worked line 93.3's inshore stations on 2026-06-30; matched on
// the calendar month they looked up a June baseline (none: no June cruise 1993–2013) and the inshore half of the
// section went blank although the release holds July baselines for them. sql/section.sql runs in the engine the
// browser ships, against a small fixture; src/anomaly.ts is the key both renderers use.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, datasetFilterSql, type Params } from "../src/sqltpl";
import { anomalyOf, climLookup, cruiseMonth, noBaseline, noBaselineWhy, sectionRange } from "../src/anomaly";
import type { SectionCell } from "../src/charts";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // two stations of one cruise designated July: station 30 occupied on June 30, station 60 on July 1
  // the slice as slice_env.sql builds it: year / quarter / cruise_month / season_year are the cruise's (JJA, July, 2026)
  db.exec(`CREATE TABLE slice AS SELECT * FROM (VALUES
    ('093.3 030.0', 'st30-ln93.3', 93.3::DOUBLE, 30.0::DOUBLE, '2026-07-3322', TIMESTAMP '2026-06-30 22:00:00', 2026::SMALLINT, 3::TINYINT, 10, 14.0::DOUBLE, TRUE, 7::TINYINT, 2026::SMALLINT),
    ('093.3 030.0', 'st30-ln93.3', 93.3, 30.0, '2026-07-3322', TIMESTAMP '2026-06-30 22:00:00', 2026, 3, 10, 16.0, TRUE, 7, 2026),
    ('093.3 060.0', 'st60-ln93.3', 93.3, 60.0, '2026-07-3322', TIMESTAMP '2026-07-01 08:00:00', 2026, 3, 10, 17.0, TRUE, 7, 2026)
  ) t(site_key, grid_key, line, station, cruise_key, datetime, year, quarter, depth_bin, value, qual_ok, cruise_month, season_year)`);
  db.exec(`ALTER TABLE slice ADD COLUMN dataset_key VARCHAR DEFAULT 'calcofi_ctd-cast'`);
  db.exec(`ALTER TABLE slice ADD COLUMN obs_id BIGINT DEFAULT 1`); db.exec(`ALTER TABLE slice ADD COLUMN life_stage VARCHAR`);
  db.exec(`ALTER TABLE slice ADD COLUMN depth_min_m DOUBLE`); db.exec(`UPDATE slice SET depth_min_m = depth_bin`);
  db.exec(`ALTER TABLE slice ADD COLUMN depth_max_m DOUBLE`); db.exec(`UPDATE slice SET depth_max_m = depth_bin`);
});
afterAll(() => db.close());

const P = (over: Params = {}): Params => ({ val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500,
  stage: null, dataset_filter: datasetFilterSql(null), zeros: true, line: 93.3, cruise: "2026-07-3322", ...over });

describe("cruiseMonth() — the key rule, the fallback where the cruise table carries no median month", () => {
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

// explore#12: the Sections legend read the map's station rows, which this lens never refreshes — "106.31 per 10 m²"
// and "106.31 degC" alike. The legend now reads the range the section draws.
describe("sectionRange — the legend of the Sections lens", () => {
  const cells = [{ station: 30, y: 10, v: 14, n: 1, month: 7 }, { station: 40, y: 10, v: 18, n: 1, month: 7 }, { station: 50, y: 10, v: 11, n: 1, month: 7 }];
  it("is the section's own min–max", () => expect(sectionRange(cells, null, false)).toEqual([11, 18]));
  it("follows the pick: other values, another range", () => expect(sectionRange(cells.map((c) => ({ ...c, v: c.v * 100 })), null, false)).toEqual([1100, 1800]));
  it("as a difference from the normal, symmetric about 0 from the largest departure; no baseline is left out", () => {
    const clim = [{ station: 30, y: 10, v: 13, n: 9, month: 7 }, { station: 40, y: 10, v: 15, n: 9, month: 7 }];
    expect(sectionRange(cells, clim, true)).toEqual([-3, 3]);
  });
  it("null when nothing is drawn", () => { expect(sectionRange([], null, false)).toBeNull(); expect(sectionRange(cells, [], true)).toBeNull(); });
});

// the tour rehearsal, 2026-11-11: ?lens=section&var=temperature&line=93.3&anom=1&cruise=2025-04-3322 drew empty axes under
// a legend left over from the map ("8.89 … 15.58 degC"). The cruise's median cast month is March; release v2026.11.09 holds
// no March normal on line 93.3 (no March reached 5 cruises in 1993–2013) though it holds the Mar–May one. The section has
// rows and no baseline: it says so, offers the ways out, and has no range — and it never switches the baseline itself.
describe("noBaseline — an anomaly section with rows and no normal for the cruise's period", () => {
  // two stations of a cruise whose month is March (season 2, Mar–May)
  const cells: SectionCell[] = [{ station: 30, y: 10, v: 14, n: 1, month: 3 }, { station: 30, y: 20, v: 13, n: 1, month: 3 }, { station: 60, y: 10, v: 15, n: 1, month: 3 }];
  // the monthly baseline as section_clim.sql hands it: the line's other months, none for March
  const monthly: SectionCell[] = [{ station: 30, y: 10, v: 12, n: 40, month: 2 }, { station: 30, y: 10, v: 13, n: 40, month: 4 }, { station: 60, y: 10, v: 14, n: 40, month: 4 }];
  // the seasonal one: `month` is the PERIOD, the season 1–4 (2 = Mar–May, 3 = Jun–Aug)
  const seasonal: SectionCell[] = [{ station: 30, y: 10, v: 12.5, n: 90, month: 2 }, { station: 60, y: 10, v: 14, n: 90, month: 2 }, { station: 30, y: 10, v: 16, n: 90, month: 3 }];

  it("is true when no cell has a baseline for the cruise's month", () => expect(noBaseline(cells, monthly)).toBe(true));
  it("the seasonal baseline of the same cruise draws: not empty", () => expect(noBaseline(cells, seasonal, "season")).toBe(false));
  it("one cell with a baseline is enough to draw", () => expect(noBaseline(cells, [...monthly, { station: 60, y: 10, v: 14, n: 40, month: 3 }])).toBe(false));
  it("a baseline table with no row at all is no baseline", () => { expect(noBaseline(cells, [])).toBe(true); expect(noBaseline(cells, null)).toBe(true); });
  it("a section with no rows is the other empty state, not this one", () => expect(noBaseline([], monthly)).toBe(false));

  it("the legend has no range then — never one left over from another draw", () => expect(sectionRange(cells, monthly, true)).toBeNull());
  it("as measured, the same cells have their own range", () => expect(sectionRange(cells, monthly, false)).toEqual([13, 15]));
  // regression: sectionRange() keyed a seasonal baseline on the cruise's MONTH, so a March cruise read period 3 — the
  // Jun–Aug normal (14 − 16 = −2 → ±2) — and a July cruise (period 7) found nothing and kept the map's range
  it("under the seasonal baseline the range is the departure from the cruise's own season", () => {
    expect(sectionRange(cells, seasonal, true, "season")).toEqual([-1.5, 1.5]);
    expect(sectionRange(cells.map((c) => ({ ...c, month: 7 })), [{ station: 30, y: 10, v: 12, n: 90, month: 3 }], true, "season")).toEqual([-2, 2]);
  });
});

describe("noBaselineWhy — what the empty section says", () => {
  it("names the normal it lacks and the ways out", () =>
    expect(noBaselineWhy("month", 3, "1993–2013")).toBe("no 1993–2013 March normal at these stations — try the seasonal normal, or show as measured"));
  it("does not offer a seasonal normal the release does not carry", () =>
    expect(noBaselineWhy("month", 3, "1993–2013", false)).toBe("no 1993–2013 March normal at these stations — show as measured"));
  it("under the seasonal baseline there is no other normal to try", () =>
    expect(noBaselineWhy("season", 3, "1993–2013")).toBe("no 1993–2013 Mar–May normal at these stations — show as measured"));
  it("without a cruise month, the kind of normal", () =>
    expect(noBaselineWhy("month", null, "1993–2013")).toBe("no 1993–2013 monthly normal at these stations — try the seasonal normal, or show as measured"));
});
