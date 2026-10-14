// the depth × time anomaly card (explore#28, Rasmus Swalethorp: "an anomaly plot with depth on the y and time on the x
// axis"): x is the cruise season, y the 10 m depth bin, the colour the mean departure from the 1993–2013 normal on the
// SAME diverging ramp as the map lenses' anomaly (#22). The rows are sql/anom_depth_time.sql over slice_anom; this module
// is pure — the grid shaping, the colour window, the Plotly trace and the empty-card reasons — so tests/depthtime.test.ts
// pins every rule and charts.tsx only draws what it returns.
import type { ClimBase } from "./anomaly";
import { lensRamp, rampPlotly } from "./ramps";

/** the panel id: `show=depthtime` opens the card (state.ts DEFAULT_HIDE folds it), `max=depthtime` fills the map with it */
export const DT_PANEL = "depthtime" as const;
/** one cell of sql/anom_depth_time.sql: the cruise season × depth bin, the mean anomaly over n observations with a
 * baseline (null when none of the cell's n_obs had one), and the cruises in it */
export interface DtRow { year: number; quarter: number; depth_bin: number; anom: number | null; n: number; n_obs: number; cruises: string | null }
export const DT_BIN_M = 10;
const Q_MONTHS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
/** a season's place on the time axis: the quarter's midpoint as a fractional year — App.tsx SEASON_BIN's convention, so
 * the card's columns sit under the Time strip's mean ± se points */
export const seasonX = (year: number, quarter: number) => year + (quarter - 0.5) / 4;
/** "2015 Q3 (Jul–Sep)" */
export const seasonLabel = (year: number, quarter: number) => `${year} Q${quarter} (${Q_MONTHS[quarter - 1]})`;
/** "50–60 m": a floor bin is labelled by its shallow edge (calcofi4db: floor(depth_min_m / 10) * 10) */
export const binLabel = (bin: number) => `${bin}–${bin + DT_BIN_M} m`;

export interface DtGrid {
  x: number[];                       // season midpoints, every season from the first to the last kept (a gap is a blank column)
  seasons: [number, number][];       // [year, quarter] per column
  y: number[];                       // depth-bin CENTRES (bin + 5), every bin from the shallowest to the deepest (a gap is a blank row)
  bins: number[];                    // the bins' shallow edges, per row
  z: (number | null)[][];            // z[row][col]: the mean anomaly, null = blank (no observation, or none with a baseline)
  cell: (DtRow | null)[][];          // the row behind each cell, for the hover
}
/** the rows as a full season × depth-bin grid. `quarters` is the season filter (null = all four): with `q=3` the columns
 * are the Q3s only, one a year, so a filtered-out quarter is not drawn as a blank column between every pair. A bin is
 * drawn at its centre so the cell spans the bin's true depths (50 → 50–60 m). */
export function dtGrid(rows: DtRow[], quarters: number[] | null = null): DtGrid {
  const empty: DtGrid = { x: [], seasons: [], y: [], bins: [], z: [], cell: [] };
  if (!rows.length) return empty;
  const keep = quarters?.length ? [...quarters].sort() : [1, 2, 3, 4];
  const idx = (y: number, q: number) => y * 4 + (q - 1);
  const s0 = Math.min(...rows.map((r) => idx(r.year, r.quarter))), s1 = Math.max(...rows.map((r) => idx(r.year, r.quarter)));
  const seasons: [number, number][] = [];
  for (let s = s0; s <= s1; s++) { const y = Math.floor(s / 4), q = (s % 4) + 1; if (keep.includes(q)) seasons.push([y, q]); }
  const b0 = Math.min(...rows.map((r) => r.depth_bin)), b1 = Math.max(...rows.map((r) => r.depth_bin));
  const bins: number[] = []; for (let b = b0; b <= b1; b += DT_BIN_M) bins.push(b);
  const col = new Map(seasons.map(([y, q], i) => [idx(y, q), i])), row = new Map(bins.map((b, i) => [b, i]));
  const cell: (DtRow | null)[][] = bins.map(() => seasons.map(() => null));
  for (const r of rows) { const i = row.get(r.depth_bin), j = col.get(idx(r.year, r.quarter)); if (i != null && j != null) cell[i][j] = r; }
  return { x: seasons.map(([y, q]) => seasonX(y, q)), seasons, y: bins.map((b) => b + DT_BIN_M / 2), bins,
    z: cell.map((rr) => rr.map((c) => (c && c.anom != null && Number.isFinite(c.anom) ? c.anom : null))), cell };
}

/** the colour window: symmetric about 0, so the diverging ramp's neutral midpoint IS the normal — the map lenses' rule
 * (App.tsx symDomain over the 5–95 % window): the larger of the two 5–95 % ends, so one odd cell does not wash the rest
 * out (the hover keeps its true value). Never a zero-width window. */
export function dtRange(values: (number | null | undefined)[]): [number, number] {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [-1, 1];
  const q = (p: number) => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const a = Math.max(Math.abs(q(0.05)), Math.abs(q(0.95))) || Math.max(...v.map(Math.abs)) || 1e-9;
  return [-a, a];
}

/** the ramp the card draws: the selection's ANOMALY ramp — `ramp=` when the URL names one, else `balance`, the rule every
 * lens drawing an env anomaly shares (ramps.ts lensRamp(), the section's as the reference) */
export const dtRamp = (ramp: string | null) => lensRamp({ ramp, realm: "env", var: "", anom: true, lens: "section" });

/** the hover of one cell: the season, the bin, the anomaly with its unit, n and the cruises — or why it is blank */
export function dtHover(r: DtRow | null, season: [number, number], bin: number, unit: string, base: ClimBase): string {
  const head = `${seasonLabel(season[0], season[1])} · ${binLabel(bin)}`;
  if (!r) return `${head}<br>no observations under these filters`;
  if (r.anom == null) return `${head}<br>no ${base === "season" ? "seasonal" : "monthly"} normal for its ${r.n_obs.toLocaleString()} observation${r.n_obs === 1 ? "" : "s"} — left blank`;
  const sign = r.anom > 0 ? "+" : r.anom < 0 ? "−" : "";
  return `${head}<br>anomaly <b>${sign}${Math.abs(r.anom).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}</b>` +
    `<br>n ${r.n.toLocaleString()} observation${r.n === 1 ? "" : "s"}${r.n < r.n_obs ? ` (of ${r.n_obs.toLocaleString()}; the rest had no normal)` : ""}` +
    (r.cruises ? `<br>${r.cruises.split(", ").length > 3 ? `${r.cruises.split(", ").length} cruises` : `cruise ${r.cruises}`}` : "");
}

/** the Plotly heatmap trace: no smoothing (a blank stays blank), the anomaly ramp, a window symmetric about 0 (zmid 0) */
export function dtTrace(g: DtGrid, unit: string, base: ClimBase, ramp: string | null) {
  const [zmin, zmax] = dtRange(g.z.flat());
  return {
    type: "heatmap" as const, x: g.x, y: g.y, z: g.z, zsmooth: false as const, hoverongaps: true,
    colorscale: rampPlotly(dtRamp(ramp)), zmin, zmax, zmid: 0,
    colorbar: { thickness: 10, len: 0.9, title: { text: `Δ ${unit}`, side: "right" as const }, tickfont: { size: 10 } },
    text: g.bins.map((b, i) => g.seasons.map((s, j) => dtHover(g.cell[i][j], s, b, unit, base))),
    hovertemplate: "%{text}<extra></extra>",
  };
}

/** why the card has nothing to draw, or null when it has. The order is what the pick IS before what the filters left:
 * an organism has no normal (the climatology is env-only, and a net tow is depth-integrated); a per-cast variable has no
 * depth; a release or a variable without a climatology has no baseline; then the filters */
export function dtEmpty(p: { realm: "bio" | "env"; cast: boolean; anomAvail: boolean; anomWhyNot?: string | null; rows: DtRow[] | null; filters?: string[] }): string | null {
  if (p.realm === "bio") return "the depth × time anomaly is for an Environment variable: the release's 1993–2013 normals (its climatology table) cover environmental measurements only, and net tows are depth-integrated — pick a variable such as temperature or nitrate";
  if (p.cast) return "a per-cast variable is one value for the whole cast — it has no depth bins to draw";
  if (!p.anomAvail) return p.anomWhyNot ?? "no 1993–2013 normal for this variable in this release";
  if (p.rows == null) return null;   // still loading
  if (!p.rows.length) return `no observations at depth under these filters${p.filters?.length ? `: ${p.filters.join(" · ")}` : ""}`;
  if (p.rows.every((r) => r.anom == null)) return "none of the observations under these filters had a 1993–2013 normal at their station and depth";
  return null;
}

/** a long note as Plotly annotation lines (Plotly does not wrap): <br> between words at about `n` characters */
export function wrapText(s: string, n = 60): string {
  const out: string[] = []; let line = "";
  for (const w of s.split(" ")) { if (line && line.length + 1 + w.length > n) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
  if (line) out.push(line);
  return out.join("<br>");
}
