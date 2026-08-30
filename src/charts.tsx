// Plotly panels: the water-column strip (brush = depth band), the year strip (brush = year range),
// the section heatmap (zsmooth best, anomaly toggle) and the per-cruise series (click = cruise).
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { colorScale, quantileDomain } from "./map";
// Plotly is ~3.5 MB of the bundle and no panel needs it before the slice answers: load it lazily
let PlotlyMod: any = null;
const plotly = () => PlotlyMod ? Promise.resolve(PlotlyMod) : import("plotly.js-dist-min").then((m) => (PlotlyMod = m.default ?? m));

function cssVar(n: string) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function base(theme: string) {
  // the fallbacks only apply before getComputedStyle answers: brand v2's light values (the default theme)
  const fg = cssVar("--fg") || "#182b49", muted = cssVar("--muted") || "#66686a", border = cssVar("--border") || "#dddddd";
  return {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: fg, size: 11, family: cssVar("--sans") || "system-ui" },
    xaxis: { gridcolor: border, zerolinecolor: border, color: muted, linecolor: border },
    yaxis: { gridcolor: border, zerolinecolor: border, color: muted, linecolor: border },
    margin: { l: 44, r: 8, t: 6, b: 28 },
    accent: cssVar("--accent") || (theme === "dark" ? "#4fb6e6" : "#00629b"), muted,
    // the selection highlight: the brand's yellow (UCSD #ffcd00 in v2) — the one place the accent lands inside the data view
    pick: cssVar("--cc-yellow") || "#ffd60a",
  };
}
const CFG = { displayModeBar: false, responsive: true } as const;

// a plot draws only once its container has a size (a rail mid-transition is 28 px wide, and Plotly lays
// out Infinity into it) and follows the container's size thereafter — `responsive: true` only watches the
// window, and the rails resize their tracks without one
function usePlot(deps: any[], draw: (div: HTMLDivElement, Plotly: any) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const drawn = useRef(false);
  useEffect(() => {
    let live = true; const div = ref.current; if (!div) return;
    const sized = () => div.clientWidth >= 40 && div.clientHeight >= 40;
    let P: any = null;
    const go = () => { if (!live || !P) return; if (sized()) { draw(div, P); drawn.current = true; } };
    plotly().then((m) => { P = m; go(); });
    const ro = new ResizeObserver(() => { if (!live || !P) return; if (!drawn.current) go(); else if (sized()) P.Plots.resize(div); });
    ro.observe(div);
    return () => { live = false; ro.disconnect(); };
  }, deps);
  return ref;
}

export interface DepthRow { depth_bin: number; n: number; med: number; q1: number; q3: number; dataset_key?: string }
// the water-column strip; `byDataset` (the maximized wide profile) adds one median line per dataset in its colour
export function DepthStrip(p: { rows: DepthRow[]; band: [number, number]; theme: string; unit: string; onBand: (b: [number, number] | null) => void; empty?: string; byDataset?: { rows: DepthRow[]; color: (dk: string) => string; short: (dk: string) => string } | null }) {
  const ref = usePlot([p.rows, p.band, p.theme, p.unit, p.empty, p.byDataset], (div, Plotly) => {
    const b = base(p.theme);
    const r = p.rows;
    const ds = p.byDataset ? [...new Set(p.byDataset.rows.map((d) => d.dataset_key!))] : [];
    const perDs: any[] = ds.map((dk) => { const rr = p.byDataset!.rows.filter((d) => d.dataset_key === dk); return {
      x: rr.map((d) => d.med), y: rr.map((d) => d.depth_bin), type: "scatter", mode: "lines", line: { color: p.byDataset!.color(dk), width: 1.5, dash: "dot" }, name: p.byDataset!.short(dk),
      text: rr.map((d) => `n ${d.n}`), hovertemplate: `${p.byDataset!.short(dk)} %{y} m: median %{x:.2f}<br>%{text}<extra></extra>` }; });
    const data: any[] = r.length ? [
      { x: [...r.map((d) => d.q1), ...r.slice().reverse().map((d) => d.q3)], y: [...r.map((d) => d.depth_bin), ...r.slice().reverse().map((d) => d.depth_bin)],
        fill: "toself", fillcolor: "rgba(77,171,247,0.22)", line: { width: 0 }, hoverinfo: "skip", type: "scatter", mode: "lines", name: "IQR" },
      { x: r.map((d) => d.med), y: r.map((d) => d.depth_bin), type: "scatter", mode: "lines", line: { color: b.accent, width: 2 },
        text: r.map((d) => `n ${d.n}`), hovertemplate: "%{y} m: median %{x:.2f}<br>%{text}<extra></extra>", name: "median" },
      ...perDs,
    ] : [];
    const ymax = r.length ? Math.max(500, ...r.map((d) => d.depth_bin)) : 500;
    Plotly.react(div, data, {
      ...b, showlegend: perDs.length > 0, legend: { orientation: "h", y: -0.02, font: { size: 10 } }, dragmode: "select", selectdirection: "v",
      xaxis: { ...b.xaxis, title: { text: p.unit, standoff: 4 }, side: "top" },
      yaxis: { ...b.yaxis, range: [Math.min(ymax, 520), -5], title: { text: "depth (m)", standoff: 4 }, fixedrange: false },
      margin: { l: 44, r: 6, t: 30, b: 6 },
      shapes: (p.band[0] === 0 && p.band[1] >= 500) ? [] : [{ type: "rect", xref: "paper", x0: 0, x1: 1, y0: p.band[0], y1: p.band[1], fillcolor: "rgba(255,214,10,0.10)", line: { color: "rgba(255,214,10,0.6)", width: 1 } }],
      annotations: r.length ? [] : [{ text: p.empty ?? "no depth axis in this cut<br>(depth-integrated tows)", xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false, font: { color: b.muted, size: 11 }, align: "center" }],
    }, CFG);
    const d = div as any;
    d.removeAllListeners?.("plotly_selected"); d.removeAllListeners?.("plotly_deselect");
    d.on("plotly_selected", (ev: any) => {
      if (!ev?.range?.y) return;
      const [a, c] = ev.range.y.map((v: number) => Math.round(v / 10) * 10).sort((x: number, y: number) => x - y);
      p.onBand([Math.max(0, a), Math.max(a + 10, c)]);
    });
    d.on("plotly_deselect", () => p.onBand(null));
  });
  return <div ref={ref} className="plot fill" />;
}

export interface YearRow { year: number; n: number; n_samples: number; mean: number | null; se?: number | null }
export interface GanttRow extends CruiseRow { ship: string; lane: number }
export type StripMode = "n" | "mean" | "cruises";
export const MONTH_LOD_YEARS = 15; // bins are months when the zoom window is at most this many years (D20)
// fractional years <-> dates (the Gantt's x axis is a date axis; the zoom window is kept in fractional years for every mode)
export const fyToDate = (fy: number) => { const y = Math.floor(fy), a = Date.UTC(y, 0, 1), z = Date.UTC(y + 1, 0, 1); return new Date(a + (fy - y) * (z - a)); };
export const dateToFy = (d: Date) => { const y = d.getUTCFullYear(), a = Date.UTC(y, 0, 1), z = Date.UTC(y + 1, 0, 1); return y + (d.getTime() - a) / (z - a); };
const plotlyDate = (v: any) => (v instanceof Date ? v : new Date(String(v).replace(" ", "T") + (String(v).length <= 10 ? "T00:00:00Z" : "Z")));
const yearsToFy = (y: [number, number], m: [number, number] | null): [number, number] => [y[0] + (m ? (m[0] - 1) / 12 : 0), y[1] + (m ? m[1] / 12 : 1)];

// the year strip (D20): brush = filter (years=, month-resolved when zoomed in), wheel / pinch = zoom (yview=),
// double-click = reset, ⤢ on the brush = zoom to the selection, a context bar to pan when zoomed; bins are years
// over > 15 years and months at <= 15; modes: observations · mean ± se · cruises (a Gantt in lanes by ship — no
// two cruises of one ship overlap — coloured by the summary stat, labelled once a bar is >= 40 px, click = pick)
export function YearStrip(p: {
  rows: YearRow[]; monthRows: YearRow[] | null; onNeedMonths?: (need: boolean) => void;
  years: [number, number]; months: [number, number] | null; yearMax: number; theme: string; mode: StripMode; unit: string; stat: "mean" | "med" | "n";
  view: [number, number] | null; onView: (v: [number, number] | null) => void;
  onYears: (y: [number, number] | null, months?: [number, number] | null) => void;
  gantt?: { rows: GanttRow[]; lanes: string[]; selected: string | null; onPick: (k: string) => void } | null;
}) {
  const [handle, setHandle] = useState<number | null>(null);
  const full: [number, number] = [1948, p.yearMax + 1];
  const view = p.view ?? full;
  const span = view[1] - view[0];
  const wantMonths = p.mode !== "cruises" && span <= MONTH_LOD_YEARS;
  useEffect(() => { p.onNeedMonths?.(wantMonths); }, [wantMonths]);
  const monthly = wantMonths && !!p.monthRows?.length;
  const isDate = p.mode === "cruises";
  const yearsSet = p.years[0] > 1949 || p.years[1] < p.yearMax || !!p.months;
  const fy = yearsToFy(p.years, p.months);
  const toX = (v: number) => (isDate ? fyToDate(v) : v);
  const ref = usePlot([p.rows, p.monthRows, p.years, p.months, p.yearMax, p.theme, p.mode, p.unit, p.stat, p.view, p.gantt, monthly], (div, Plotly) => {
    const b = base(p.theme);
    const r = monthly ? p.monthRows! : p.rows;
    const bw = monthly ? 1 / 12 : 0.85;
    const gap = monthly ? 1 / 12 + 1e-6 : 1;
    let data: any[] = [];
    let layout: any = {};
    if (p.mode === "n") {
      data = [{ x: r.map((d) => d.year), y: r.map((d) => d.n), type: "bar", width: bw, marker: { color: b.accent },
        customdata: r.map((d) => d.n_samples), hovertemplate: (monthly ? "%{x:.2f}" : "%{x}") + ": %{y} observations, %{customdata} samples<extra></extra>" }];
    } else if (p.mode === "mean") {
      const xs: (number | null)[] = [], ys: (number | null)[] = [], lo: (number | null)[] = [], hi: (number | null)[] = [];
      for (let i = 0; i < r.length; i++) {
        if (i > 0 && r[i].year - r[i - 1].year > gap) { xs.push(r[i].year - gap); ys.push(null); lo.push(null); hi.push(null); }
        xs.push(r[i].year); ys.push(r[i].mean); lo.push(r[i].mean != null && r[i].se != null ? r[i].mean! - r[i].se! : null); hi.push(r[i].mean != null && r[i].se != null ? r[i].mean! + r[i].se! : null);
      }
      data = [
        { x: xs, y: lo, type: "scatter", mode: "lines", line: { width: 0 }, hoverinfo: "skip", connectgaps: false, showlegend: false },
        { x: xs, y: hi, type: "scatter", mode: "lines", fill: "tonexty", fillcolor: "rgba(77,171,247,0.22)", line: { width: 0 }, hoverinfo: "skip", connectgaps: false, showlegend: false },
        { x: xs, y: ys, type: "scatter", mode: "lines+markers", line: { color: b.accent, width: 2 }, marker: { size: monthly ? 3 : 4 }, connectgaps: false,
          customdata: r.map((d) => d.n), hovertemplate: (monthly ? "%{x:.2f}" : "%{x}") + ": mean %{y:.3g} ± se<br>n %{customdata}<extra></extra>" },
      ];
    } else if (p.gantt) {
      const g = p.gantt.rows;
      const vals = g.map((d) => (p.stat === "n" ? d.n : d[p.stat]) as number);
      const dom = quantileDomain(vals, p.stat), col = colorScale(dom, 255);
      const nmax = Math.max(1, ...g.map((d) => d.n));
      data = [{
        type: "bar", orientation: "h", y: g.map((d) => d.lane), base: g.map((d) => new Date(d.t0 * 1000).toISOString()), x: g.map((d) => Math.max(86400e3, (d.t1 - d.t0) * 1000)),
        marker: { color: g.map((d) => { const c = col(p.stat === "n" ? d.n : d[p.stat]); return `rgba(${c[0]},${c[1]},${c[2]},${(0.45 + 0.55 * Math.sqrt(d.n / nmax)).toFixed(2)})`; }), line: { width: g.map((d) => (d.cruise_key === p.gantt!.selected ? 2 : 0.5)), color: g.map((d) => (d.cruise_key === p.gantt!.selected ? b.pick : "rgba(0,0,0,0.5)")) } },
        width: 0.8, customdata: g.map((d) => [d.cruise_key, new Date(d.t0 * 1000).toISOString().slice(0, 10), new Date(d.t1 * 1000).toISOString().slice(0, 10), d.n_sta, d.n, fmtStat(p.stat === "n" ? d.n : d[p.stat]), d.ship]),
        hovertemplate: "<b>%{customdata[0]}</b> · %{customdata[6]}<br>%{customdata[1]} → %{customdata[2]} · %{customdata[3]} stations · %{customdata[4]} observations · " + p.stat + " %{customdata[5]}<extra></extra>",
      }];
      // lane labels only when a lane is >= 9 px tall (the maximized strip); folded into the hover otherwise
      const laneH = (div.clientHeight - 28) / Math.max(1, p.gantt.lanes.length);
      layout = { yaxis: { ...b.yaxis, tickvals: p.gantt.lanes.map((_, i) => i), ticktext: p.gantt.lanes, autorange: "reversed", fixedrange: true, tickfont: { size: 9 }, showgrid: false, showticklabels: laneH >= 9, title: { text: laneH >= 9 ? "" : `${p.gantt.lanes.length} ships`, standoff: 2 } }, bargap: 0.1 };
    }
    const brush = yearsSet ? [{ type: "rect", yref: "paper", y0: 0, y1: 1, x0: toX(fy[0]), x1: toX(fy[1]), fillcolor: "rgba(255,214,10,0.10)", line: { color: "rgba(255,214,10,0.6)", width: 1 } }] : [];
    Plotly.react(div, data, {
      ...b, showlegend: false, dragmode: "select", selectdirection: "h", bargap: 0.15,
      xaxis: { ...b.xaxis, type: isDate ? "date" : "linear", range: [toX(view[0]), toX(view[1])], fixedrange: false, tickformat: isDate ? undefined : monthly ? ".0f" : undefined },
      yaxis: { ...b.yaxis, title: { text: p.mode === "n" ? "observations" : p.mode === "mean" ? `mean ${p.unit}` : "", standoff: 2 }, fixedrange: true },
      margin: { l: p.mode === "cruises" ? (layout.yaxis?.showticklabels ? 96 : 44) : 44, r: 8, t: 6, b: 22 }, shapes: brush, annotations: [], ...layout,
    }, { ...CFG, scrollZoom: true, doubleClick: false as any });
    const d = div as any;
    const xaxis = () => d._fullLayout?.xaxis;
    const px = (v: number) => { const ax = xaxis(); if (!ax) return null; const x = isDate ? fyToDate(v).getTime() : v; return ax._offset + ax.d2p(x); };
    const place = () => { const x = yearsSet ? px(fy[1]) : null; setHandle(x != null && Number.isFinite(x) ? x : null); };
    // cruise codes appear only where a bar is >= 40 px wide (zoom in for more); recomputed on every relayout
    let labelSig = "";
    const label = () => {
      if (p.mode !== "cruises" || !p.gantt) return;
      const ax = xaxis(); if (!ax) return;
      const [r0, r1] = (ax.range ?? []).map((v: any) => plotlyDate(v).getTime());
      const vis = p.gantt.rows.filter((c) => Math.abs(ax.d2p(c.t1 * 1000) - ax.d2p(c.t0 * 1000)) >= 40 && (r1 == null || c.t0 * 1000 <= r1) && (r0 == null || c.t1 * 1000 >= r0));
      const sig = vis.map((c) => c.cruise_key).join(",");
      if (sig === labelSig) return; labelSig = sig; // a relayout of annotations fires plotly_relayout again: write only a changed set
      Plotly.relayout(div, { annotations: vis.map((c) => ({ x: new Date((c.t0 + c.t1) / 2 * 1000).toISOString(), y: c.lane, text: c.cruise_key, showarrow: false, font: { size: 9, color: "#fff" }, xanchor: "center", yanchor: "middle" })) });
    };
    place(); label();
    d.removeAllListeners?.("plotly_selected"); d.removeAllListeners?.("plotly_deselect"); d.removeAllListeners?.("plotly_relayout"); d.removeAllListeners?.("plotly_click"); d.removeAllListeners?.("plotly_doubleclick");
    if (!d.__ccDbl) { d.__ccDbl = true; div.addEventListener("dblclick", () => d.__ccOnDbl?.()); }
    d.__ccOnDbl = () => p.onView(null);
    d.on("plotly_selected", (ev: any) => {
      if (!ev?.range?.x) return;
      const [a, c] = (ev.range.x as any[]).map((v) => (isDate ? dateToFy(plotlyDate(v)) : +v)).sort((x, y) => x - y);
      if (monthly || isDate) { // month resolution: the brush edges snap to month bounds
        const y0 = Math.floor(a), m0 = Math.min(12, Math.floor((a - y0) * 12) + 1), y1 = Math.floor(c), m1 = Math.min(12, Math.floor((c - y1) * 12) + 1);
        const whole = m0 === 1 && m1 === 12;
        p.onYears([y0, Math.max(y0, y1)], whole ? null : [m0, m1]);
      } else { const a2 = Math.round(a), c2 = Math.round(c); p.onYears([a2, Math.max(a2, c2)], null); }
    });
    d.on("plotly_deselect", () => p.onYears(null, null));
    d.on("plotly_relayout", (ev: any) => {
      const zoomed = ev["xaxis.autorange"] || ev["xaxis.range[0]"] != null || ev["xaxis.range"];
      if (!zoomed) return; // an annotations-only relayout (ours) is not a view change
      if (ev["xaxis.autorange"]) p.onView(null);
      else if (ev["xaxis.range[0]"] != null || ev["xaxis.range"]) {
        const r0 = ev["xaxis.range"]?.[0] ?? ev["xaxis.range[0]"], r1 = ev["xaxis.range"]?.[1] ?? ev["xaxis.range[1]"];
        const v: [number, number] = [isDate ? dateToFy(plotlyDate(r0)) : +r0, isDate ? dateToFy(plotlyDate(r1)) : +r1];
        const clamped: [number, number] = [Math.max(full[0], v[0]), Math.min(full[1], v[1])];
        if (clamped[1] - clamped[0] >= full[1] - full[0] - 0.01) p.onView(null); else p.onView([+clamped[0].toFixed(3), +clamped[1].toFixed(3)]);
      }
      place(); label();
    });
    if (p.gantt) d.on("plotly_click", (ev: any) => { const i = ev?.points?.[0]?.pointIndex; if (i != null) p.gantt!.onPick(p.gantt!.rows[i].cruise_key); });
  });
  const zoomToSel = () => p.onView([Math.max(full[0], fy[0] - span * 0.02), Math.min(full[1], fy[1] + span * 0.02)]);
  return (
    <div className="yearstrip">
      <div ref={ref} className="plot fill" />
      {handle != null && yearsSet && <div className="brush-handle" style={{ left: handle }}>
        <button type="button" title="zoom to the selected years" aria-label="zoom to selection" onClick={zoomToSel}><Icon name="ui-zoom-sel" /></button>
        <button type="button" title="clear the year filter" aria-label="clear years" onClick={() => p.onYears(null, null)}><Icon name="ui-close" /></button>
      </div>}
      {p.view && <ContextBar full={full} view={p.view} onView={p.onView} left={44} />}
    </div>
  );
}
const fmtStat = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));
/** the thin bar under the axis when zoomed: the full record with the window highlighted; drag to pan, double-click to reset */
function ContextBar(p: { full: [number, number]; view: [number, number]; onView: (v: [number, number] | null) => void; left: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const span = p.full[1] - p.full[0];
  const l = ((p.view[0] - p.full[0]) / span) * 100, w = ((p.view[1] - p.view[0]) / span) * 100;
  const onDown = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const W = el.getBoundingClientRect().width, x0 = e.clientX, v0 = p.view[0], vw = p.view[1] - p.view[0];
    const move = (ev: PointerEvent) => { const dv = ((ev.clientX - x0) / W) * span; const a = Math.min(p.full[1] - vw, Math.max(p.full[0], v0 + dv)); p.onView([+a.toFixed(3), +(a + vw).toFixed(3)]); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  return (
    <div ref={ref} className="context-bar" title="the whole record · drag to pan · double-click to zoom out" onPointerDown={onDown} onDoubleClick={() => p.onView(null)}>
      <div className="context-win" style={{ left: `${l}%`, width: `${Math.max(0.5, w)}%` }} />
      <span className="context-lab">{p.full[0] + 1}</span><span className="context-lab right">{p.full[1] - 1}</span>
    </div>
  );
}

export interface SectionCell { station: number; y: number; v: number; n: number }
export function SectionPlot(p: { cells: SectionCell[]; clim: SectionCell[] | null; anom: boolean; yLabel: string; theme: string; unit: string; title: string }) {
  const ref = usePlot([p.cells, p.clim, p.anom, p.theme, p.yLabel, p.unit, p.title], (div, Plotly) => {
    const b = base(p.theme);
    const xs = [...new Set(p.cells.map((c) => c.station))].sort((a, c) => a - c);
    const ys = [...new Set(p.cells.map((c) => c.y))].sort((a, c) => a - c);
    const climMap = new Map((p.clim ?? []).map((c) => [`${c.station}|${c.y}`, c.v]));
    const z = ys.map((y) => xs.map((x) => {
      const c = p.cells.find((d) => d.station === x && d.y === y);
      if (!c) return null;
      if (!p.anom) return c.v;
      const k = climMap.get(`${x}|${y}`);
      return k == null ? null : c.v - k;
    }));
    const isDepth = p.yLabel.startsWith("depth");
    Plotly.react(div, xs.length ? [{
      type: "heatmap", x: xs, y: ys, z, zsmooth: "best", connectgaps: false,
      colorscale: p.anom ? "RdBu" : "Viridis", reversescale: p.anom, zmid: p.anom ? 0 : undefined,
      colorbar: { thickness: 10, len: 0.9, title: { text: p.anom ? `Δ ${p.unit}` : p.unit, side: "right" }, tickfont: { size: 10 } },
      hovertemplate: `station %{x}<br>${p.yLabel} %{y}<br>%{z:.2f}<extra></extra>`,
    }] : [], {
      ...b, title: { text: p.title, font: { size: 12 }, x: 0.02, xanchor: "left", y: 0.98 },
      xaxis: { ...b.xaxis, title: { text: "station (nearshore → offshore)", standoff: 4 }, type: "category" },
      yaxis: { ...b.yaxis, title: { text: p.yLabel, standoff: 4 }, autorange: isDepth ? "reversed" : true },
      margin: { l: 50, r: 10, t: 28, b: 36 },
      annotations: xs.length ? [] : [{ text: "no rows for this line × cruise × filters", xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false }],
    }, CFG);
  });
  return <div ref={ref} className="plot fill" />;
}

export interface CruiseRow { cruise_key: string; n: number; n_samples: number; n_sta: number; mean: number | null; med: number | null; t0: number; t1: number }
export function CruiseSeries(p: { rows: CruiseRow[]; stat: "mean" | "med" | "n"; selected: string | null; theme: string; unit: string; onPick: (k: string) => void }) {
  const ref = usePlot([p.rows, p.stat, p.selected, p.theme, p.unit], (div, Plotly) => {
    const b = base(p.theme);
    const y = p.rows.map((d) => (p.stat === "n" ? d.n : d[p.stat]));
    Plotly.react(div, [{
      x: p.rows.map((d) => new Date(d.t0 * 1000)), y, type: "scatter", mode: "markers",
      marker: { size: p.rows.map((d) => (d.cruise_key === p.selected ? 12 : 6)), color: p.rows.map((d) => (d.cruise_key === p.selected ? b.pick : b.accent)), line: { width: 0.5, color: "#000" } },
      text: p.rows.map((d) => `${d.cruise_key}<br>${d.n_sta} stations, ${d.n} observations`), hovertemplate: "%{text}<br>%{y:.2f}<extra></extra>",
    }], {
      ...b, showlegend: false, xaxis: { ...b.xaxis, fixedrange: true }, yaxis: { ...b.yaxis, title: { text: `${p.stat} ${p.unit}`, standoff: 2 }, fixedrange: true },
      margin: { l: 44, r: 8, t: 6, b: 22 }, hovermode: "closest",
    }, CFG);
    const d = div as any;
    d.removeAllListeners?.("plotly_click");
    d.on("plotly_click", (ev: any) => { const i = ev?.points?.[0]?.pointIndex; if (i != null) p.onPick(p.rows[i].cruise_key); });
  });
  return <div ref={ref} className="plot fill" />;
}

// the station coverage card (db-viz-station's per-dataset "observations by year" + "seasonality"):
// one small Plotly per dataset from coverage_stations.json — years as bars, months as a 12-cell row
export function StationCard(p: {
  summary?: { datasets: { dataset_key: string; n_obs: number; n_roots: number; year_min: number; year_max: number }[] };
  detail?: { datasets: { dataset_key: string; n_obs: number; year_min: number; year_max: number; years: [number, number][]; months: number[] }[] };
  theme: string; short: (d: string) => string; yearMax: number;
}) {
  const ds = p.detail?.datasets ?? p.summary?.datasets?.map((d) => ({ ...d, years: [] as [number, number][], months: [] as number[] })) ?? [];
  return <div className="cards">
    {!ds.length && <div className="hint">no coverage at this station</div>}
    {ds.map((d) => <StationDatasetRow key={d.dataset_key} d={d} theme={p.theme} short={p.short} yearMax={p.yearMax} />)}
  </div>;
}
function StationDatasetRow(p: { d: { dataset_key: string; n_obs: number; year_min: number; year_max: number; years: [number, number][]; months: number[] }; theme: string; short: (d: string) => string; yearMax: number }) {
  const ref = usePlot([p.d, p.theme, p.yearMax], (div, Plotly) => {
    const b = base(p.theme);
    const ys = p.d.years ?? [];
    Plotly.react(div, [
      { x: ys.map((y) => y[0]), y: ys.map((y) => y[1]), type: "bar", marker: { color: b.accent }, xaxis: "x", yaxis: "y", hovertemplate: "%{x}: %{y} obs<extra></extra>" },
      { x: Array.from({ length: 12 }, (_, i) => i + 1), y: (p.d.months ?? []).length ? p.d.months : Array(12).fill(0), type: "bar", marker: { color: b.accent, opacity: 0.6 }, xaxis: "x2", yaxis: "y2", hovertemplate: "month %{x}: %{y} obs<extra></extra>" },
    ], {
      ...b, showlegend: false, height: 84, margin: { l: 4, r: 4, t: 2, b: 14 }, bargap: 0.1,
      xaxis: { ...b.xaxis, domain: [0, 0.72], range: [1948, p.yearMax + 1], showgrid: false, tickfont: { size: 8 }, fixedrange: true },
      yaxis: { ...b.yaxis, showticklabels: false, showgrid: false, fixedrange: true },
      xaxis2: { ...b.xaxis, domain: [0.76, 1], range: [0.5, 12.5], showgrid: false, tickvals: [1, 6, 12], tickfont: { size: 8 }, fixedrange: true, anchor: "y2" },
      yaxis2: { ...b.yaxis, showticklabels: false, showgrid: false, fixedrange: true, anchor: "x2" },
    }, CFG);
  });
  return <div className="card">
    <div className="row" style={{ justifyContent: "space-between", fontSize: 11 }}><b>{p.short(p.d.dataset_key)}</b><span className="hint">{p.d.n_obs.toLocaleString()} obs · {p.d.year_min}–{p.d.year_max}</span></div>
    <div ref={ref} style={{ height: 84 }} />
  </div>;
}
