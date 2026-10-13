// the number boxes of the Refine panel and the title sentence (years, depth band) as pure rules, so a test asserts
// them: a box keeps the text being typed and commits only a complete value (explore#26 — a controlled
// type="number" that wrote +value on every keystroke stored 0 for a cleared box and showed "01973" after it), and
// the year window steps by its own width (explore#27 — ‹ › beside the years, to flip through the record).

/** the committed value of a box's text: a finite number clamped to [min, max] (snapped to `step` above min), or
 *  null for text that is not a number yet (empty, "-", "1e") — the caller keeps the old value */
export function commitNum(text: string, min: number, max: number, step = 1): number | null {
  const t = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  let v = Math.min(max, Math.max(min, +t));
  if (step > 1) v = Math.min(max, min + Math.round((v - min) / step) * step);
  return v;
}

/** may a year box commit while typing? only once the text is a whole four-digit year inside the record —
 *  "1", "19", "197" are steps on the way to 1973, not years to query */
export const yearComplete = (text: string, min: number, max: number) => /^\d{4}$/.test(text.trim()) && +text >= min && +text <= max;

/** a [lo, hi] pair in order (a box can be typed past the other end) */
export const ordered = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a]);

/** the year window moved one step back (dir −1) or forward (+1) by its own width — 1973 → 1974, 1974–1987 →
 *  1988–2001 — held inside [first, last] (the last step is shortened to end on the record's edge); null when the
 *  window already sits at that edge */
export function stepYears(years: [number, number], dir: -1 | 1, first: number, last: number): [number, number] | null {
  const [a, b] = ordered(years[0], years[1]);
  const w = b - a + 1;
  if (dir > 0 ? b >= last : a <= first) return null;
  let na = a + dir * w, nb = b + dir * w;
  if (nb > last) { nb = last; na = Math.max(first, last - w + 1); }
  if (na < first) { na = first; nb = Math.min(last, first + w - 1); }
  return [na, nb];
}
