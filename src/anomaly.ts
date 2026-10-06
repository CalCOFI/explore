// the anomaly's one matching rule, shared by the 2-D section (charts.tsx) and the 3-D curtain (curtain.tsx).
// A cell is matched to the climatology of its CRUISE's month — the month SWFSC designates for the cruise, the MM of
// its `YYYY-MM-NODC` cruise_key — never the calendar month a cast was occupied in. A cruise that starts on the last
// days of a month occupies its first stations in the month BEFORE its designation (2026-07-3322 worked line 93.3's
// inshore stations on 2026-06-30); matched on the calendar month they looked up a June baseline that no 1993–2013
// cruise ever made, and the inshore half of the section went blank. sql/section.sql emits this month; this module
// is what both renderers key on, and tests/anomaly.test.ts pins it.
import type { SectionCell } from "./charts";

/** the release's floor for a climatology cell: at least this many cruises 1993–2013 (release_database.qmd,
 * `build_climatology(min_cruises = 5L)`, Rasmus Swalethorp 2026-09-09) */
export const CLIM_MIN_CRUISES = 5;

/** the cruise's designated month (1–12) from a `YYYY-MM-NODC` cruise_key; null when the key is malformed. The same
 * rule as sql/section.sql's `TRY_CAST(substr(cruise_key, 6, 2) AS INTEGER)`. */
export function cruiseMonth(cruiseKey: string | null | undefined): number | null {
  const m = /^\d{4}-(\d{2})-/.exec(cruiseKey ?? "");
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

const key = (station: number, month: number | undefined, y: number) => `${station}|${month}|${y}`;

/** station | month | depth bin → the baseline value */
export function climLookup(clim: SectionCell[] | null): Map<string, number> {
  return new Map((clim ?? []).map((c) => [key(c.station, c.month, c.y), c.v]));
}

/** a cell's departure from the climatology of its cruise's month at its station and depth bin; null when no
 * baseline exists (blank, never 0) */
export function anomalyOf(c: SectionCell, clim: Map<string, number>): number | null {
  const k = clim.get(key(c.station, c.month, c.y));
  return k == null ? null : c.v - k;
}
