// the view's own line / cruise on top of the filters (reproduce.ts lensOwnSql): the CSV, its zero-row count and the zip's
// observations all read it. Regression (review 2026-11-16): a Section view's zip carried every line, its CSV one
import { beforeAll, describe, expect, it, vi } from "vitest";
// release.ts (imported by reproduce.ts) reads `window.__early` at import, as tests/reproduce.test.ts notes
let lensOwnSql: typeof import("../src/reproduce").lensOwnSql;
beforeAll(async () => { vi.stubGlobal("window", {}); ({ lensOwnSql } = await import("../src/reproduce")); });

describe("lensOwnSql", () => {
  it("a section is its line; an env section also its cruise; a bio section every cruise", () => {
    expect(lensOwnSql({ lens: "section", realm: "env", line: 90, cruise: "2019-07-RL" })).toEqual(["line = 90", "cruise_key = '2019-07-RL'"]);
    expect(lensOwnSql({ lens: "section", realm: "bio", line: 76.7, cruise: "2019-07-RL" })).toEqual(["line = 76.7"]);
  });
  it("the Cruise view is its cruise (none picked yet: nothing)", () => {
    expect(lensOwnSql({ lens: "cruise", realm: "bio", line: 90, cruise: "2019-07-RL" })).toEqual(["cruise_key = '2019-07-RL'"]);
    expect(lensOwnSql({ lens: "cruise", realm: "bio", line: 90, cruise: null })).toEqual([]);
  });
  it("the map views add nothing", () => {
    for (const lens of ["station", "hex", "region", "contour"]) expect(lensOwnSql({ lens, realm: "env", line: 90, cruise: "x" })).toEqual([]);
  });
});
