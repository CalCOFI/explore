// the Time strip's SQL (explore#21, #23): mean ± se by season, the se across STATION means, and the cruise seasons the
// gap marks read — run in duckdb-wasm against a small slice, one fixture per rule
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "../src/sqltpl";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // 1998 Q1: station a has three bottles (10, 10, 10), station b one (20); 1998 Q3: station a one (30). A row with no
  // grid_key is its own 0.1° station.
  db.exec(`CREATE TABLE slice AS SELECT * FROM (VALUES
    (1, 1, 'a', '1998-01-RL', 33.0, -118.0, TIMESTAMP '1998-01-10', 1998, 1, 10.0),
    (2, 1, 'a', '1998-01-RL', 33.0, -118.0, TIMESTAMP '1998-01-10', 1998, 1, 10.0),
    (3, 1, 'a', '1998-01-RL', 33.0, -118.0, TIMESTAMP '1998-01-10', 1998, 1, 10.0),
    (4, 2, 'b', '1998-01-RL', 34.0, -120.0, TIMESTAMP '1998-01-12', 1998, 1, 20.0),
    (5, 3, 'a', '1998-07-RL', 33.0, -118.0, TIMESTAMP '1998-07-10', 1998, 3, 30.0),
    (6, 4, NULL, '1998-07-RL', 30.04, -125.01, TIMESTAMP '1998-07-11', 1998, 3, 50.0)
  ) t(obs_id, root_id, grid_key, cruise_key, latitude, longitude, datetime, year, quarter, value)`);
  for (const c of ["qual_ok BOOLEAN DEFAULT TRUE", "depth_bin INTEGER DEFAULT 10", "life_stage VARCHAR", "dataset_key VARCHAR DEFAULT 'calcofi_bottle'"]) db.exec(`ALTER TABLE slice ADD COLUMN ${c}`);
  db.exec(`CREATE TABLE cruise AS SELECT * FROM (VALUES ('1998-01-RL'), ('1998-07-RL'), ('1998-11-NH'), ('2022-04-3322'), ('bad-key')) t(cruise_key)`);
});
afterAll(() => db.close());

const P = { val: "value", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: null, dataset_filter: "TRUE", zeros: true };
const years = (bin: string) => db.exec(render("years", { ...P, bin }));

describe("years.sql — mean ± se across station means", () => {
  it("by season: two points in 1998, at Q1 and Q3's midpoints", () => expect(years("year::INTEGER + (quarter - 0.5) / 4.0").map((r) => r.year)).toEqual([1998.125, 1998.625]));
  it("the mean is over stations, not bottles (Q1: (10 + 20) / 2, not 12.5)", () => expect(years("year::INTEGER + (quarter - 0.5) / 4.0")[0]).toMatchObject({ n: 4, n_samples: 2, n_stations: 2, n_cruises: 1, mean: 15 }));
  it("the se is sd(station means) / √stations", () => expect(years("year::INTEGER + (quarter - 0.5) / 4.0")[0].se).toBeCloseTo(Math.sqrt(50) / Math.sqrt(2), 9));
  it("a cast off the grid is its own station", () => expect(years("year::INTEGER + (quarter - 0.5) / 4.0")[1]).toMatchObject({ n_stations: 2, mean: 40 }));
  it("by year: one point, four stations' worth of means pooled by station", () => expect(years("year")).toEqual([expect.objectContaining({ year: 1998, n: 6, n_stations: 3, n_cruises: 2 })]));
});

describe("cruise_seasons.sql — every cruise season, from the cruise_key", () => {
  it("year and quarter from YYYY-MM, a malformed key skipped", () => expect(db.exec(render("cruise_seasons", { src: "cruise" }))).toEqual([
    { year: 1998, quarter: 1, cruises: "1998-01-RL" }, { year: 1998, quarter: 3, cruises: "1998-07-RL" }, { year: 1998, quarter: 4, cruises: "1998-11-NH" }, { year: 2022, quarter: 2, cruises: "2022-04-3322" }]));
});
