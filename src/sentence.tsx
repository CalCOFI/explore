// the title sentence (the light layout, 2026-09-06): what the map shows, in plain words, with the colour scale
// beside it — "Pacific sardine (pilchard) larvae, the mean per 10 m² of sea surface at each station, all years ·
// all seasons." Its ▾ opens the same pickers the Select panel holds, in sentence form: every part becomes a chip
// whose popover is the panel's own control (the organism tree, the cruise list, the stage and statistic menus),
// so the two surfaces cannot disagree. One control surface at a time: opening the sentence folds the panel.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { IconButton, Menu, useAnchor, type MenuItem } from "./ui";
import { Picker, type PickerItem, type GroupOpt } from "./picker";
import { DEN_LABEL, DEN_HOW, LENSES, LENS_SHORT, LENS_DESC, LENS_ICON, RES_KM, STAT_WORD, STAT_LABEL, YEAR_OPEN, INTERPS, INTERP_LABEL, INTERP_WORD, INTERP_HOW, SURFACES, SURFACE_LABEL, SURFACE_WORD, GRAIN_LABEL, GRAIN_HOW, type Sel, type Den, type Stat, type Lens, type Grain } from "./state";

const fmtN = (v: number) => v.toLocaleString();
export const Q_LABEL = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

export interface SentenceCtx {
  sel: Sel; setSel: (patch: Partial<Sel>) => void; onLens: (l: Lens) => void;
  organismItems: PickerItem[]; organismGroups: GroupOpt[]; variableItems: PickerItem[]; variableGroups: GroupOpt[];
  sectionCruiseItems: PickerItem[]; cruiseItems: PickerItem[]; lines: number[]; layerNames: string[]; regionName: string | null;
  stages: [string | null, number][]; denRows: (d: Den) => number; defaultDen: (stage: string | null) => Den;
  years: [number, number]; yearMax: number; hasDepthAxis: boolean; hasClim: boolean; climWindow: [number, number] | null;
  datasetsInSlice: string[]; dsOn: (dk: string) => boolean; toggleDataset: (dk: string) => void; dsColor: (dk: string) => string; short: (dk: string) => string;
  subject: string; unit: string;
  domain: [string, string]; bar: string; count: number; status: string; ready: boolean; seaFloor: boolean;
  extra?: ReactNode;          // the boundary-layer legend rows, an empty result's note — under the sentence
  native: boolean; phone: boolean; loading: string | null;
  open: boolean; onToggle: () => void;
  band?: React.CSSProperties;  // the free band between the panels (left · right insets), set by the app
}

/** a chip that opens a small list (the statistic, the stage, the lens …): the shared Menu, chip-shaped */
export function ChipMenu(p: { label: ReactNode; items: MenuItem[]; title?: string; icon?: IconName; "data-tour"?: string }) {
  return <Menu className="sc-menu" label={p.label} items={p.items} icon={p.icon} title={p.title} data-tour={p["data-tour"]} />;
}
/** a chip that opens custom content (a year range, the seasons, the depth band, the dataset pills) */
export function ChipPop(p: { label: ReactNode; title?: string; icon?: IconName; width?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useAnchor(open, btn, p.width ?? 280, 360);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span ref={ref} className="sc-pop">
      <button ref={btn} type="button" className={`sc${open ? " open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={p.title}>
        {p.icon && <Icon name={p.icon} />}{p.label}<Icon name="ui-down" className="car" size="0.9em" />
      </button>
      {open && <div className="menu-list sc-pop-body" role="dialog" style={box ?? undefined}>{p.children}</div>}
    </span>);
}

type Part = string | { key: string; text: ReactNode; control?: () => ReactNode; bold?: boolean };

export function Sentence(c: SentenceCtx) {
  const { sel, setSel } = c;
  const yearsSet = sel.years[0] !== 1949 || sel.years[1] !== YEAR_OPEN || !!sel.months;
  const pad = (m: number) => String(m).padStart(2, "0");
  const yearsWord = yearsSet ? (sel.months ? `${c.years[0]}-${pad(sel.months[0])} to ${c.years[1]}-${pad(sel.months[1])}` : `${c.years[0]}–${c.years[1]}`) : "all years";
  const seasonWord = sel.q?.length && sel.q.length < 4 ? sel.q.map((x) => Q_LABEL[x - 1]).join(", ") : "all seasons";
  const depthWord = `${sel.depth[0]}–${sel.depth[1]} m`;
  const nDs = c.datasetsInSlice.length, nOn = c.datasetsInSlice.filter(c.dsOn).length;
  const climWord = c.climWindow ? `${c.climWindow[0]}–${c.climWindow[1]}` : "1993–2013";
  const cruiseLabel = (items: PickerItem[]) => items.find((i) => i.key === sel.cruise)?.label ?? sel.cruise ?? "…";
  const toggleQ = (x: number) => { const cur = sel.q ?? [1, 2, 3, 4]; const next = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x].sort(); setSel({ q: next.length === 0 || next.length === 4 ? null : next }); };

  // ── the controls each chip opens: the panel's own pickers, chip-shaped ─────────────────────────
  const realmMenu = () => <ChipMenu label={sel.realm === "bio" ? "Biology" : "Environment"} icon={sel.realm === "bio" ? "realm-bio" : "realm-env"} title="one organism, or one ocean variable, at a time" items={[
    { label: "Biology", icon: "realm-bio", hint: "one organism from the net tows and censuses", selected: sel.realm === "bio", onSelect: () => setSel({ realm: "bio", datasets: null }) },
    { label: "Environment", icon: "realm-env", hint: "one variable from the bottle, CTD, carbonate and weather series", selected: sel.realm === "env", onSelect: () => setSel({ realm: "env", cruise: null, datasets: null }) }]} />;
  const subjectPicker = () => sel.realm === "bio"
    ? <Picker variant="chip" id="ts-organism" label="organism" value={sel.taxon} items={c.organismItems} onChange={(k) => setSel({ taxon: k, stage: null, den: null, cruise: null })} groups={c.organismGroups} letters browse placeholder="search species, genus, family…" dsColor={c.dsColor} dsShort={c.short} loading={c.organismItems.length ? null : c.loading} native={c.native} sheet={c.phone} />
    : <Picker variant="chip" id="ts-variable" label="variable" value={sel.var} items={c.variableItems} onChange={(k) => setSel({ var: k, cruise: null })} groups={c.variableGroups} defaultGroup="category" browse placeholder="search temperature, nitrate, chlorophyll…" dsColor={c.dsColor} dsShort={c.short} loading={c.variableItems.length ? null : "…"} native={c.native} sheet={c.phone} />;
  const stageMenu = () => <ChipMenu label={sel.stage ?? "all life stages"} title="life stage" items={c.stages.map(([s, n]) => ({ label: s ?? "(none)", hint: `${fmtN(n)} observations`, selected: s === sel.stage, onSelect: () => setSel({ stage: s, den: c.defaultDen(s) }) }))} />;
  const statMenu = () => <ChipMenu label={STAT_WORD[sel.stat]} title="the summary statistic" items={(["mean", "med", "n"] as Stat[]).map((k) => ({ label: STAT_LABEL[k], selected: k === sel.stat, onSelect: () => setSel({ stat: k }) }))} />;
  const denMenu = () => <ChipMenu label={sel.den ? DEN_LABEL[sel.den] : "…"} title="how counts are standardized" items={(["per_10m2", "per_1000m3", "raw"] as Den[]).map((d) => ({ label: DEN_LABEL[d], hint: DEN_HOW[d], disabled: c.denRows(d) === 0, selected: d === sel.den, onSelect: () => setSel({ den: d }) }))} />;
  const lensMenu = (label: string) => <ChipMenu label={label} icon={LENS_ICON[sel.lens]} title="how the observations are gathered on the map" items={LENSES.map((l) => ({ label: LENS_SHORT[l], icon: LENS_ICON[l], hint: LENS_DESC[l], selected: l === sel.lens, onSelect: () => c.onLens(l) }))} />;
  const resMenu = () => <ChipMenu label={RES_KM[sel.res]} title="hexagon size" items={[3, 4, 5, 6, 7].map((r) => ({ label: RES_KM[r], hint: `H3 resolution ${r}`, selected: r === sel.res, onSelect: () => setSel({ res: r }) }))} />;
  const interpMenu = () => <ChipMenu label={INTERP_WORD[sel.interp]} title="the interpolator" items={INTERPS.map((m) => ({ label: INTERP_LABEL[m], hint: INTERP_HOW[m], selected: m === sel.interp, onSelect: () => setSel({ interp: m }) }))} />;
  const surfaceMenu = () => <ChipMenu label={SURFACE_WORD[sel.surface] || "the statistic itself"} title="which surface is drawn" items={SURFACES.map((s) => ({ label: SURFACE_LABEL[s], disabled: s === "se" && sel.interp === "idw", selected: s === sel.surface, onSelect: () => setSel({ surface: s }) }))} />;
  const grainMenu = () => <ChipMenu label={sel.interp === "tps" ? "the station grid" : sel.grain === "site" ? "every site" : "the station grid"} title="the points the surface is fitted to" items={(["site", "station"] as Grain[]).map((g) => ({ label: GRAIN_LABEL[g], hint: GRAIN_HOW[g], disabled: g === "site" && sel.interp === "tps", selected: g === (sel.interp === "tps" ? "station" : sel.grain), onSelect: () => setSel({ grain: g }) }))} />;
  const layerMenu = () => <ChipMenu label={sel.layer} title="the boundary layer" items={c.layerNames.map((n) => ({ label: n, selected: n === sel.layer, onSelect: () => setSel({ layer: n, region: null }) }))} />;
  const regionMenu = () => <ChipMenu label={c.regionName ?? ""} title="the selected region — click a polygon on the map to pick another" items={[{ label: "every region", hint: "clear the selection", onSelect: () => setSel({ region: null }) }]} />;
  const lineMenu = () => <ChipMenu label={String(sel.line)} title="the CalCOFI line" items={c.lines.map((l) => ({ label: `line ${l}`, selected: l === sel.line, onSelect: () => setSel({ line: l, cruise: null }) }))} />;
  const cruiseChip = (items: PickerItem[], id: string) => <Picker variant="chip" id={id} label="cruise" hint="newest first" value={sel.cruise ?? ""} items={items} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "n"]} countLabel={id === "ts-section-cruise" ? "stations" : undefined} placeholder="search YYYY-MM-NODC…" loading={items.length ? null : "…"} native={c.native} sheet={c.phone} />;
  const anomMenu = () => <ChipMenu label={sel.anom ? `shown as the difference from the ${climWord} normal` : "shown as measured"} title="a departure from the release's climatology: this station, the cast's calendar month, this 10 m bin, at least 3 cruises" items={[
    { label: "as measured", selected: !sel.anom, onSelect: () => setSel({ anom: false }) },
    { label: `the difference from the ${climWord} normal`, hint: "red above normal, blue below; a cell with no baseline is blank", selected: sel.anom, onSelect: () => setSel({ anom: true }) }]} />;
  const yearsPop = () => <ChipPop label={yearsWord} icon="ui-years" title="the year range · or drag on the Years panel">
    <div className="row"><input type="number" style={{ width: 62 }} value={c.years[0]} min={1949} max={c.yearMax} onChange={(e) => setSel({ years: [+e.target.value, c.years[1]] })} />–<input type="number" style={{ width: 62 }} value={c.years[1]} min={1949} max={c.yearMax} onChange={(e) => setSel({ years: [c.years[0], +e.target.value] })} /></div>
    <div className="row"><button type="button" className="pill act" onClick={() => setSel({ years: [1949, YEAR_OPEN], months: null })}>all years</button><span className="hint">or drag on the Years panel{sel.months ? " · month edges from the brush" : ""}</span></div>
  </ChipPop>;
  const seasonPop = () => <ChipPop label={seasonWord} icon="ui-calendar" title="season: keep only these quarters" width={240}>
    <span className="seg">{[1, 2, 3, 4].map((x) => <button key={x} type="button" className={!sel.q || sel.q.includes(x) ? "on" : ""} onClick={() => toggleQ(x)} title={Q_LABEL[x - 1]}>Q{x}</button>)}</span>
    <div className="hint">{sel.q ? sel.q.map((x) => Q_LABEL[x - 1]).join(", ") : "every quarter"}</div>
  </ChipPop>;
  const depthPop = () => <ChipPop label={depthWord} icon="ui-tune" title="the depth band · or drag on the Depth panel">
    <div className="row"><input type="number" style={{ width: 62 }} value={sel.depth[0]} min={0} max={sel.depth[1] - 10} step={10} onChange={(e) => setSel({ depth: [+e.target.value, sel.depth[1]] })} />–<input type="number" style={{ width: 62 }} value={sel.depth[1]} min={sel.depth[0] + 10} max={6500} step={10} onChange={(e) => setSel({ depth: [sel.depth[0], +e.target.value] })} /> m</div>
    <div className="row"><button type="button" className="pill act" onClick={() => setSel({ depth: [0, 500] })}>0–500 m</button><span className="hint">or drag on the Depth panel</span></div>
  </ChipPop>;
  const datasetsPop = () => <ChipPop label={nOn === nDs ? `${nDs} datasets` : `${nOn} of ${nDs} datasets`} icon="ui-data" title="the datasets this view pools — click one to leave it out" width={300}>
    <div className="pills">{c.datasetsInSlice.map((dk) => <button key={dk} type="button" className={`pill act${c.dsOn(dk) ? "" : " off"}`} onClick={() => c.toggleDataset(dk)}><i className="dot" style={{ background: c.dsColor(dk) }} />{c.short(dk)}</button>)}</div>
    {sel.datasets && <button type="button" className="linkish" onClick={() => setSel({ datasets: null })}>all datasets</button>}
  </ChipPop>;

  // ── the sentence, one grammar for both renderings ─────────────────────────────────────────────
  const parts: Part[] = [];
  const w = (s: string) => parts.push(s);
  const chip = (key: string, text: ReactNode, control?: () => ReactNode, bold = false) => parts.push({ key, text, control, bold });
  if (c.open) chip("realm", sel.realm === "bio" ? "Biology" : "Environment", realmMenu);
  chip("subject", c.subject, subjectPicker, true);
  if (sel.realm === "bio") { w(" "); chip("stage", sel.stage ?? "all life stages", stageMenu); }
  w(", the "); chip("stat", STAT_WORD[sel.stat], statMenu);
  if (sel.realm === "bio") { w(" "); chip("den", sel.den ? DEN_LABEL[sel.den] : "…", denMenu); }
  w(" ");
  if (sel.lens === "station") chip("lens", "at each station", () => lensMenu("at each station"));
  else if (sel.lens === "hex") { chip("lens", "in hexagons", () => lensMenu("in hexagons")); w(" of "); chip("res", RES_KM[sel.res], resMenu); }
  else if (sel.lens === "contour") { chip("lens", "as a contoured surface", () => lensMenu("as a contoured surface")); w(" by "); chip("interp", INTERP_WORD[sel.interp], interpMenu); w(" over "); chip("grain", sel.interp === "tps" ? "the station grid" : sel.grain === "site" ? "every site" : "the station grid", grainMenu); if (sel.surface !== "value" || c.open) { w(", showing "); chip("surface", SURFACE_WORD[sel.surface] || "the statistic itself", surfaceMenu); } }
  else if (sel.lens === "cruise") { chip("lens", "along a cruise track", () => lensMenu("along a cruise track")); w(": "); chip("cruise", cruiseLabel(c.cruiseItems), () => cruiseChip(c.cruiseItems, "ts-cruise")); }
  else if (sel.lens === "region") { chip("lens", "within regions", () => lensMenu("within regions")); w(": "); chip("layer", sel.layer, layerMenu); if (c.regionName) { w(" · "); chip("region", c.regionName, regionMenu); } }
  else {
    chip("lens", "as a section along line", () => lensMenu("as a section along line")); w(" "); chip("line", String(sel.line), lineMenu);
    if (sel.realm === "env") { w(" on cruise "); chip("cruise", cruiseLabel(c.sectionCruiseItems), () => cruiseChip(c.sectionCruiseItems, "ts-section-cruise")); if (c.hasClim) { w(", "); chip("anom", sel.anom ? `shown as the difference from the ${climWord} normal` : "shown as measured", anomMenu); } }
    else w(" across all cruises");
  }
  w(", "); chip("years", yearsWord, yearsPop); w(" · "); chip("season", seasonWord, seasonPop);
  if (c.hasDepthAxis) { w(" · "); chip("depth", depthWord, depthPop); }
  if (sel.datasets || c.open) { w(" · "); chip("datasets", nOn === nDs ? `all ${nDs} datasets` : `${nOn} of ${nDs} datasets`, datasetsPop); }
  w(".");

  // the legend reads the scale and the count; the STATUS is not here any more — it has its own toast over the map (App.tsx), where
  // a newcomer waiting on "engine warming…" will see it. The title stands above the legend, never beside it: a mouthful of a
  // sentence squeezed into a column beside an unwrapping legend was the 2026-09-07 bug.
  const legend = <span className="ts-legend" data-tour="legend">
    <span>{c.domain[0]}</span><span className="bar" style={{ background: c.bar }} /><span>{c.domain[1]} {c.unit}</span>
    <span className="hint">· 5–95 %{c.ready ? ` · ${fmtN(c.count)} observations` : ""}</span>
  </span>;
  return (
    <div className={`sentence${c.open ? " open" : ""}`} data-tour="sentence" style={c.band}>
      <div className="ts" role="group" aria-label="what the map shows">
        {c.open ? <>
          <div className="ts-sent">{parts.map((p, i) => typeof p === "string" ? <span key={i} className="w">{p}</span> : <span key={p.key} className="ts-chip">{p.control ? p.control() : <span className="sc static">{p.text}</span>}</span>)}</div>
          <div className="ts-foot">{legend}<span className="sp" /><span className="hint">the same pickers as the Controls panel — change a part, the map follows</span><IconButton icon="ui-up" label="Done — back to the title" className="ts-toggle" onClick={c.onToggle} data-tour="sentence-toggle" /></div>
        </> : <>
          <div className="ts-row">
            <span className="ts-text">{parts.map((p, i) => typeof p === "string" ? p : p.bold ? <b key={p.key}>{p.text}</b> : <span key={p.key}>{p.text}</span>)}</span>
            <IconButton icon="ui-down" label="Change what the map shows" className="ts-toggle" onClick={c.onToggle} data-tour="sentence-toggle" />
          </div>
          <div className="ts-legend-row">{legend}</div>
        </>}
        {c.extra && <div className="ts-extra">{c.extra}</div>}
      </div>
    </div>);
}
