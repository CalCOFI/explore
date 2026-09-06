// the panel system (plan D11 + D18, reshaped 2026-09-06 for the light layout): the map is the page and EVERY
// panel floats over it — Select, Years, Depth, Layers and each lens result — with one title bar and the same
// four controls: move (drag the bar; double-click snaps it back to its dock), collapse (a labelled pill on the
// edge nearest its dock), expand (fill the map's box; Esc restores) and resize (the corner grip or any edge).
// Geometry is remembered per browser and viewport; the folds and the maximized panel live in the URL as before.
// Under 900 px the bottom SHEET with three detents is still what every panel opens as.
// No library: a pointer handler each. Layout changes only on a user's fold / maximize / drag / resize, a lens
// change or a breakpoint — never on a selection change.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { IconButton, Menu, type MenuItem } from "./ui";

export type RailId = "select" | "depth" | "years";
export type CardId = "section" | "cruise" | "station" | "timing" | "layers";
export type PanelId = RailId | CardId;
export const RAILS: RailId[] = ["select", "depth", "years"];
export const PANELS: PanelId[] = [...RAILS, "section", "cruise", "station", "timing"];
export const FOLDED_PX = 28;
/** where a panel's pill lands, and where a double-click on its bar sends it back to */
export type Dock = "left" | "right" | "bottom";

function store<T>(key: string, v?: T | null): T | undefined {
  try {
    if (v === null) { localStorage.removeItem(key); return undefined; }
    if (v === undefined) { const s = localStorage.getItem(key); return s == null ? undefined : (JSON.parse(s) as T); }
    localStorage.setItem(key, JSON.stringify(v));
  } catch { /* private mode */ }
  return v ?? undefined;
}
const vpKey = () => `${innerWidth}x${innerHeight}`;

// ── maximize: the panel takes the box with a backdrop; Esc or ⤡ restores ────────────────────────────
const ExportMenu = (items?: MenuItem[]) => items?.length ? <Menu className="export-menu" icon="ui-download" label="" title="export this panel: PNG · SVG · CSV" items={items} align="right" /> : null;
export function MaxPanel(p: { title: ReactNode; icon?: IconName; onRestore: () => void; actions?: ReactNode; children: ReactNode; id: string; exportable?: MenuItem[] }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; el?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); p.onRestore(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="max-layer">
      <div className="max-backdrop" onClick={p.onRestore} />
      <section ref={ref} className={`max-panel panel-${p.id}`} role="dialog" aria-modal="true" aria-label={typeof p.title === "string" ? p.title : undefined} tabIndex={-1}>
        <header className="rail-head">{p.icon && <Icon name={p.icon} />}<b>{p.title}</b><span className="spacer" />{p.actions}{ExportMenu(p.exportable)}<IconButton icon="ui-collapse" label="Restore (Esc)" className="sm" onClick={p.onRestore} /></header>
        <div className="rail-body">{p.children}</div>
      </section>
    </div>
  );
}

// ── floating panels ───────────────────────────────────────────────────────────────────────────────
/** a panel's home geometry, in CSS lengths relative to the map's box (numbers are px) */
export interface CardBox { left?: number; top?: number; right?: number; bottom?: number; width?: number | string; height?: number | string; maxHeight?: number | string }
export type CardBoxLike = CardBox;
interface Geom { left: number; top: number; width: number; height: number | null } // null height = content-sized (the Select panel)
type Edge = "n" | "s" | "e" | "w" | "se";

export function Panel(p: {
  id: PanelId; title: ReactNode; icon?: IconName; boxRef: React.RefObject<HTMLElement | null>; defaults: CardBox; dock: Dock;
  collapsed: boolean; onCollapse: () => void; maximized: boolean; onMax: () => void; onClose?: () => void;
  actions?: ReactNode; raised?: boolean; onTouch?: () => void; children: ReactNode; className?: string; "data-tour"?: string; exportable?: MenuItem[];
  /** a content-sized panel (the Select panel) keeps its height automatic until the user resizes it */
  autoHeight?: boolean; minWidth?: number; minHeight?: number;
}) {
  const key = `explore.panel.${p.id}`;
  const [geom, setGeom] = useState<Geom | null>(() => { const s = store<{ vp: string } & Geom>(key); return s && s.vp === vpKey() ? { left: s.left, top: s.top, width: s.width, height: s.height } : null; });
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const reset = () => { const s = store<{ vp: string }>(key); if (s && s.vp !== vpKey()) setGeom(null); }; addEventListener("resize", reset); return () => removeEventListener("resize", reset); }, []);
  const minW = p.minWidth ?? 220, minH = p.minHeight ?? 96;
  // the panel's rectangle as it stands (defaults resolve here), relative to the map's box
  const rect = () => { const card = ref.current, box = p.boxRef.current; if (!card || !box) return null; const b = box.getBoundingClientRect(), c = card.getBoundingClientRect(); return { b, c, left: c.left - b.left, top: c.top - b.top, width: c.width, height: c.height }; };
  const onHead = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, select, input")) return;
    const r = rect(); if (!r) return;
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    p.onTouch?.();
    const x0 = e.clientX, y0 = e.clientY;
    let cur: Geom = { left: r.left, top: r.top, width: r.width, height: geom?.height ?? (p.autoHeight ? null : r.height) };
    const move = (ev: PointerEvent) => {
      cur = { ...cur, left: Math.round(Math.min(r.b.width - 40, Math.max(0, r.left + ev.clientX - x0))), top: Math.round(Math.min(r.b.height - 32, Math.max(0, r.top + ev.clientY - y0))) };
      setGeom(cur);
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); store(key, { vp: vpKey(), ...cur }); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  const onResize = (edge: Edge) => (e: React.PointerEvent) => {
    const r = rect(); if (!r) return;
    e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    p.onTouch?.();
    const x0 = e.clientX, y0 = e.clientY;
    let cur: Geom = { left: r.left, top: r.top, width: r.width, height: r.height };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      let { left, top, width, height } = { left: r.left, top: r.top, width: r.width, height: r.height };
      if (edge === "e" || edge === "se") width = Math.max(minW, Math.min(r.b.width - r.left, r.width + dx));
      if (edge === "s" || edge === "se") height = Math.max(minH, Math.min(r.b.height - r.top, r.height + dy));
      if (edge === "w") { const w = Math.max(minW, Math.min(r.left + r.width, r.width - dx)); left = r.left + r.width - w; width = w; }
      if (edge === "n") { const h = Math.max(minH, Math.min(r.top + r.height, r.height - dy)); top = r.top + r.height - h; height = h; }
      cur = { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height!) };
      setGeom(cur);
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); store(key, { vp: vpKey(), ...cur }); dispatchEvent(new Event("resize")); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  const snapBack = () => { setGeom(null); store(key, null); setTimeout(() => dispatchEvent(new Event("resize")), 0); };
  if (p.collapsed || p.maximized) return null;
  const d = p.defaults;
  const style: React.CSSProperties = geom
    ? { left: geom.left, top: geom.top, right: "auto", bottom: "auto", width: geom.width, height: geom.height ?? undefined, maxHeight: `calc(100% - ${geom.top}px - 10px)` }
    : { left: d.left, top: d.top, right: d.right, bottom: d.bottom, width: d.width, height: d.height, maxHeight: d.maxHeight };
  return (
    <section ref={ref} className={`card card-${p.id} dock-${p.dock}${p.raised ? " raised" : ""}${p.className ? ` ${p.className}` : ""}`} style={style} role="region" aria-label={typeof p.title === "string" ? p.title : p.id} onPointerDown={p.onTouch} data-tour={p["data-tour"]}>
      <header className="card-head" onPointerDown={onHead} onDoubleClick={snapBack} title="drag to move · double-click to send it back to its place">
        <Icon name="ui-drag" className="grip" />{p.icon && <Icon name={p.icon} />}<b className="card-title">{p.title}</b><span className="spacer" />{p.actions}{ExportMenu(p.exportable)}
        <IconButton icon="ui-minimize" label="Collapse to a pill" className="sm" onClick={p.onCollapse} />
        <IconButton icon="ui-expand" label="Expand to fill the map" className="sm" onClick={p.onMax} />
        {p.onClose && <IconButton icon="ui-close" label="Close" className="sm" onClick={p.onClose} />}
      </header>
      <div className="card-body">{p.children}</div>
      <div className="rz rz-n" onPointerDown={onResize("n")} /><div className="rz rz-s" onPointerDown={onResize("s")} />
      <div className="rz rz-e" onPointerDown={onResize("e")} /><div className="rz rz-w" onPointerDown={onResize("w")} />
      <div className="rz rz-se" onPointerDown={onResize("se")} role="separator" aria-label="Resize" title="drag to resize" />
    </section>);
}
/** the old name, kept for the lens cards: a Panel with no dock (its pill lands at the bottom) */
export const FloatCard = Panel;

/** a collapsed panel on the map's edge: its state in one line (vertical on the sides), click to reopen */
export interface EdgePill { id: PanelId | string; label: ReactNode; icon?: IconName; onRestore: () => void; onClose?: () => void; muted?: boolean; on?: boolean; pulse?: boolean; extra?: ReactNode; "data-tour"?: string; title?: string }
export function EdgePills(p: { side: Dock; pills: EdgePill[] }) {
  if (!p.pills.length) return null;
  const openIcon: IconName = p.side === "left" ? "ui-right" : p.side === "right" ? "ui-left" : "ui-up";
  return (
    <div className={`edge-pills side-${p.side}`} role="toolbar" aria-label="collapsed panels">
      {p.pills.map((q) => <span key={q.id} className={`edge-pill pill-${q.id}${q.muted ? " muted" : ""}${q.on ? " on" : ""}${q.pulse ? " pulse" : ""}`} data-tour={q["data-tour"]}>
        <button type="button" className="edge-restore" onClick={q.onRestore} title={q.title ?? "expand"} aria-expanded={false}>
          <Icon name={openIcon} className="chev" />{q.icon && <Icon name={q.icon} />}<span className="edge-text">{q.label}</span>
        </button>
        {q.extra}
        {q.onClose && <button type="button" className="edge-close" onClick={q.onClose} aria-label="close" title="close"><Icon name="ui-close" /></button>}
      </span>)}
    </div>);
}

/** the map's top-left pill row (kept for the phone's pills row) */
export function PillRow(p: { pills: { id: string; label: ReactNode; icon?: IconName; onRestore: () => void; onClose?: () => void }[] }) {
  if (!p.pills.length) return null;
  return (
    <div className="pill-row" role="toolbar" aria-label="minimized panels">
      {p.pills.map((q) => <span key={q.id} className="pill mini">
        <button type="button" className="mini-restore" onClick={q.onRestore} title="restore">{q.icon && <Icon name={q.icon} />}{q.label}</button>
        {q.onClose && <button type="button" className="mini-close" onClick={q.onClose} aria-label="close" title="close"><Icon name="ui-close" /></button>}
      </span>)}
    </div>);
}

// ── the phone's bottom sheet ─────────────────────────────────────────────────────────────────────
export type Detent = "peek" | "half" | "full";
export const SHEET_PEEK = 104;
export function Sheet(p: { detent: Detent; onDetent: (d: Detent) => void; peek: ReactNode; title?: ReactNode; onClose?: () => void; children: ReactNode; "data-tour"?: string; exportable?: MenuItem[] }) {
  const [drag, setDrag] = useState<number | null>(null); // live height while dragging
  const heights = () => ({ peek: SHEET_PEEK, half: Math.round(innerHeight * 0.5), full: Math.round(innerHeight * 0.9) });
  const onHandle = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // no preventDefault: it would suppress the dblclick that toggles the detent

    const h = heights(), y0 = e.clientY, h0 = h[p.detent]; let cur = h0, last = y0, vy = 0, t = performance.now();
    const move = (ev: PointerEvent) => { const now = performance.now(); vy = (ev.clientY - last) / Math.max(1, now - t); last = ev.clientY; t = now; cur = Math.min(h.full, Math.max(h.peek, h0 + y0 - ev.clientY)); setDrag(cur); };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); setDrag(null);
      const target = cur + (Math.abs(vy) > 0.3 ? -vy * 300 : 0); // a flick carries
      const d = (["peek", "half", "full"] as Detent[]).reduce((a, b) => (Math.abs(h[b] - target) < Math.abs(h[a] - target) ? b : a));
      p.onDetent(d);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  const h = heights();
  return (
    <section className={`sheet detent-${p.detent}${drag != null ? " dragging" : ""}`} style={{ height: drag ?? h[p.detent] }} aria-label="panel" data-tour={p["data-tour"]}>
      <div className="sheet-handle" onPointerDown={onHandle} onDoubleClick={() => p.onDetent(p.detent === "peek" ? "half" : "peek")} role="button" aria-label="drag to resize" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowUp") p.onDetent(p.detent === "peek" ? "half" : "full"); if (e.key === "ArrowDown") p.onDetent(p.detent === "full" ? "half" : "peek"); }}>
        <span className="sheet-grip" />
      </div>
      {p.title != null && <header className="rail-head sheet-title"><b>{p.title}</b><span className="spacer" />{ExportMenu(p.exportable)}
        <IconButton icon={p.detent === "full" ? "ui-down" : "ui-up"} label={p.detent === "full" ? "Lower" : "Raise"} className="sm" onClick={() => p.onDetent(p.detent === "full" ? "half" : "full")} />
        {p.onClose && <IconButton icon="ui-close" label="Close" className="sm" onClick={p.onClose} />}</header>}
      <div className="sheet-peek">{p.peek}</div>
      <div className="sheet-body">{p.children}</div>
    </section>);
}

/** the histogram sparkline in the folded years pill (60 × 14 px) */
export function Sparkline(p: { values: number[]; width?: number; height?: number }) {
  const w = p.width ?? 60, h = p.height ?? 14, n = p.values.length;
  if (!n) return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const max = Math.max(1, ...p.values), bw = w / n;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {p.values.map((v, i) => { const bh = Math.max(v > 0 ? 1 : 0, (v / max) * h); return <rect key={i} x={i * bw} y={h - bh} width={Math.max(0.5, bw - 0.2)} height={bh} fill="currentColor" />; })}
    </svg>);
}
/** the vertical sparkline in the folded Depth pill: the median by 10 m bin, top to bottom, with the band in force */
export function VSpark(p: { rows: { depth_bin: number; med: number }[]; band?: [number, number] | null; width?: number; height?: number; dmax?: number }) {
  const w = p.width ?? 14, h = p.height ?? 110;
  const rows = p.rows.filter((r) => Number.isFinite(r.med)).slice().sort((a, b) => a.depth_bin - b.depth_bin);
  if (rows.length < 2) return <svg className="spark vspark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  const dmax = p.dmax ?? Math.max(500, ...rows.map((r) => r.depth_bin));
  const vs = rows.map((r) => r.med); const v0 = Math.min(...vs), v1 = Math.max(...vs), span = v1 - v0 || 1;
  const d = rows.map((r, i) => `${i ? "L" : "M"}${(2 + (w - 4) * (r.med - v0) / span).toFixed(1)} ${(1 + (h - 2) * r.depth_bin / dmax).toFixed(1)}`).join("");
  const band = p.band && (p.band[0] > 0 || p.band[1] < dmax) ? p.band : null;
  return (
    <svg className="spark vspark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {band && <rect x={0} y={1 + (h - 2) * band[0] / dmax} width={w} height={Math.max(1, (h - 2) * (band[1] - band[0]) / dmax)} className="vspark-band" />}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>);
}
