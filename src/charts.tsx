// Plotly panels: the water-column strip (brush = depth band), the year strip (brush = year range),
// the section heatmap (zsmooth best, anomaly toggle) and the per-cruise series (click = cruise).
import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

function cssVar(n: string) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function base(theme: string) {
  const fg = cssVar("--fg") || "#e6e9ed", muted = cssVar("--muted") || "#9aa0a6", border = cssVar("--border") || "#3a3f44";
  return {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: fg, size: 11, family: cssVar("--sans") || "system-ui" },
    xaxis: { gridcolor: border, zerolinecolor: border, color: muted, linecolor: border },
    yaxis: { gridcolor: border, zerolinecolor: border, color: muted, linecolor: border },
    margin: { l: 44, r: 8, t: 6, b: 28 },
    accent: cssVar("--accent") || (theme === "dark" ? "#4dabf7" : "#2780e3"),
  };
}
const CFG = { displayModeBar: false, responsive: true } as const;

function usePlot(deps: any[], draw: (div: HTMLDivElement) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) draw(ref.current); }, deps);
  return ref;
}

export interface DepthRow { depth_bin: number; n: number; med: number; q1: number; q3: number }
export function DepthStrip(p: { rows: DepthRow[]; band: [number, number]; theme: string; unit: string; onBand: (b: [number, number] | null) => void }) {
  const ref = usePlot([p.rows, p.band, p.theme, p.unit], (div) => {
    const b = base(p.theme);
    const r = p.rows;
    const data: any[] = r.length ? [
      { x: [...r.map((d) => d.q1), ...r.slice().reverse().map((d) => d.q3)], y: [...r.map((d) => d.depth_bin), ...r.slice().reverse().map((d) => d.depth_bin)],
        fill: "toself", fillcolor: "rgba(77,171,247,0.22)", line: { width: 0 }, hoverinfo: "skip", type: "scatter", mode: "lines", name: "IQR" },
      { x: r.map((d) => d.med), y: r.map((d) => d.depth_bin), type: "scatter", mode: "lines", line: { color: b.accent, width: 2 },
        text: r.map((d) => `n ${d.n}`), hovertemplate: "%{y} m: median %{x:.2f}<br>%{text}<extra></extra>", name: "median" },
    ] : [];
    const ymax = r.length ? Math.max(500, ...r.map((d) => d.depth_bin)) : 500;
    Plotly.react(div, data, {
      ...b, showlegend: false, dragmode: "select", selectdirection: "v",
      xaxis: { ...b.xaxis, title: { text: p.unit, standoff: 4 }, side: "top" },
      yaxis: { ...b.yaxis, range: [Math.min(ymax, 520), -5], title: { text: "depth (m)", standoff: 4 }, fixedrange: false },
      margin: { l: 44, r: 6, t: 30, b: 6 },
      shapes: (p.band[0] === 0 && p.band[1] >= 500) ? [] : [{ type: "rect", xref: "paper", x0: 0, x1: 1, y0: p.band[0], y1: p.band[1], fillcolor: "rgba(255,214,10,0.10)", line: { color: "rgba(255,214,10,0.6)", width: 1 } }],
      annotations: r.length ? [] : [{ text: "no depth axis in this cut<br>(depth-integrated tows)", xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false, font: { color: b.font.color, size: 11 } }],
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

export interface YearRow { year: number; n: number; n_samples: number; mean: number | null }
export function YearStrip(p: { rows: YearRow[]; years: [number, number]; theme: string; onYears: (y: [number, number] | null) => void }) {
  const ref = usePlot([p.rows, p.years, p.theme], (div) => {
    const b = base(p.theme);
    Plotly.react(div, [{
      x: p.rows.map((d) => d.year), y: p.rows.map((d) => d.n), type: "bar", marker: { color: b.accent },
      customdata: p.rows.map((d) => d.n_samples), hovertemplate: "%{x}: %{y} rows, %{customdata} samples<extra></extra>",
    }], {
      ...b, showlegend: false, dragmode: "select", selectdirection: "h", bargap: 0.15,
      xaxis: { ...b.xaxis, range: [1948, 2024], fixedrange: true }, yaxis: { ...b.yaxis, title: { text: "rows", standoff: 2 }, fixedrange: true },
      margin: { l: 44, r: 8, t: 6, b: 22 },
      shapes: (p.years[0] <= 1949 && p.years[1] >= 2023) ? [] : [{ type: "rect", yref: "paper", y0: 0, y1: 1, x0: p.years[0] - 0.5, x1: p.years[1] + 0.5, fillcolor: "rgba(255,214,10,0.10)", line: { color: "rgba(255,214,10,0.6)", width: 1 } }],
    }, CFG);
    const d = div as any;
    d.removeAllListeners?.("plotly_selected"); d.removeAllListeners?.("plotly_deselect");
    d.on("plotly_selected", (ev: any) => {
      if (!ev?.range?.x) return;
      const [a, c] = ev.range.x.map((v: number) => Math.round(v)).sort((x: number, y: number) => x - y);
      p.onYears([a, Math.max(a, c)]);
    });
    d.on("plotly_deselect", () => p.onYears(null));
  });
  return <div ref={ref} className="plot fill" />;
}

export interface SectionCell { station: number; y: number; v: number; n: number }
export function SectionPlot(p: { cells: SectionCell[]; clim: SectionCell[] | null; anom: boolean; yLabel: string; theme: string; unit: string; title: string }) {
  const ref = usePlot([p.cells, p.clim, p.anom, p.theme, p.yLabel, p.unit, p.title], (div) => {
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
  const ref = usePlot([p.rows, p.stat, p.selected, p.theme, p.unit], (div) => {
    const b = base(p.theme);
    const y = p.rows.map((d) => (p.stat === "n" ? d.n : d[p.stat]));
    Plotly.react(div, [{
      x: p.rows.map((d) => new Date(d.t0 * 1000)), y, type: "scatter", mode: "markers",
      marker: { size: p.rows.map((d) => (d.cruise_key === p.selected ? 12 : 6)), color: p.rows.map((d) => (d.cruise_key === p.selected ? "#ffd60a" : b.accent)), line: { width: 0.5, color: "#000" } },
      text: p.rows.map((d) => `${d.cruise_key}<br>${d.n_sta} stations, ${d.n} rows`), hovertemplate: "%{text}<br>%{y:.2f}<extra></extra>",
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
