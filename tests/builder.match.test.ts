// HOW A NET IS MATCHED TO A CAST (src/builder/query.ts netSql; Ben, 2026-11-17: "a time, xy distance, z depth filter for
// matching, and preference for matching by time vs distance, and the calculation included in each row"). One small
// fixture, one assertion per rule: under Stations › Every sample a table that holds a species is one row per net, and
// each water dataset gives the row ONE cast, the best inside a time window and a distance window measured on the
// samples' own times and positions.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { builderSql, cleanupSql, depthTo, kmSql, matchColumns, matchOf, netRows, stepsIn, waters, MATCH_COLS, MATCH_DEFAULT, MATCH_DEPTH, MATCH_MAX, NET_COLS, type Ctx, type Item, type Spec } from "../src/builder/query";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
const ANCHOVY = "worms:217452", SARDINE = "worms:126422";
const COLS = `obs_id, dataset_key, root_id, grid_key, site_key, cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m,
      depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok, tow_type, std_haul_factor, prop_sorted,
      volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7`;
const NUM = ["value", "std_haul_factor", "prop_sorted", "volume_sampled_m3", "density_per_10m2", "density_per_1000m3", "depth_min_m", "depth_max_m", "latitude", "longitude"];
// a net: the tow as the release ships it (0–210 m, depth_bin 0), one larva record of `taxon`
const net = (id: number, root: number, grid: string, site: string, lat: number, lon: number, t: string, taxon: string, d: number, tow = "CB") =>
  `(${id}, 'ichthyo', ${root}, '${grid}', '${site}', '2019-04-RL', ${lat}, ${lon}, TIMESTAMP '${t}', 2019, 2, 0.0, 210.0, 0, '${taxon}', 'larva', 'abundance', 'count', 2.0, NULL, TRUE, '${tow}', 3.905, 1.0, 300.0, ${d}, 6.5, 'count_with_effort', NULL)`;
// one water value of a cast (root) at one depth
const val = (id: number, ds: string, root: number, site: string, lat: number, lon: number, t: string, depth: number, v: number, ok = true, cruise = "2019-04-RL") =>
  `(${id}, '${ds}', ${root}, 'ln80st60', '${site}', '${cruise}', ${lat}, ${lon}, TIMESTAMP '${t}', 2019, 2, ${depth}, ${depth}, ${Math.floor(depth / 10) * 10}, NULL, NULL, 'x', 'u', ${v}, NULL, ${ok ? "TRUE" : "FALSE"}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`;

beforeAll(async () => {
  db = await openDuck();
  // THE NETS (1° of latitude = 111.195 km)
  //   net 1  34.0 N 121.0 W, 10 Apr 12:00  caught anchovy
  //   net 2  the same station visit, 12:20 caught sardine only (a second net of the visit: anchovy zero-filled)
  //   net 3  32.0 N 120.0 W, 12 Apr 06:00  no bottle cast anywhere near; one CTD cast 1.5 h AFTER it
  //   net 5  33.0 N 119.0 W, 14 Apr 00:30  its bottle cast was at 23:15 the evening before (another UTC date) and is filed
  //          under station 090.0 071.0 while the net's grid cell is line 90 station 70
  db.exec(`CREATE TABLE m_obs AS SELECT * FROM (VALUES
    ${net(1, 1, "ln80st60", "080.0 060.0", 34.0, -121.0, "2019-04-10 12:00:00", ANCHOVY, 7.81)},
    ${net(2, 2, "ln80st60", "080.0 060.0", 34.0, -121.0, "2019-04-10 12:20:00", SARDINE, 15.0, "MT")},
    ${net(3, 3, "ln90st90", "090.0 090.0", 32.0, -120.0, "2019-04-12 06:00:00", SARDINE, 3.0)},
    ${net(5, 5, "ln90st70", "090.0 070.0", 33.0, -119.0, "2019-04-14 00:30:00", ANCHOVY, 1.0)}
  ) t(${COLS})`);
  // THE CASTS around nets 1 and 2 (bottle)
  //   cast 10  11:00 (−1 h from net 1), 3.34 km north   NEARER IN TIME      0 m 14.0 · 5 m 13.0 · 9 m 99 (flagged) · 10 m 12.0 · 20 m 10.0
  //   cast 11  09:00 (−3 h),            0.46 km west    NEARER IN DISTANCE  0 m 15.0
  //   cast 12  12:30 (+0.5 h),          6.67 km north   just outside 5 km   0 m 20.0
  //   cast 13  01:00 next day (+13 h),  0 km            just outside 12 h   0 m 21.0
  //   cast 17  11:50 (−0.17 h),         0 km            only a 50 m value   50 m 9.0
  //   cast 15  13 Apr 23:15, 33.0 N 119.0 W             net 5's cast        0 m 16.0
  db.exec(`CREATE TABLE m_temperature AS SELECT * EXCLUDE (measurement_type) FROM (VALUES
    ${val(100, "bottle", 10, "080.0 060.0", 34.03, -121.0, "2019-04-10 11:00:00", 0, 14.0)},
    ${val(101, "bottle", 10, "080.0 060.0", 34.03, -121.0, "2019-04-10 11:00:00", 5, 13.0)},
    ${val(102, "bottle", 10, "080.0 060.0", 34.03, -121.0, "2019-04-10 11:00:00", 9, 99.0, false)},
    ${val(103, "bottle", 10, "080.0 060.0", 34.03, -121.0, "2019-04-10 11:00:00", 10, 12.0)},
    ${val(104, "bottle", 10, "080.0 060.0", 34.03, -121.0, "2019-04-10 11:00:00", 20, 10.0)},
    ${val(110, "bottle", 11, "080.0 060.0", 34.0, -121.005, "2019-04-10 09:00:00", 0, 15.0)},
    ${val(120, "bottle", 12, "080.0 059.0", 34.06, -121.0, "2019-04-10 12:30:00", 0, 20.0)},
    ${val(130, "bottle", 13, "080.0 060.0", 34.0, -121.0, "2019-04-11 01:00:00", 0, 21.0)},
    ${val(170, "bottle", 17, "080.0 060.0", 34.0, -121.0, "2019-04-10 11:50:00", 50, 9.0)},
    ${val(150, "bottle", 15, "090.0 071.0", 33.0, -119.0, "2019-04-13 23:15:00", 0, 16.0, true, "2019-04-OTHER")},
    ${/* a CTD cast is one root with a time and a position PER DEPTH (the ship drifts): cast 20 beside nets 1 and 2, cast 21 after net 3 */ ""}
    ${val(200, "ctd", 20, "080.0 060.0", 34.0, -121.0, "2019-04-10 11:30:00", 2, 14.4)},
    ${val(201, "ctd", 20, "080.0 060.0", 34.0002, -121.0, "2019-04-10 11:30:20", 8, 14.2)},
    ${val(210, "ctd", 21, "090.0 090.0", 32.0, -120.0, "2019-04-12 07:30:00", 3, 17.0)}
  ) t(${COLS})`);
  // salinity: a second measurement of the same bottle casts
  db.exec(`CREATE TABLE m_salinity AS SELECT * EXCLUDE (measurement_type) FROM (VALUES
    ${val(300, "bottle", 10, "080.0 060.0", 34.03, -121.0, "2019-04-10 11:00:00", 0, 33.5)},
    ${val(310, "bottle", 11, "080.0 060.0", 34.0, -121.005, "2019-04-10 09:00:00", 0, 33.9)}
  ) t(${COLS})`);
  for (const t of ["m_obs", "m_temperature", "m_salinity"]) for (const c of NUM) db.exec(`ALTER TABLE ${t} ALTER ${c} TYPE DOUBLE`);
});
afterAll(() => db.close());

const ctx: Ctx = { bioSrc: "m_obs", envSrc: (ms) => `(${ms.map((m) => `SELECT *, '${m}' AS measurement_type FROM m_${m}`).join(" UNION ALL ")})`, spatialSrc: "sp" };
const NET: Item = { realm: "bio", taxon: ANCHOVY, label: "Northern Anchovy", dataset: "ichthyo", tag: "Ichthyo" };
const TEMP: Item = { realm: "env", key: "temperature", label: "Temperature", members: ["temperature"], dataset: "bottle", tag: "Bottle" };
const SAL: Item = { realm: "env", key: "salinity", label: "Salinity", members: ["salinity"], dataset: "bottle", tag: "Bottle" };
const CTD: Item = { realm: "env", key: "temperature", label: "Temperature", members: ["temperature"], dataset: "ctd", tag: "CTD" };
const BASE: Spec = {
  picks: [NET, TEMP], lens: "station", place: "station", hexRes: 7, layer: null, regionNames: null, area: "TRUE",
  years: [1949, 2026], seasons: null, depth: MATCH_DEPTH, time: "sample", depthBy: "10", stat: "avg",
  stages: ["larva"], den: "density_per_10m2", zeros: true, qualOnly: true, datasets: null,
};
const run = (spec: Spec) => {
  const s = builderSql(spec, ctx); s.slice(0, -1).forEach((x) => db.exec(x));
  const r = db.exec(s[s.length - 1]); cleanupSql(spec.picks.length).forEach((x) => db.exec(x)); return r;
};
const A = "northern_anchovy_larva_per_10m2_ichthyo", T = "temperature_bottle";
const byNet = (spec: Spec) => new Map(run(spec).map((r) => [r.net_id, r]));

describe("when the table is one row per net", () => {
  it("Stations, per station, every sample, with a species picked — and no other shape", () => {
    expect(netRows(BASE)).toBe(true);
    expect(netRows({ ...BASE, picks: [TEMP] })).toBe(false);           // water alone: the rows are the casts
    expect(netRows({ ...BASE, time: "year" })).toBe(false);
    expect(netRows({ ...BASE, lens: "hex", place: "hex" })).toBe(false);
    expect(netRows({ ...BASE, place: "line" })).toBe(false);
    expect(netRows({ lens: "station", place: "station", time: "sample" })).toBe(false);   // nothing picked yet
  });
  it("the defaults: ± 12 hours, 5 km, nearest in time, water from 0 to 10 m", () => {
    expect(MATCH_DEFAULT).toEqual({ hours: 12, km: 5, prefer: "time" });
    expect(MATCH_DEPTH).toEqual([0, 10]);
    expect(matchOf({})).toEqual(MATCH_DEFAULT);
  });
  it("a window that is not a usable number falls back to the default; a huge one is capped", () => {
    expect(matchOf({ match: { hours: 0, km: NaN, prefer: "time" } })).toEqual(MATCH_DEFAULT);
    expect(matchOf({ match: { hours: 1e6, km: 1e6, prefer: "distance" } })).toEqual({ ...MATCH_MAX, prefer: "distance" });
    expect(matchOf({ match: { hours: 0.5, km: 2, prefer: "nearest" as any } })).toEqual({ hours: 0.5, km: 2, prefer: "time" });
  });
});

describe("one row per net, the net's own columns first", () => {
  it("every net of the species' dataset is a row, in time order; two nets of one station visit are two rows", () => {
    const r = run(BASE);
    expect(r.map((x) => x.net_id)).toEqual(["1", "2", "3", "5"]);
    expect(Object.keys(r[0])).toEqual([...NET_COLS.map((c) => c.col), A, T, ...MATCH_COLS.map((c) => `${c.stem}_bottle`)]);
    expect(r[0]).toMatchObject({ date: "2019-04-10", cruise: "2019-04-RL", line: 80, station: 60, net_time: "2019-04-10 12:00", latitude: 34, longitude: -121, tow_type: "CB" });
    expect(r[1]).toMatchObject({ date: "2019-04-10", line: 80, station: 60, net_time: "2019-04-10 12:20", tow_type: "MT" });
  });
  it("a species column is the net's own value: the catch, or 0 for a net that was sorted and held none", () => {
    const r = run(BASE);
    expect(r.map((x) => x[A])).toEqual([7.81, 0, 0, 1]);
  });
  it("catches only: the nets with no catch of the picked species are left out", () => {
    expect(run({ ...BASE, zeros: false }).map((x) => x.net_id)).toEqual(["1", "5"]);
  });
  it("a species alone (the dataset pages' rows=sample link): still one row per net, and no match columns", () => {
    const r = run({ ...BASE, picks: [NET], depth: [0, 500] });
    expect(r.map((x) => x.net_id)).toEqual(["1", "2", "3", "5"]);
    expect(Object.keys(r[0])).toEqual([...NET_COLS.map((c) => c.col), A]);
  });
  it("water alone: the rows are the casts' values, by station × date × 10 m step, as before", () => {
    const r = run({ ...BASE, picks: [TEMP], depth: [0, 500] });
    expect(Object.keys(r[0])).toEqual(["date", "cruise", "line", "station", "depth_m", T]);
    // station 59: cast 12. Station 60: the mean over two casts of that date, 10 (14, 13) and 11 (15) — the aggregate rule
    expect(r.filter((x) => x.date === "2019-04-10" && x.depth_m === 0).map((x) => [x.station, x[T]])).toEqual([[59, 20], [60, 14]]);
  });
});

describe("the one best cast inside both windows", () => {
  it("prefer time: of two casts inside both windows the nearer in time is taken, though the other is nearer in distance", () => {
    const r = byNet(BASE).get("1")!;
    expect(r.cast_id_bottle).toBe("10");
    expect(r[T]).toBe(13.5);                       // cast 10 alone: (14 + 13) / 2 — never a mean with cast 11's 15
  });
  it("prefer distance: the nearer in distance is taken", () => {
    const r = byNet({ ...BASE, match: { ...MATCH_DEFAULT, prefer: "distance" } }).get("1")!;
    expect(r.cast_id_bottle).toBe("11");
    expect(r[T]).toBe(15);
  });
  it("a cast just outside the distance window is not taken, however near in time: 6.67 km at 6.6 km, taken at 6.7 km", () => {
    expect(byNet({ ...BASE, match: { hours: 12, km: 6.6, prefer: "time" } }).get("1")!.cast_id_bottle).toBe("10");
    expect(byNet({ ...BASE, match: { hours: 12, km: 6.7, prefer: "time" } }).get("1")!.cast_id_bottle).toBe("12");   // +0.5 h beats −1 h
  });
  it("a cast just outside the time window is not taken, however near in distance: 13 h at 12.9 h, taken at 13 h", () => {
    expect(byNet({ ...BASE, match: { hours: 12.9, km: 5, prefer: "distance" } }).get("1")!.cast_id_bottle).toBe("11");
    expect(byNet({ ...BASE, match: { hours: 13, km: 5, prefer: "distance" } }).get("1")!.cast_id_bottle).toBe("13");  // 0 km beats 0.46 km
  });
  it("the preferred measure decides and the other only breaks a tie: narrowing to 1 h leaves the one cast inside", () => {
    expect(byNet({ ...BASE, match: { hours: 1, km: 5, prefer: "distance" } }).get("1")!.cast_id_bottle).toBe("10");
  });
  it("two nets of one visit each keep their row and share the cast", () => {
    const m = byNet(BASE);
    expect([m.get("1")!.cast_id_bottle, m.get("2")!.cast_id_bottle]).toEqual(["10", "10"]);
    expect([m.get("1")![T], m.get("2")![T]]).toEqual([13.5, 13.5]);
  });
  it("a net with no cast inside the windows keeps its row, the water and the match columns blank", () => {
    const r = byNet(BASE).get("3")!;
    expect(r[A]).toBe(0);
    for (const c of [T, ...MATCH_COLS.map((x) => `${x.stem}_bottle`)]) expect(r[c]).toBeNull();
  });
  it("REGRESSION: a cast on the other side of 00:00 UTC, on another cruise key and under another station number, still pairs", () => {
    // as built until 2026-11-17 rows were keyed by cruise × station × UTC date: on release v2026.11.14 5% of the sardine
    // nets lost their bottle temperature to the date and 3% to grid cell versus station number
    const r = byNet(BASE).get("5")!;
    expect(r).toMatchObject({ date: "2019-04-14", line: 90, station: 70, cast_id_bottle: "15", cast_time_bottle: "2019-04-13 23:15", cast_station_bottle: "090.0 071.0", cast_hours_bottle: -1.25, cast_km_bottle: 0 });
    expect(r[T]).toBe(16);
  });
});

describe("the calculation in each row", () => {
  it("which cast and how far: its id, time and station, hours (cast minus net) and km", () => {
    const r = byNet(BASE).get("1")!;
    expect(r).toMatchObject({ cast_id_bottle: "10", cast_time_bottle: "2019-04-10 11:00", cast_station_bottle: "080.0 060.0", cast_hours_bottle: -1, cast_km_bottle: 3.34 });
  });
  it("the time difference is signed: negative when the cast came first, positive when it came after the net", () => {
    const r = byNet({ ...BASE, picks: [NET, CTD] });
    expect(r.get("1")!.cast_hours_ctd).toBe(-0.5);
    expect(r.get("2")!.cast_hours_ctd).toBe(-0.83);     // 11:30 − 12:20
    expect(r.get("3")!.cast_hours_ctd).toBe(1.5);       // 07:30 − 06:00
  });
  it("the distance is the great circle between the two positions", () => {
    const km = (a: number, b: number, c: number, d: number) => db.exec(`SELECT ${kmSql(String(a), String(b), String(c), String(d))} AS km`)[0].km;
    expect(km(34, -121, 34.03, -121)).toBeCloseTo(3.336, 3);              // 0.03° of latitude
    expect(km(34, -121, 34, -121.005)).toBeCloseTo(0.461, 3);             // 0.005° of longitude at 34° N
    expect(km(0, 0, 0, 180)).toBeCloseTo(Math.PI * 6371.0088, 6);         // half the globe: no NaN at the antipode
    expect(km(34, -121, 34, -121)).toBe(0);
  });
  it("the depths the value is taken over, and how many: of the matched cast, inside the range, quality-checked", () => {
    const r = byNet(BASE).get("1")!;
    expect(r).toMatchObject({ cast_depth_min_m_bottle: 0, cast_depth_max_m_bottle: 5, cast_n_depths_bottle: 2 });   // 0 m and 5 m; the flagged 9 m is not used
    const all = byNet({ ...BASE, qualOnly: false }).get("1")!;
    expect(all).toMatchObject({ cast_depth_max_m_bottle: 9, cast_n_depths_bottle: 3 });
    expect(all[T]).toBe((14 + 13 + 99) / 3);
  });
  it("a cast with one time and position per depth (CTD) is one cast: its first time, its mean position", () => {
    const r = byNet({ ...BASE, picks: [NET, CTD] }).get("1")!;
    expect(r).toMatchObject({ cast_id_ctd: "20", cast_time_ctd: "2019-04-10 11:30", cast_hours_ctd: -0.5, cast_km_ctd: 0.01, cast_depth_min_m_ctd: 2, cast_depth_max_m_ctd: 8, cast_n_depths_ctd: 2 });
    expect(r.temperature_ctd).toBeCloseTo(14.3, 9);
  });
});

describe("the depth range is the water's", () => {
  it("0 to 10 m is the first 10 m step only (it pooled 0–20 m while the last step was included)", () => {
    expect(depthTo({ depth: [0, 10] })).toBe(10); expect(stepsIn({ depth: [0, 10] })).toBe(1);
    expect(byNet(BASE).get("1")![T]).toBe(13.5);                                    // 14 and 13; not the 12 at 10 m
  });
  it("0 to 20 m takes the two steps; 10 to 20 m the second alone", () => {
    expect(byNet({ ...BASE, depth: [0, 20] }).get("1")![T]).toBe(13);                // 14, 13, 12
    expect(byNet({ ...BASE, depth: [10, 20] }).get("1")).toMatchObject({ [T]: 12, cast_depth_min_m_bottle: 10, cast_depth_max_m_bottle: 10, cast_n_depths_bottle: 1 });
  });
  it("only a cast with a value in the range is a candidate: at 50 to 60 m the nearest cast is the one that reached it", () => {
    expect(byNet(BASE).get("1")!.cast_id_bottle).toBe("10");                        // cast 17 is nearer in time but has no 0–10 m value
    expect(byNet({ ...BASE, depth: [50, 60] }).get("1")).toMatchObject({ cast_id_bottle: "17", [T]: 9, cast_hours_bottle: -0.17 });
  });
  it("it does not filter the nets: a range below every tow still lists every net", () => {
    expect(run({ ...BASE, depth: [300, 500] }).map((x) => x.net_id)).toEqual(["1", "2", "3", "5"]);
  });
  it("a range no wider than a step is the step that starts at its top", () => {
    expect(depthTo({ depth: [20, 20] })).toBe(30); expect(depthTo({ depth: [20, 5] })).toBe(30);
    expect(byNet({ ...BASE, depth: [20, 20] }).get("1")![T]).toBe(10);
  });
});

describe("several water columns", () => {
  it("two measurements of one dataset come from the one cast and share one set of match columns", () => {
    const spec = { ...BASE, picks: [NET, TEMP, SAL] }, r = byNet(spec).get("1")!;
    expect(waters(spec.picks)).toHaveLength(1);
    expect(Object.keys(r)).toEqual([...NET_COLS.map((c) => c.col), A, T, "salinity_bottle", ...matchColumns(waters(spec.picks)[0]).map((c) => c.col)]);
    expect(r).toMatchObject({ cast_id_bottle: "10", [T]: 13.5, salinity_bottle: 33.5 });
    const d = byNet({ ...spec, match: { ...MATCH_DEFAULT, prefer: "distance" } }).get("1")!;
    expect(d).toMatchObject({ cast_id_bottle: "11", [T]: 15, salinity_bottle: 33.9 });   // both from cast 11, never one from each
  });
  it("two water datasets are each matched on their own, each with its own match columns after its measurements", () => {
    const spec = { ...BASE, picks: [NET, TEMP, CTD] }, m = byNet(spec);
    expect(waters(spec.picks).map((w) => [w.name, w.sfx])).toEqual([["Bottle", "_bottle"], ["CTD", "_ctd"]]);
    expect(Object.keys(m.get("1")!)).toEqual([...NET_COLS.map((c) => c.col), A, T, ...MATCH_COLS.map((c) => `${c.stem}_bottle`), "temperature_ctd", ...MATCH_COLS.map((c) => `${c.stem}_ctd`)]);
    expect(m.get("1")).toMatchObject({ cast_id_bottle: "10", cast_hours_bottle: -1, cast_id_ctd: "20", cast_hours_ctd: -0.5 });
    expect(m.get("3")).toMatchObject({ cast_id_bottle: null, [T]: null, cast_id_ctd: "21", temperature_ctd: 17 });   // a bottle miss does not blank the CTD
    expect(m.get("5")).toMatchObject({ cast_id_bottle: "15", cast_id_ctd: null, temperature_ctd: null });
  });
  it("the years and the season choose the nets, not the casts", () => {
    // every net here is in 2019; the casts' own year column is never asked
    expect(run({ ...BASE, years: [2019, 2019] }).map((x) => x.cast_id_bottle)).toEqual(["10", "10", null, "15"]);
    expect(run({ ...BASE, years: [2020, 2026] })).toHaveLength(0);
  });
});
