// the Table builder's SQL (src/builder/query.ts) on a fixture: several picks in one table, keyed by place × time × depth,
// with the Explorer's own slices underneath (per-net zero-fill for a positive-only species, the cruise's year).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { builderSql, type Spec, type Ctx } from "../src/builder/query";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
const ANCHOVY = "worms:217452", SARDINE = "worms:126422";
const HX = (lat: number, lon: number) => BigInt("0x" + latLngToCell(lat, lon, 7)).toString();
const COLS = `obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m,
      depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok, tow_type, std_haul_factor, prop_sorted,
      volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7`;
const NUM = ["value", "std_haul_factor", "prop_sorted", "volume_sampled_m3", "density_per_10m2", "density_per_1000m3"];

beforeAll(async () => {
  db = await openDuck();
  const h1 = HX(34.0, -121.0), h3 = HX(32.0, -120.0);
  // ichthyo (positive-only): R1 1960 caught anchovy · R2 2012 caught sardine · R3 1990 caught sardine
  db.exec(`CREATE TABLE obs AS SELECT * FROM (VALUES
    (1, 'ichthyo', 1, 'ln80st60', '080.0 060.0', '1960-03-JD', 34.0, -121.0, TIMESTAMP '1960-03-10', 1960, 2, 0.0, 210.0, NULL, '${ANCHOVY}', 'larva', 'abundance', 'count', 2.0, NULL, TRUE, 'CB', 3.905, 1.0, 300.0, 7.81, 6.5, 'count_with_effort', ${h1}::UBIGINT),
    (2, 'ichthyo', 2, 'ln80st60', '080.0 060.0', '2012-04-RL', 34.0, -121.0, TIMESTAMP '2012-04-02', 2012, 2, 0.0, 210.0, NULL, '${SARDINE}', 'larva', 'abundance', 'count', 5.0, NULL, TRUE, 'CB', 3.0, 1.0, 300.0, 15.0, 16.7, 'count_with_effort', ${h1}::UBIGINT),
    (3, 'ichthyo', 3, 'ln90st70', '090.0 070.0', '1990-07-NH', 32.0, -120.0, TIMESTAMP '1990-07-02', 1990, 3, 0.0, 210.0, NULL, '${SARDINE}', 'larva', 'abundance', 'count', 1.0, NULL, TRUE, 'CB', 3.0, 1.0, 300.0, 3.0, 3.3, 'count_with_effort', ${h3}::UBIGINT)
  ) t(${COLS})`);
  for (const c of NUM) db.exec(`ALTER TABLE obs ALTER ${c} TYPE DOUBLE`);
  // temperature (an obs_env object: no measurement_type column — the source adds it, as App.tsx envSrc() does)
  db.exec(`CREATE TABLE env AS SELECT * EXCLUDE (measurement_type) FROM (VALUES
    (11, 'bottle', 1, 'ln80st60', '080.0 060.0', '1960-03-JD', 34.0, -121.0, TIMESTAMP '1960-03-10', 1960, 2, 0.0, 10.0, 0, NULL, NULL, 'temperature', 'degC', 14.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${h1}::UBIGINT),
    (12, 'bottle', 1, 'ln80st60', '080.0 060.0', '1960-03-JD', 34.0, -121.0, TIMESTAMP '1960-03-10', 1960, 2, 10.0, 20.0, 10, NULL, NULL, 'temperature', 'degC', 12.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${h1}::UBIGINT),
    (13, 'bottle', 3, 'ln90st70', '090.0 070.0', '1990-07-NH', 32.0, -120.0, TIMESTAMP '1990-07-02', 1990, 3, 0.0, 10.0, 0, NULL, NULL, 'temperature', 'degC', 16.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${h3}::UBIGINT),
    (14, 'bottle', 3, 'ln90st70', '090.0 070.0', '1990-07-NH', 32.0, -120.0, TIMESTAMP '1990-07-02', 1990, 3, 0.0, 10.0, 0, NULL, NULL, 'temperature', 'degC', 99.0, NULL, FALSE, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${h3}::UBIGINT)
  ) t(${COLS})`);
  for (const c of NUM) db.exec(`ALTER TABLE env ALTER ${c} TYPE DOUBLE`);
  db.exec(`CREATE TABLE sp AS SELECT * FROM (VALUES ('Wind', 'A', 1), ('Wind', 'B', 3), ('Counties', 'X', 1)) t(layer, spatial_name, root_id)`);
});
afterAll(() => db.close());

const ctx: Ctx = { bioSrc: "obs", envSrc: (ms) => `(${ms.map((m) => `SELECT *, '${m}' AS measurement_type FROM env`).join(" UNION ALL ")})`, spatialSrc: "sp" };
const BASE: Spec = {
  picks: [{ realm: "bio", taxon: ANCHOVY, label: "Northern Anchovy" }, { realm: "env", key: "temperature", label: "Sea temperature", members: ["temperature"] }],
  lens: "station", place: "station", hexRes: 7, layer: null, regionNames: null, area: "TRUE",
  years: [1949, 2026], seasons: null, depth: [0, 500], time: "year", depthBy: "avg", stat: "avg",
  stages: ["larva"], den: "density_per_10m2", zeros: true, qualOnly: true, datasets: null,
};
const run = (spec: Spec) => { const s = builderSql(spec, ctx); s.slice(0, -1).forEach((x) => db.exec(x)); return db.exec(s[s.length - 1]); };
const A = "northern_anchovy_larva_per_10m2", T = "sea_temperature";

describe("one row per station per year, species and temperature side by side", () => {
  it("anchovy is zero-filled where its dataset sampled and caught none; temperature is blank where not measured", () => {
    const r = run(BASE);
    expect(r.map((x) => [x.year, x.line, x.station])).toEqual([[1960, 80, 60], [1990, 90, 70], [2012, 80, 60]]);
    expect(r[0][A]).toBeCloseTo(7.81, 9); expect(r[0][T]).toBeCloseTo(13, 9);   // (14 + 12) / 2, depths together
    expect(r[1][A]).toBe(0); expect(r[1][T]).toBe(16);                         // the 99 is not quality-checked
    expect(r[2][A]).toBe(0); expect(r[2][T]).toBeNull();                       // no cast that year: blank, never 0
  });
  it("positive catches only: the zeros go blank", () => {
    const r = run({ ...BASE, zeros: false });
    expect(r.find((x) => x.year === 1990)![A]).toBeNull();
  });
  it("quality filter off: the flagged 99 counts", () => {
    expect(run({ ...BASE, qualOnly: false }).find((x) => x.year === 1990)![T]).toBe((16 + 99) / 2);
  });
  it("per 10 m of depth: one row per depth bin, the tow (no bin) on its own row", () => {
    const r = run({ ...BASE, depthBy: "10" }).filter((x) => x.year === 1960);
    expect(r.map((x) => [x.depth_m, x[T]])).toEqual([[0, 14], [10, 12], [null, null]]);
  });
});

describe("other places and times", () => {
  it("no split by place, all years: one row, the average of everything", () => {
    const r = run({ ...BASE, place: "all", time: "all" });
    expect(r).toHaveLength(1);
    expect(r[0][A]).toBeCloseTo(7.81 / 3, 9); expect(r[0][T]).toBeCloseTo((14 + 12 + 16) / 3, 9);
  });
  it("regions: rows per region of the layer, with the layer named", () => {
    const r = run({ ...BASE, lens: "region", place: "region", layer: "Wind", time: "all" });
    expect(r.map((x) => [x.layer, x.region, x[T]])).toEqual([["Wind", "A", 13], ["Wind", "B", 16]]);
  });
  it("hexagons: one row per cell", () => {
    const r = run({ ...BASE, lens: "hex", place: "hex", time: "all" });
    expect(r).toHaveLength(2);
    expect(r.every((x) => typeof x.hexagon === "string" && x.hexagon.length === 15)).toBe(true);
  });
  it("by season: the season is named and the year is the season's", () => {
    const r = run({ ...BASE, time: "season", place: "all" });
    expect(r.map((x) => [x.year, x.season])).toEqual([[1960, "Spring"], [1990, "Summer"], [2012, "Spring"]]);
  });
  it("median, count and a season filter", () => {
    expect(run({ ...BASE, place: "all", time: "all", stat: "count" })[0][A]).toBe(3);
    expect(run({ ...BASE, place: "all", time: "all", seasons: [3] })[0][T]).toBe(16);
  });
  it("two life stages: one column each", () => {
    const r = run({ ...BASE, stages: ["larva", "egg"], place: "all", time: "all" });
    expect(Object.keys(r[0])).toEqual(["northern_anchovy_larva_per_10m2", "northern_anchovy_egg_per_10m2", T]);
  });
});

describe("a pick is one dataset's species or measurement", () => {
  it("the same species from one dataset only, named for it; another dataset's rows are left out", () => {
    db.exec(`CREATE OR REPLACE TABLE obs AS SELECT * FROM obs UNION ALL SELECT 9, 'zooscan', root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, year, quarter,
      depth_min_m, depth_max_m, depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok, tow_type, std_haul_factor, prop_sorted,
      volume_sampled_m3, 100.0, density_per_1000m3, effort_class, hex7 FROM obs WHERE obs_id = 1`);
    const spec: Spec = { ...BASE, place: "all", time: "all", picks: [
      { realm: "bio", taxon: ANCHOVY, label: "Northern Anchovy", dataset: "ichthyo", tag: "SWFSC Ichthyo" },
      { realm: "bio", taxon: ANCHOVY, label: "Northern Anchovy", dataset: "zooscan", tag: "ZooScan" }] };
    const r = run(spec)[0];
    expect(Object.keys(r)).toEqual(["northern_anchovy_larva_per_10m2_swfsc_ichthyo", "northern_anchovy_larva_per_10m2_zooscan"]);
    expect(r.northern_anchovy_larva_per_10m2_swfsc_ichthyo).toBeCloseTo(7.81 / 3, 9);
    expect(r.northern_anchovy_larva_per_10m2_zooscan).toBe(100);
  });
});

