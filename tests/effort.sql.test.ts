// the Effort layer (`effort=on`): sql/effort_track.sql over sample_track ⋈ sample_root, run in the engine the browser
// ships, then src/effort.ts turning its rows into PathLayer paths. One small fixture per rule.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, datasetFilterSql, type Params } from "../src/sqltpl";
import { effortPath, effortPaths, effortSummary, type EffortRow } from "../src/effort";
import { openDuck, type Duck } from "./helpers/duck";

const DS = "sio_cetacean-sightings";
let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // sample_root: the effort segments are root samples. Segment 1 is worked on 31 March for the April cruise (the cruise's
  // month, not the calendar's); segment 3 is the misdated one the ingest gives no cruise_key; segment 9 is another dataset's
  db.exec(`CREATE TABLE root AS SELECT * FROM (VALUES
    (1, '${DS}:transect:1', '${DS}', 'transect', 'st60-ln90', '2022-04-32SH', 32.0::DOUBLE, -120.0::DOUBLE, TIMESTAMP '2022-03-31 20:00:00'),
    (2, '${DS}:transect:2', '${DS}', 'transect', 'st70-ln90', '2022-07-32SH', 31.5, -121.0, TIMESTAMP '2022-07-10 12:00:00'),
    (3, '${DS}:transect:3', '${DS}', 'transect', 'st80-ln90', NULL::VARCHAR, 31.0, -122.0, TIMESTAMP '2022-11-05 12:00:00'),
    (9, 'other_ds:transect:9', 'other_ds', 'transect', 'st60-ln90', '2022-04-99XX', 33.0, -119.0, TIMESTAMP '2022-04-12 12:00:00')
  ) t(root_id, root_sample_key, dataset_key, sample_type, grid_key, cruise_key, latitude, longitude, datetime)`);
  // sample_track: the four segments, a sight line within segment 1's span (a child sample: no root row of its own), a sight
  // line on no segment (August, calendar month), and segment 2 with a NaN midpoint
  db.exec(`CREATE TABLE trk AS SELECT * FROM (VALUES
    ('${DS}:transect:1', '${DS}', 'effort_segment', TIMESTAMP '2022-03-31 19:00:00', TIMESTAMP '2022-03-31 20:00:00', TIMESTAMP '2022-03-31 21:00:00', -120.1::DOUBLE, 32.0::DOUBLE, -120.0::DOUBLE, 32.0::DOUBLE, -119.9::DOUBLE, 32.0::DOUBLE, 18.9::DOUBLE),
    ('${DS}:transect:2', '${DS}', 'effort_segment', TIMESTAMP '2022-07-10 11:00:00', TIMESTAMP '2022-07-10 12:00:00', TIMESTAMP '2022-07-10 13:00:00', -121.1, 31.5, 'NaN'::DOUBLE, 31.5, -120.9, 31.5, 19.0),
    ('${DS}:transect:3', '${DS}', 'effort_segment', TIMESTAMP '2022-11-05 11:00:00', TIMESTAMP '2022-11-05 12:00:00', TIMESTAMP '2022-11-05 13:00:00', -122.1, 31.0, -122.0, 31.0, -121.9, 31.0, 5.0),
    ('other_ds:transect:9', 'other_ds', 'effort_segment', TIMESTAMP '2022-04-12 11:00:00', TIMESTAMP '2022-04-12 12:00:00', TIMESTAMP '2022-04-12 13:00:00', -119.1, 33.0, -119.0, 33.0, -118.9, 33.0, 2.0),
    ('${DS}:sighting:11', '${DS}', 'sight_line', TIMESTAMP '2022-03-31 20:30:00', TIMESTAMP '2022-03-31 20:30:00', TIMESTAMP '2022-03-31 20:30:00', -119.95, 32.0, -119.95, 32.005, -119.95, 32.01, 1.1),
    ('${DS}:sighting:12', '${DS}', 'sight_line', TIMESTAMP '2022-08-01 08:00:00', TIMESTAMP '2022-08-01 08:00:00', TIMESTAMP '2022-08-01 08:00:00', -118.0, 30.0, NULL, NULL, -118.0, 30.01, 1.1)
  ) t(sample_key, dataset_key, track_type, datetime_beg, datetime_mid, datetime_end, longitude_beg, latitude_beg, longitude_mid, latitude_mid, longitude_end, latitude_end, length_km)`);
});
afterAll(() => db.close());

// the Effort parameters as App.tsx builds them: every year and season, every dataset, everywhere, no cruise
const P = (over: Params = {}): Params => ({ track_src: "trk", root_src: "root", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", dataset_filter: datasetFilterSql(null), area_filter: "TRUE", cruise: null, ...over });
const keys = (over: Params = {}) => db.exec(render("effort_track", P(over))).map((r) => r.sample_key);

describe("effort_track.sql — sample_track placed by sample_root, filtered without a taxon", () => {
  it("returns every path in the window, segments before sight lines, each by key", () => {
    expect(keys()).toEqual(["other_ds:transect:9", `${DS}:transect:1`, `${DS}:transect:2`, `${DS}:transect:3`, `${DS}:sighting:11`, `${DS}:sighting:12`]);
  });
  it("a segment's cruise_key is its sample_root row's; a sight line takes the segment whose span contains it", () => {
    const r = db.exec(render("effort_track", P())).map((x) => [x.sample_key, x.cruise_key]);
    expect(r).toEqual([["other_ds:transect:9", "2022-04-99XX"], [`${DS}:transect:1`, "2022-04-32SH"], [`${DS}:transect:2`, "2022-07-32SH"], [`${DS}:transect:3`, null],
      [`${DS}:sighting:11`, "2022-04-32SH"], [`${DS}:sighting:12`, null]]);
  });
  // explore#17: the month is the CRUISE's, so 31 March of the April cruise sits in April
  it("the time window is the cruise's month: a 31 March segment of the April cruise is in April, not March", () => {
    expect(keys({ ym0: 202204, ym1: 202204 })).toEqual(["other_ds:transect:9", `${DS}:transect:1`, `${DS}:sighting:11`]);
    expect(keys({ ym0: 202203, ym1: 202203 })).toEqual([]);
  });
  it("a path with no cruise falls back to the calendar month of datetime_beg", () => {
    expect(keys({ ym0: 202211, ym1: 202211 })).toEqual([`${DS}:transect:3`]);
    expect(keys({ ym0: 202208, ym1: 202208 })).toEqual([`${DS}:sighting:12`]);
  });
  it("the season filter reads the cruise's quarter", () => expect(keys({ quarter_filter: "quarter IN (2)" })).toEqual(["other_ds:transect:9", `${DS}:transect:1`, `${DS}:sighting:11`]));
  // v2026.11+: the cruise table's median cast month outranks the key's MM, as in the slice (explore#43); the key rule stands
  // for a cruise the table does not know, and DJF is season 1 of the NEXT year's count only in season_year, not in the window
  it("the cruise's median cast month places the path when the release's cruise table carries it", () => {
    const cz = `(SELECT * FROM (VALUES ('2022-04-32SH', DATE '2022-06-15', 6::TINYINT, 2022::SMALLINT)) t(cruise_key, date_median, month_median, season_year))`;
    expect(keys({ cruise_src: cz, ym0: 202206, ym1: 202206 })).toEqual([`${DS}:transect:1`, `${DS}:sighting:11`]);
    expect(keys({ cruise_src: cz, ym0: 202204, ym1: 202204 })).toEqual(["other_ds:transect:9"]);
    expect(keys({ cruise_src: cz, quarter_filter: "quarter IN (3)" })).toEqual([`${DS}:transect:1`, `${DS}:transect:2`, `${DS}:sighting:11`, `${DS}:sighting:12`]);
  });
  it("the dataset pills filter on dataset_key", () => expect(keys({ dataset_filter: datasetFilterSql(["other_ds"]) })).toEqual(["other_ds:transect:9"]));
  it("the cruise lens keeps one cruise, its sight lines included", () => {
    expect(keys({ cruise: "2022-04-32SH" })).toEqual([`${DS}:transect:1`, `${DS}:sighting:11`]);
  });
  it("the Area filter reads the midpoint (latitude / longitude) and the root row (grid_key)", () => {
    expect(keys({ area_filter: "(latitude BETWEEN 32.5 AND 34 AND longitude BETWEEN -120 AND -118)" })).toEqual(["other_ds:transect:9"]);
    expect(keys({ area_filter: "grid_key IN ('st60-ln90')" })).toEqual(["other_ds:transect:9", `${DS}:transect:1`, `${DS}:sighting:11`]);
  });
});

describe("effort.ts — rows to PathLayer paths", () => {
  it("a path is beginning · middle · end", () => {
    const r = db.exec(render("effort_track", P({ cruise: "2022-04-32SH" }))) as unknown as EffortRow[];
    expect(effortPath(r[0])).toEqual([[-120.1, 32], [-120, 32], [-119.9, 32]]);
  });
  it("drops a NULL or NaN point, and a path left with fewer than two points", () => {
    const rows = db.exec(render("effort_track", P())) as unknown as EffortRow[];
    const paths = effortPaths(rows);
    expect(paths.find((p) => p.sample_key === `${DS}:transect:2`)!.path).toEqual([[-121.1, 31.5], [-120.9, 31.5]]);
    expect(paths.find((p) => p.sample_key === `${DS}:sighting:12`)!.path).toEqual([[-118, 30], [-118, 30.01]]);
    expect(effortPaths([{ ...rows[0], longitude_beg: null, longitude_end: Number.NaN }])).toEqual([]);
  });
  it("the summary counts effort segments and their length, never sight lines", () => {
    const s = effortSummary(effortPaths(db.exec(render("effort_track", P())) as unknown as EffortRow[]));
    expect(s.n).toBe(4);
    expect(s.km).toBeCloseTo(18.9 + 19 + 5 + 2, 6);
  });
});
