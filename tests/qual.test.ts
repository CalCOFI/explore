// the quality predicate has one definition in each runtime — calcofi4r::cc_qual_ok_sql(), calcofi4py.qual_ok_sql(),
// db-query's qualOkSQL() — and the Explorer's per-cast slice needs it too: sample_measurement carries the raw
// measurement_qual (obs_bio / obs_env arrive with qual_ok already stamped by the release). The string is pinned to
// what calcofi4r 's cc_qual_ok_sql() prints, so "Copy code" hands R and Python the predicate their own package builds.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QUAL_EXCLUDE, qualOkSQL } from "../src/qual";
import { openDuck, type Duck } from "./helpers/duck";

// calcofi4r::cc_qual_ok_sql("sm") and cc_qual_ok_sql(), printed 2026-10-02 from the installed package
const R_SM = String.raw`COALESCE(NOT ((sm.dataset_key = 'calcofi_bottle' AND regexp_replace(sm.measurement_qual, '\.0+$', '') IN ('8', '9')) OR (sm.dataset_key = 'calcofi_ctd-cast' AND regexp_replace(sm.measurement_qual, '\.0+$', '') IN ('8', '9')) OR (sm.dataset_key = 'calcofi_dic' AND regexp_replace(sm.measurement_qual, '\.0+$', '') IN ('3', '4', '9'))), TRUE)`;
const R_BARE = String.raw`COALESCE(NOT ((dataset_key = 'calcofi_bottle' AND regexp_replace(measurement_qual, '\.0+$', '') IN ('8', '9')) OR (dataset_key = 'calcofi_ctd-cast' AND regexp_replace(measurement_qual, '\.0+$', '') IN ('8', '9')) OR (dataset_key = 'calcofi_dic' AND regexp_replace(measurement_qual, '\.0+$', '') IN ('3', '4', '9'))), TRUE)`;

describe("qualOkSQL() — the twin of calcofi4r::cc_qual_ok_sql()", () => {
  it("is byte-identical to the R string, with an alias", () => expect(qualOkSQL("sm")).toBe(R_SM));
  it("is byte-identical to the R string, without one", () => { expect(qualOkSQL()).toBe(R_BARE); expect(qualOkSQL(null)).toBe(R_BARE); expect(qualOkSQL("")).toBe(R_BARE); });
  it("names exactly the three datasets with a flag vocabulary (metadata/measurement_qual.csv)", () => {
    expect(QUAL_EXCLUDE).toEqual({ calcofi_bottle: ["8", "9"], "calcofi_ctd-cast": ["8", "9"], calcofi_dic: ["3", "4", "9"] });
  });
});

describe("qualOkSQL() evaluated in the browser's engine", () => {
  let db: Duck;
  beforeAll(async () => { db = await openDuck(); });
  afterAll(() => db.close());
  const ok = (dataset_key: string, qual: string | null) =>
    db.exec(`SELECT ${qualOkSQL("sm")} AS ok FROM (SELECT '${dataset_key}' AS dataset_key, ${qual == null ? "NULL::VARCHAR" : `'${qual}'`} AS measurement_qual) sm`)[0].ok;

  it("an unflagged row is kept — NOT(NULL) is NULL, and a NULL predicate would drop it", () => expect(ok("calcofi_ctd-cast", null)).toBe(true));
  it("CTD 8 and 9 are excluded; 1 and 2 (use this sensor) are kept", () => {
    expect(ok("calcofi_ctd-cast", "8")).toBe(false); expect(ok("calcofi_ctd-cast", "9")).toBe(false);
    expect(ok("calcofi_ctd-cast", "1")).toBe(true); expect(ok("calcofi_ctd-cast", "2")).toBe(true);
  });
  it("bottle codes written as 8.0 (through v2026.08.14) are still excluded", () => expect(ok("calcofi_bottle", "8.0")).toBe(false));
  it("DIC's WOCE 3 / 4 / 9 are excluded, 2 (good) kept", () => {
    expect(ok("calcofi_dic", "3")).toBe(false); expect(ok("calcofi_dic", "4")).toBe(false); expect(ok("calcofi_dic", "9")).toBe(false); expect(ok("calcofi_dic", "2")).toBe(true);
  });
  // a NAMED statement of today's rule, not an endorsement: calcofi_ctd-derived has no flag vocabulary (v2026.10.01 ships
  // 63,276 per-cast rows, measurement_qual NULL on every one). The day the derived dataset stamps a flag, the three
  // runtimes' exclude lists gain an arm together and this assertion changes with them.
  it("a dataset with no vocabulary is never excluded, whatever its flag says (calcofi_ctd-derived today)", () => {
    expect(ok("calcofi_ctd-derived", "8")).toBe(true); expect(ok("calcofi_ctd-derived", null)).toBe(true);
  });
});
