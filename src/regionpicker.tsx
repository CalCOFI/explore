// the region modal (explore#20 · explore#16; Ben, 2026-10-14: "allow ALL features in a given layer to be used as the
// filter … a large modal for selecting individual features from a table and/or on the map for clickable inclusion").
// Left: the layer's regions that hold samples in this release — a sortable, searchable table with a checkbox each,
// select all / none and a count. Right: the layer's own polygons from its PMTiles (the CalCOFI bucket or the oceanmetrics
// gazetteer, the same source the Layers card draws — spatial_registry.ts pmtilesSource), where a click toggles a region:
// chosen ones in the Area outline's yellow, ones with samples in the layer's colour, ones without grey and dashed (they
// cannot be chosen: no sample of the release falls inside). Apply hands the set back; Cancel and Esc change nothing.
// The rules (matching a polygon to a region, the table's sort, what Apply means) are pure, in src/area.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CARTO_URL, spatialBaseUrl, type RegionStatus, type SpatialLayerDef } from "./basemap";
import { pmtilesSource, statusWord } from "./spatial_registry";
import { filterSortRegions, regionMatchExpr, regionsOfFeatureProps, type RegionRow, type RegionSort } from "./area";
import { IconButton } from "./ui";
import { Icon } from "./icons";

const PICKED = "#ffd60a"; // the Area outline's yellow (map.tsx area-outline)
const OFF = { dark: "#6b7177", light: "#9aa0a6" };

export interface RegionPickerProps {
  layer: string;                                   // the sample_spatial layer name
  def: SpatialLayerDef | undefined;                // its registry row (the polygons), if the registry has one
  regions: { name: string; n: number }[];          // the release's regions of the layer with samples
  status: Map<string, RegionStatus>;               // the sidecar's region_status, by name (empty before v2026.10.14)
  initial: string[] | null;                        // the current pick; null = the whole layer
  base: string;                                    // the sidecar's pmtiles_base
  bounds: [number, number, number, number] | null; // where the regions with samples are
  theme: "dark" | "light";
  fmtN: (x: number) => string;
  onApply: (names: string[]) => void;
  onCancel: () => void;
}

export function RegionPicker(p: RegionPickerProps) {
  const names = useMemo(() => p.regions.map((r) => r.name), [p.regions]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(p.initial ?? names));
  const [q, setQ] = useState("");
  const [by, setBy] = useState<RegionSort>("name");
  const [desc, setDesc] = useState(false);
  const [featStatus, setFeatStatus] = useState<Map<string, { status: string; status_date: string | null }>>(new Map());
  const [hover, setHover] = useState<string | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const cb = useRef(p); cb.current = p;

  // Esc cancels before any app-level handler sees it (a maximized panel would restore itself); focus returns on close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    search.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); cb.current.onCancel(); } };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); prev?.focus?.(); };
  }, []);

  // the status column: the release's region_status, else the polygons' own (a gazetteer feature carries status and
  // status_date) — matched to regions by the same rule as a click, kept when every polygon of a region agrees
  const rows: RegionRow[] = useMemo(() => p.regions.map((r) => {
    const s = p.status.get(r.name), f = featStatus.get(r.name);
    return { name: r.name, n: r.n, status: s?.status ?? f?.status ?? null, status_date: s?.status_date ?? f?.status_date ?? null };
  }), [p.regions, p.status, featStatus]);
  const shown = useMemo(() => filterSortRegions(rows, q, by, desc), [rows, q, by, desc]);
  const toggle = (ns: string[]) => setPicked((s) => {
    const n = new Set(s), allOn = ns.every((x) => n.has(x));
    for (const x of ns) allOn ? n.delete(x) : n.add(x);
    return n;
  });
  const setMany = (ns: string[], on: boolean) => setPicked((s) => { const n = new Set(s); for (const x of ns) on ? n.add(x) : n.delete(x); return n; });
  const sortBy = (k: RegionSort) => { if (k === by) setDesc(!desc); else { setBy(k); setDesc(k === "n"); } };
  const shownOn = shown.filter((r) => picked.has(r.name)).length;

  // ── the map: the layer's polygons from its own PMTiles ──
  const src = p.def && p.def.geom !== "raster" && p.def.geom !== "label" ? pmtilesSource(p.def, spatialBaseUrl(p.base)) : null;
  // a polygon names its region by the row's name_field, else `name`, else the gazetteer's `source_id` (area.ts
  // featureNameFields: the AOA tiles carry "Southern California AOA N2-E" as `name` and "N2-E" as `source_id`)
  const nameField = p.def?.name_field ?? null;
  const regionsOf = (props: any) => regionsOfFeatureProps(props, nameField, names);
  useEffect(() => {
    if (!mapEl.current || !src || !p.def) { setMapNote(p.def ? null : "this layer has no boundary tiles in the registry — choose in the table"); return; }
    const d = p.def;
    const m = new maplibregl.Map({ container: mapEl.current, style: CARTO_URL[p.theme], attributionControl: false,
      bounds: p.bounds ?? [-126, 29, -114, 38.5], fitBoundsOptions: { padding: 30 } });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current = m; (window as any).__regionMap = m; // like window.__map: the smoke and screenshot scripts drive it
    const base = d.filter ? [d.filter] : [];
    const only = (e: any) => (base.length ? ["all", ...base, e] : e);
    m.on("load", () => {
      m.addSource("rp", { type: "vector", url: src.url, ...(d.attribution ? { attribution: d.attribution } : {}) });
      const common = { source: "rp", "source-layer": src.layer };
      m.addLayer({ id: "rp-fill", type: "fill", ...common, ...(base.length ? { filter: base[0] } : {}), paint: { "fill-color": OFF[p.theme], "fill-opacity": 0.08 } } as any);
      m.addLayer({ id: "rp-off", type: "line", ...common, filter: only(["!", regionMatchExpr(names, names, nameField)]), paint: { "line-color": OFF[p.theme], "line-width": 1, "line-dasharray": [2, 2] } } as any);
      m.addLayer({ id: "rp-on", type: "line", ...common, filter: only(regionMatchExpr(names, names, nameField)), paint: { "line-color": d.line_color || d.fill_color || "#2a78d6", "line-width": 1.5 } } as any);
      m.addLayer({ id: "rp-picked", type: "line", ...common, filter: only(false), paint: { "line-color": PICKED, "line-width": 2.5 } } as any);
      paint();
    });
    m.on("error", (e: any) => { if (String(e?.sourceId ?? "").startsWith("rp")) setMapNote("the boundary tiles did not load — choose in the table"); });
    const at = (e: maplibregl.MapMouseEvent) => m.getLayer("rp-fill") ? m.queryRenderedFeatures(e.point, { layers: ["rp-fill"] }) : [];
    m.on("mousemove", (e) => {
      const fs = at(e), pr = fs[0]?.properties, regs = [...new Set(fs.flatMap((f) => regionsOf(f.properties)))];
      const nm = pr ? (pr.name ?? pr[nameField ?? "name"] ?? null) : null;
      m.getCanvas().style.cursor = regs.length ? "pointer" : "";
      setHover(nm ? `${nm}${regs.length ? (regs.length === 1 && regs[0] === nm ? "" : ` → ${regs.join(", ")}`) : " — no samples in this release"}` : null);
    });
    m.on("mouseout", () => setHover(null));
    m.on("click", (e) => {
      const ns = [...new Set(at(e).flatMap((f) => regionsOf(f.properties)))];
      if (ns.length) toggle(ns);
    });
    // a gazetteer feature carries its own status: the table shows it where the release has none (v2026.10.13)
    m.on("idle", () => {
      if (!m.getSource("rp")) return;
      const got = new Map<string, { status: string; status_date: string | null }>(), clash = new Set<string>();
      for (const f of m.querySourceFeatures("rp", { sourceLayer: src.layer })) {
        const pr = f.properties ?? {}; if (!pr.status) continue;
        const s = { status: String(pr.status), status_date: pr.status_date ? String(pr.status_date) : null };
        for (const r of regionsOf(pr)) {
          const o = got.get(r);
          if (o && (o.status !== s.status || o.status_date !== s.status_date)) clash.add(r); else got.set(r, s);
        }
      }
      for (const r of clash) got.delete(r);
      if (got.size) setFeatStatus((old) => (old.size >= got.size ? old : got));
    });
    return () => { m.remove(); map.current = null; (window as any).__regionMap = null; };
  }, [p.def?.id, p.theme]);

  const paint = () => {
    const m = map.current; if (!m || !m.getLayer("rp-fill") || !p.def) return;
    const sel = [...pickedRef.current];
    const pickedE = regionMatchExpr(sel, names, nameField), haveE = regionMatchExpr(names, names, nameField);
    const color = p.def.fill_color || p.def.line_color || "#2a78d6";
    m.setPaintProperty("rp-fill", "fill-color", ["case", pickedE, PICKED, haveE, color, OFF[p.theme]]);
    m.setPaintProperty("rp-fill", "fill-opacity", ["case", pickedE, 0.45, haveE, 0.22, 0.06]);
    m.setFilter("rp-picked", (p.def.filter ? ["all", p.def.filter, pickedE] : pickedE) as any);
  };
  useEffect(paint, [picked]);

  const th = (k: RegionSort, label: string, cls = "") => (
    <th className={cls} aria-sort={by === k ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" className="rp-sort" onClick={() => sortBy(k)}>{label}{by === k && <Icon name={desc ? "ui-down" : "ui-up"} size="0.8rem" />}</button>
    </th>);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onCancel(); }}>
      <div ref={ref} className="modal modal-regions" role="dialog" aria-modal="true" aria-labelledby="regions-title" tabIndex={-1}>
        <header className="rail-head modal-head"><Icon name="ui-filter" /><b id="regions-title">Area › regions of {p.layer}</b><span className="spacer" /><IconButton icon="ui-close" label="Cancel (Esc)" className="sm" onClick={p.onCancel} /></header>
        <div className="rp-body">
          <div className="rp-table">
            <div className="rp-tools">
              <input ref={search} type="search" placeholder="search name or status" aria-label="search regions" value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="button" className="pill act" onClick={() => setMany(shown.map((r) => r.name), true)} title={q ? "select every region the search shows" : "select every region"}>all{q ? " shown" : ""}</button>
              <button type="button" className="pill act" onClick={() => setMany(shown.map((r) => r.name), false)} title={q ? "clear every region the search shows" : "clear every region"}>none</button>
            </div>
            <div className="rp-scroll">
              <table>
                <thead><tr>
                  <th className="rp-check"><input type="checkbox" aria-label="select every region shown" checked={shown.length > 0 && shownOn === shown.length}
                    ref={(el) => { if (el) el.indeterminate = shownOn > 0 && shownOn < shown.length; }} onChange={(e) => setMany(shown.map((r) => r.name), e.target.checked)} /></th>
                  {th("name", "name")}{th("status", "status")}{th("status_date", "status date")}{th("n", "samples", "num")}
                </tr></thead>
                <tbody>
                  {shown.map((r) => <tr key={r.name} className={picked.has(r.name) ? "on" : ""} onClick={(e) => { if ((e.target as HTMLElement).tagName !== "INPUT") toggle([r.name]); }}>
                    <td className="rp-check"><input type="checkbox" checked={picked.has(r.name)} onChange={() => toggle([r.name])} aria-label={r.name} /></td>
                    <td>{r.name}</td><td>{r.status ? statusWord(r.status) : <span className="hint">—</span>}</td><td>{r.status_date ?? <span className="hint">—</span>}</td><td className="num">{p.fmtN(r.n)}</td>
                  </tr>)}
                  {!shown.length && <tr><td colSpan={5} className="hint">no region matches “{q}”</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rp-map">
            <div ref={mapEl} className="rp-canvas" />
            <div className="rp-legend hint"><i style={{ background: PICKED }} /> chosen <i style={{ background: p.def?.fill_color || p.def?.line_color || "#2a78d6" }} /> has samples — click to add <i className="off" /> no samples in this release</div>
            {(hover || mapNote) && <div className="rp-hover">{mapNote ?? hover}</div>}
          </div>
        </div>
        <div className="modal-actions">
          <span className="hint rp-count" aria-live="polite">{picked.size} of {names.length} regions chosen{picked.size === names.length && names.length ? " — the whole layer" : ""}</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>
          <button type="button" className="btn primary" disabled={!picked.size} onClick={() => p.onApply([...picked])}>Apply</button>
        </div>
      </div>
    </div>
  );
}
