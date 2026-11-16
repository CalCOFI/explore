// the What picker's "Sort by" and its observation counts (leanpanel.tsx WhatPicker, picker.tsx Browse): pure, so
// tests/pickersort.test.ts asserts the orders and the compact numbers the rows show.
//   suggested — the picker's own order (the default): what people reach for first; see WhatPicker for its rules
//   n         — most observations first, a tie by name
//   az        — by name, A to Z, as the reader's language sorts it (case, accents and a leading "The" / "A" ignored)

export type WhatSort = "suggested" | "n" | "az";
export const WHAT_SORTS: [WhatSort, string][] = [["suggested", "Suggested"], ["n", "Most observations"], ["az", "Name A–Z"]];
/** what "Suggested" means, for the control's hover */
export const SUGGESTED_TIP = "Suggested: the familiar measurements first (temperature, salinity, oxygen, chlorophyll, nutrients …), measured before derived, then most observations; sensor copies, raw or uncorrected versions and unidentified or unnamed taxa last";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const nameKey = (s: string | null | undefined) => (s ?? "").trim().replace(/^(the|a|an)\s+/i, "").replace(/^[^\p{L}\p{N}]+/u, "");
/** names in the reader's language order: case-, accent- and article-insensitive, digits as numbers ("Sensor 2" before "Sensor 10") */
export const compareNames = (a: string, b: string) => collator.compare(nameKey(a), nameKey(b));

export interface Sortable { key: string; label: string; n: number }
/** the items in the chosen order: a new array, the input untouched. `suggested` is the picker's own comparator (used for
 *  "suggested"; without one the input order stands); `count` is the number a row shows (By dataset: that dataset's). */
export function sortItems<T extends Sortable>(items: readonly T[], how: WhatSort, suggested?: (a: T, b: T) => number, count: (it: T) => number = (it) => it.n): T[] {
  const out = items.slice();
  if (how === "n") return out.sort((a, b) => count(b) - count(a) || compareNames(a.label, b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (how === "az") return out.sort((a, b) => compareNames(a.label, b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return suggested ? out.sort(suggested) : out;
}

const NNBSP = " "; // a narrow no-break space: "1.2 M" never wraps between the number and its unit
/** an observation count, short: 999 · 1 k · 8.6 k · 86 k · 1 M · 1.2 M · 12 M · 3.4 B. One decimal under 10, none above; a
 *  value that rounds up to 1,000 of a unit is shown in the next unit (999,500 → 1 M, never "1000 k"). */
export function compactN(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const v0 = Math.round(Math.abs(n)), sign = n < 0 ? "−" : "";
  if (v0 < 1000) return `${sign}${v0}`;
  const units: [number, string][] = [[1e3, "k"], [1e6, "M"], [1e9, "B"]];
  for (let i = 0; i < units.length; i++) {
    const [d, u] = units[i], v = v0 / d;
    const r = v < 9.95 ? Math.round(v * 10) / 10 : Math.round(v);
    if (r < 1000 || i === units.length - 1) return `${sign}${r}${NNBSP}${u}`;
  }
  return String(n);
}
/** the exact count and what it counts, for a row's hover and screen readers */
export const countTip = (n: number, what: string, where: string) => `${Math.round(n).toLocaleString("en-US")} ${what}${where ? ` ${where}` : ""}`;

const STORE = "explore.what.sort";
/** the sort is remembered per browser (never in the link); private mode or blocked storage falls back to Suggested */
export function loadSort(): WhatSort {
  try { const s = localStorage.getItem(STORE); return s === "n" || s === "az" || s === "suggested" ? s : "suggested"; } catch { return "suggested"; }
}
export function saveSort(s: WhatSort) { try { localStorage.setItem(STORE, s); } catch { /* private mode */ } }
