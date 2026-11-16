// the What picker's Sort by and its compact observation counts (src/pickersort.ts)
import { describe, expect, it } from "vitest";
import { compactN, compareNames, countTip, sortItems } from "../src/pickersort";

const S = " ";
const it3 = [
  { key: "c", label: "Pacific Hake", n: 500 },
  { key: "a", label: "northern anchovy", n: 2000 },
  { key: "b", label: "Jack Mackerel", n: 500 },
  { key: "d", label: "Ägir fish", n: 10 },
];

describe("sortItems", () => {
  it("most observations: count descending, a tie by name (stable on the name, not the input order)", () => {
    expect(sortItems(it3, "n").map((x) => x.key)).toEqual(["a", "b", "c", "d"]);
    expect(sortItems([...it3].reverse(), "n").map((x) => x.key)).toEqual(["a", "b", "c", "d"]);
  });
  it("most observations: an equal count and an equal name fall back to the key", () => {
    const xs = [{ key: "z", label: "Same", n: 1 }, { key: "y", label: "same", n: 1 }];
    expect(sortItems(xs, "n").map((x) => x.key)).toEqual(["y", "z"]);
  });
  it("by the number the row shows (By dataset: that dataset's count)", () => {
    const ds: Record<string, number> = { a: 1, b: 9, c: 5, d: 7 };
    expect(sortItems(it3, "n", undefined, (x) => ds[x.key]).map((x) => x.key)).toEqual(["b", "d", "c", "a"]);
  });
  it("A–Z: locale-aware, case- and accent-insensitive", () => {
    expect(sortItems(it3, "az").map((x) => x.label)).toEqual(["Ägir fish", "Jack Mackerel", "northern anchovy", "Pacific Hake"]);
  });
  it("A–Z: a leading article is ignored and digits sort as numbers", () => {
    expect(compareNames("The Zebra", "Apple")).toBeGreaterThan(0);
    expect(sortItems([{ key: "1", label: "Sensor 10", n: 0 }, { key: "2", label: "Sensor 2", n: 0 }], "az").map((x) => x.label)).toEqual(["Sensor 2", "Sensor 10"]);
  });
  it("suggested: the picker's own comparator, or the order given", () => {
    expect(sortItems(it3, "suggested").map((x) => x.key)).toEqual(["c", "a", "b", "d"]);
    expect(sortItems(it3, "suggested", (a, b) => a.key.localeCompare(b.key)).map((x) => x.key)).toEqual(["a", "b", "c", "d"]);
  });
  it("never changes the array it is given", () => {
    const xs = it3.slice(); sortItems(xs, "n"); sortItems(xs, "az");
    expect(xs).toEqual(it3);
  });
});

describe("compactN", () => {
  it("keeps numbers under a thousand whole", () => {
    expect(compactN(0)).toBe("0");
    expect(compactN(999)).toBe("999");
  });
  it("switches to k at 1,000", () => {
    expect(compactN(1000)).toBe(`1${S}k`);
    expect(compactN(1234)).toBe(`1.2${S}k`);
    expect(compactN(86_400)).toBe(`86${S}k`);
  });
  it("a value that rounds to 1,000 k is 1 M, never 1000 k", () => {
    expect(compactN(999_499)).toBe(`999${S}k`);
    expect(compactN(999_500)).toBe(`1${S}M`);
  });
  it("millions and billions", () => {
    expect(compactN(1_000_000)).toBe(`1${S}M`);
    expect(compactN(1_234_567)).toBe(`1.2${S}M`);
    expect(compactN(12_345_678)).toBe(`12${S}M`);
    expect(compactN(3_400_000_000)).toBe(`3.4${S}B`);
  });
  it("one decimal under 10, none from 10", () => {
    expect(compactN(9_940)).toBe(`9.9${S}k`);
    expect(compactN(9_960)).toBe(`10${S}k`);
  });
});

describe("countTip", () => {
  it("says the exact number and what it counts", () => {
    expect(countTip(1234567, "observations", "in all datasets")).toBe("1,234,567 observations in all datasets");
  });
});
