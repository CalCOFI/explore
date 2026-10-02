// the per-cast grain (plan 2026-10-02 D2, explore#13): sql/slice_cast.sql builds the SAME `slice` the bio and env realms
// build, from sample_measurement ⋈ sample_root, and every lens template then runs on it unchanged. One small fixture
// per rule, run in the engine the browser ships. The type is called `mld_x` on purpose: nothing here (and nothing in
// the app) is keyed on a real measurement_type name — the registry says what is a per-cast type.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, datasetFilterSql, hexExpr, type Params } from "../src/sqltpl";
import { qualOkSQL } from "../src/qual";
import { openDuck, type Duck, type Row } from "./helpers/duck";

let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // sample_root: three CTD casts in two grid cells on two cruises, and one bottle cast. The casts' own dataset is
  // calcofi_ctd-cast — the derived dataset publishes no sample of its own (ingest_calcofi_ctd-derived.qmd).
  db.exec(`CREATE TABLE root AS SELECT * FROM (VALUES
    (1, 'calcofi_ctd-cast:cast:A', 'calcofi_ctd-cast', 'cast', 'st60-ln90', '2020-01-33RL', 32.004::DOUBLE, -120.006::DOUBLE, TIMESTAMP '2020-01-15 10:00:00'),
    (2, 'calcofi_ctd-cast:cast:B', 'calcofi_ctd-cast', 'cast', 'st60-ln90', '2021-07-33RL', 32.004, -120.006, TIMESTAMP '2021-07-20 04:00:00'),
    (3, 'calcofi_ctd-cast:cast:C', 'calcofi_ctd-cast', 'cast', 'st70-ln90', '2020-01-33RL', 31.500, -121.000, TIMESTAMP '2020-01-16 02:00:00'),
    (4, 'calcofi_bottle:cast:D',   'calcofi_bottle',   'cast', 'st70-ln90', '2020-01-33RL', 31.500, -121.000, TIMESTAMP '2020-01-16 02:30:00')
  ) t(root_id, root_sample_key, dataset_key, sample_type, grid_key, cruise_key, latitude, longitude, datetime)`);
  db.exec(`ALTER TABLE root ADD COLUMN depth_min_m DOUBLE`); db.exec(`ALTER TABLE root ADD COLUMN depth_max_m DOUBLE`);
  // sample_measurement: mld_x on casts A, B, C and on a sample with NO root row; another type on cast A; a flagged
  // bottle value on cast D
  db.exec(`CREATE TABLE sm AS SELECT * FROM (VALUES
    (1::BIGINT, 'calcofi_ctd-cast:cast:A',      'calcofi_ctd-derived', 'mld_x', 20.0::DOUBLE, NULL::VARCHAR),
    (2::BIGINT, 'calcofi_ctd-cast:cast:A',      'calcofi_ctd-derived', 'chl_y',  1.5, NULL::VARCHAR),
    (3::BIGINT, 'calcofi_ctd-cast:cast:B',      'calcofi_ctd-derived', 'mld_x', 40.0, NULL::VARCHAR),
    (4::BIGINT, 'calcofi_ctd-cast:cast:C',      'calcofi_ctd-derived', 'mld_x', 30.0, NULL::VARCHAR),
    (5::BIGINT, 'calcofi_ctd-cast:cast:ORPHAN', 'calcofi_ctd-derived', 'mld_x', 99.0, NULL::VARCHAR),
    (6::BIGINT, 'calcofi_bottle:cast:D',        'calcofi_bottle',      'wind_z', 10.0, '8'),
    (7::BIGINT, 'calcofi_bottle:cast:D',        'calcofi_bottle',      'wind_z', 12.0, NULL::VARCHAR)
  ) t(sample_measurement_id, sample_key, dataset_key, measurement_type, measurement_value, measurement_qual)`);
  db.exec(`CREATE TABLE mt AS SELECT * FROM (VALUES
    ('mld_x', 'Mixed-layer depth, a criterion', 'm', 'ctd_mld(...)', 'sample'),
    ('chl_y', 'Chlorophyll-a at its maximum', 'ug/L', 'ctd_chl_max(...)', 'sample'),
    ('wind_z', 'Wind speed', 'knots', NULL, 'sample')
  ) t(measurement_type, description, units, derivation, grain)`);
  db.exec(`CREATE TABLE sp AS SELECT * FROM (VALUES
    (1, 'calcofi_ctd-cast:cast:A', 'Sanctuaries', 'cinms', 'Channel Islands'),
    (3, 'calcofi_ctd-cast:cast:C', 'Sanctuaries', 'cinms', 'Channel Islands'),
    (2, 'calcofi_ctd-cast:cast:B', 'Counties',    'sb',    'Santa Barbara')
  ) t(root_id, root_sample_key, layer, spatial_key, spatial_name)`);
});
afterAll(() => db.close());

const slice = (type: string) => db.exec(render("slice_cast", { sm_src: "sm", root_src: "root", mt_src: "mt", type, qual_ok: qualOkSQL("sm") }));
// the lens parameters as App.tsx builds them for an env variable: every year, every season, the DEFAULT 0–500 m band
const P = (over: Params = {}): Params => ({ val: "value", y0: 1949, y1: 2026, ym0: 194901, ym1: 202612, quarter_filter: "TRUE", bin: "year", d0: 0, d1: 500, stage: null, dataset_filter: datasetFilterSql(null), zeros: true, ...over });
const q = (name: string, over: Params = {}) => db.exec(render(name, P(over)));
const by = (k: string) => (a: Row, b: Row) => String(a[k]).localeCompare(String(b[k]));

describe("slice_cast.sql — one row per cast value, placed by the cast's sample_root row", () => {
  beforeAll(() => { slice("mld_x"); });

  it("holds exactly the chosen type's values on casts that have a root row", () => {
    const r = db.exec("SELECT obs_id, sample_key, root_id, grid_key, cruise_key, value FROM slice ORDER BY obs_id");
    expect(r).toEqual([
      { obs_id: 1, sample_key: "calcofi_ctd-cast:cast:A", root_id: 1, grid_key: "st60-ln90", cruise_key: "2020-01-33RL", value: 20 },
      { obs_id: 3, sample_key: "calcofi_ctd-cast:cast:B", root_id: 2, grid_key: "st60-ln90", cruise_key: "2021-07-33RL", value: 40 },
      { obs_id: 4, sample_key: "calcofi_ctd-cast:cast:C", root_id: 3, grid_key: "st70-ln90", cruise_key: "2020-01-33RL", value: 30 },
    ]);
  });
  it("another type on the same cast never leaks in", () => expect(db.exec("SELECT count(*) AS n FROM slice WHERE measurement_type <> 'mld_x'")[0].n).toBe(0));
  it("dataset_key is the MEASUREMENT's (the derived dataset), never the cast's own — it is what gets cited", () => {
    expect(db.exec("SELECT DISTINCT dataset_key FROM slice")).toEqual([{ dataset_key: "calcofi_ctd-derived" }]);
  });
  it("has no depth: depth_min_m, depth_max_m and depth_bin are NULL on every row", () => {
    expect(db.exec("SELECT count(depth_min_m) AS a, count(depth_max_m) AS b, count(depth_bin) AS c FROM slice")[0]).toEqual({ a: 0, b: 0, c: 0 });
  });
  it("year and quarter come from the cast's datetime; units from the registry", () => {
    expect(db.exec("SELECT obs_id, year, quarter, units FROM slice ORDER BY obs_id")).toEqual([
      { obs_id: 1, year: 2020, quarter: 1, units: "m" }, { obs_id: 3, year: 2021, quarter: 3, units: "m" }, { obs_id: 4, year: 2020, quarter: 1, units: "m" }]);
  });
  it("carries the columns of slice_env.sql in the same order, plus sample_key — so every lens template runs on it", () => {
    const cols = db.exec("DESCRIBE slice").map((r) => `${r.column_name}:${r.column_type}`);
    expect(cols).toEqual(["obs_id:BIGINT", "dataset_key:VARCHAR", "root_id:INTEGER", "grid_key:VARCHAR", "site_key:VARCHAR", "line:DOUBLE", "station:DOUBLE",
      "cruise_key:VARCHAR", "latitude:DOUBLE", "longitude:DOUBLE", "datetime:TIMESTAMP", "year:SMALLINT", "quarter:TINYINT",
      "depth_min_m:DOUBLE", "depth_max_m:DOUBLE", "depth_bin:INTEGER", "taxon_key:VARCHAR", "life_stage:VARCHAR", "measurement_type:VARCHAR", "units:VARCHAR", "value:DOUBLE",
      "measurement_qual:VARCHAR", "qual_ok:BOOLEAN", "tow_type:VARCHAR", "std_haul_factor:DOUBLE", "prop_sorted:DOUBLE", "volume_sampled_m3:DOUBLE",
      "density_per_10m2:DOUBLE", "density_per_1000m3:DOUBLE", "effort_class:VARCHAR", "hex7:UBIGINT", "sample_key:VARCHAR"]);
  });
  it("a registry with a repeated row cannot double a cast (units is a scalar lookup, not a join)", () => {
    db.exec("CREATE OR REPLACE TABLE mt2 AS SELECT * FROM mt UNION ALL SELECT * FROM mt");
    db.exec(render("slice_cast", { sm_src: "sm", root_src: "root", mt_src: "mt2", type: "mld_x", qual_ok: qualOkSQL("sm") }));
    expect(db.exec("SELECT count(*) AS n FROM slice")[0].n).toBe(3);
    slice("mld_x");
  });
});

describe("the lens templates on a per-cast slice", () => {
  beforeAll(() => { slice("mld_x"); });

  it("station.sql: one row per grid cell, n = casts, the mean over them", () => {
    expect(q("station").sort(by("grid_key")).map(({ grid_key, n, n_samples, mean, med, y0, y1 }) => ({ grid_key, n, n_samples, mean, med, y0, y1 }))).toEqual([
      { grid_key: "st60-ln90", n: 2, n_samples: 2, mean: 30, med: 30, y0: 2020, y1: 2021 },
      { grid_key: "st70-ln90", n: 1, n_samples: 1, mean: 30, med: 30, y0: 2020, y1: 2020 }]);
  });
  // REGRESSION (permanent): a per-cast value is not a depth observation. The depth band is a filter on depth_bin, and
  // a band that excludes the surface must not silently empty a map of mixed-layer depths.
  it("a depth band never filters a per-cast value", () => {
    const deep = q("station", { d0: 200, d1: 300 }).sort(by("grid_key")).map((r) => [r.grid_key, r.n, r.mean]);
    expect(deep).toEqual([["st60-ln90", 2, 30], ["st70-ln90", 1, 30]]);
  });
  it("depth_strip.sql returns nothing: there is no water-column profile, so the Depth pill stays quiet", () => expect(q("depth_strip")).toEqual([]));
  it("section.sql returns nothing: Sections cut depth, so they draw per-bin variables only", () => {
    expect(q("section", { line: 90, cruise: "2020-01-33RL" })).toEqual([]);
    expect(q("section_cruises", { line: 90 })).toEqual([]);
  });
  it("hex.sql returns nothing: sample_root carries no H3 cell (hex7 is NULL) — Hexagons is not a per-cast lens yet", () => expect(q("hex", { hex: hexExpr(5) })).toEqual([]));
  it("the year range and the season filter on the cast's own date", () => {
    expect(q("station", { ym0: 202101, ym1: 202112 }).map((r) => [r.grid_key, r.n, r.mean])).toEqual([["st60-ln90", 1, 40]]);
    expect(q("station", { quarter_filter: "quarter IN (1)" }).sort(by("grid_key")).map((r) => [r.grid_key, r.n, r.mean])).toEqual([["st60-ln90", 1, 20], ["st70-ln90", 1, 30]]);
  });
  it("years.sql: one bar per year, n = casts", () => {
    expect(q("years").map(({ year, n, n_samples, mean }) => ({ year, n, n_samples, mean }))).toEqual([{ year: 2020, n: 2, n_samples: 2, mean: 25 }, { year: 2021, n: 1, n_samples: 1, mean: 40 }]);
  });
  it("cruise.sql: one row per cruise", () => {
    expect(q("cruise").map(({ cruise_key, n, n_sta, mean }) => ({ cruise_key, n, n_sta, mean }))).toEqual([
      { cruise_key: "2020-01-33RL", n: 2, n_sta: 2, mean: 25 }, { cruise_key: "2021-07-33RL", n: 1, n_sta: 1, mean: 40 }]);
  });
  it("cruise_samples.sql: one dot per cast of the cruise", () => {
    expect(q("cruise_samples", { cruise: "2020-01-33RL" }).sort(by("root_id")).map(({ root_id, grid_key, n, mean }) => ({ root_id, grid_key, n, mean }))).toEqual([
      { root_id: 1, grid_key: "st60-ln90", n: 1, mean: 20 }, { root_id: 3, grid_key: "st70-ln90", n: 1, mean: 30 }]);
  });
  it("region.sql: the cast's root_id is the key sample_spatial is built on", () => {
    expect(q("region", { layer: "Sanctuaries", spatial_src: "sp" }).map(({ spatial_key, n, n_samples, mean }) => ({ spatial_key, n, n_samples, mean }))).toEqual([{ spatial_key: "cinms", n: 2, n_samples: 2, mean: 25 }]);
  });
  it("contour_cast.sql: one point per site at the cast's own position (0.01°)", () => {
    expect(q("contour_cast").sort((a, b) => a.longitude - b.longitude).map(({ longitude, latitude, n, mean }) => ({ longitude, latitude, n, mean }))).toEqual([
      { longitude: -121, latitude: 31.5, n: 1, mean: 30 }, { longitude: -120.01, latitude: 32, n: 2, mean: 30 }]);
  });
  it("picker.sql: one pill per dataset, no life stage, no effort", () => {
    expect(db.exec(render("picker", {}))).toEqual([{ dataset_key: "calcofi_ctd-derived", life_stage: null, effort_class: null, tow_type: null, units: "m", n: 3, n_10m2: 0, n_1000m3: 0, n_filled: 0, n_flagged: 0 }]);
  });
});

describe("measurement_qual reaches the slice through qualOkSQL()", () => {
  it("a flagged value under a dataset WITH a vocabulary is in the slice with qual_ok FALSE, and no lens counts it", () => {
    slice("wind_z");
    expect(db.exec("SELECT obs_id, measurement_qual, qual_ok FROM slice ORDER BY obs_id")).toEqual([
      { obs_id: 6, measurement_qual: "8", qual_ok: false }, { obs_id: 7, measurement_qual: null, qual_ok: true }]);
    expect(q("station").map((r) => [r.grid_key, r.n, r.mean])).toEqual([["st70-ln90", 1, 12]]);
    expect(db.exec(render("picker", {}))[0]).toMatchObject({ dataset_key: "calcofi_bottle", n: 2, n_flagged: 1 });
  });
});

describe("the census the variable picker lists per-cast types from", () => {
  it("cast_census.sql: values per dataset × type, from sample_measurement alone", () => {
    expect(db.exec(render("cast_census", { sm_src: "sm" }))).toEqual([
      { dataset_key: "calcofi_bottle", measurement_type: "wind_z", n: 2 },
      { dataset_key: "calcofi_ctd-derived", measurement_type: "chl_y", n: 1 },
      { dataset_key: "calcofi_ctd-derived", measurement_type: "mld_x", n: 4 }]);
  });
  // a value whose sample has no root row cannot be placed on a map: it is COUNTED (n) and reported (n_placed), never
  // silently dropped from one number and kept in another
  it("cast_list.sql: n_placed says how many of them a root sample places, with the years", () => {
    expect(db.exec(render("cast_list", { sm_src: "sm", root_src: "root" }))).toEqual([
      { dataset_key: "calcofi_bottle", measurement_type: "wind_z", n: 2, n_placed: 2, y0: 2020, y1: 2020 },
      { dataset_key: "calcofi_ctd-derived", measurement_type: "chl_y", n: 1, n_placed: 1, y0: 2020, y1: 2020 },
      { dataset_key: "calcofi_ctd-derived", measurement_type: "mld_x", n: 4, n_placed: 3, y0: 2020, y1: 2021 }]);
  });
});
