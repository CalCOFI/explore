// the one searchable combobox behind organism, variable and cruise (plan D13): WAI-ARIA combobox +
// listbox, A→Z by default, every row carrying its count as a log-scaled bar (so most/least is visible
// in any order) and its dataset colour dots; sort (A–Z · most observations · most recent) and group
// (none · category · dataset · class) as toggles; a letter strip on the flat A–Z list; untruncated.
// hand-rolled (no styled dependency); `?native=1` keeps a plain <select> behind it for a release.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useAnchor } from "./ui";

export interface PickerItem {
  key: string;
  year0?: number | null;            // first year (Browse shows the span)
  label: string;                    // organism: common name (or scientific) · variable: description · cruise: key
  sub?: string;                     // organism: scientific name · variable: units · cruise: ship + dates
  subItalic?: boolean;
  n: number;                        // the bar (observations; stations for a section's cruises)
  year?: number | null;             // "most recent" sort key
  datasets?: string[];              // colour dots
  groups?: Record<string, string>;  // group key -> value (category · dataset · class)
  search?: string;                  // extra searchable text
}
export type SortKey = "az" | "n" | "recent";
export interface GroupOpt { key: string; label: string; icon?: (v: string) => IconName | undefined; rank?: (v: string) => number; short?: (v: string) => string }

const fmtN = (v: number) => v.toLocaleString();
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** the sort key of a display name: case-, accent- and article-insensitive (the station app's sortKey) */
export const sortKey = (s: string | null | undefined) => norm(s).replace(/^(the|a|an)\s+/, "").replace(/^[^a-z0-9]+/, "");
const SORT_LABEL: Record<SortKey, [string, IconName]> = { az: ["A–Z", "ui-sort-az"], n: ["most observations", "ui-sort-n"], recent: ["most recent", "ui-sort-recent"] };

function remember<T>(id: string, k: string, v: T | undefined): T | undefined {
  const key = `explore.picker.${id}.${k}`;
  try { if (v === undefined) { const s = localStorage.getItem(key); return s == null ? undefined : (JSON.parse(s) as T); } localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
  return v;
}

export function Picker(p: {
  id: string; label: string; hint?: string; value: string; items: PickerItem[]; onChange: (key: string) => void;
  sorts?: SortKey[]; defaultSort?: SortKey; groups?: GroupOpt[]; defaultGroup?: string; countLabel?: string; placeholder?: string;
  dsColor?: (dk: string) => string; dsShort?: (dk: string) => string; loading?: string | null; letters?: boolean; native?: boolean; "data-tour"?: string;
  sheet?: boolean; // phone: the popover fills the viewport
  browse?: boolean; // the Browse tab (D14): the whole holding by category or by dataset, click -> select
}) {
  const sorts = p.sorts ?? ["az", "n", "recent"];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSortRaw] = useState<SortKey>(() => { const s = remember<SortKey>(p.id, "sort", undefined); return s && sorts.includes(s) ? s : (p.defaultSort ?? sorts[0]); });
  const [group, setGroupRaw] = useState<string>(() => remember<string>(p.id, "group", undefined) ?? p.defaultGroup ?? "none");
  const [active, setActive] = useState(0);
  const [tab, setTabRaw] = useState<"search" | "browse">(() => (remember<"search" | "browse">(p.id, "tab", undefined) ?? "search"));
  const [browseBy, setBrowseByRaw] = useState<"category" | "dataset">(() => (remember<"category" | "dataset">(p.id, "browse", undefined) ?? "category"));
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const setTab = (t: "search" | "browse") => { setTabRaw(t); remember(p.id, "tab", t); };
  const setBrowseBy = (b: "category" | "dataset") => { setBrowseByRaw(b); remember(p.id, "browse", b); setOpenGroup(null); };
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useAnchor(open && !p.sheet, btn, 300, 560);
  const setSort = (s: SortKey) => { setSortRaw(s); remember(p.id, "sort", s); };
  const setGroup = (g: string) => { setGroupRaw(g); remember(p.id, "group", g); };
  const selected = p.items.find((it) => it.key === p.value);
  const maxN = useMemo(() => Math.max(1, ...p.items.map((it) => it.n)), [p.items]);
  const groupOpt = p.groups?.find((g) => g.key === group) ?? null;

  // filter → sort → group
  const sections = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    const hay = (it: PickerItem) => norm(`${it.label} ${it.sub ?? ""} ${it.search ?? ""} ${it.key}`);
    let vis = toks.length ? p.items.filter((it) => { const h = hay(it); return toks.every((t) => h.includes(t)); }) : p.items.slice();
    const cmp = sort === "az" ? (a: PickerItem, b: PickerItem) => sortKey(a.label).localeCompare(sortKey(b.label)) || a.key.localeCompare(b.key)
      : sort === "n" ? (a: PickerItem, b: PickerItem) => b.n - a.n || sortKey(a.label).localeCompare(sortKey(b.label))
      : (a: PickerItem, b: PickerItem) => (b.year ?? -1) - (a.year ?? -1) || b.key.localeCompare(a.key);
    vis.sort(cmp);
    if (!groupOpt) return [{ title: null as string | null, icon: undefined as IconName | undefined, items: vis, n: vis.reduce((a, it) => a + it.n, 0) }];
    const by = new Map<string, PickerItem[]>();
    for (const it of vis) { const g = it.groups?.[group] ?? "—"; (by.get(g) ?? by.set(g, []).get(g)!).push(it); }
    return [...by.entries()].sort((a, b) => (groupOpt.rank ? groupOpt.rank(a[0]) - groupOpt.rank(b[0]) : 0) || sortKey(a[0]).localeCompare(sortKey(b[0])))
      .map(([g, items]) => ({ title: groupOpt.short ? groupOpt.short(g) : g, icon: groupOpt.icon?.(g), items, n: items.reduce((a, it) => a + it.n, 0) }));
  }, [p.items, q, sort, group, groupOpt]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const letters = useMemo(() => {
    if (!p.letters || groupOpt || sort !== "az" || q) return null;
    const ls = new Set(flat.map((it) => sortKey(it.label)[0]?.toUpperCase() ?? "#"));
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => ({ l, on: ls.has(l) }));
  }, [flat, groupOpt, sort, q, p.letters]);

  // open: focus the search, land on the current value
  useEffect(() => {
    if (!open) return;
    setQ("");
    const i = Math.max(0, flat.findIndex((it) => it.key === p.value));
    setActive(i);
    requestAnimationFrame(() => { input.current?.focus(); scrollTo(i, "center"); });
    setOpenGroup(null);
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  useEffect(() => { setActive(0); }, [q, sort, group]);
  // scroll the list only (scrollIntoView would also scroll the rail the picker sits in)
  const scrollTo = (i: number, block: "nearest" | "center" | "start" = "nearest") => {
    const ul = list.current, el = ul?.querySelector<HTMLElement>(`[data-i="${i}"]`); if (!ul || !el) return;
    const top = el.getBoundingClientRect().top - ul.getBoundingClientRect().top + ul.scrollTop, h = el.offsetHeight, H = ul.clientHeight, head = 26;
    if (block === "center") ul.scrollTop = top - H / 2 + h / 2;
    else if (block === "start") ul.scrollTop = top - head;
    else if (top - head < ul.scrollTop) ul.scrollTop = top - head;
    else if (top + h > ul.scrollTop + H) ul.scrollTop = top + h - H;
  };
  useEffect(() => { if (open) scrollTo(active); }, [active]);
  const choose = (it: PickerItem) => { setOpen(false); if (it.key !== p.value) p.onChange(it.key); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(flat.length - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 10)); }
    else if (e.key === "PageUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 10)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[active]) choose(flat[active]); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); }
  };
  const jump = (l: string) => { const i = flat.findIndex((it) => (sortKey(it.label)[0]?.toUpperCase() ?? "#") === l); if (i >= 0) { setActive(i); scrollTo(i, "start"); } };
  const listId = `${p.id}-list`;
  // Browse (D14): the tree with counts, year spans and dataset dots; by category (an item under its category) or by
  // dataset (an item in two datasets lists under both, with per-dataset counts when the item carries them)
  const browseGroups = useMemo(() => {
    if (!p.browse) return [];
    const by = new Map<string, PickerItem[]>();
    for (const it of p.items) {
      const keys = browseBy === "category" ? [it.groups?.category ?? "Other"] : (it.datasets?.length ? it.datasets : ["—"]);
      for (const g of keys) (by.get(g) ?? by.set(g, []).get(g)!).push(it);
    }
    const opt = p.groups?.find((g) => g.key === browseBy);
    return [...by.entries()].sort((a, b) => (opt?.rank ? opt.rank(a[0]) - opt.rank(b[0]) : 0) || sortKey(opt?.short ? opt.short(a[0]) : a[0]).localeCompare(sortKey(opt?.short ? opt.short(b[0]) : b[0])))
      .map(([g, items]) => { const ys = items.map((i) => i.year0).filter((y): y is number => y != null), ye = items.map((i) => i.year).filter((y): y is number => y != null);
        return { key: g, title: opt?.short ? opt.short(g) : g, icon: opt?.icon?.(g), items: items.slice().sort((a, b) => sortKey(a.label).localeCompare(sortKey(b.label))), n: items.reduce((a, it) => a + it.n, 0), y0: ys.length ? Math.min(...ys) : null, y1: ye.length ? Math.max(...ye) : null, ds: [...new Set(items.flatMap((i) => i.datasets ?? []))] }; });
  }, [p.items, p.browse, browseBy, p.groups]);
  const span = (y0: number | null | undefined, y1: number | null | undefined) => (y0 != null && y1 != null ? (y0 === y1 ? String(y0) : `${y0}–${y1}`) : y1 != null ? String(y1) : "");
  const dot = (dk: string) => <i key={dk} className="dot" style={{ background: p.dsColor?.(dk) ?? "var(--muted)" }} title={p.dsShort?.(dk) ?? dk} />;

  if (p.native) return (
    <label className="f picker-native" data-tour={p["data-tour"]}>{p.label}{p.hint && <span className="hint"> {p.hint}</span>}
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
        {!selected && <option value={p.value}>{p.value}</option>}
        {flat.map((it) => <option key={it.key} value={it.key}>{it.label}{it.sub ? ` — ${it.sub}` : ""} ({fmtN(it.n)})</option>)}
      </select></label>);

  let idx = 0;
  return (
    <div ref={root} className={`picker${open ? " open" : ""}${p.sheet ? " fullscreen" : ""}`} data-tour={p["data-tour"]}>
      <label className="f" htmlFor={`${p.id}-btn`}>{p.label}{p.hint && <span className="hint"> {p.hint}</span>}</label>
      <button ref={btn} id={`${p.id}-btn`} type="button" className="picker-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)} title={selected ? `${selected.label}${selected.sub ? ` — ${selected.sub}` : ""}` : p.value}>
        {selected?.datasets?.length ? <span className="dots">{selected.datasets.map(dot)}</span> : null}
        <span className="picker-val">{selected?.label ?? (p.loading ?? p.value)}{selected?.sub && <small className={selected.subItalic ? "i" : ""}>{selected.sub}</small>}</span>
        <Icon name="ui-down" />
      </button>
      {open && <div className="picker-pop" role="dialog" aria-label={p.label} style={p.sheet ? undefined : box ?? { visibility: "hidden" }}>
        <div className="picker-head">
          {p.browse && <div className="picker-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "search"} className={tab === "search" ? "on" : ""} onClick={() => setTab("search")}><Icon name="ui-search" /> Search</button>
            <button type="button" role="tab" aria-selected={tab === "browse"} className={tab === "browse" ? "on" : ""} onClick={() => setTab("browse")} data-tour="browse"><Icon name="ui-layers" /> Browse</button>
            {tab === "browse" && <span className="seg" role="group" aria-label="browse by"><button type="button" className={browseBy === "category" ? "on" : ""} onClick={() => setBrowseBy("category")}>by category</button><button type="button" className={browseBy === "dataset" ? "on" : ""} onClick={() => setBrowseBy("dataset")}>by dataset</button></span>}
            {p.sheet && <button type="button" className="cc-icon-button" aria-label="Close" onClick={() => setOpen(false)} style={{ marginLeft: "auto" }}><Icon name="ui-close" size="1.25rem" /></button>}
          </div>}
          {tab === "browse" ? <div className="hint picker-count">{fmtN(p.items.length)} in {fmtN(browseGroups.length)} {browseBy === "category" ? "categories" : "datasets"} · {p.countLabel ?? "observations"}, log scale</div> : <>
          <div className="picker-search">
            <Icon name="ui-search" />
            <input ref={input} type="search" role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open} aria-activedescendant={flat[active] ? `${p.id}-opt-${active}` : undefined}
              value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={p.placeholder ?? "search…"} autoComplete="off" spellCheck={false} />
            {p.sheet && <button type="button" className="cc-icon-button" aria-label="Close" onClick={() => setOpen(false)}><Icon name="ui-close" size="1.25rem" /></button>}
          </div>
          <div className="row picker-tools">
            <span className="seg" role="group" aria-label="sort">
              {sorts.map((s) => <button key={s} type="button" className={sort === s ? "on" : ""} title={`sort: ${SORT_LABEL[s][0]}`} aria-pressed={sort === s} onClick={() => setSort(s)}><Icon name={SORT_LABEL[s][1]} /></button>)}
            </span>
            {p.groups?.length ? <label className="row hint">group<select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="group by">
              <option value="none">none</option>{p.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label> : null}
            <span className="hint picker-count">{fmtN(flat.length)} of {fmtN(p.items.length)} · {p.countLabel ?? "observations"}, log scale</span>
          </div>
          {letters && <div className="letters" aria-label="jump to letter">{letters.map(({ l, on }) => <button key={l} type="button" disabled={!on} onClick={() => jump(l)}>{l}</button>)}</div>}
          </>}
        </div>
        {tab === "browse" ? <ul className="browse" role="tree" aria-label={`${p.label} by ${browseBy}`}>
          {p.loading && !p.items.length && <li className="hint pad">{p.loading}</li>}
          {browseGroups.map((g) => { const on = openGroup === g.key; return (
            <li key={g.key} role="treeitem" aria-expanded={on} className={`browse-group${on ? " open" : ""}`}>
              <div className="browse-row" onClick={() => setOpenGroup(on ? null : g.key)}>
                <Icon name={on ? "ui-down" : "ui-right"} className="chev" />{g.icon && <Icon name={g.icon} className="gicon" />}
                <span className="lab">{g.title}<small>{fmtN(g.items.length)} {fmtN(g.items.length) === "1" ? "item" : "items"}{span(g.y0, g.y1) ? ` · ${span(g.y0, g.y1)}` : ""}</small></span>
                <span className="dots">{g.ds.slice(0, 6).map(dot)}</span>
                <span className="cnt" title={`${fmtN(g.n)} ${p.countLabel ?? "observations"}`}><span className="bar" style={{ width: `${Math.max(1, Math.round(44 * Math.log10(g.n + 1) / Math.log10(Math.max(1, ...browseGroups.map((x) => x.n)) + 1)))}px` }} /><span>{fmtN(g.n)}</span></span>
              </div>
              {on && <ul role="group">{g.items.map((it) => <li key={it.key} role="treeitem" className={`browse-item${it.key === p.value ? " sel" : ""}`} onClick={() => choose(it)}>
                <span className="dots">{(it.datasets ?? []).map(dot)}</span>
                <span className="lab">{it.label}{it.sub && <small className={it.subItalic ? "i" : ""}>{it.sub}</small>}</span>
                <span className="hint span">{span(it.year0, it.year)}</span>
                <span className="cnt"><span className="bar" style={{ width: `${Math.max(1, Math.round(44 * Math.log10(it.n + 1) / Math.log10(maxN + 1)))}px` }} /><span>{fmtN(it.n)}</span></span>
              </li>)}</ul>}
            </li>); })}
        </ul> : <ul ref={list} id={listId} role="listbox" aria-label={p.label}>
          {p.loading && !p.items.length && <li className="hint pad">{p.loading}</li>}
          {!p.loading && !flat.length && <li className="hint pad">no match for “{q}”</li>}
          {sections.map((s, si) => <li key={si} role="presentation" className="picker-section">
            {s.title != null && <div className="picker-group" role="presentation">{s.icon && <Icon name={s.icon} />}<span>{s.title}</span><span className="hint">{fmtN(s.items.length)} · {fmtN(s.n)}</span></div>}
            <ul role="group" aria-label={s.title ?? undefined}>
              {s.items.map((it) => { const i = idx++; const on = it.key === p.value; return (
                <li key={it.key} id={`${p.id}-opt-${i}`} data-i={i} role="option" aria-selected={on} className={`${i === active ? "active" : ""}${on ? " sel" : ""}`}
                  onMouseMove={() => { if (i !== active) setActive(i); }} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(it)}>
                  <span className="dots">{(it.datasets ?? []).map(dot)}</span>
                  <span className="lab">{it.label}{it.sub && <small className={it.subItalic ? "i" : ""}>{it.sub}</small>}</span>
                  <span className="cnt" title={`${fmtN(it.n)} ${p.countLabel ?? "observations"}`}><span className="bar" style={{ width: `${Math.max(1, Math.round(44 * Math.log10(it.n + 1) / Math.log10(maxN + 1)))}px` }} /><span>{fmtN(it.n)}</span></span>
                </li>); })}
            </ul>
          </li>)}
        </ul>}
      </div>}
    </div>
  );
}
