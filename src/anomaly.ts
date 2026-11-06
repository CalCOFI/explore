// the anomaly's one matching rule, shared by the 2-D section (charts.tsx) and the 3-D curtain (curtain.tsx).
// A cell is matched to the climatology of its CRUISE's month — since release v2026.11 the cruise's median cast month
// (`cruise.month_median`, the slice's `cruise_month`; the MM of its `YYYY-MM-NODC` key before) — never the calendar month
// a cast was occupied in. A cruise that starts on the last days of a month occupies its first stations in the month
// BEFORE its designation (2026-07-3322 worked line 93.3's inshore stations on 2026-06-30); matched on the calendar month
// they looked up a June baseline that no 1993–2013 cruise ever made, and the inshore half of the section went blank.
// The seasons are DJF / MAM / JJA / SON, numbered 1–4 (Rasmus Swalethorp 2026-10-16; December counts toward the following
// year's winter). sql/section.sql emits the month; this module is what both renderers key on; tests/anomaly.test.ts and
// tests/season.test.ts pin it.
import type { SectionCell } from "./charts";
import { CRUISE_MONTH_SQL, CRUISE_QUARTER_SQL, djfSql } from "./sqltpl";

/** the release's floor for a climatology cell: at least this many cruises 1993–2013 (release_database.qmd,
 * `build_climatology(min_cruises = 5L)`, Rasmus Swalethorp 2026-09-09) */
export const CLIM_MIN_CRUISES = 5;

/** the cruise's month (1–12) from a `YYYY-MM-NODC` cruise_key — the KEY rule, the fallback for a release before v2026.11
 * or a cruise the cruise table does not know; null when the key is malformed. App.tsx reads the median month from the
 * cruise table (cruise_ref.sql) and passes it where it has one. */
export function cruiseMonth(cruiseKey: string | null | undefined): number | null {
  const m = /^\d{4}-(\d{2})-/.exec(cruiseKey ?? "");
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

/** the season of a month, numbered 1–4: 1 = DJF (winter), 2 = MAM, 3 = JJA, 4 = SON (calcofi4db::cruise_quarter(); the
 * release's `quarter` column since v2026.11 — Q1 Jan–Mar … Q4 Oct–Dec before). null for no month. */
export const seasonOf = (month: number | null | undefined): number | null =>
  month == null || !(month >= 1 && month <= 12) ? null : month === 12 || month <= 2 ? 1 : Math.floor((month - 3) / 3) + 2;
/** the cruise's season (1–4) by the key rule — see cruiseMonth(). The season filter and the seasonal baseline both key on
 * the slice's `quarter`: a station of a July cruise worked on 30 June is in JJA (explore#17). */
export function cruiseQuarter(cruiseKey: string | null | undefined): number | null { return seasonOf(cruiseMonth(cruiseKey)); }

/** which normal an anomaly subtracts: the cruise's month (`clim_*`, the default) or its season (`season_*`, `base=season`) */
export type ClimBase = "month" | "season";
const MONTH_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** the seasons in words, by their number 1–4 */
export const SEASON_CODE = ["DJF", "MAM", "JJA", "SON"];
export const SEASON_WORD = ["Dec–Feb", "Mar–May", "Jun–Aug", "Sep–Nov"];
export const SEASON_NAME = ["winter", "spring", "summer", "fall"];
/** the key a cell is matched on under a baseline: the cruise's month, or its season */
export const periodOf = (month: number | null | undefined, base: ClimBase): number | null =>
  month == null || !(month >= 1 && month <= 12) ? null : base === "season" ? seasonOf(month) : month;
/** the baseline in words for a caption or a tooltip: "July" (month) or "Jun–Aug" (season); without a month, the kind */
export function baselineWord(base: ClimBase, month?: number | null): string {
  const p = periodOf(month, base);
  if (p == null) return base === "season" ? "seasonal (3-month)" : "monthly";
  return base === "season" ? SEASON_WORD[p - 1] : MONTH_NAME[p - 1];
}

/** the climatology columns a baseline reads. The seasonal ones (calcofi4db 4.24.0+) repeat a season's values on each of
 * its three months; the season of a row is that of its `month` (DJF … SON, v2026.11+ — the table's own `quarter` column is
 * not read, so a release from before the redefinition is read the same way). A NULL mean is "no baseline", exactly like
 * an absent row (that month or season is under the floor). */
export const CLIM_COLS: Record<ClimBase, { mean: string; n: string; cruises: string; period: string }> = {
  month:  { mean: "clim_mean",   n: "clim_n",   cruises: "n_cruises",        period: "month" },
  season: { mean: "season_mean", n: "season_n", cruises: "season_n_cruises", period: djfSql("month") },
};
/** a release's climatology carries the seasonal baseline when its objects have these columns (App.tsx probes one) */
export const SEASON_COLS = ["season_mean", "season_n", "season_n_cruises"] as const;
export const hasSeasonCols = (cols: Iterable<string>) => { const s = new Set(cols); return SEASON_COLS.every((c) => s.has(c)); };

/** the baseline as one table expression with fixed columns — dataset_key, site_key, grid_key, period (the cruise's month,
 * or its quarter), depth_bin, measurement_type, mean, n, n_cruises, yr_min, yr_max — over `src`, the union of the
 * variable's climatology objects. A row with no mean under this baseline is dropped (no baseline, never a 0); the season's
 * three repeated month rows collapse to one per quarter, so its n is counted once. sql/section_clim.sql and
 * sql/anom_slice.sql read it as {{clim_src}}. */
export function climBaseSql(src: string, base: ClimBase): string {
  const c = CLIM_COLS[base];
  return `(SELECT dataset_key, site_key, any_value(grid_key) AS grid_key, ${c.period} AS period, depth_bin, measurement_type, ` +
    `any_value(${c.mean}) AS mean, any_value(${c.n}) AS n, any_value(${c.cruises}) AS n_cruises, ` +
    `min(clim_yr_min) AS yr_min, max(clim_yr_max) AS yr_max ` +
    `FROM ${src} WHERE ${c.mean} IS NOT NULL AND ${c.n} > 0 ` +
    `GROUP BY dataset_key, site_key, ${c.period}, depth_bin, measurement_type)`;
}

/** the slice column an observation's baseline cell is found by. A per-bin value carries its station (site_key, from
 * obs_env). A per-cast value does not: sample_root has no site_key, so it is matched on the cell its cast falls in,
 * grid_key — the climatology's grid_key is its station's modal cell, one cell per official station since the v2026.10.04
 * grid (calcofi_ctd-derived: 81 site_keys in 81 cells, v2026.10.08), and the rows of a cell are pooled weighted by n. */
export const anomLoc = (grain: "bin" | "cast") => (grain === "cast" ? "grid_key" : "site_key");

/** the tokens sql/anom_slice.sql takes: the baseline (climBaseSql over `src`), the slice column it is found by, and the
 * slice's period — its cruise's month (slice column cruise_month), or its cruise's season (quarter) under the seasonal baseline */
export const anomTokens = (src: string, base: ClimBase, grain: "bin" | "cast") => ({
  clim_src: climBaseSql(src, base), clim_loc: anomLoc(grain), clim_period: base === "season" ? CRUISE_QUARTER_SQL : CRUISE_MONTH_SQL,
});

const key = (station: number, period: number | null | undefined, y: number) => `${station}|${period}|${y}`;

/** station | period | depth bin → the baseline value. A baseline row carries its PERIOD in `month`: sql/section_clim.sql
 * emits the cruise month, or the quarter under the seasonal baseline */
export function climLookup(clim: SectionCell[] | null): Map<string, number> {
  return new Map((clim ?? []).map((c) => [key(c.station, c.month, c.y), c.v]));
}

/** a cell's departure from the climatology of its cruise's month (or quarter, `base = "season"`) at its station and depth
 * bin; null when no baseline exists (blank, never 0) */
export function anomalyOf(c: SectionCell, clim: Map<string, number>, base: ClimBase = "month"): number | null {
  const k = clim.get(key(c.station, periodOf(c.month, base), c.y));
  return k == null ? null : c.v - k;
}

/** the colour range a section draws (explore#12): the values' min–max, or, as a difference from the normal, a window
 *  symmetric about 0 from the largest departure (at least ±0.1). The section panel's colourbar and the title sentence's
 *  legend both read it, so the legend says what the section shows — not the map's station summary, which the Sections
 *  lens does not refresh (106.31 "per 10 m²" and "degC" alike, whatever the pick). null = nothing drawn yet. */
export function sectionRange(cells: SectionCell[], clim: SectionCell[] | null, anom: boolean): [number, number] | null {
  const cm = anom ? climLookup(clim) : null;
  const v = cells.map((c) => (cm ? anomalyOf(c, cm) : c.v)).filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return null;
  if (anom) { const a = Math.max(0.1, ...v.map(Math.abs)); return [-a, a]; }
  return [Math.min(...v), Math.max(...v)];
}
