// what the counts beside a mean count (Betty 2026-11-11): for a zero-filled taxon the mean, median and years run over
// EVERY sample in view (a tow that caught none is a 0), while n = count(obs_id) counts only the samples that caught it.
// OCS-P 0562 read "3.9 per 10 m², mean · 1 observation · 1960–2012": two tows (7.81 and a zero), one record. These
// fixtures pin that arithmetic, and that a region whose tows all caught none still has samples (n_samples > 0) — the
// rule the Regions-from outline and list now use — while its n is 0.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "../src/sqltpl";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
const ANCHOVY = "worms:217452", SARDINE = "worms:126422";
beforeAll(async () => {
  db = await openDuck();
  // ichthyo records a tow only when it caught a taxon (no zero rows anywhere), so slice_bio zero-fills it:
  //   R1 1960 caught anchovy (7.81 per 10 m²) · R2 2012 caught only sardine · R3 1990 caught only sardine
  db.exec(`CREATE TABLE obs AS SELECT * FROM (VALUES
    (1, 'ichthyo', 1, 'ln80st60', '080.0 060.0', '1960-03-JD', 34.0, -121.0, TIMESTAMP '1960-03-10', 1960, 1, 0.0, 210.0, NULL, '${ANCHOVY}', 'larva', 'abundance', 'count', 2.0, NULL, TRUE, 'CB', 3.905, 1.0, 300.0, 7.81, 6.5, 'count_with_effort', NULL),
    (2, 'ichthyo', 2, 'ln80st60', '080.0 060.0', '2012-04-RL', 34.0, -121.0, TIMESTAMP '2012-04-02', 2012, 2, 0.0, 210.0, NULL, '${SARDINE}', 'larva', 'abundance', 'count', 5.0, NULL, TRUE, 'CB', 3.0, 1.0, 300.0, 15.0, 16.7, 'count_with_effort', NULL),
    (3, 'ichthyo', 3, 'ln90st70', '090.0 070.0', '1990-07-NH', 32.0, -120.0, TIMESTAMP '1990-07-02', 1990, 3, 0.0, 210.0, NULL, '${SARDINE}', 'larva', 'abundance', 'count', 1.0, NULL, TRUE, 'CB', 3.0, 1.0, 300.0, 3.0, 3.3, 'count_with_effort', NULL)
  ) t(obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m,
      depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok, tow_type, std_haul_factor, prop_sorted,
      volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7)`);
  db.exec(`CREATE TABLE sp AS SELECT * FROM (VALUES ('wind', 'k1', 'OCS-P 0562', 1), ('wind', 'k1', 'OCS-P 0562', 2), ('wind', 'k2', 'OCS-P 0561', 3))
    t(layer, spatial_key, spatial_name, root_id)`);
  for (const c of ["value", "std_haul_factor", "prop_sorted", "volume_sampled_m3", "density_per_10m2", "density_per_1000m3"]) db.exec(`ALTER TABLE obs ALTER ${c} TYPE DOUBLE`); // the release's numeric columns are DOUBLE
  db.exec(render("slice_bio", { src: "obs", taxon: ANCHOVY }));
});
afterAll(() => db.close());

const P = { val: "density_per_10m2", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: "larva", dataset_filter: "TRUE", zeros: true };

describe("a zero-filled taxon: the mean runs over samples, n counts records", () => {
  it("the slice holds one record and two zero-filled tows", () => {
    expect(db.exec("SELECT count(*) AS rows, count(obs_id) AS records FROM slice")[0]).toEqual({ rows: 3, records: 1 });
  });
  it("region.sql: OCS-P 0562 is 2 samples, 1 record, mean (7.81 + 0) / 2, years over both tows", () => {
    const r = db.exec(render("region", { ...P, layer: "wind", spatial_src: "sp" })).find((x) => x.spatial_name === "OCS-P 0562")!;
    expect(r).toMatchObject({ n: 1, n_samples: 2, y0: 1960, y1: 2012 });
    expect([Number(r.lo), Number(r.hi)]).toEqual([0, 7.81]);
    expect(r.mean).toBeCloseTo(3.905, 9);
  });
  it("region.sql: a lease whose tows all caught none has samples (a mean of 0) and no records", () => {
    const r = db.exec(render("region", { ...P, layer: "wind", spatial_src: "sp" })).find((x) => x.spatial_name === "OCS-P 0561")!;
    expect(r).toMatchObject({ n: 0, n_samples: 1, mean: 0 });
  });
  it("count.sql (the title's count): 3 samples in view, found in 1", () => {
    expect(db.exec(render("count", P))[0]).toEqual({ n: 1, n_samples: 3, n_found: 1 });
  });
  it("positive tows only: the zeros leave, so samples = records", () => {
    expect(db.exec(render("count", { ...P, zeros: false }))[0]).toEqual({ n: 1, n_samples: 1, n_found: 1 });
  });
});

// "80 samples · found in 31" with 30 tows that caught it: one tow held TWO anchovy-larva records. found-in counts samples
// (n_found), never records (n)
describe("a tow with two records of the taxon: found-in counts the tow once", () => {
  beforeAll(() => {
    db.exec(`CREATE OR REPLACE TABLE obs2 AS SELECT * FROM obs`);
    db.exec(`INSERT INTO obs2 SELECT 4, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m,
      depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok, tow_type, std_haul_factor, prop_sorted,
      volume_sampled_m3, 2.0, density_per_1000m3, effort_class, hex7 FROM obs WHERE obs_id = 1`);
    db.exec(render("slice_bio", { src: "obs2", taxon: ANCHOVY }));
  });
  it("count.sql: 2 records, both in tow R1 — found in 1 of 3 samples", () => {
    expect(db.exec(render("count", P))[0]).toEqual({ n: 2, n_samples: 3, n_found: 1 });
  });
  it("region.sql: OCS-P 0562 holds 2 records in 1 of its 2 tows", () => {
    const r = db.exec(render("region", { ...P, layer: "wind", spatial_src: "sp" })).find((x) => x.spatial_name === "OCS-P 0562")!;
    expect(r).toMatchObject({ n: 2, n_samples: 2, n_found: 1 });
  });
});

// regression (2026-11-11): count.sql's n_found was first written FILTER (WHERE …), and the three callers that read this
// template's filter as "everything after its first WHERE" (reproduce.ts whereSql — the downloads —, App.tsx's empty-state
// tow count and the added variable) got "obs_id IS NOT NULL) AS n_found FROM slice WHERE …": a syntax error
describe("count.sql: the filter after its first WHERE is the whole filter", () => {
  it("runs on its own", () => {
    const s = render("count", P), where = s.slice(s.indexOf("WHERE") + 5).trim();
    expect(where.startsWith("qual_ok")).toBe(true);
    expect(() => db.exec(`SELECT count(*) AS n FROM slice WHERE ${where}`)).not.toThrow();
  });
});

// one map shape over two data regions: the popup pools the mean by n_rows (the rows each region averaged)
describe("region.sql: n_rows, for pooling a mean across regions", () => {
  it("n_rows counts every averaged row, zero-filled ones included", () => {
    const rs = db.exec(render("region", { ...P, layer: "wind", spatial_src: "sp" }));
    const a = rs.find((x) => x.spatial_name === "OCS-P 0562")!, b = rs.find((x) => x.spatial_name === "OCS-P 0561")!;
    expect([a.n_rows, b.n_rows]).toEqual([3, 1]);
    const pooled = (a.mean * a.n_rows + b.mean * b.n_rows) / (a.n_rows + b.n_rows);
    const all = db.exec(`SELECT avg(density_per_10m2) AS m FROM slice JOIN sp USING (root_id) WHERE layer = 'wind'`)[0].m;
    expect(pooled).toBeCloseTo(all, 9);
  });
});

// zeros per net (Betty 2026-11-11): a station visit (root_id) can hold several nets (sample_key). Each net gets a larva 0
// only if it recorded larvae of some taxon (it was sorted for larvae); an egg-only net gets none
describe("slice_bio.sql: zeros per net", () => {
  let d: Duck;
  const mk = (rows: string) => `SELECT * FROM (VALUES ${rows}) t(obs_id, dataset_key, root_id, sample_key, grid_key, site_key, cruise_key, latitude, longitude,
    datetime, year, quarter, depth_min_m, depth_max_m, depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok,
    tow_type, std_haul_factor, prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7)`;
  const r = (id: number, root: number, net: string, taxon: string, stage: string, v: number, tow = "CB") =>
    `(${id}::BIGINT, 'ichthyo', ${root}, '${net}', 'ln80st60', '080.0 060.0', '2010-04-RL', 34.0, -121.0, TIMESTAMP '2010-04-02', 2010::SMALLINT, 2::TINYINT,
      0.0, 210.0, NULL::INTEGER, '${taxon}', '${stage}', 'abundance', 'count', ${v}::DOUBLE, NULL::VARCHAR, TRUE, '${tow}', 1.0::DOUBLE, 1.0::DOUBLE,
      300.0::DOUBLE, ${v}::DOUBLE, ${v}::DOUBLE, 'count_with_effort', NULL::UBIGINT)`;
  beforeAll(async () => {
    d = await openDuck();
    // visit 1: net A caught anchovy (10), net B caught sardine larvae only, net C (PV) recorded eggs only
    // visit 2: one net, sardine larvae only
    d.exec(`CREATE TABLE src AS ${mk([r(1, 1, "A", ANCHOVY, "larva", 10), r(2, 1, "B", SARDINE, "larva", 5), r(3, 1, "C", SARDINE, "egg", 4, "PV"), r(4, 2, "D", SARDINE, "larva", 2)].join(", "))}`);
  });
  afterAll(() => d.close());
  const larva = () => d.exec(`SELECT root_id, obs_id, density_per_10m2 AS v FROM slice WHERE life_stage = 'larva' ORDER BY root_id, obs_id NULLS LAST`);
  it("per net: the empty net B is a 0, the egg-only net C is not, the one-net visit 2 is a 0", () => {
    d.exec(render("slice_bio", { src: "src", taxon: ANCHOVY, net_key: "sample_key" }));
    expect(larva()).toEqual([{ root_id: 1, obs_id: 1, v: 10 }, { root_id: 1, obs_id: null, v: 0 }, { root_id: 2, obs_id: null, v: 0 }]);
    expect(d.exec(render("count", P))[0]).toEqual({ n: 1, n_samples: 2, n_found: 1 });
  });
  it("per visit (a release without sample_key): visit 1 has its catch and no 0, visit 2 a 0", () => {
    d.exec(render("slice_bio", { src: "src", taxon: ANCHOVY }));
    expect(larva()).toEqual([{ root_id: 1, obs_id: 1, v: 10 }, { root_id: 2, obs_id: null, v: 0 }]);
  });
});
