// the anomaly's one matching rule, shared by the 2-D section (charts.tsx) and the 3-D curtain (curtain.tsx).
// A cell is matched to the climatology of its CRUISE's month — the month SWFSC designates for the cruise, the MM of
// its `YYYY-MM-NODC` cruise_key — never the calendar month a cast was occupied in. A cruise that starts on the last
// days of a month occupies its first stations in the month BEFORE its designation (2026-07-3322 worked line 93.3's
// inshore stations on 2026-06-30); matched on the calendar month they looked up a June baseline that no 1993–2013
// cruise ever made, and the inshore half of the section went blank. sql/section.sql emits this month; this module
// is what both renderers key on, and tests/anomaly.test.ts pins it.
import type { SectionCell } from "./charts";
import { CRUISE_MONTH_SQL, CRUISE_QUARTER_SQL } from "./sqltpl";

/** the release's floor for a climatology cell: at least this many cruises 1993–2013 (release_database.qmd,
 * `build_climatology(min_cruises = 5L)`, Rasmus Swalethorp 2026-09-09) */
export const CLIM_MIN_CRUISES = 5;

/** the cruise's designated month (1–12) from a `YYYY-MM-NODC` cruise_key; null when the key is malformed. The same
 * rule as sqltpl.ts's `{{cruise_month}}` token, which sql/section.sql emits. */
export function cruiseMonth(cruiseKey: string | null | undefined): number | null {
  const m = /^\d{4}-(\d{2})-/.exec(cruiseKey ?? "");
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

/** the cruise's quarter (1–4) from its designated month — Q1 Jan–Mar … Q4 Oct–Dec. The season filter and the seasonal
 * baseline both key on it: a station of a July cruise worked on 30 June is in Q3 (explore#17). The SQL twin is
 * sqltpl.ts's `{{cruise_quarter}}` token, which every slice template computes its `quarter` with. */
export function cruiseQuarter(cruiseKey: string | null | undefined): number | null {
  const m = cruiseMonth(cruiseKey);
  return m == null ? null : Math.floor((m - 1) / 3) + 1;
}

/** which normal an anomaly subtracts: the cruise's month (`clim_*`, the default) or its quarter (`season_*`, `base=season`) */
export type ClimBase = "month" | "season";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** the key a cell is matched on under a baseline: the cruise's month, or its quarter */
export const periodOf = (month: number | null | undefined, base: ClimBase): number | null =>
  month == null || !(month >= 1 && month <= 12) ? null : base === "season" ? Math.floor((month - 1) / 3) + 1 : month;
/** the baseline in words for a caption or a tooltip: "July" (month) or "Jul–Sep" (season); without a month, the kind */
export function baselineWord(base: ClimBase, month?: number | null): string {
  const p = periodOf(month, base);
  if (p == null) return base === "season" ? "seasonal (3-month)" : "monthly";
  return base === "season" ? `${MON[(p - 1) * 3]}–${MON[(p - 1) * 3 + 2]}` : MONTH_NAME[p - 1];
}

/** the climatology columns a baseline reads. The seasonal ones (calcofi4db 4.24.0+) repeat a quarter's values on each of
 * its three months. A NULL mean is "no baseline", exactly like an absent row (that month or quarter is under the floor). */
export const CLIM_COLS: Record<ClimBase, { mean: string; n: string; cruises: string; period: string }> = {
  month:  { mean: "clim_mean",   n: "clim_n",   cruises: "n_cruises",        period: "month" },
  season: { mean: "season_mean", n: "season_n", cruises: "season_n_cruises", period: "((month - 1) // 3 + 1)" },
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
 * slice's period — its cruise's month, or its cruise's quarter under the seasonal baseline */
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
