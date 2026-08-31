// the panel system (plan D11 + D18): three docked RAILS that fold into labelled state pills (and maximize
// into the map's box), FLOATING CARDS over the map (minimize to a pill, maximize, drag; position kept in
// localStorage per card, reset on a viewport change), the map's PILL ROW, and — under 900 px — the
// bottom SHEET with three detents that the select rail, the strips and the cards all open as.
// No library: a pointer handler each. Layout changes only on a user's fold / maximize / drag, a lens
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

function store<T>(key: string, v?: T): T | undefined {
  try { if (v === undefined) { const s = localStorage.getItem(key); return s == null ? undefined : (JSON.parse(s) as T); } localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
  return v;
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

// ── rails ────────────────────────────────────────────────────────────────────────────────────────
export function Rail(p: {
  id: RailId; side: "left" | "right" | "bottom"; title: string; icon?: IconName;
  summary: ReactNode; muted?: boolean; pulse?: boolean;
  folded: boolean; onFold: () => void; maximized: boolean; onMax: () => void;
  actions?: ReactNode; resizable?: { width: number; min: number; max: number; onResize: (w: number) => void }; exportable?: MenuItem[];
  children: ReactNode; "data-tour"?: string;
}) {
  const foldIcon: IconName = p.side === "left" ? "ui-left" : p.side === "right" ? "ui-right" : "ui-down";
  const openIcon: IconName = p.side === "left" ? "ui-right" : p.side === "right" ? "ui-left" : "ui-up";
  const onGutter = (e: React.PointerEvent) => {
    const r = p.resizable; if (!r) return;
    e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = r.width;
    const move = (ev: PointerEvent) => r.onResize(Math.round(Math.min(r.max, Math.max(r.min, w0 + ev.clientX - x0))));
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  if (p.folded) return (
    <button type="button" className={`rail-pill side-${p.side} rail-${p.id}${p.muted ? " muted" : ""}${p.pulse ? " pulse" : ""}`} aria-expanded={false} aria-controls={`rail-${p.id}`} onClick={p.onFold} title={`Expand ${p.title}`} data-tour={p["data-tour"]}>
      <Icon name={openIcon} /><span className="rail-pill-text">{p.summary}</span>
    </button>);
  return (
    <section id={`rail-${p.id}`} className={`rail side-${p.side} rail-${p.id}${p.maximized ? " is-max" : ""}`} data-tour={p["data-tour"]}>
      <header className="rail-head">
        {p.icon && <Icon name={p.icon} />}<b>{p.title}</b><span className="spacer" />{p.actions}{ExportMenu(p.exportable)}
        <IconButton icon={p.maximized ? "ui-collapse" : "ui-expand"} label={p.maximized ? `Restore ${p.title}` : `Maximize ${p.title}`} className="sm" onClick={p.onMax} pressed={p.maximized} />
        <IconButton icon={foldIcon} label={`Fold ${p.title}`} className="sm" onClick={p.onFold} />
      </header>
      {p.maximized ? <div className="rail-body rail-max-note hint">maximized — Esc or ⤡ restores</div> : <div className="rail-body">{p.children}</div>}
      {p.resizable && <div className="rail-gutter" role="separator" aria-orientation="vertical" aria-label={`Resize ${p.title}`} title="drag to resize" onPointerDown={onGutter} />}
    </section>);
}

// ── floating cards ───────────────────────────────────────────────────────────────────────────────
export interface CardBox { left?: number; top?: number; right?: number; bottom?: number; width?: number | string; height?: number | string; maxHeight?: number | string }
export function FloatCard(p: {
  id: CardId; title: ReactNode; icon?: IconName; boxRef: React.RefObject<HTMLElement | null>; defaults: CardBox;
  minimized: boolean; onMinimize: () => void; maximized: boolean; onMax: () => void; onClose?: () => void;
  actions?: ReactNode; raised?: boolean; onTouch?: () => void; children: ReactNode; className?: string; "data-tour"?: string; exportable?: MenuItem[];
}) {
  const key = `explore.card.${p.id}`;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(() => { const s = store<{ vp: string; left: number; top: number }>(key); return s && s.vp === vpKey() ? { left: s.left, top: s.top } : null; });
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const reset = () => { const s = store<{ vp: string }>(key); if (s && s.vp !== vpKey()) setPos(null); }; addEventListener("resize", reset); return () => removeEventListener("resize", reset); }, []);
  const onHead = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, select, input")) return;
    const card = ref.current, box = p.boxRef.current; if (!card || !box) return;
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    p.onTouch?.();
    const b0 = box.getBoundingClientRect(), c0 = card.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, l0 = c0.left - b0.left, t0 = c0.top - b0.top;
    let cur = { left: l0, top: t0 };
    const move = (ev: PointerEvent) => {
      cur = { left: Math.round(Math.min(b0.width - c0.width, Math.max(0, l0 + ev.clientX - x0))), top: Math.round(Math.min(Math.max(b0.height - c0.height, b0.height - 120), Math.max(0, t0 + ev.clientY - y0))) };
      setPos(cur);
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); store(key, { vp: vpKey(), ...cur }); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  };
  if (p.minimized || p.maximized) return null;
  const d = p.defaults;
  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto", width: d.width, height: d.height, maxHeight: `calc(100% - ${pos.top}px - 10px)` }
    : { left: d.left, top: d.top, right: d.right, bottom: d.bottom, width: d.width, height: d.height, maxHeight: d.maxHeight };
  return (
    <section ref={ref} className={`card card-${p.id}${p.raised ? " raised" : ""}${p.className ? ` ${p.className}` : ""}`} style={style} role="region" aria-label={typeof p.title === "string" ? p.title : p.id} onPointerDown={p.onTouch} data-tour={p["data-tour"]}>
      <header className="card-head" onPointerDown={onHead} title="drag to move">
        {p.icon && <Icon name={p.icon} />}<b className="card-title">{p.title}</b><span className="spacer" />{p.actions}{ExportMenu(p.exportable)}
        <IconButton icon="ui-minimize" label="Minimize to a pill" className="sm" onClick={p.onMinimize} />
        <IconButton icon="ui-expand" label="Maximize" className="sm" onClick={p.onMax} />
        {p.onClose && <IconButton icon="ui-close" label="Close" className="sm" onClick={p.onClose} />}
      </header>
      <div className="card-body">{p.children}</div>
    </section>);
}

/** the map's top-left pill row: one pill per minimized card (click restores; × closes when the card can close) */
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
