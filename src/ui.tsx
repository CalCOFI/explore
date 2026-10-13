// small shared controls: the flat 2 rem icon button (brand v1's theme toggle generalized — plan D15's
// .cc-icon-button), a dropdown menu (Copy code ▾, Share ▾) and the group heading of the select rail.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon, type IconName } from "./icons";
import { commitNum, ordered, stepYears, yearComplete } from "./ranges";

/** a popover's fixed-position box under (or, when the room is short, over) its anchor — so a rail's or a
 *  card's overflow never clips it; re-measured on resize and on any scroll */
export function useAnchor(open: boolean, ref: RefObject<HTMLElement | null>, minWidth = 0, maxHeight = 560) {
  const [box, setBox] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) { setBox(null); return; }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      const vw = innerWidth, vh = innerHeight, gap = 3, pad = 8;
      const width = Math.min(Math.max(r.width, minWidth), vw - 2 * pad);
      const left = Math.min(Math.max(pad, r.left), vw - pad - width);
      const below = vh - r.bottom - pad, above = r.top - pad;
      if (below >= Math.min(maxHeight, 260) || below >= above) setBox({ position: "fixed", top: r.bottom + gap, left, width, maxHeight: Math.min(maxHeight, below - gap) });
      else setBox({ position: "fixed", bottom: vh - r.top + gap, left, width, maxHeight: Math.min(maxHeight, above - gap) });
    };
    measure();
    addEventListener("resize", measure); addEventListener("scroll", measure, true);
    return () => { removeEventListener("resize", measure); removeEventListener("scroll", measure, true); };
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
export function YearRange(p: { years: [number, number]; first: number; last: number; onChange: (y: [number, number]) => void; width?: number }) {
  const [a, b] = p.years, back = stepYears(p.years, -1, p.first, p.last), fwd = stepYears(p.years, 1, p.first, p.last);
  const span = b - a + 1, unit = span === 1 ? "year" : `${span} years`;
  return <span className="year-range">
    <button type="button" className="pill act step" disabled={!back} onClick={() => back && p.onChange(back)} title={back ? `back ${unit}: ${back[0] === back[1] ? back[0] : back.join("–")}` : "at the start of the record"} aria-label="earlier years">‹</button>
    <NumInput value={a} min={p.first} max={p.last} width={p.width} label="first year" live={(t) => yearComplete(t, p.first, p.last)} onCommit={(v) => p.onChange(ordered(v, b))} />–<NumInput value={b} min={p.first} max={p.last} width={p.width} label="last year" live={(t) => yearComplete(t, p.first, p.last)} onCommit={(v) => p.onChange(ordered(a, v))} />
    <button type="button" className="pill act step" disabled={!fwd} onClick={() => fwd && p.onChange(fwd)} title={fwd ? `forward ${unit}: ${fwd[0] === fwd[1] ? fwd[0] : fwd.join("–")}` : "at the end of the record"} aria-label="later years">›</button>
  </span>;
}
