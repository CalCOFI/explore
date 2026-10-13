// the Refine panel's number boxes and year steps (explore#26, #27) — src/ranges.ts
import { describe, expect, it } from "vitest";
import { commitNum, ordered, stepYears, yearComplete } from "../src/ranges";
import { parseYears } from "../src/state";

describe("commitNum — what a number box commits", () => {
  it("a cleared or half-typed box commits nothing (#26: it stored 0, then showed 01973)", () => {
    expect(commitNum("", 1949, 2026)).toBeNull();
    expect(commitNum("-", 1949, 2026)).toBeNull();
    expect(commitNum("1e", 1949, 2026)).toBeNull();
  });
  it("a leading zero is read as the year", () => expect(commitNum("01973", 1949, 2026)).toBe(1973));
  it("clamps to the record", () => { expect(commitNum("1900", 1949, 2026)).toBe(1949); expect(commitNum("3000", 1949, 2026)).toBe(2026); });
  it("snaps a depth to its 10 m step", () => { expect(commitNum("47", 0, 490, 10)).toBe(50); expect(commitNum("0", 0, 490, 10)).toBe(0); });
});

describe("yearComplete — when a year box queries while typing", () => {
  it("not on the way to a year", () => ["1", "19", "197", "0197"].forEach((t) => expect(yearComplete(t, 1949, 2026)).toBe(false)));
  it("on a whole year in the record", () => expect(yearComplete("1973", 1949, 2026)).toBe(true));
  it("not on a four-digit year outside it", () => expect(yearComplete("1900", 1949, 2026)).toBe(false));
});

describe("ordered", () => it("swaps a reversed pair", () => { expect(ordered(1990, 1980)).toEqual([1980, 1990]); expect(ordered(1980, 1990)).toEqual([1980, 1990]); }));

describe("stepYears — ‹ › by the window's own width (#27)", () => {
  it("a single year steps one year", () => { expect(stepYears([1973, 1973], 1, 1949, 2026)).toEqual([1974, 1974]); expect(stepYears([1973, 1973], -1, 1949, 2026)).toEqual([1972, 1972]); });
  it("a range steps by its width", () => { expect(stepYears([1974, 1987], 1, 1949, 2026)).toEqual([1988, 2001]); expect(stepYears([1988, 2001], -1, 1949, 2026)).toEqual([1974, 1987]); });
  it("the last step ends on the record's edge, keeping the width", () => { expect(stepYears([2010, 2019], 1, 1949, 2026)).toEqual([2017, 2026]); expect(stepYears([1950, 1959], -1, 1949, 2026)).toEqual([1949, 1958]); });
  it("null at the edge", () => { expect(stepYears([2026, 2026], 1, 1949, 2026)).toBeNull(); expect(stepYears([1949, 1960], -1, 1949, 2026)).toBeNull(); });
});

describe("parseYears — a shared link's years=", () => {
  it("a single year reopens as that year, not all years (years=1973-1973)", () => expect(parseYears("1973-1973")).toEqual({ years: [1973, 1973], months: null }));
  it("a range, either order", () => { expect(parseYears("1974-1987").years).toEqual([1974, 1987]); expect(parseYears("1987-1974").years).toEqual([1974, 1987]); });
  it("month-resolved", () => expect(parseYears("2015-04:2016-10")).toEqual({ years: [2015, 2016], months: [4, 10] }));
});
