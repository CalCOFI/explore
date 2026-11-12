// the When step's cruise box (Ben 2026-11-10: "line 93.3 from cruise 202504"): cruises picked by cruise_key filter, through the shared filter every lens and every download reads
import { afterAll, beforeAll, expect, it } from "vitest";
import { cruiseFilterSql, render, datasetFilterSql } from "../src/sqltpl";
import { openDuck, type Duck } from "./helpers/duck";

let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  db.exec(`CREATE TABLE slice AS SELECT * FROM (VALUES
    (1, 1, '2025-04-33RL', 2025::SMALLINT, 4::TINYINT, 2::TINYINT, 10, 1.0::DOUBLE, TRUE),
    (2, 2, '2025-04-33RL', 2025::SMALLINT, 4::TINYINT, 2::TINYINT, 10, 2.0::DOUBLE, TRUE),
    (3, 3, '2019-01-33RL', 2019::SMALLINT, 1::TINYINT, 1::TINYINT, 10, 3.0::DOUBLE, TRUE),
    (4, 4, '2024-07-33RL', 2024::SMALLINT, 7::TINYINT, 3::TINYINT, 10, 4.0::DOUBLE, TRUE)
  ) t(obs_id, root_id, cruise_key, year, cruise_month, quarter, depth_bin, value, qual_ok)`);
  db.exec("ALTER TABLE slice ADD COLUMN datetime TIMESTAMP; ALTER TABLE slice ADD COLUMN life_stage VARCHAR; ALTER TABLE slice ADD COLUMN dataset_key VARCHAR");
});
afterAll(() => db.close());

const count = (cruises: string[] | null) => Number(db.exec(render("count", {
  val: "value", ym0: 194901, ym1: 202612, quarter_filter: "TRUE", d0: 0, d1: 500, stage: null, zeros: true,
  dataset_filter: datasetFilterSql(null), cruise_filter: cruiseFilterSql(cruises),
}))[0].n);

it("no cruise typed = every cruise", () => { expect(cruiseFilterSql(null)).toBe("TRUE"); expect(count(null)).toBe(4); });
it("one cruise keeps only its rows", () => expect(count(["2025-04-33RL"])).toBe(2));
it("several cruises add up", () => expect(count(["2025-04-33RL", "2019-01-33RL"])).toBe(3));
it("a cruise with no data gives nothing", () => expect(count(["1990-01-33RL"])).toBe(0));
