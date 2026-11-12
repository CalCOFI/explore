// small shared controls: the flat 2 rem icon button (brand v1's theme toggle generalized — plan D15's
// .cc-icon-button), a dropdown menu (Copy code ▾, Share ▾) and the group heading of the select rail.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon, type IconName } from "./icons";
import { commitNum, ordered, stepYears, yearComplete } from "./ranges";

/** a popover's fixed-position box under (or, when the room is short, over) its anchor — so a rail's or a
 *  card's overflow never clips it; re-measured on resize and on any scroll */
export function useAnchor(open: boolean, ref: RefObject<HTMLElement | null>, minWidth = 0, maxHeight = 560, popRef?: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) { setBox(null); return; }
    // the panel the anchor scrolls in: when the anchor scrolls out of it, the popover hides instead of floating over the header
    let sc: HTMLElement | null = ref.current?.parentElement ?? null;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    const place = (): React.CSSProperties | null => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return null;
      const vw = innerWidth, vh = innerHeight, gap = 3, pad = 8;
      const width = Math.min(Math.max(r.width, minWidth), vw - 2 * pad);
      const left = Math.min(Math.max(pad, r.left), vw - pad - width);
      const below = vh - r.bottom - pad, above = r.top - pad;
      const sr = sc?.getBoundingClientRect(), gone = !!sr && (r.bottom < sr.top || r.top > sr.bottom);
      const vis = gone ? "hidden" as const : "visible" as const;
      if (below >= Math.min(maxHeight, 260) || below >= above) return { position: "fixed", top: r.bottom + gap, bottom: "auto", left, width, maxHeight: Math.min(maxHeight, below - gap), visibility: vis };
      return { position: "fixed", top: "auto", bottom: vh - r.top + gap, left, width, maxHeight: Math.min(maxHeight, above - gap), visibility: vis };
    };
    setBox(place());
    // on scroll the popover is moved directly, in the same frame as the scroll (a React re-render of a long list lagged
    // a frame or more behind, so the list trailed the box it belongs to); the state catches up once the scrolling stops
    let settle = 0;
    const follow = () => {
      const b = place(); if (!b) return;
      const el = popRef?.current;
      if (el) {
        const px = (v: unknown) => (typeof v === "number" ? `${v}px` : String(v));
        el.style.top = px(b.top); el.style.bottom = px(b.bottom); el.style.left = px(b.left); el.style.width = px(b.width);
        el.style.maxHeight = px(b.maxHeight); el.style.visibility = String(b.visibility);
        clearTimeout(settle); settle = window.setTimeout(() => setBox(place()), 150);
      } else setBox(b);
    };
    addEventListener("resize", follow); addEventListener("scroll", follow, true);
    return () => { clearTimeout(settle); removeEventListener("resize", follow); removeEventListener("scroll", follow, true); };
  }, [open]);
  return box;
}
export function IconButton(p: { icon: IconName; label: string; title?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; className?: string; disabled?: boolean; size?: number | string; pressed?: boolean; "data-tour"?: string; id?: string }) {
  // `title` defaults to the label; the header's feedback button is the case where the hover text says more than
  // the accessible name (calcofi.io's .cc-feedback: "Send feedback" / "Send feedback — with a screenshot of this view")
  return (
    <button type="button" id={p.id} className={`cc-icon-button${p.className ? ` ${p.className}` : ""}`} aria-label={p.label} title={p.title ?? p.label} onClick={p.onClick}
      disabled={p.disabled} aria-pressed={p.pressed} data-tour={p["data-tour"]}>
      <Icon name={p.icon} size={p.size ?? "1.25rem"} />
    </button>
  );
}

export interface MenuItem { label: string; icon?: IconName; onSelect?: () => void; hint?: string; disabled?: boolean; href?: string; selected?: boolean }
/** a button that opens a small menu below it; closes on a choice, outside click or Esc */
export function Menu(p: { label: ReactNode; items: MenuItem[]; className?: string; icon?: IconName; title?: string; align?: "left" | "right"; "data-tour"?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useAnchor(open, btn, 200, 400);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span ref={ref} className={`menu${p.className ? ` ${p.className}` : ""}`} data-tour={p["data-tour"]}>
      <button ref={btn} type="button" className={`pill menu-btn${open ? " on" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={p.title}>
        {p.icon && <Icon name={p.icon} />}{p.label}<Icon name="ui-down" size="0.9em" />
      </button>
      {open && <div className={`menu-list ${p.align ?? "left"}`} role="menu" style={box ?? undefined}>
        {p.items.map((it, i) => it.href
          ? <a key={i} role="menuitem" className="menu-item" href={it.href} target="_blank" rel="noopener" onClick={() => setOpen(false)}>{it.icon && <Icon name={it.icon} />}<span>{it.label}{it.hint && <small>{it.hint}</small>}</span></a>
          : <button key={i} type="button" role="menuitem" className={`menu-item${it.selected ? " sel" : ""}`} aria-checked={it.selected} disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect?.(); }}>{it.icon && <Icon name={it.icon} />}<span>{it.label}{it.hint && <small>{it.hint}</small>}</span>{it.selected && <Icon name="ui-check" className="sel-check" />}</button>)}
      </div>}
    </span>
  );
}

/** a group heading in the select rail: LENS · DATA · FILTERS · EXPORT. With `onToggle` the heading is a disclosure
 *  (FILTERS and EXPORT start folded, so the rail is the lens and the data): `right` is what a folded group still says */
export function Group(p: { title: string; icon?: IconName; children?: ReactNode; right?: ReactNode; "data-tour"?: string; className?: string; open?: boolean; onToggle?: () => void }) {
  const open = p.onToggle ? p.open !== false : true;
  const head = <>{p.icon && <Icon name={p.icon} />}{p.title}{p.right && <span className="group-right">{p.right}</span>}</>;
  return (
    <section className={`group${p.className ? ` ${p.className}` : ""}${p.onToggle ? (open ? " open" : " folded") : ""}`} data-tour={p["data-tour"]} data-group={p.title.toLowerCase()}>
      {p.onToggle
        ? <h4 className="group-title"><button type="button" className="group-toggle" aria-expanded={open} onClick={p.onToggle} title={`${open ? "Fold" : "Expand"} ${p.title}`}><Icon name={open ? "ui-down" : "ui-right"} size="0.95rem" />{head}</button></h4>
        : <h4 className="group-title">{head}</h4>}
      {open && p.children}
    </section>
  );
}

/** a number box that keeps the text being typed and commits a complete value (explore#26): on Enter, on blur, on
 *  a spinner click or arrow key, and while typing only when `live(text)` says the text is already whole (a
 *  four-digit year). A cleared box reverts to the committed value instead of storing 0; ranges.ts holds the rules */
export function NumInput(p: { value: number; min: number; max: number; step?: number; width?: number; onCommit: (v: number) => void; live?: (text: string) => boolean; label: string; title?: string }) {
  const [text, setText] = useState(String(p.value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(p.value)); }, [p.value]);
  const commit = (t: string, revert = true) => {
    const v = commitNum(t, p.min, p.max, p.step ?? 1);
    if (v == null) { if (revert) setText(String(p.value)); return; }
    if (revert) setText(String(v));
    if (v !== p.value) p.onCommit(v);
  };
  return <input type="number" inputMode="numeric" style={{ width: p.width ?? 66 }} value={text} min={p.min} max={p.max} step={p.step ?? 1} aria-label={p.label} title={p.title}
    onFocus={() => { focused.current = true; }}
    onBlur={(e) => { focused.current = false; commit(e.currentTarget.value); }}
    // typing arrives as an InputEvent; a spinner click or an arrow key steps the box with a plain Event — a whole value
    onChange={(e) => { const t = e.currentTarget.value; setText(t); if (!(e.nativeEvent instanceof InputEvent) || p.live?.(t)) commit(t, false); }}
    onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); }} />;
}

/** the year window as two boxes with ‹ › either side that step it by its own width (explore#27: 1973 → 1974,
 *  1974–1987 → 1988–2001), so the map can be flipped through the record; the Refine panel and the title sentence's
 *  year chip both draw it */
export function YearRange(p: { years: [number, number]; first: number; last: number; onChange: (y: [number, number]) => void; width?: number; arrows?: boolean }) {
  const [a, b] = p.years, back0 = stepYears(p.years, -1, p.first, p.last), fwd0 = stepYears(p.years, 1, p.first, p.last);
  // the window is the whole record, so there is nothing to slide: each arrow jumps to the end it points at, one year, and from there steps
  const whole = !back0 && !fwd0;
  const back = whole ? ([p.first, p.first] as [number, number]) : back0, fwd = whole ? ([p.last, p.last] as [number, number]) : fwd0;
  const span = b - a + 1, unit = span === 1 ? "year" : `${span} years`;
  return <span className="year-range">
    {p.arrows !== false && <button type="button" className="pill act step" disabled={!back} onClick={() => back && p.onChange(back)} title={whole ? `show just ${p.first}, then step on with ›` : back ? `back ${unit}: ${back[0] === back[1] ? back[0] : back.join("–")}` : "at the start of the record"} aria-label="earlier years">‹</button>}
    <NumInput value={a} min={p.first} max={p.last} width={p.width} label="first year" live={(t) => yearComplete(t, p.first, p.last)} onCommit={(v) => p.onChange(ordered(v, b))} />–<NumInput value={b} min={p.first} max={p.last} width={p.width} label="last year" live={(t) => yearComplete(t, p.first, p.last)} onCommit={(v) => p.onChange(ordered(a, v))} />
    {p.arrows !== false && <button type="button" className="pill act step" disabled={!fwd} onClick={() => fwd && p.onChange(fwd)} title={whole ? `show just ${p.last}, then step back with ‹` : fwd ? `forward ${unit}: ${fwd[0] === fwd[1] ? fwd[0] : fwd.join("–")}` : "at the end of the record"} aria-label="later years">›</button>}
  </span>;
}


/** a two-handle slider for the years: grab either end and slide; applies when you let go. The track is the span the data covers. */
export function YearSlider(p: { min: number; max: number; value: [number, number]; onCommit: (y: [number, number]) => void; left?: ReactNode; right?: ReactNode }) {
  const clamp = (v: number) => Math.min(p.max, Math.max(p.min, v));
  const [v, setV] = useState<[number, number]>([clamp(p.value[0]), clamp(p.value[1])]);
  useEffect(() => { setV([clamp(p.value[0]), clamp(p.value[1])]); }, [p.value[0], p.value[1], p.min, p.max]);
  const span = Math.max(1, p.max - p.min), l = ((v[0] - p.min) / span) * 100, r = ((v[1] - p.min) / span) * 100;
  const commit = () => p.onCommit(v);
  const common = { type: "range" as const, min: p.min, max: p.max, step: 1, onPointerUp: commit, onKeyUp: commit, onBlur: commit };
  const slider = (
    <div className="year-slider" aria-label="years">
      <div className="ys-track"><div className="ys-fill" style={{ left: `${l}%`, width: `${Math.max(0, r - l)}%` }} /></div>
      <input {...common} value={v[0]} aria-label="first year" onChange={(e) => setV([Math.min(+e.target.value, v[1]), v[1]])} />
      <input {...common} value={v[1]} aria-label="last year" onChange={(e) => setV([v[0], Math.max(+e.target.value, v[0])])} />
      {!(p.left || p.right) && <div className="ys-ends"><span>{p.min}</span><span>{p.max}</span></div>}
    </div>);
  return p.left || p.right ? <div className="year-bar">{p.left}{slider}{p.right}</div> : slider;
}
