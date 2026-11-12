// the lean layout's pieces (?ui=lean, the "make the common path obvious" pass): the View as step,
// the Where control, the Download bar and the Depth pill. Presentational only — App.tsx owns every piece of state and
// passes plain callbacks, so nothing here reads the URL or the engine. The classic Select / Refine / Share panel is
// untouched; `?ui=lean` (remembered per browser) swaps in the lean body, `?ui=classic` brings the old one back.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import type { PickerItem } from "./picker";
import { Menu, type MenuItem } from "./ui";
import { LENSES, type Lens } from "./state";
import { shownName } from "./spatial_registry";
import { lineStationId } from "./area";

// ── the view picker ────────────────────────────────────────────────────────────────────────────────────────
// plain names for the six lenses (the lens ids and the state they set are unchanged), each with a small picture of
// what it draws, so a person can tell the views apart without knowing what "hexagons" or "contours" are
export const RAIL_NAME: Record<Lens, string> = { station: "Stations", hex: "Hexagon", contour: "Contour", cruise: "By cruise", region: "By region", section: "Cross-section" };
/** each view as what a person wants to do (the headline) and a fuller line on what it draws and what it is good for */
const GUIDE: Record<Lens, { q: string; a: string }> = {
  station: { q: "Look at CalCOFI line and station data", a: "Find what was sampled, and where, on the CalCOFI line and station grid, current and historical." },
  hex: { q: "See patterns across the full survey region", a: "Every sample, on or off the CalCOFI line and station grid, pooled into hexagons." },
  region: { q: "Compare regions (sanctuaries, wind energy areas, maritime zones, etc.)", a: "Summarises the data inside each named area, so you can compare them." },
  contour: { q: "See how it changes across the water", a: "A colour surface with contour lines, estimated between stations. Used for spotting fronts and gradients." },
  cruise: { q: "Follow a specific cruise", a: "Pick one cruise and follow its track, station by station, to see what that trip found." },
  section: { q: "Look down through the water", a: "A slice from the surface to the bottom along one CalCOFI line, to see how things change with depth." },
};
/** a species has no depth axis (its tows are depth-integrated), so its section runs along the line year by year */
const guideOf = (l: Lens, bio?: boolean) => (bio && l === "section" ? { q: "Look along one CalCOFI line, year by year", a: "A slice along one line of stations, with the years running up the side, to see how it changed over time." } : GUIDE[l]);
export const RAIL_TIP: Record<Lens, string> = Object.fromEntries((Object.keys(GUIDE) as Lens[]).map((l) => [l, `${RAIL_NAME[l]} — ${GUIDE[l].a}`])) as Record<Lens, string>;
const hex = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
const V = { lo: "#3b0f70", mid: "#21908c", hi: "#fde725", lt: "#7ad151" }; // the viridis stops the maps use
const THUMB: Record<Lens, ReactNode> = {
  station: <><circle cx="12" cy="9" r="4" fill={V.mid} /><circle cx="30" cy="20" r="4" fill={V.hi} /><circle cx="44" cy="8" r="4" fill={V.mid} /><circle cx="52" cy="22" r="4" fill={V.lo} /><circle cx="8" cy="24" r="3.4" fill={V.lo} /></>,
  hex: <><polygon points={hex(10, 10, 7)} fill={V.lo} /><polygon points={hex(24, 10, 7)} fill={V.mid} /><polygon points={hex(38, 10, 7)} fill={V.mid} /><polygon points={hex(52, 10, 7)} fill={V.lt} /><polygon points={hex(17, 22, 7)} fill={V.hi} /><polygon points={hex(31, 22, 7)} fill={V.mid} /><polygon points={hex(45, 22, 7)} fill={V.mid} /></>,
  contour: <><defs><linearGradient id="vr-c" x1="0" x2="1"><stop offset="0" stopColor={V.lo} /><stop offset=".5" stopColor={V.mid} /><stop offset="1" stopColor={V.hi} /></linearGradient></defs><rect x="2" y="3" width="52" height="26" rx="3" fill="url(#vr-c)" opacity=".85" /><path d="M2 20 C16 8 30 24 54 12" fill="none" stroke="#fff" strokeWidth="1" opacity=".7" /><path d="M2 26 C18 16 34 28 54 20" fill="none" stroke="#fff" strokeWidth="1" opacity=".5" /></>,
  cruise: <><path d="M3 24 C14 6 24 30 36 14 S50 8 53 5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="14" cy="14" r="2.6" fill="currentColor" /><circle cx="36" cy="14" r="2.6" fill="currentColor" /><circle cx="53" cy="5" r="2.6" fill="currentColor" /></>,
  region: <><polygon points="3,6 22,4 24,26 4,28" fill="#7fb2d8" /><polygon points="24,4 42,7 44,27 24,26" fill={V.mid} /><polygon points="42,7 54,6 54,26 44,27" fill={V.hi} /></>,
  section: <><defs><linearGradient id="vr-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={V.hi} /><stop offset=".5" stopColor={V.mid} /><stop offset="1" stopColor={V.lo} /></linearGradient></defs><path d="M2 3 H54 V20 L44 28 H12 L2 20 Z" fill="url(#vr-s)" /><path d="M10 3 v3 M22 3 v3 M34 3 v3 M46 3 v3" stroke="#fff" strokeWidth="1.2" opacity=".8" /></>,
};
/** step 4, "View as": the six views as one compact row of little pictures (the chosen one outlined, its name beside the heading),
 *  plus "? Guide", which opens the same views as questions. Replaces the old rail on the map's right edge. */
const VA_SHORT: Record<Lens, string> = { station: "Stations", hex: "Hexagon", contour: "Contour", cruise: "Cruise", region: "Region", section: "Section" };
export function ViewAs(p: { lens: Lens; onLens: (l: Lens) => void; nudge?: Lens | null; bio?: boolean }) {
  const [guide, setGuide] = useState<{ top: number; left: number; max: number; w: number } | null>(null);
  // hovering a picture shows its own row of the "Which view?" list beside the panel, while the pointer stays on it
  const [peek, setPeek] = useState<{ l: Lens; top: number; left: number; w: number } | null>(null);
  const peekAt = (l: Lens, el: HTMLElement) => {
    const par = el.closest(".lean-steps")?.getBoundingClientRect(), r = el.getBoundingClientRect();
    const left = (par?.right ?? r.right) + 10, w = Math.min(470, window.innerWidth - left - 12);
    setPeek({ l, left, w, top: Math.max(8, Math.min(r.top - 8, window.innerHeight - 120)) });
  };
  const openGuide = (el: HTMLElement) => {
    const par = el.closest(".lean-steps")?.getBoundingClientRect(), r = el.getBoundingClientRect();
    // sits beside the panel; slides up as far as it needs to, and scrolls inside itself when the window is too short for all six views
    const left = (par?.right ?? r.right) + 10, w = Math.min(470, window.innerWidth - left - 12);
    // it stops above the Time panel when that sits underneath it, and scrolls inside itself if the six views do not fit
    const tp = document.querySelector(".card-years")?.getBoundingClientRect();
    const floor = tp && tp.height > 0 && tp.top > 80 && tp.right > left && tp.left < left + w ? tp.top - 8 : window.innerHeight - 12;
    const top = Math.max(8, Math.min(r.top - 40, floor - 400));
    setGuide({ left, top, w, max: Math.max(220, floor - top) });
  };
  useEffect(() => {
    if (!guide) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setGuide(null); };
    const away = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!t.closest(".vr-guide, .va-gd")) setGuide(null); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", away);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", away); };
  }, [guide]);
  return (
    <section className="group step viewas" data-tour="lens">
      <h4 className="group-title">View as <span className="va-name">· {RAIL_NAME[p.lens]}</span>
        <button type="button" className="va-gd" onClick={(e) => (guide ? setGuide(null) : openGuide(e.currentTarget))} aria-expanded={!!guide}>Which view?</button></h4>
      <div className="va-grid" role="group" aria-label="Map view">
        {LENSES.map((l) => (
          <button key={l} type="button" className={`va-tile${l === p.lens ? " on" : ""}${l === p.nudge && l !== p.lens ? " nudge" : ""}`} aria-pressed={l === p.lens} aria-label={RAIL_NAME[l]} onClick={() => l !== p.lens && p.onLens(l)}
            onMouseEnter={(e) => !guide && peekAt(l, e.currentTarget)} onMouseLeave={() => setPeek(null)} onFocus={(e) => !guide && peekAt(l, e.currentTarget)} onBlur={() => setPeek(null)}>
            <svg className="vr-th" viewBox="0 0 56 32" aria-hidden="true">{THUMB[l]}</svg>
            <span className="va-lab">{VA_SHORT[l]}</span>
          </button>))}
      </div>
      {peek && !guide && <div className="vr-guide vr-peek" aria-hidden="true" style={{ top: peek.top, left: peek.left, width: peek.w }}>
        <div className={`vm-row${peek.l === p.lens ? " on" : ""}`}>
          <span className="vm-pic"><svg className="vr-th" viewBox="0 0 56 32" aria-hidden="true">{THUMB[peek.l]}</svg><i>{RAIL_NAME[peek.l]}</i></span>
          <span className="vm-tx"><b>{guideOf(peek.l, p.bio).q}</b><span>{guideOf(peek.l, p.bio).a}</span></span>
        </div>
      </div>}
      {guide && <div className="vr-guide" role="dialog" aria-label="What each view shows" style={{ top: guide.top, left: guide.left, width: guide.w, maxHeight: guide.max }}>
        <div className="vm-hd">WHAT DO YOU WANT TO DO?</div>
        {LENSES.map((l) => (
          <button key={l} type="button" className={`vm-row${l === p.lens ? " on" : ""}`} onClick={() => { if (l !== p.lens) p.onLens(l); setGuide(null); }}>
            <span className="vm-pic"><svg className="vr-th" viewBox="0 0 56 32" aria-hidden="true">{THUMB[l]}</svg><i>{RAIL_NAME[l]}</i></span>
            <span className="vm-tx"><b>{guideOf(l, p.bio).q}</b><span>{guideOf(l, p.bio).a}</span></span>
          </button>))}
      </div>}
    </section>);
}

/** the header's view picker: the chosen view (picture, name, chevron) with its question beside it; click it for the list of all six
 *  views, each with its picture and question. Replaces the row of tabs. */
export function ViewMenu(p: { lens: Lens; onLens: (l: Lens) => void; nudge?: Lens | null; leftAt?: number; bio?: boolean }) {
  const [open, setOpen] = useState(false);
  const [x, setX] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const away = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest?.(".driver-popover")) setOpen(false); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", away);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", away); };
  }, [open]);
  // the list opens where the Time panel opens (just right of the Find-data panel), so it never sits over that panel
  const show = (v: boolean) => {
    if (v && p.leftAt != null && box.current) { const m = document.querySelector(".mapwrap")?.getBoundingClientRect(); setX(m ? m.left + p.leftAt - box.current.getBoundingClientRect().left - 1 : null); }
    setOpen(v);
  };
  const showRef = useRef(show); showRef.current = show;
  useEffect(() => { // the guided tour opens and closes it
    const on = (e: Event) => showRef.current(!!(e as CustomEvent).detail);
    window.addEventListener("cc-viewmenu", on); return () => window.removeEventListener("cc-viewmenu", on);
  }, []);
  const nudge = !!p.nudge && p.nudge !== p.lens && !open;
  return (
    <div ref={box} className="view-menu" data-tour="viewmenu">
      <button type="button" className={`vm-btn${nudge ? " nudge" : ""}`} aria-haspopup="true" aria-expanded={open} title="Change the view" onClick={() => show(!open)}>
        <svg className="vr-th" viewBox="0 0 56 32" aria-hidden="true">{THUMB[p.lens]}</svg>
        {RAIL_NAME[p.lens]}
        <Icon name={open ? "ui-up" : "ui-down"} size="0.95em" />
      </button>
      <div className="vm-q" title={guideOf(p.lens, p.bio).a}><b>{guideOf(p.lens, p.bio).q}</b><span>{guideOf(p.lens, p.bio).a}</span></div>
      {open && <div className="vm-list" data-tour="viewlist" role="group" aria-label="Map view" style={x != null ? { left: x } : undefined}>
        <div className="vm-hd">WHAT DO YOU WANT TO DO?</div>
        {LENSES.map((l) => (
          <button key={l} type="button" className={`vm-row${l === p.lens ? " on" : ""}`} aria-pressed={l === p.lens} onClick={() => { if (l !== p.lens) p.onLens(l); setOpen(false); }}>
            <span className="vm-pic"><svg className="vr-th" viewBox="0 0 56 32" aria-hidden="true">{THUMB[l]}</svg><i>{RAIL_NAME[l]}</i></span>
            <span className="vm-tx"><b>{guideOf(l, p.bio).q}</b><span>{guideOf(l, p.bio).a}</span></span>
          </button>))}
      </div>}
    </div>);
}

// ── Where ─────────────────────────────────────────────────────────────────────────────────────────────
/** "Draw an area" lets you draw a freehand shape on the map as the area filter, "Pick a region" opens the region choice; the one in
 *  force is filled and carries its own × (so there is no separate "clear" line). Nothing picked = the whole survey area.
 */
export function WhereControl(p: { kind: "box" | "region" | null; drawing?: boolean; onDraw: () => void; onRegion: () => void; onClear: () => void }) {
  const one = (on: boolean, label: string, tip: string, go: () => void) => (
    <span className={`wc-wrap${on ? " on" : ""}`}>
      <button type="button" className="wc-btn" aria-pressed={on} title={tip} onClick={go}>{label}</button>
      {on && <button type="button" className="wc-x" aria-label={`clear: ${label}`} title="clear" onClick={p.onClear}>×</button>}
    </span>);
  return (
    <div className="where-ctl" role="group" aria-label="where">
      {one(p.kind === "box" || !!p.drawing, p.drawing ? "Draw on the map…" : "Draw an area", "draw any shape on the map, like a lasso: only samples inside it count (Esc cancels)", p.onDraw)}
      {one(p.kind === "region", "Pick a region", "only samples inside a named area — a sanctuary, a basin, a boundary layer", p.onRegion)}
    </div>);
}

/** a text box with a themed suggestion list (the browser's own <datalist> popup is a white box that ignores the theme):
 *  opens on focus, filters as you type, a click fills the box; the list is fixed to the box so no panel clips it */
function Suggest(p: { value: string; onChange: (v: string) => void; options: number[]; placeholder: string; label: string; onKeyDown: (e: React.KeyboardEvent) => void }) {
  const [open, setOpen] = useState(false), [at, setAt] = useState<{ x: number; y: number; w: number } | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const shown = p.options.filter((o) => String(o).startsWith(p.value.trim()) && String(o) !== p.value.trim());
  const show = () => { const r = box.current?.getBoundingClientRect(); if (r) setAt({ x: r.left, y: r.bottom + 4, w: r.width }); setOpen(true); };
  return (
    <>
      <input ref={box} className="ls-in" inputMode="decimal" placeholder={p.placeholder} value={p.value} aria-label={p.label} autoComplete="off"
        onChange={(e) => { p.onChange(e.target.value); show(); }} onFocus={show} onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); p.onKeyDown(e); }} />
      {open && at && shown.length > 0 && (
        <div className="ls-list" role="listbox" style={{ left: at.x, top: at.y, minWidth: Math.max(at.w, 72) }}>
          {shown.map((o) => <button key={o} type="button" role="option" aria-selected={false} className="ls-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => { p.onChange(String(o)); setOpen(false); }}>{o}</button>)}
        </div>)}
    </>);
}

/** the boundary layer, as a themed list grouped by the registry's own groups (Energy and industry, Conservation …) with a
 *  check on the current one — in place of the browser's white <select>. Esc / a click outside closes; ↑ ↓ move. */
export function LayerSelect(p: { value: string; groups: { group: string; names: string[] }[]; onChange: (v: string) => void; label: string; labelOf?: (n: string) => string; whyOf?: (n: string) => string | null; placeholder?: string; onOpen?: () => void }) {
  const nameOf = p.labelOf ?? shownName;
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  // the list hangs just under its box, inside the panel (absolutely placed in the box's wrapper): it scrolls with the panel in
  // the same frame and is as wide as the box — the same frame as the cruise lists
  const show = () => { setOpen(true); p.onOpen?.(); };
  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(pop.current?.querySelectorAll<HTMLElement>("button.lsel-opt:not(:disabled)") ?? [])]; const i = items.indexOf(document.activeElement as HTMLElement);
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };
  return (
    <div className={`lsel-wrap${open ? " open" : ""}`}>
      <button ref={btn} type="button" className={`lsel-btn${open ? " open" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-label={p.label}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); show(); } }}>
        {p.value ? <span>{nameOf(p.value)}</span> : <span className="lsel-ph">{p.placeholder ?? "choose…"}</span>}<Icon name="ui-down" size="0.95rem" />
      </button>
      {open && (
        <div ref={pop} className="lsel-pop anchored" role="listbox" aria-label={p.label} onKeyDown={move}>
          {p.groups.map((g) => <div key={g.group} role="group" aria-label={g.group}>
            <div className="lsel-gh">{g.group}</div>
            {g.names.map((n) => { const why = p.whyOf?.(n) ?? null; return <button key={n} type="button" role="option" aria-selected={n === p.value} aria-disabled={!!why} disabled={!!why} title={why ?? undefined} className={`lsel-opt${n === p.value ? " on" : ""}${why ? " off" : ""}`}
              onClick={() => { p.onChange(n); setOpen(false); btn.current?.focus(); }}><span>{nameOf(n)}{why ? ` — ${why}` : ""}</span>{n === p.value && <Icon name="ui-check" size="0.95rem" />}</button>; })}
          </div>)}
        </div>)}
    </div>);
}

/** Line / Station: add CalCOFI lines (90) and, if you want, one station on a line (90 / 55), in any combination; each one
 *  is a chip with its own ×. Enter or "Add" puts it in; the line box suggests the lines the grid has. */
export function LineStation(p: { lines: number[]; stationsOf: (line: number) => number[]; items: { line: number; station: number | null }[]; unmatched: { line: number; station: number | null }[]; onSet: (items: { line: number; station: number | null }[]) => void; onClear: () => void }) {
  const [l, setL] = useState(""), [st, setSt] = useState("");
  const add = () => {
    const line = Number(l), station = st.trim() === "" ? null : Number(st);
    if (l.trim() === "" || !Number.isFinite(line) || (station != null && !Number.isFinite(station))) return;
    if (!p.items.some((i) => i.line === line && i.station === station)) p.onSet([...p.items, { line, station }]);
    setL(""); setSt("");
  };
  const key = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  const lab = lineStationId; // CalCOFI's standard ID: "090.0 070.0", or "Line 090.0" for a whole line
  return (
    <div className={`line-station${p.items.length ? " on" : ""}`} role="group" aria-label="lines and stations">
      <span className="ls-lab">Line</span>
      <Suggest value={l} onChange={(v) => { setL(v); setSt(""); }} options={p.lines} placeholder="e.g. 90" label="CalCOFI line" onKeyDown={key} />
      <span className="ls-lab">Station</span>
      <Suggest value={st} onChange={setSt} options={Number.isFinite(Number(l)) && l.trim() !== "" ? p.stationsOf(Number(l)) : []} placeholder="any" label="station on that line (optional)" onKeyDown={key} />
      <button type="button" className="ls-add" disabled={l.trim() === ""} onClick={add} title="add this line / station — add as many as you like">+ Add</button>
      {p.items.length > 0 && <div className="ls-chips">
        {p.items.map((i) => <span key={`${i.line}/${i.station}`} className="ls-chip">{lab(i)}<button type="button" aria-label={`remove ${lab(i)}`} onClick={() => p.onSet(p.items.filter((x) => x !== i))}>×</button></span>)}
        {p.items.length > 1 && <button type="button" className="linkish" onClick={p.onClear}>Clear</button>}
      </div>}
      {p.unmatched.length > 0 && <div className="ls-warn">No such station: {p.unmatched.map(lab).join(", ")}.</div>}
    </div>);
}

// ── the Download bar ───────────────────────────────────────────────────────────────────────────────────
/** how many rows, one prominent Download CSV (the filtered observations), a ▾ for the other formats, and the two small
 *  links people reach for next. The zip package lives only in the ▾ — it used to be a second, competing button */
export function DownloadBar(p: { count: ReactNode; sub?: ReactNode; busy: string | null; disabled: boolean; onCsv: () => void; onZip: () => void; onCopy: (k: "sql" | "r" | "py") => void; onCite: () => void; onLink: () => void; onReset?: () => void; zerosOpt?: { checked: boolean; onChange: (b: boolean) => void } | null }) {
  return (
    <div className="dl-foot" data-tour="share">
      <div className="dl-count"><b>{p.count}</b></div>
      {p.sub && <div className="dl-sub">{p.sub}</div>}
      <div className="dl-split">
        <button type="button" className="dl-main" disabled={p.disabled || !!p.busy} onClick={p.onCsv} title="every observation behind this view, with your filters applied, as one CSV">
          <Icon name="ui-download" />{p.busy ?? "Download CSV"}</button>
        <button type="button" className="dl-zip" disabled={p.disabled || !!p.busy} onClick={p.onZip} title="everything as a package: the data, the citation, and the exact SQL, R and Python"><Icon name="ui-download" size="0.9rem" />Zip</button>
      </div>
      {p.zerosOpt && <label className="dl-zeros" title="a sampled tow with no catch is a row with a value of 0 and no observation ID — most rows of a common species"><input type="checkbox" checked={p.zerosOpt.checked} onChange={(e) => p.zerosOpt!.onChange(e.target.checked)} />Include tows with no catch</label>}
      <div className="dl-tools">
        <button type="button" className="dl-tool" onClick={p.onCite} title="the sources and citations for this view"><Icon name="ui-cite" size="0.95rem" />How to cite</button>
        <button type="button" className="dl-tool" onClick={p.onLink} title="copy a link that reopens this exact view"><Icon name="ui-link" size="0.95rem" />Copy link</button>
        <Menu className="dl-tool-menu" icon="ui-code" label="Code" align="right" title="copy the code that reproduces this view"
          items={[{ label: "Copy SQL", icon: "ui-code", hint: "the query this view ran", onSelect: () => p.onCopy("sql") }, { label: "Copy R code", icon: "ui-code", onSelect: () => p.onCopy("r") }, { label: "Copy Python code", icon: "ui-code", onSelect: () => p.onCopy("py") }]} />
        {p.onReset && <button type="button" className="dl-tool" onClick={p.onReset} title="back to the defaults: Stations, all years, all seasons, all depths, everywhere, every dataset — keeps your variable">Reset all</button>}
      </div>
    </div>);
}

// ── Depth ──────────────────────────────────────────────────────────────────────────────────────────────
/** a plain labelled pill under the variable, drawn only for a pick that has a depth axis; it pulses once when one arrives
 *  (App.tsx's depthPulse) and opens the Depth panel. No chip, no icon-only button */
export function DepthPill(p: { available: boolean; open: boolean; pulse: boolean; onClick: () => void; band?: [number, number]; children?: ReactNode; preview?: ReactNode }) {
  if (!p.available) return null;
  return (<div className="depth-wrap">
    <button type="button" className={`depth-row${p.open ? " on" : ""}${p.pulse ? " pulse" : ""}`} aria-expanded={p.open} onClick={p.onClick}
      title="open the depth profile — drag the band there to choose the depths"><Icon name="ui-tune" />
      <span className="dr-t">Depth profile{p.band && <b>{p.band[0]}–{p.band[1]} m</b>}</span>{p.preview}<Icon name={p.open ? "ui-down" : "ui-right"} size="0.95rem" className="dr-chev" /></button>{p.children}</div>);
}

// ── the What picker (the mockup's, opening in place like the station app's By Category list) ─────────────────────
// One search box over species AND measurements; below it "Marine life" and "The water" list their categories (or datasets), a count
// on each; a row opens in place to its items (name, then the scientific name or description). Typing searches everything.
const PLAIN_CAT: Record<string, string> = {
  "Physical Oceanography": "Water properties", "Nutrients & Chemistry": "Nutrients and chemistry", "Carbonate System": "Carbonate chemistry",
  "Productivity & Pigments": "Chlorophyll", "Meteorology & Sea State": "Weather and sea state", "Euphausiids (Krill)": "Krill",
  "Seabirds & Marine Mammals": "Seabirds and mammals", "Mesopelagic Fish": "Mesopelagic fish", "Picoplankton & Bacteria": "Picoplankton and bacteria",
  "Fish Eggs & Larvae": "Fish eggs and larvae",
};
// category names in Title Case (Betty 2026-11-10): "Water Properties", "Nutrients and Chemistry"; the small words stay
// lower case and a word with its own capitals (eDNA) is left as it is
const SMALL = new Set(["and", "or", "of", "the", "a", "an", "in", "on", "at", "to", "by", "for"]);
const titleCase = (x: string) => x.split(" ").map((w, i) => (i > 0 && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : /[A-Z]/.test(w.slice(1)) ? w : w[0].toUpperCase() + w.slice(1)).join(" ");
export const plainCat = (c: string) => titleCase(PLAIN_CAT[c] ?? c.replace(/ & /g, " and "));
const norm = (x: string | null | undefined) => (x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// singular and plural find each other: "anchovies" ⇄ "anchovy", "krills" ⇄ "krill", "fishes" ⇄ "fish"
const stem = (w: string) => w.length < 4 ? w : /ies$/.test(w) ? w.slice(0, -3) + "y" : /(ch|sh|ss|x|z)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : /ie$/.test(w) ? w.slice(0, -2) + "y" : w;
const stemmed = (x: string) => norm(x).replace(/[a-z]+/g, stem);
const sortKey = (x: string) => norm(x).replace(/^(the|a|an)\s+/, "").replace(/^[^a-z0-9]+/, "");
const CAP = 60;
type Kind = "life" | "water";
// the order people reach for: temperature, oxygen, carbon, chlorophyll first; then the life: fish and zooplankton, mammals, krill, mesopelagic fish, phytoplankton (Betty 2026-11-10)
const ORDER = ["Water properties", "Nutrients and chemistry", "Carbonate chemistry", "Chlorophyll", "Weather and sea state",
  "Fish eggs and larvae", "Zooplankton", "Seabirds and mammals", "Krill", "Mesopelagic fish", "Phytoplankton", "Picoplankton and bacteria", "Genomics and eDNA"];
// inside a category: the measurements everyone knows first (temperature, salinity, oxygen …), then the rest by how much data
// there is, derived ones after the measured ones — not A–Z
const KNOWN = ["temperature", "salinity", "oxygen", "chlorophyll", "nitrate", "phosphate", "silicate", "nitrite", "ammon", "ph", "alkalinity", "inorganic carbon", "density", "productivity", "fluorescence", "pressure"];
const famousness = (it: PickerItem) => { const l = it.label.toLowerCase(), i = KNOWN.findIndex((k) => (k === "ph" ? /\bph\b/.test(l) : l.includes(k))); return i < 0 ? 99 : i; };
// the secondary versions of a measurement sink below the headline ones (Betty 2026-11-10): a single sensor, an
// uncorrected / raw / pre-QC / reported value, an underway TSG unit, a replicate, a model prediction, an unidentified code,
// a retired definition, instrument housekeeping (sensor temperature, voltage, flow rate)
const SECONDARY = /\b(sensor\s*\d|uncorrected|raw|pre-?qc|reported|tsg|unit\s*\d|replicate|rep\s*\d|model-predicted|predicted|unidentified|unconfirmed|cruise-corrected|second unit|retired|sensor temperature|voltage|flow rate)\b/i;
const SECONDARY_KEY = /(^r_|_[12]$|_[12]_|_rep\d|^tsg|^pred_|^unknown_|_cruise_corr$)/i;
const secondary = (it: PickerItem) => (SECONDARY.test(`${it.label} ${it.desc ?? ""}`) || SECONDARY_KEY.test(it.key) ? 1 : 0);
// topics inside an environmental category (Betty 2026-11-10: "groups within, like temperature, salinity, depth"). Tested in
// this order (instrument and weather first, so "oxygen sensor temperature" and "air temperature" do not land in Temperature);
// shown in TOPIC_SHOW order. Matched on the row's name, description and key.
const TOPIC_TEST: [string, RegExp][] = [
  ["Instrument", /sensor temperature|voltage|flow rate|bottle trip|retired|valve|dic system/i],
  ["Weather", /\bwind|\bair\b|humidity|barometric|atmospheric|cloud|weather|\bwave|swell|sea state|visibility|dew point|wet bulb|dry bulb|psychrometer/i],
  ["Depth & mixed layer", /^(mixed-layer depth|pycnocline depth)/i],   // before Temperature/Density: "Mixed-Layer Depth (Temperature −0.2 °C)" is a depth
  ["Productivity", /incubation|productivity|\b14c\b|\bc14|assimilation/i],
  ["Chlorophyll & pigments", /chlorophyll|phaeo|pigment|fluoresc|hplc|xanthin|carotene|fuco/i],
  ["Carbon", /inorganic carbon|alkalinity|\bph\b|\bdic\b|co2|carbonate|aragonite|calcite/i],
  ["Nutrients", /nitrate|nitrite|phosphate|silicate|ammon/i],
  ["Organic carbon & iron", /organic carbon|organic nitrogen|\biron\b/i],
  ["Oxygen", /oxygen|hypoxic/i],
  ["Density", /density|sigma|buoyancy|pycnocline|specific volume|dynamic height|sound velocity/i],
  ["Temperature", /temperature|\bsst\b|\btemp\b|spice|spicin/i],
  ["Salinity", /salinity|conductivity/i],
  ["Depth & mixed layer", /depth|mixed-layer|mixed layer|pressure/i],
  ["Light & clarity", /\bpar\b|photosynth|light|transmiss|beam attenuation|secchi|irradiance/i],
];
const TOPIC_SHOW = ["Temperature", "Salinity", "Oxygen", "Density", "Depth & mixed layer", "Nutrients", "Organic carbon & iron", "Carbon", "Chlorophyll & pigments", "Productivity", "Light & clarity", "Weather", "Other", "Instrument"];
// Fish Eggs and Larvae holds more than fish: the ichthyoplankton nets also catch squid and other invertebrates. The rows split
// by the taxon's class (Betty 2026-11-10). Egg vs larva is not a property of a species — it is the life stage, chosen after picking.
const FISH_CLASS = /teleostei|actinopter|elasmobranch|chondrichth|holocephal|myxini|petromyzont|sarcopteryg|cephalaspidomorph/i;
const BIO_TOPIC_SHOW = ["Fish", "Squid and octopus", "Other invertebrates", "Class not recorded"];
const bioTopicOf = (it: PickerItem) => {
  const c = it.groups?.class && it.groups.class !== "—" ? it.groups.class : "";
  if (FISH_CLASS.test(c) || (!c && /\b(fish|teleost)/i.test(`${it.label} ${it.sub ?? ""}`))) return "Fish";
  if (/cephalopod/i.test(c)) return "Squid and octopus";
  return c ? "Other invertebrates" : "Class not recorded";
};
const BIO_SPLIT = new Set(["Fish Eggs & Larvae"]);
const topicOf = (it: PickerItem) => { const t = `${it.label} ${it.desc ?? ""} ${it.key.replace(/_/g, " ")}`; return TOPIC_TEST.find(([, re]) => re.test(t))?.[0] ?? "Other"; };
const orderOf = (name: string) => { const i = ORDER.findIndex((o) => o.toLowerCase() === name.toLowerCase()); return i < 0 ? 99 : i; };

export function WhatPicker(p: {
  items: PickerItem[]; isOrganism: (key: string) => boolean; value: string; onPick: (key: string, dataset?: string) => void; onClose: () => void;
  iconOf: (category: string) => IconName | undefined; rank: (category: string) => number; dsShort: (dk: string) => string; dsName?: (dk: string) => string; loading?: string | null;
}) {
  const dsName = p.dsName ?? p.dsShort; // the dataset's full name ("CalCOFI Bottle Database"), never the shorthand
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"category" | "dataset">("category");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState<string | null>(null);
  const [ex, setEx] = useState<string | null>(null); // the measurement whose dataset choices are showing
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const kindOf = (it: PickerItem): Kind => (p.isOrganism(it.key) ? "life" : "water");
  const catOf = (it: PickerItem) => it.groups?.category ?? "Other";
  // By category: one group per row. By dataset: a row made in several datasets is listed under EACH of them (Betty
  // 2026-11-10 — "Sea Temperature" under the bottle AND the CTD dataset), tagged with that dataset so a click picks it directly
  const groupsOf = (it: PickerItem) => (tab === "category" ? [catOf(it)] : it.datasets?.length ? it.datasets : ["—"]);
  const isSel = (it: PickerItem) => it.key === p.value || !!it.alt?.includes(p.value);
  const sections = useMemo(() => {
    const m = new Map<string, { id: string; kind: Kind; name: string; cat: string; items: PickerItem[] }>();
    for (const it of p.items) for (const g of groupsOf(it)) {
      const k = kindOf(it), id = `${k}|${g}`;
      const e = m.get(id) ?? { id, kind: k, name: tab === "category" ? plainCat(g) : dsName(g), cat: g, items: [] };
      e.items.push(tab === "dataset" && g !== "—" ? { ...it, inDs: g } : it); m.set(id, e);
    }
    const by = (kind: Kind) => [...m.values()].filter((e) => e.kind === kind)
      .sort((a, b) => (tab === "category" ? orderOf(a.name) - orderOf(b.name) || p.rank(a.cat) - p.rank(b.cat) : 0) || a.name.localeCompare(b.name))
      .map((e) => ({ ...e, items: e.items.sort((a, b) => Number(!!a.unnamed) - Number(!!b.unnamed) || secondary(a) - secondary(b) || famousness(a) - famousness(b) || Number(!!a.badge) - Number(!!b.badge) || b.n - a.n || sortKey(a.label).localeCompare(sortKey(b.label), undefined, { numeric: true }) || a.key.localeCompare(b.key)) }));
    return { life: by("life"), water: by("water") };
  }, [p.items, tab]);
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const found = useMemo(() => {
    if (!toks.length) return null;
    const hay = (it: PickerItem) => { const t = `${it.label} ${it.sub ?? ""} ${it.desc ?? ""} ${it.search ?? ""} ${it.key}`; return norm(t) + " " + stemmed(t); };
    const lead = (it: PickerItem) => (norm(it.label).startsWith(toks[0]) ? 0 : 1);
    return p.items.filter((it) => toks.every((t) => { const h = hay(it); return h.includes(t) || h.includes(stem(t)); })).sort((a, b) => Number(!!a.unnamed) - Number(!!b.unnamed) || lead(a) - lead(b) || secondary(a) - secondary(b) || b.n - a.n || a.label.localeCompare(b.label));
  }, [p.items, q]);
  // a measurement made in several datasets (bottle, CTD …) is never picked for you: the row opens in place and you choose the dataset
  const choicesOf = (it: PickerItem) => {
    // a species counted in several datasets (anchovy: CUFES eggs, ichthyoplankton …) opens the same chooser (Betty 2026-11-10)
    if (p.isOrganism(it.key)) return (it.datasets?.length ?? 0) > 1 ? it.datasets!.map((d) => ({ key: it.key, ds: d })) : null;
    const seen = new Set<string>(), out: { key: string; ds: string }[] = [];
    for (const v of it.variants?.length ? it.variants : [{ key: it.key, datasets: it.datasets ?? [] }]) for (const d of v.datasets) if (!seen.has(d)) { seen.add(d); out.push({ key: v.key, ds: d }); }
    return out.length > 1 ? out : null;
  };
  const itemBtn = (it: PickerItem, tag?: string) => {
    const second = p.isOrganism(it.key) ? it.sub : it.desc ?? it.sub;
    // listed under one dataset (By dataset): no chooser — the click opens this row's data from THAT dataset
    if (it.inDs) {
      const v = it.variants?.find((x) => x.datasets.includes(it.inDs!));
      const n = it.datasets?.length ?? 0;
      return <button key={it.key} type="button" className={`wp-item${isSel(it) ? " on" : ""}`} onClick={() => p.onPick(v?.key ?? it.key, it.inDs)} title={it.tip ?? it.desc}>
        <span className="wp-name">{it.label}{it.badge && <i className="badge">{it.badge}</i>}</span>{tag && <em>{tag}</em>}
        {n > 1 && <em className="wp-nds">also in {n - 1} other{n > 2 ? "s" : ""}</em>}
        {second && <small className={it.subItalic ? "i" : ""}>{second}</small>}</button>;
    }
    const ch = choicesOf(it), isOpen = !!ch && ex === it.key;
    // a click on the row just opens it — the app picks the dataset (Betty 2026-11-10: step 1 asks one thing). The quiet
    // "N datasets" beside it is its own button, for whoever wants a particular one
    const btn = <button key={it.key} type="button" className={`wp-item${isSel(it) ? " on" : ""}${ch ? " multi" : ""}`}
      onClick={() => p.onPick(it.key)} title={it.tip ?? it.desc}>
      <span className="wp-name">{it.label}{it.badge && <i className="badge">{it.badge}</i>}</span>{tag && <em>{tag}</em>}
      {second && <small className={it.subItalic ? "i" : ""}>{second}</small>}</button>;
    if (!ch) return btn;
    return <div key={it.key} className="wp-itemwrap">{btn}
      <button type="button" className="wp-nds-btn" aria-expanded={isOpen} onClick={() => setEx(isOpen ? null : it.key)} title="this is in several datasets — choose one yourself">
        {ch.length} datasets <Icon name={isOpen ? "ui-up" : "ui-down"} size="0.8rem" /></button>
      {isOpen && <div className="wp-ds" role="group" aria-label="choose a dataset">
        <div className="wp-ds-h">Or choose a dataset</div>
        {ch.map((c) => <button key={c.ds} type="button" className="wp-dsrow" onClick={() => p.onPick(c.key, c.ds)}><span className="wp-dsname">{dsName(c.ds)}</span><span className="wp-dsgo" aria-hidden="true">→</span></button>)}
      </div>}</div>;
  };
  const section = (title: string, rows: typeof sections.life) => rows.length ? <>
    <div className="wp-sec">{title}</div>
    <div className="wp-list">{rows.map((g) => {
      const on = open === g.id, ic = tab === "category" ? p.iconOf(g.cat) : undefined, lim = all === g.id ? g.items.length : CAP;
      return <div key={g.id} className={`wp-group${on ? " open" : ""}`}>
        <button type="button" className="wp-row" aria-expanded={on} onClick={(e) => {
          // opening just opens: the clicked row stays exactly where it is on screen, even when another group above it closes
          const btn = e.currentTarget, box = btn.closest(".lean-steps") as HTMLElement | null, y0 = btn.getBoundingClientRect().top;
          setOpen(on ? null : g.id); setAll(null);
          requestAnimationFrame(() => requestAnimationFrame(() => { if (box && btn.isConnected) box.scrollTop += btn.getBoundingClientRect().top - y0; }));
        }}>
          {tab === "category" && <span className="wp-ic">{ic && <Icon name={ic} />}</span>}
          <span className="wp-name">{g.name}</span><span className="wp-badge">{g.items.length.toLocaleString()}</span><Icon name={on ? "ui-down" : "ui-right"} className="wp-chev" size="0.9rem" /></button>
        {on && (() => {
          // a long environmental category reads in topics (Temperature, Salinity, Oxygen …), each keeping the list's order
          const topics = tab !== "category" || g.items.length <= 8 ? []
            : g.kind === "water" ? TOPIC_SHOW.map((t) => [t, g.items.filter((it) => topicOf(it) === t)] as const).filter(([, xs]) => xs.length)
            : BIO_SPLIT.has(g.cat) ? BIO_TOPIC_SHOW.map((t) => [t, g.items.filter((it) => bioTopicOf(it) === t)] as const).filter(([, xs]) => xs.length) : [];
          if (topics.length > 1) return <div className="wp-items">{topics.map(([t, xs]) => <Fragment key={t}><div className="wp-sub">{t}</div>{xs.map((it) => itemBtn(it))}</Fragment>)}</div>;
          return <div className="wp-items">{g.items.slice(0, lim).map((it) => itemBtn(it))}
            {g.items.length > lim && <button type="button" className="wp-more" onClick={() => setAll(g.id)}>Show all {g.items.length.toLocaleString()}</button>}</div>;
        })()}
      </div>;
    })}</div></> : null;
  return <div className="wp" role="dialog" aria-label="What to look at" onKeyDown={(e) => { if (e.key === "Escape") p.onClose(); }}>
    <div className="wp-head"><span className="wp-title">What</span><button type="button" className="wp-cancel" onClick={p.onClose} title="Back to filters" aria-label="Back to filters"><Icon name="ui-arrow-left" size="1rem" />Filters</button></div>
    <div className="wp-find" data-tour="what-find">
      <label className="wp-search"><Icon name="ui-search" size="1rem" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search species or measurements" aria-label="Search species or measurements" /></label>
      {!found && <div className="wp-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "category"} className={tab === "category" ? "on" : ""} onClick={() => { setTab("category"); setOpen(null); }}>By category</button>
        <button type="button" role="tab" aria-selected={tab === "dataset"} className={tab === "dataset" ? "on" : ""} onClick={() => { setTab("dataset"); setOpen(null); }}>By dataset</button></div>}
    </div>
    {p.loading && <div className="hint">{p.loading}</div>}
    {found ? <div className="wp-list">
      {found.slice(0, CAP).map((it) => itemBtn(it, tab === "category" ? plainCat(catOf(it)) : undefined))}
      {!found.length && <div className="hint wp-none">Nothing matches “{q}”.</div>}
      {found.length > CAP && <div className="hint wp-none">{found.length.toLocaleString()} matches — type more to narrow.</div>}
    </div> : <div className="wp-groups" data-tour="what-list">
      {section("Environmental", sections.water)}{section("Biological", sections.life)}
    </div>}
  </div>;
}


// ── a small dropdown: a button naming the current choice, and a plain list under it (the browser's own select popup cannot be styled)
export function StatPick(p: { value: string; options: [string, string][]; onChange: (k: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const idx = Math.max(0, p.options.findIndex(([k]) => k === p.value));
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest?.(".driver-popover")) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => { // the guided tour opens and closes it
    const on = (e: Event) => { setHi(idx); setOpen(!!(e as CustomEvent).detail); };
    window.addEventListener("cc-statpick", on); return () => window.removeEventListener("cc-statpick", on);
  }, [idx]);
  const pick = (k: string) => { p.onChange(k); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) { setHi(idx); setOpen(true); } else setHi((h) => (h + (e.key === "ArrowDown" ? 1 : p.options.length - 1)) % p.options.length); }
    else if ((e.key === "Enter" || e.key === " ") && open) { e.preventDefault(); pick(p.options[hi][0]); }
  };
  return <span className="sp" ref={box} onKeyDown={onKey}>
    <button type="button" className="sp-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={p.label} onClick={() => { setHi(idx); setOpen(!open); }}>{p.options[idx]?.[1]}<Icon name="ui-down" size="0.9rem" /></button>
    {open && <ul className="sp-list" role="listbox" aria-label={p.label}>{p.options.map(([k, v], i) => <li key={k} role="option" aria-selected={k === p.value} className={i === hi ? "hi" : ""} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(k); }}><span className="ck">✓</span>{v}</li>)}</ul>}
  </span>;
}
