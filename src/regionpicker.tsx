// the region modal (explore#20 · explore#16; Ben, 2026-10-14: "allow ALL features in a given layer to be used as the
// filter … a large modal for selecting individual features from a table and/or on the map for clickable inclusion").
// Left: the layer's regions that hold samples in this release — a sortable, searchable table with a checkbox each,
// select all / none and a count. Right: the layer's own polygons from its PMTiles (the CalCOFI bucket or the oceanmetrics
// gazetteer, the same source the Layers card draws — spatial_registry.ts pmtilesSource), where a click toggles a region:
// chosen ones in the Area outline's yellow, ones with samples in the layer's colour, ones without grey and dashed (they
// cannot be chosen: no sample of the release falls inside). Apply hands the set back; Cancel and Esc change nothing.
// The rules (matching a polygon to a region, the table's sort, what Apply means) are pure, in src/area.ts.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CARTO_URL, spatialBaseUrl, type RegionStatus, type SpatialLayerDef } from "./basemap";
import { pmtilesSource, statusWord } from "./spatial_registry";
import { filterSortRegions, regionMatchExpr, regionsOfFeatureProps, type RegionRow, type RegionSort } from "./area";
import { IconButton } from "./ui";
import { Icon } from "./icons";

const PICKED = "#ffd60a"; // the Area outline's yellow (map.tsx area-outline)
const OFF = { dark: "#6b7177", light: "#9aa0a6" };
// the opening view when the app has no bounds for a layer: the whole California coast, Oregon line to Mexico, so every
// region with samples is in the loaded tiles; the map then frames the ones with samples (Betty 2026-11-11)
const COAST: [number, number, number, number] = [-131, 29, -114, 42.5];
// the Regions from list's scroll: the modal remounts per layer (App.tsx key), so keep it across clicks (Betty 2026-11-11)
let layersTop = 0;

// lon/lat box of GeoJSON geometries
function geomBbox(gs: any[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: any) => {
    if (typeof c?.[0] === "number") { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
    else if (Array.isArray(c)) for (const x of c) walk(x);
  };
  for (const g of gs) walk(g?.coordinates);
  return w <= e && s <= n ? [w, s, e, n] : null;
}

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
  layers?: { group: string; names: string[] }[];  // the layers to flip through (Betty 2026-11-10): Regions from opens this map
  labelOf?: (n: string) => string;
  onLayer?: (n: string) => void;
  onCancel: () => void;
}

export function RegionPicker(p: RegionPickerProps) {
  const browse = !!(p.layers?.length && p.onLayer); // Betty 2026-11-10: just Regions from + the map; the list after Apply narrows
  const names = useMemo(() => p.regions.map((r) => r.name), [p.regions]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(browse ? [] : p.initial ?? names));
  const [q, setQ] = useState("");
  const [by, setBy] = useState<RegionSort>("name");
  const [desc, setDesc] = useState(false);
  const [featStatus, setFeatStatus] = useState<Map<string, { status: string; status_date: string | null }>>(new Map());
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null); // a popup at the cursor (Betty 2026-11-11)
  const [mapNote, setMapNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const layersEl = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (layersEl.current) layersEl.current.scrollTop = layersTop; }, []);
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
    // the window settles its size after the map is made (Betty 2026-11-10: the map opened framed too far north, San Diego
    // cut off): re-fit to the regions whenever the box changes size, until the person moves the map themselves
    // open on the whole coast (and the app's bounds, if wider), so every region with samples is in the loaded tiles; then
    // frame the drawn polygons that have samples. The app's bounds come from a simplified copy of some layers and can miss
    // part of a region (Betty 2026-11-11: CA State Waters opened at Sacramento, the north coast cut off)
    const b0 = p.bounds;
    let fitTo: [number, number, number, number] = b0 ? [Math.min(b0[0], COAST[0]), Math.min(b0[1], COAST[1]), Math.max(b0[2], COAST[2]), Math.max(b0[3], COAST[3])] : COAST;
    const m = new maplibregl.Map({ container: mapEl.current, style: CARTO_URL[p.theme], attributionControl: false,
      bounds: fitTo, fitBoundsOptions: { padding: 30 } });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    let moved = false;
    // once the tiles have drawn, frame the polygons that have samples (Wind Energy Areas opened centered off Mexico)
    let framed = false;
    m.on("idle", () => {
      if (framed || moved || !m.getSource("rp") || !m.isSourceLoaded("rp")) return;
      framed = true;
      const fs = m.querySourceFeatures("rp", { sourceLayer: src.layer, ...(d.filter ? { filter: d.filter as any } : {}) }).filter((f) => regionsOf(f.properties).length);
      const bb = geomBbox(fs.map((f) => f.geometry));
      if (bb) { fitTo = bb; m.fitBounds(bb, { padding: 30, maxZoom: 9, duration: 300 }); }
    });
    m.on("dragstart", () => { moved = true; }); m.on("zoomstart", (e: any) => { if (e.originalEvent) moved = true; });
    const ro = new ResizeObserver(() => { m.resize(); if (!moved) m.fitBounds(fitTo, { padding: 30, maxZoom: 9, duration: 0 }); });
    ro.observe(mapEl.current);
    // start collapsed to its (i), like the main map: MapLibre opens it on load, so close it once the boundaries have drawn
    m.once("idle", () => mapEl.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
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
      m.getCanvas().style.cursor = regs.length && !browse ? "pointer" : "";
      setHover(nm ? { text: `${nm}${regs.length ? (regs.length === 1 && regs[0] === nm ? "" : ` → ${regs.join(", ")}`) : " — no CalCOFI samples inside"}`, x: e.point.x, y: e.point.y } : null);
    });
    m.on("mouseout", () => setHover(null));
    m.on("click", (e) => {
      const ns = [...new Set(at(e).flatMap((f) => regionsOf(f.properties)))];
      if (ns.length && !browse) toggle(ns);
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
    return () => { ro.disconnect(); m.remove(); map.current = null; (window as any).__regionMap = null; };
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
      <div ref={ref} className={`modal modal-regions${browse ? " browse" : ""}`} role="dialog" aria-modal="true" aria-labelledby="regions-title" tabIndex={-1}>
        <header className="rail-head modal-head"><Icon name="ui-filter" />{p.layers?.length && p.onLayer ? <b id="regions-title">Choose regions</b> : <b id="regions-title">Area › regions of {p.layer}</b>}<span className="spacer" /><IconButton icon="ui-close" label="Cancel (Esc)" className="sm" onClick={p.onCancel} /></header>
        <div className={`rp-body${p.layers?.length && p.onLayer ? " with-layers" : ""}`}>
          {/* the layers, always in view (Betty 2026-11-10): which layer comes first, its regions second */}
          {p.layers?.length && p.onLayer && <nav ref={layersEl} className="rp-layers" aria-label="regions from" onScroll={(e) => { layersTop = e.currentTarget.scrollTop; }}>
            <div className="rp-layers-h">Regions from</div>
            {p.layers.map((g) => <div key={g.group} className="rp-lg">
              <div className="rp-lg-h">{g.group}</div>
              {g.names.map((n) => <button key={n} type="button" className={`rp-l${n === p.layer ? " on" : ""}`} aria-current={n === p.layer ? "true" : undefined} onClick={() => p.onLayer!(n)}>{p.labelOf ? p.labelOf(n) : n}</button>)}
            </div>)}
          </nav>}
          {!browse && <div className="rp-table">
            <div className="rp-tools">
              <input ref={search} type="search" placeholder="search name or status" aria-label="search regions" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {/* one plain, prominent Select all (Betty 2026-11-10: the all / none pills were too easy to miss) */}
            <label className="rp-all">
              <input type="checkbox" checked={shown.length > 0 && shownOn === shown.length} disabled={!shown.length}
                ref={(el) => { if (el) el.indeterminate = shownOn > 0 && shownOn < shown.length; }} onChange={(e) => setMany(shown.map((r) => r.name), e.target.checked)} />
              <span>Select all {q ? `${shown.length} shown` : `${shown.length} regions`}</span>
              {shownOn > 0 && <button type="button" className="linkish rp-clear" onClick={(e) => { e.preventDefault(); setMany(shown.map((r) => r.name), false); }}>clear</button>}
            </label>
            <div className="rp-scroll">
              <table>
                <thead><tr>
                  <th className="rp-check" aria-label="chosen" />
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
          </div>}
          <div className="rp-map">
            <div ref={mapEl} className="rp-canvas" />
            <div className="rp-legend hint">{!browse && <><i style={{ background: PICKED }} /> chosen </>}<i style={{ background: p.def?.fill_color || p.def?.line_color || "#2a78d6" }} /> has samples{browse ? "" : " — click to add"} <i className="off" /> no CalCOFI samples inside</div>
            {mapNote && <div className="rp-hover">{mapNote}</div>}
            {/* the region's name beside the cursor; flips left / up near the right and bottom edges */}
            {!mapNote && hover && (() => {
              const w = mapEl.current?.clientWidth ?? 0, h = mapEl.current?.clientHeight ?? 0;
              const tx = hover.x > w - 220 ? "calc(-100% - 12px)" : "12px", ty = hover.y > h - 60 ? "calc(-100% - 12px)" : "12px";
              return <div className="rp-hover at" style={{ left: hover.x, top: hover.y, transform: `translate(${tx}, ${ty})` }}>{hover.text}</div>;
            })()}
          </div>
        </div>
        <div className="modal-actions">
          <span className="hint rp-count" aria-live="polite">{browse ? `${names.length} ${names.length === 1 ? "region has" : "regions have"} samples in this layer` : `${picked.size} of ${names.length} regions chosen${picked.size === names.length && names.length ? " — the whole layer" : ""}`}</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>
          <button type="button" className="btn primary" disabled={browse ? !names.length : !picked.size} onClick={() => p.onApply(browse ? names : [...picked])}>{browse ? "Use this layer" : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}
