// the preliminary mark (the tour rehearsal, 2026-11-11): cruise 2026-11-33P4 is the ship's preliminary CTD series, which
// ctd-transects badges "Preliminary — CTD & bottle 1 m-binned" and the Explorer showed with no word of it. The status is
// the release's `data_stage`, read from `sample_root` by sql/cruise_stage.sql on a release whose sample_root carries it
// (calcofi4db 4.37.0+) and not read at all on one that does not (v2026.11.09). Both are run here, in the engine the
// browser ships, against a small fixture; src/stage.ts is which views wear the mark, and in which words.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "../src/sqltpl";
import { STAGE_LABELS, cruiseStage, hasStageCols, leastFinal, singleCruise, stageIndex, stageLabel, stageProbeSql, viewStage, type StageRow } from "../src/stage";
import { openDuck, type Duck } from "./helpers/duck";

const CTD = "calcofi_ctd-cast", BTL = "calcofi_bottle";
let db: Duck;
beforeAll(async () => {
  db = await openDuck();
  // `sample_root` as a release with the column writes it: the CTD casts carry a stage, a bottle or a tow of the same cruise
  // key none. Cruise 2021-07-33P4 is the mixed case (no release has one): two casts merged with the bottles, one not yet.
  db.exec(`CREATE TABLE sample_root AS SELECT * FROM (VALUES
    ('${CTD}:cast:1', '${CTD}', '2015-11-32OC', 'final'),
    ('${CTD}:cast:2', '${CTD}', '2015-11-32OC', 'final'),
    ('${BTL}:bottle:1', '${BTL}', '2015-11-32OC', NULL),
    ('${CTD}:cast:3', '${CTD}', '2026-04-3322', 'preliminary_without_bottle'),
    ('${CTD}:cast:4', '${CTD}', '2026-11-33P4', 'preliminary_with_bottle'),
    ('${CTD}:cast:5', '${CTD}', '2026-11-33P4', 'preliminary_with_bottle'),
    ('${CTD}:cast:6', '${CTD}', '2021-07-33P4', 'preliminary_with_bottle'),
    ('${CTD}:cast:7', '${CTD}', '2021-07-33P4', 'preliminary_with_bottle'),
    ('${CTD}:cast:8', '${CTD}', '2021-07-33P4', 'preliminary_without_bottle'),
    ('${CTD}:cast:9', '${CTD}', NULL, 'final'),
    ('swfsc_ichthyo:tow:1', 'swfsc_ichthyo', '2026-11-33P4', NULL)
  ) t(root_sample_key, dataset_key, cruise_key, data_stage)`);
  // sample_root as every release to v2026.11.09 writes it: no data_stage
  db.exec(`CREATE TABLE sample_root_old AS SELECT root_sample_key, dataset_key, cruise_key FROM sample_root`);
});
afterAll(() => db.close());

const stages = (src: string) => db.exec(render("cruise_stage", { src })) as StageRow[];

describe("stageProbeSql — does this release's sample_root carry the stage?", () => {
  const probe = (src: string) => hasStageCols(db.exec(stageProbeSql(src)));
  it("yes where it has data_stage beside cruise_key and dataset_key", () => expect(probe("sample_root")).toBe(true));
  it("no on a release without the column — nothing is read, and no view wears a mark", () => expect(probe("sample_root_old")).toBe(false));
  it("no answer is a no", () => { expect(hasStageCols([])).toBe(false); expect(hasStageCols([{ n: null }])).toBe(false); });
  it("reading the stage where the column is absent would throw: the probe is what keeps the app from asking", () => {
    expect(() => stages("sample_root_old")).toThrow(/data_stage/);
  });
});

describe("cruise_stage.sql — the stage of each cruise's samples, per dataset", () => {
  it("one row per cruise × dataset × stage, only where a stage is written", () => {
    expect(stages("sample_root").map((r) => [r.cruise_key, r.dataset_key, r.data_stage, r.n])).toEqual([
      ["2015-11-32OC", CTD, "final", 2],
      ["2021-07-33P4", CTD, "preliminary_with_bottle", 2],
      ["2021-07-33P4", CTD, "preliminary_without_bottle", 1],
      ["2026-04-3322", CTD, "preliminary_without_bottle", 1],
      ["2026-11-33P4", CTD, "preliminary_with_bottle", 2],
    ]);
  });
  it("a dataset with no stage has no row: the bottles and the net tows of a preliminary cruise key", () => {
    expect(stages("sample_root").filter((r) => r.dataset_key !== CTD)).toEqual([]);
  });
});

describe("stageIndex — the rows as a lookup", () => {
  it("keeps the least final stage of a cruise that carries two", () => {
    const idx = stageIndex(stages("sample_root"));
    expect(idx.get("2021-07-33P4")?.get(CTD)).toBe("preliminary_without_bottle");
    expect(idx.get("2026-11-33P4")?.get(CTD)).toBe("preliminary_with_bottle");
    expect(idx.get("2015-11-32OC")?.get(CTD)).toBe("final");
  });
  it("whatever order the rows arrive in", () => {
    const rows = [{ cruise_key: "c", dataset_key: CTD, data_stage: "final" }, { cruise_key: "c", dataset_key: CTD, data_stage: "preliminary_without_bottle" }, { cruise_key: "c", dataset_key: CTD, data_stage: "preliminary_with_bottle" }];
    expect(stageIndex(rows).get("c")?.get(CTD)).toBe("preliminary_without_bottle");
    expect(stageIndex(rows.slice().reverse()).get("c")?.get(CTD)).toBe("preliminary_without_bottle");
  });
  it("drops a row with no cruise, dataset or stage", () => {
    expect(stageIndex([{ cruise_key: "c", dataset_key: CTD }, { dataset_key: CTD, data_stage: "final" }, { cruise_key: "c", data_stage: "final" }]).size).toBe(0);
  });
  it("leastFinal: without the bottle merge < with it < final; a stage the app does not know is the least final", () => {
    expect(leastFinal("final", "preliminary_with_bottle")).toBe("preliminary_with_bottle");
    expect(leastFinal("preliminary_with_bottle", "preliminary_without_bottle")).toBe("preliminary_without_bottle");
    expect(leastFinal("preliminary_without_bottle", "at_sea")).toBe("at_sea");
    expect(leastFinal("final", "final")).toBe("final");
  });
});

describe("stageLabel — the provider's wording, the same as ctd-transects", () => {
  it("the two preliminary tiers, verbatim from ctd-transects' STAGE_LABELS", () => {
    expect(stageLabel("preliminary_with_bottle")).toBe("Preliminary — CTD & bottle 1 m-binned");
    expect(stageLabel("preliminary_without_bottle")).toBe("Preliminary — CTD only, no bottle merge");
    expect(Object.keys(STAGE_LABELS).sort()).toEqual(["preliminary_with_bottle", "preliminary_without_bottle"]);
  });
  it("a finished cruise wears no mark, and neither does no stage", () => {
    expect(stageLabel("final")).toBeNull(); expect(stageLabel(null)).toBeNull(); expect(stageLabel(undefined)).toBeNull(); expect(stageLabel("")).toBeNull();
  });
  it("a stage it does not name: the word and the release's own value, no wording of its own", () => {
    expect(stageLabel("preliminary")).toBe("Preliminary — preliminary");
    expect(stageLabel("at_sea")).toBe("Preliminary — at_sea");
  });
});

describe("viewStage — which views wear the mark", () => {
  const idx = stageIndex([
    { cruise_key: "2015-11-32OC", dataset_key: CTD, data_stage: "final" },
    { cruise_key: "2026-11-33P4", dataset_key: CTD, data_stage: "preliminary_with_bottle" },
    { cruise_key: "2026-04-3322", dataset_key: CTD, data_stage: "preliminary_without_bottle" },
  ]);
  const section = { lens: "section" as const, realm: "env" as const, cruise: "2026-11-33P4" };

  it("a depth section of a preliminary cruise, for a variable the CTD casts hold", () => {
    expect(viewStage(section, [BTL, CTD], idx)).toEqual({ stage: "preliminary_with_bottle", dataset_key: CTD, label: "Preliminary — CTD & bottle 1 m-binned" });
  });
  it("the Cruises lens' shown cruise", () => {
    expect(viewStage({ lens: "cruise", realm: "env", cruise: "2026-04-3322" }, [CTD], idx)?.label).toBe("Preliminary — CTD only, no bottle merge");
  });
  it("a finished cruise: none", () => expect(viewStage({ ...section, cruise: "2015-11-32OC" }, [BTL, CTD], idx)).toBeNull());
  it("a cruise the release has no stage for: none", () => expect(viewStage({ ...section, cruise: "1950-09-31CR" }, [BTL, CTD], idx)).toBeNull());
  it("the stage is the dataset's: a bottle-only variable on the same cruise key wears none", () => {
    expect(viewStage(section, [BTL], idx)).toBeNull();
    expect(viewStage({ lens: "cruise", realm: "bio", cruise: "2026-11-33P4" }, ["swfsc_ichthyo"], idx)).toBeNull();
  });
  it("a dataset switched out of view does not mark it", () => expect(viewStage(section, [], idx)).toBeNull());
  it("a lens that pools cruises wears none, whatever cruise the URL still names", () => {
    for (const lens of ["station", "hex", "contour", "region"] as const) expect(viewStage({ ...section, lens }, [CTD], idx)).toBeNull();
  });
  it("an organism's section runs across every cruise: none", () => {
    expect(singleCruise({ lens: "section", realm: "bio", cruise: "2026-11-33P4" })).toBeNull();
    expect(viewStage({ lens: "section", realm: "bio", cruise: "2026-11-33P4" }, [CTD], idx)).toBeNull();
  });
  it("no cruise chosen yet: none", () => expect(viewStage({ ...section, cruise: null }, [CTD], idx)).toBeNull());
  it("the stage not read yet, or a release without one: none — never a guess", () => {
    expect(viewStage(section, [CTD], null)).toBeNull();
    expect(viewStage(section, [CTD], new Map())).toBeNull();
  });
  it("cruiseStage (a picker row): the least final of the datasets in view", () => {
    const two = stageIndex([{ cruise_key: "c", dataset_key: "a", data_stage: "preliminary_with_bottle" }, { cruise_key: "c", dataset_key: "b", data_stage: "preliminary_without_bottle" }]);
    expect(cruiseStage(two, "c", ["a", "b"])).toEqual({ stage: "preliminary_without_bottle", dataset_key: "b" });
    expect(cruiseStage(two, "c", ["a"])).toEqual({ stage: "preliminary_with_bottle", dataset_key: "a" });
    expect(cruiseStage(idx, "2015-11-32OC", [CTD])).toBeNull();
  });
});
