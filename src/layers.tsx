// the Layers card (plan 2026-08-31, D24 · D25): the Sea floor half (slice 2) + the boundary layers —
// "On the map" in DRAW ORDER (top-first, the GIS table-of-contents convention; drag a row's handle or use
// ▲ ▼), each row expanding into its symbology (one colour, or a by-name palette; fill opacity; line width;
// reset), and "Add a layer" as the registry's groups, folded. Symbology is VIEW STATE: it lives in the URL
// (`layers=`) and nowhere else, so a share link, a bookmark and a feedback report reopen the same map (D26).
import { useRef, useState } from "react";
import { Icon } from "./icons";
import { BATHY_PARTS, type BathyPart, type LayerStyle, type Sel } from "./state";
import { PALETTES, bathyDefaultOpacity, isPalette, type SpatialLayerDef } from "./basemap";
import { RAMPS, RAMP_IDS, parseRamp, rampCss, defaultRamp } from "./ramps";

const LABELS: Record<BathyPart, string> = { relief: "shaded relief", depth: "depth colour", contours: "contours" };
// the one-colour strip: mid-tone Material shades in the registry's families — they read on dark and light alike
const SWATCHES = ["#1565c0", "#42a5f5", "#00838f", "#2e7d32", "#7cb342", "#f57c00", "#8d6e63", "#7b1fa2", "#c2185b", "#546e7a"];

export function LayersCard(p: { sel: Sel; setSel: (s: Partial<Sel>) => void; theme: "dark" | "light"; defs: SpatialLayerDef[] }) {
  const parts = p.sel.bathy ?? [...BATHY_PARTS];
  const on = parts.length > 0;
  const def = bathyDefaultOpacity(p.theme);
  const o = p.sel.bathyo ?? def;
  const setBathy = (next: BathyPart[]) => p.setSel({ bathy: next.length === BATHY_PARTS.length ? null : next });
  const toggleBathy = (x: BathyPart) => setBathy(BATHY_PARTS.filter((v) => (v === x ? !parts.includes(v) : parts.includes(v))));

  // the list holds the boundary layers AND the data layer (D36): `data` is a pseudo entry in `layers=` naming where the
  // selection draws in the order; absent = on top, and a list whose first row is data is written without it
  const DATA: LayerStyle = { id: "data", color: null, fillOpacity: null, lineWidth: null };
  const stored = p.sel.layers ?? [];
  const entries = stored.some((e) => e.id === "data") ? stored : [DATA, ...stored];
  const byId = new Map(p.defs.map((d) => [d.id, d]));
  const setLayers = (ls: LayerStyle[]) => { const out = ls[0]?.id === "data" ? ls.slice(1) : ls; p.setSel({ layers: out.length ? out : null }); };
  const upd = (i: number, patch: Partial<LayerStyle>) => setLayers(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i: number, to: number) => { if (to < 0 || to >= entries.length) return; const ls = entries.slice(); const [e] = ls.splice(i, 1); ls.splice(to, 0, e); setLayers(ls); };
  const remove = (i: number) => setLayers(entries.filter((_, j) => j !== i));
  const addLayer = (id: string) => setLayers([{ id, color: null, fillOpacity: null, lineWidth: null }, ...entries]); // a new layer lands ON TOP (D24)
  const nBounds = entries.filter((e) => e.id !== "data").length;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // drag-to-reorder: a pointer handler like the cards' own drag (no library); ▲ ▼ cover keyboard + the phone
  const listRef = useRef<HTMLDivElement>(null);
  const onHandle = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    let cur = i;
    const rows = () => [...(listRef.current?.querySelectorAll(".onmap-row") ?? [])] as HTMLElement[];
    const movePt = (ev: PointerEvent) => {
      const rs = rows(); if (!rs.length) return;
      let to = rs.findIndex((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (to < 0) to = rs.length - 1;
      if (to !== cur) { move(cur, to); cur = to; }
    };
    const up = () => { removeEventListener("pointermove", movePt); removeEventListener("pointerup", up); };
    addEventListener("pointermove", movePt); addEventListener("pointerup", up);
  };

  const swatchFor = (d: SpatialLayerDef, st: LayerStyle) =>
    isPalette(st.color)
      ? <span className="pal-strip">{PALETTES[st.color][p.theme].slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}</span>
      : <span className="swatch" style={{ background: st.color ? `#${st.color}` : (d.fill_color || d.line_color || "#9aa0a6") }} />;

  const groups = [...new Set(p.defs.map((d) => d.group))];
  // the data layer (Ben, 2026-09-07): on/off, opacity, the colour ramp (+ reversed). It draws in deck's own canvas, above
  // every MapLibre layer — moving it BELOW a boundary layer needs the interleaved overlay (plan 2026-09-07 D36, spike-gated)
  const ramp = parseRamp(p.sel.ramp ?? defaultRamp(p.sel.realm, p.sel.var, p.sel.anom && p.sel.lens === "section"));
  const rampId = `${ramp.base}${ramp.reversed ? "_r" : ""}`;
  const setRamp = (base: string, reversed: boolean) => { const id = `${base}${reversed ? "_r" : ""}`; p.setSel({ ramp: id === defaultRamp(p.sel.realm, p.sel.var) ? null : id }); };
  const dOpacity = p.sel.datao ?? 1;
  const families: ("cmocean" | "viridis" | "oce")[] = ["cmocean", "viridis", "oce"];
  return (
    <div className="layers-body">
      <label className="layers-row layers-main">
        <input type="checkbox" checked={p.sel.data} onChange={() => p.setSel({ data: !p.sel.data })} />
        <b>Data</b> <span className="hint">the selection, as the lens draws it</span>
      </label>
      <label className="layers-row layers-opacity">
        <span className="hint">opacity</span>
        <input type="range" min={0.1} max={1} step={0.05} disabled={!p.sel.data} value={dOpacity}
          onChange={(e) => { const v = Math.round(+e.target.value * 100) / 100; p.setSel({ datao: v >= 1 ? null : v }); }} />
        <span className="hint">{dOpacity.toFixed(2)}</span>
      </label>
      <div className="layers-row ramp-row">
        <span className="hint">colours</span>
        <select value={ramp.base} disabled={!p.sel.data} onChange={(e) => setRamp(e.target.value, ramp.reversed)} title="cmocean (Thyng et al. 2016), viridis, and oce's GEBCO ramp">
          {families.map((f) => <optgroup key={f} label={f === "oce" ? "oce (R)" : f}>{RAMP_IDS.filter((k) => RAMPS[k].family === f).map((k) => <option key={k} value={k}>{RAMPS[k].label}{RAMPS[k].kind !== "sequential" ? ` (${RAMPS[k].kind})` : ""}</option>)}</optgroup>)}
        </select>
        <span className="ramp-strip" style={{ background: rampCss(rampId) }} />
        <label className="hint rev"><input type="checkbox" checked={ramp.reversed} disabled={!p.sel.data} onChange={(e) => setRamp(ramp.base, e.target.checked)} /> reverse</label>
        {p.sel.ramp && <button type="button" className="linkish" onClick={() => p.setSel({ ramp: null })}>default</button>}
      </div>
      {p.sel.lens === "contour" && <label className="layers-row layers-sub" title="the points the Contours surface was fitted to (D43)">
        <input type="checkbox" disabled={!p.sel.data} checked={p.sel.inputs ?? (p.sel.interp === "tps" || p.sel.grain === "station")} onChange={(e) => p.setSel({ inputs: e.target.checked })} />
        Inputs <span className="hint">the sites or stations the surface was fitted to</span>
      </label>}
      <div className="hint layers-note">draws above the sea floor; its place among the boundary layers is the <b>Data</b> row under <i>On the map</i> — drag it below a boundary to draw under it</div>

      <label className="layers-row layers-main">
        <input type="checkbox" checked={on} onChange={() => setBathy(on ? [] : [...BATHY_PARTS])} />
        <b>Sea floor</b> <span className="hint">GEBCO 2025</span>
      </label>
      {BATHY_PARTS.map((x) => (
        <label key={x} className="layers-row layers-sub">
          <input type="checkbox" disabled={!on} checked={parts.includes(x)} onChange={() => toggleBathy(x)} />
          {LABELS[x]}
        </label>
      ))}
      <label className="layers-row layers-opacity">
        <span className="hint">opacity</span>
        <input type="range" min={0.1} max={1} step={0.05} disabled={!on} value={o}
          onChange={(e) => { const v = Math.round(+e.target.value * 100) / 100; p.setSel({ bathyo: v === def ? null : v }); }} />
        <span className="hint">{o.toFixed(2)}</span>
      </label>

      <h5 className="layers-h">On the map {nBounds ? <span className="hint">top first — drag or ▲ ▼ to reorder</span> : <span className="hint">the data layer alone — add a boundary below</span>}</h5>
      <div ref={listRef} className="onmap">
        {entries.map((st, i) => { const d = byId.get(st.id);
          if (st.id === "data") return (
            <div key="data" className="onmap-row data">
              <div className="onmap-head">
                <span className="drag" title="drag to reorder" onPointerDown={onHandle(i)}><Icon name="ui-drag" size="0.9rem" /></span>
                <span className="ramp-strip sm" style={{ background: rampCss(rampId), opacity: p.sel.data ? 1 : 0.35 }} />
                <span className="onmap-name" title="the selection, as the lens draws it (stations, hexagons, the surface, polygons, the track)">Data{!p.sel.data && <span className="hint"> · off</span>}</span>
                <button type="button" className="sm" aria-label="Move the data layer up" disabled={i === 0} onClick={() => move(i, i - 1)}><Icon name="ui-up" size="0.85rem" /></button>
                <button type="button" className="sm" aria-label="Move the data layer down" disabled={i === entries.length - 1} onClick={() => move(i, i + 1)}><Icon name="ui-down" size="0.85rem" /></button>
                <span className="sm" style={{ width: 22 }} />
              </div>
            </div>);
          if (!d) return <div key={st.id} className="onmap-row hint">{st.id} (not in this release's registry)</div>;
          const open = expanded === st.id;
          return (
            <div key={st.id} className={`onmap-row${open ? " open" : ""}`}>
              <div className="onmap-head">
                <span className="drag" title="drag to reorder" onPointerDown={onHandle(i)}><Icon name="ui-drag" size="0.9rem" /></span>
                {swatchFor(d, st)}
                <button type="button" className="onmap-name" onClick={() => setExpanded(open ? null : st.id)} title={d.description ?? d.name}>{d.name}</button>
                <button type="button" className="sm" aria-label={`Move ${d.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><Icon name="ui-up" size="0.85rem" /></button>
                <button type="button" className="sm" aria-label={`Move ${d.name} down`} disabled={i === entries.length - 1} onClick={() => move(i, i + 1)}><Icon name="ui-down" size="0.85rem" /></button>
                <button type="button" className="sm" aria-label={`Remove ${d.name}`} onClick={() => remove(i)}><Icon name="ui-close" size="0.85rem" /></button>
              </div>
              {open && (
                <div className="onmap-style">
                  <div className="layers-row swatches">
                    {SWATCHES.map((c) => <button key={c} type="button" className={`swatch${st.color === c.slice(1) ? " on" : ""}`} style={{ background: c }} aria-label={c} onClick={() => upd(i, { color: c.slice(1) })} />)}
                    <input type="color" value={st.color && !isPalette(st.color) ? `#${st.color}` : "#888888"} title="any colour" onChange={(e) => upd(i, { color: e.target.value.slice(1) })} />
                  </div>
                  <div className="layers-row">
                    <span className="hint">by name</span>
                    {(["pal1", "pal2", "pal3"] as const).map((k) => (
                      <button key={k} type="button" className={`palbtn${st.color === k ? " on" : ""}`} title={`${k}${d.names ? "" : " (no name list — coloured by id)"}`} onClick={() => upd(i, { color: st.color === k ? null : k })}>
                        <span className="pal-strip">{PALETTES[k][p.theme].slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}</span>
                      </button>))}
                    {st.color != null && isPalette(st.color) && d.names && <span className="hint">· {d.names.length} names</span>}
                  </div>
                  {d.geom === "polygon" && (
                    <label className="layers-row"><span className="hint">fill</span>
                      <input type="range" min={0} max={1} step={0.05} value={st.fillOpacity ?? d.fill_opacity ?? 0.2}
                        onChange={(e) => upd(i, { fillOpacity: Math.round(+e.target.value * 100) / 100 })} />
                      <span className="hint">{(st.fillOpacity ?? d.fill_opacity ?? 0.2).toFixed(2)}</span></label>)}
                  <label className="layers-row"><span className="hint">{d.geom === "point" ? "size" : "line"}</span>
                    <input type="range" min={0.5} max={4} step={0.5} value={st.lineWidth ?? d.line_width ?? 1}
                      onChange={(e) => upd(i, { lineWidth: Math.round(+e.target.value * 2) / 2 })} />
                    <span className="hint">{(st.lineWidth ?? d.line_width ?? 1).toFixed(1)} px</span></label>
                  <div className="layers-row">
                    <button type="button" className="linkish" onClick={() => upd(i, { color: null, fillOpacity: null, lineWidth: null })}>reset to the registry</button>
                    <span className="spacer" /><span className="hint">{d.n_features.toLocaleString()} features</span>
                  </div>
                </div>)}
            </div>);
        })}
      </div>

      <h5 className="layers-h">Add a layer</h5>
      {groups.map((g) => (
        <div key={g} className={`addgroup${openGroup === g ? " open" : ""}`}>
          <button type="button" className="addgroup-h" aria-expanded={openGroup === g} onClick={() => setOpenGroup(openGroup === g ? null : g)}>
            <Icon name={openGroup === g ? "ui-down" : "ui-right"} size="0.85rem" />{g} <span className="hint">{p.defs.filter((d) => d.group === g).length}</span>
          </button>
          {openGroup === g && p.defs.filter((d) => d.group === g).map((d) => (
            <label key={d.id} className="layers-row layers-sub">
              <input type="checkbox" checked={entries.some((e) => e.id === d.id)}
                onChange={(e) => (e.target.checked ? addLayer(d.id) : setLayers(entries.filter((x) => x.id !== d.id)))} />
              <span title={d.description ?? ""}>{d.name}</span> <span className="hint">{d.n_features.toLocaleString()}</span>
            </label>))}
        </div>))}
    </div>
  );
}
