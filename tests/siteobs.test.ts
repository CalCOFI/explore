// the Observations layer's click card (`obs=`, Ben 2026-11-16: "does not allow an observation to be clicked to see what
// species was observed when") and the Station card's datasets ("unintelligible and unrelated to the given dataset").
// sql/site_obs.sql runs in the engine the browser ships against a sightings fixture; src/siteobs.ts turns its rows into the
// card. One small fixture per rule.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "../src/sqltpl";
import { groupSiteObs, pacificTime, stationDatasets, taxonLabel, utcTime, type SiteObsRow } from "../src/siteobs";
import { openDuck, type Duck } from "./helpers/duck";

const DS = "sio_cetacean-sightings", CET = "worms:2688", HUMP = "worms:137092", DD = "worms:137094";
let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // the sightings record a sighting only of what was seen (no zero rows), so slice_bio.sql zero-fills each sighting
  // (sample_key) for the pick: s1 a humpback and s2 an unidentified cetacean share one 0.01° site; s3 common dolphins
  // elsewhere, s4 a humpback at s1's site but in 2010, outside a 2020s window
  db.exec(`CREATE TABLE obs AS SELECT * FROM (VALUES
    (1, '${DS}', 1, '${DS}:sighting:1', 'st60-ln90', NULL, '2022-07-32SH', 32.551, -119.741, TIMESTAMP '2022-07-18 20:06:00', 2022, 3, NULL, NULL, NULL, '${HUMP}', NULL, 'group_size', 'count', 3.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 'count', NULL),
    (2, '${DS}', 2, '${DS}:sighting:2', 'st60-ln90', NULL, '2022-07-32SH', 32.549, -119.738, TIMESTAMP '2022-07-19 01:00:00', 2022, 3, NULL, NULL, NULL, '${CET}', NULL, 'group_size', 'count', 1.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 'count', NULL),
    (3, '${DS}', 3, '${DS}:sighting:3', 'st70-ln90', NULL, '2022-07-32SH', 31.200, -121.000, TIMESTAMP '2022-07-20 18:00:00', 2022, 3, NULL, NULL, NULL, '${DD}', NULL, 'group_size', 'count', 250.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 'count', NULL),
    (4, '${DS}', 4, '${DS}:sighting:4', 'st60-ln90', NULL, '2010-07-32OS', 32.552, -119.742, TIMESTAMP '2010-07-15 18:00:00', 2010, 3, NULL, NULL, NULL, '${HUMP}', NULL, 'group_size', 'count', 2.0, NULL, TRUE, NULL, NULL, NULL, NULL, NULL, NULL, 'count', NULL)
  ) t(obs_id, dataset_key, root_id, sample_key, grid_key, site_key, cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m,
      depth_max_m, depth_bin, taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok, tow_type, std_haul_factor,
      prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7)`);
  for (const c of ["latitude", "longitude", "value", "std_haul_factor", "prop_sorted", "volume_sampled_m3", "density_per_10m2", "density_per_1000m3", "depth_min_m", "depth_max_m"]) db.exec(`ALTER TABLE obs ALTER ${c} TYPE DOUBLE`);
  db.exec("ALTER TABLE obs ALTER depth_bin TYPE INTEGER");
  db.exec(render("slice_bio", { src: "obs", taxon: CET, net_key: "sample_key" }));
});
afterAll(() => db.close());

// the filters as App.tsx's params carry them for a raw-count species: every year, all seasons, zeros counted
const P = { val: "value", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: null, dataset_filter: "TRUE", zeros: true };
const site = (lon: number, lat: number, over: Record<string, any> = {}) =>
  db.exec(render("site_obs", { ...P, lon, lat, limit: 200, src: "obs", taxon: CET, net_key: "sample_key", ...over })) as SiteObsRow[];

describe("site_obs.sql — what was recorded at one dot, whatever the pick", () => {
  it("the dot is contour_cast.sql's 0.01° point: the same rounding finds it", () => {
    const dots = db.exec(render("contour_cast", P));
    expect(dots.map((d) => [d.longitude, d.latitude]).sort()).toEqual([[-119.74, 32.55], [-121, 31.2]].sort());
  });
  it("a Cetacea dot names the humpback its zero row stands for, and the cetacean itself, in time order", () => {
    const r = site(-119.74, 32.55);
    expect(r.map((x) => [x.sample_id, x.taxon_key, x.value, x.in_slice])).toEqual([
      [`${DS}:sighting:4`, HUMP, 2, false], [`${DS}:sighting:1`, HUMP, 3, false], [`${DS}:sighting:2`, CET, 1, true]]);
  });
  it("the selection's own filters hold: a 2020s window drops the 2010 sighting", () => {
    expect(site(-119.74, 32.55, { ym0: 202001 }).map((x) => x.sample_id)).toEqual([`${DS}:sighting:1`, `${DS}:sighting:2`]);
  });
  it("positive only (zeros off) keeps the pick's own sighting and drops the zero-filled ones", () => {
    expect(site(-119.74, 32.55, { zeros: false }).map((x) => x.taxon_key)).toEqual([CET]);
  });
  it("another site is another dot: nothing from s1–s4 leaks into the common dolphins'", () => {
    expect(site(-121, 31.2).map((x) => [x.sample_id, x.taxon_key])).toEqual([[`${DS}:sighting:3`, DD]]);
  });
  it("the dataset filter is honoured", () => { expect(site(-119.74, 32.55, { dataset_filter: "dataset_key IN ('other_ds')" })).toEqual([]); });
  it("the limit caps the rows", () => { expect(site(-119.74, 32.55, { limit: 1 })).toHaveLength(1); });
});

describe("groupSiteObs — one entry per sample, its records under it", () => {
  const rows: SiteObsRow[] = [
    { dataset_key: DS, sample_id: "a", cruise_key: "2022-07-32SH", t: 1658174760, taxon_key: HUMP, measurement_type: "group_size", units: "count", value: 3, in_slice: false },
    { dataset_key: DS, sample_id: "b", cruise_key: "2022-07-32SH", t: 1658192400, taxon_key: CET, measurement_type: "group_size", units: "count", value: 1, in_slice: true },
    { dataset_key: DS, sample_id: "b", cruise_key: "2022-07-32SH", t: 1658192400, taxon_key: DD, life_stage: "adult", measurement_type: "group_size", units: "count", value: 9, in_slice: false },
  ];
  const g = groupSiteObs(rows, (k) => ({ [HUMP]: "Humpback Whale", [CET]: "Cetacea", [DD]: "Short-beaked common dolphin" }[k] ?? k));
  it("keeps the SQL's order of samples", () => expect(g.map((s) => s.sample_id)).toEqual(["a", "b"]));
  it("puts each record under its sample, the life stage beside the name", () => expect(g[1].items.map((i) => i.label)).toEqual(["Cetacea", "Short-beaked common dolphin (adult)"]));
  it("marks the pick's own record", () => expect(g[1].items.map((i) => i.in_slice)).toEqual([true, false]));
  it("a water row (no taxon) is labelled by its depth bin", () => {
    const w = groupSiteObs([{ dataset_key: "calcofi_bottle", sample_id: "9", cruise_key: null, t: 0, depth_bin: 10, measurement_type: "temperature", units: "°C", value: 14.2 }], (k) => k);
    expect(w[0].items[0]).toMatchObject({ label: "10 m", value: 14.2, units: "°C" });
  });
});

describe("the card's words", () => {
  it("a taxon reads common · scientific, else whichever it has, else its key", () => {
    expect(taxonLabel({ scientific_name: "Megaptera novaeangliae", common_name: "Humpback Whale" }, HUMP)).toBe("Humpback Whale · Megaptera novaeangliae");
    expect(taxonLabel({ scientific_name: "Cetacea", common_name: null }, CET)).toBe("Cetacea");
    expect(taxonLabel({ scientific_name: "Cetacea", common_name: "cetacea" }, CET)).toBe("Cetacea");
    expect(taxonLabel(undefined, CET)).toBe(CET);
  });
  it("time is the Pacific clock with its zone: PDT in July, PST in January", () => {
    expect(pacificTime(Date.UTC(2022, 6, 18, 20, 6) / 1000)).toBe("2022-07-18 13:06 PDT");
    expect(pacificTime(Date.UTC(2022, 0, 18, 20, 6) / 1000)).toBe("2022-01-18 12:06 PST");
    expect(pacificTime(null)).toBe("no time");
    expect(utcTime(Date.UTC(2022, 6, 18, 20, 6) / 1000)).toBe("2022-07-18 20:06 UTC");
  });
});

describe("stationDatasets — the Station card lists the view's datasets", () => {
  const ds = [{ dataset_key: "swfsc_ichthyo" }, { dataset_key: DS }, { dataset_key: "calcofi_bottle" }];
  it("a sightings view shows the sightings and names the others", () => {
    expect(stationDatasets(ds, [DS])).toEqual({ shown: [{ dataset_key: DS }], others: ["swfsc_ichthyo", "calcofi_bottle"] });
  });
  it("a view whose dataset never sampled the cell shows none", () => expect(stationDatasets(ds, ["other_ds"]).shown).toEqual([]));
  it("no view known (null or empty) shows every dataset, as before", () => {
    expect(stationDatasets(ds, null).shown).toHaveLength(3);
    expect(stationDatasets(ds, []).others).toEqual([]);
  });
});
