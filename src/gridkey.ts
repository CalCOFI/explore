// The station grid's rules, pure so tests/gridkey.test.ts can pin them (no engine, no DOM).
//
// v2026.10.04 redrew `grid`: one Voronoi cell per official station (the SCCOOS inshore stations among them, each on a
// "line" of its own — 93.4, 86.8, 88.5 …) plus the historical cells kept as they were. grid_key keeps its form
// `st{station}-ln{line}` (historical cells end `_hist`), but station and line now carry decimals (`st26.4-ln93.4`) and
// a key that existed before may name a different polygon. The release ships `grid_crosswalk` (prev_grid_key →
// grid_key, with the share of the earlier cell's area each new cell holds) so a saved link can follow its cell.

export interface GridLine { line: number; station: number }
export interface CrosswalkRow { prev_grid_key: string; grid_key: string; prev_frac: number }

/** a section needs at least two stations along its line: one point has no x-axis to draw on */
export const SECTION_MIN_STATIONS = 2;

/** the lines the Sections lens offers: every line of the grid with at least SECTION_MIN_STATIONS cells, ascending.
 *  An inshore station on a line of its own (SCCOOS 93.4 26.4) is a station, never a section. */
export function sectionLines(grid: readonly GridLine[]): number[] {
  const n = new Map<number, number>();
  for (const c of grid) n.set(c.line, (n.get(c.line) ?? 0) + 1);
  return [...n.entries()].filter(([, k]) => k >= SECTION_MIN_STATIONS).map(([l]) => l).sort((a, b) => a - b);
}

/** the section line closest to `line` (ties go to the lower line); null when there is none */
export function nearestSectionLine(line: number, lines: readonly number[]): number | null {
  let best: number | null = null;
  for (const l of lines) if (best === null || Math.abs(l - line) < Math.abs(best - line)) best = l;
  return best;
}

/** line / station out of a grid_key, for code that holds only the key. Decimal-safe (`st26.4-ln93.4`), sign-safe
 *  (`st-20-ln130_hist`) and suffix-safe (`_hist`) — the SQL twin is the regexp_extract in sql/slice_bio.sql */
export function parseGridKey(key: string): GridLine | null {
  const ln = /ln(-?[0-9.]+)/.exec(key), st = /^st(-?[0-9.]+)/.exec(key);
  if (!ln || !st) return null;
  const line = Number(ln[1]), station = Number(st[1]);
  return Number.isFinite(line) && Number.isFinite(station) ? { line, station } : null;
}

/** a redrawn cell that kept its key is only called out when it keeps less than this share of the earlier cell */
export const REDRAWN_FRAC = 0.9;

export type StationResolution =
  | { kind: "same"; key: string; note: null }
  | { kind: "redrawn"; key: string; note: string; frac: number }
  | { kind: "moved"; key: string; from: string; note: string; frac: number }
  | { kind: "missing"; key: string; note: string };

const pct = (f: number) => `${Math.round(f * 100)} %`;

/** where a `?station=` key lands in THIS release's grid. Never silently a different area:
 *  · the key is a cell of this grid, and the crosswalk (if any) says it kept ≥ REDRAWN_FRAC of the earlier cell → as is
 *  · the key is a cell of this grid but was redrawn → kept, with a note saying how much of the earlier cell it holds
 *  · the key is not in this grid but the crosswalk knows it → the new cell holding the largest share of it, with a note
 *  · neither → kept (the card opens empty) with a note saying the release has no such cell */
export function resolveStation(key: string, gridKeys: ReadonlySet<string>, crosswalk: readonly CrosswalkRow[] | null, version = "this release"): StationResolution {
  const rows = (crosswalk ?? []).filter((r) => r.prev_grid_key === key);
  if (gridKeys.has(key)) {
    const self = rows.find((r) => r.grid_key === key);
    if (!self || !rows.length || self.prev_frac >= REDRAWN_FRAC) return { kind: "same", key, note: null };
    return { kind: "redrawn", key, frac: self.prev_frac,
      note: `${key} was redrawn in ${version}'s grid: it holds ${pct(self.prev_frac)} of the cell a link from an earlier release named` };
  }
  const best = rows.filter((r) => gridKeys.has(r.grid_key)).sort((a, b) => b.prev_frac - a.prev_frac || a.grid_key.localeCompare(b.grid_key))[0];
  if (best) return { kind: "moved", key: best.grid_key, from: key, frac: best.prev_frac,
    note: `${key} is not a cell of ${version}'s grid — showing ${best.grid_key}, which holds ${pct(best.prev_frac)} of its area` };
  return { kind: "missing", key, note: `${key} is not a cell of ${version}'s grid${crosswalk ? " (nor of its crosswalk from the previous grid)" : ""}` };
}

/** a station cell with its position (lon, lat), as the map holds it */
export interface GridHome extends GridLine { home: [number, number]; grid_key?: string }
export interface LineThread { line: number; path: [number, number][]; labels: { position: [number, number]; text: string }[] }
/** a line's name as the map and the 3-D curtain write it: `line 90`, `line 93.3` */
export const lineName = (line: number) => `line ${Number.isInteger(line) ? String(line) : line.toFixed(1)}`;
/** how far past its end station a line's label sits, as a share of the last station spacing */
export const LINE_LABEL_NUDGE = 0.7;

/** the CalCOFI lines for the 2-D map's Lines layer (`lines=on`; Erin Satterthwaite, 2026-10-02: "stations (and lines,
 *  if possible)"): every line with at least SECTION_MIN_STATIONS cells, threaded through its stations in station
 *  order, its name at BOTH ends (the offshore end is out of frame as often as not), each label nudged past the end
 *  station along the line so it never sits on a station dot. A station on a line of its own (SCCOOS 93.4 26.4) is
 *  neither threaded nor named here — on the 2-D map its station dot says enough. Only the official stations are
 *  threaded: a historical cell (`…_hist`) is a position the program once worked, and threading those drew lines across
 *  Baja California into the Gulf. Ascending by line. */
export function lineThreads(grid: readonly GridHome[]): LineThread[] {
  const by = new Map<number, GridHome[]>();
  for (const c of grid) if (!c.grid_key?.endsWith("_hist")) (by.get(c.line) ?? by.set(c.line, []).get(c.line)!).push(c);
  const past = (a: [number, number], b: [number, number]): [number, number] => [a[0] + (a[0] - b[0]) * LINE_LABEL_NUDGE, a[1] + (a[1] - b[1]) * LINE_LABEL_NUDGE];
  return [...by.entries()].filter(([, cs]) => cs.length >= SECTION_MIN_STATIONS).sort(([a], [b]) => a - b).map(([line, cs]) => {
    const path = cs.slice().sort((a, b) => a.station - b.station).map((c) => c.home);
    const n = path.length, text = lineName(line);
    return { line, path, labels: [{ position: past(path[0], path[1]), text }, { position: past(path[n - 1], path[n - 2]), text }] };
  });
}
