// the Query Builder page (builder.html; "Table builder" until 2026-11-15): pick any species and water measurements, choose Stations / Hexagons / Regions,
// filter and shape the rows, preview, download one CSV. Design: Betty's mockups (Claude outputs/calcofi-table-builder.html,
// 2026-11-13). The SQL is src/builder/query.ts; the lists come from the release's coverage sidecar (src/builder/data.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { engine, type Row } from "../engine";
import { csv, saveBlob } from "../export";
import { areaSql, type Area } from "../area";
import { Icon, type IconName } from "../icons";
import { CATEGORY_ICON } from "../categories";
import { LOGO } from "../brand";
import { boot, datasetInfo, ensure, envReg, envSrc, probe, regions, REG, urlOf, type Boot, type ListItem } from "./data";
import { parsePicks, unknownNotice, withoutDownload } from "./picks";
import { builderSql, pickColumns, sentence, STAT_WORD, type Den, type DepthBy, type Item, type Lens, type Place, type Spec, type Stat, type TimeBy } from "./query";

type Preset = "sample" | "year" | "season" | "month" | "custom";
const LENS: { id: Lens; label: string; icon: IconName; desc: string }[] = [
  { id: "station", label: "Stations", icon: "lens-stations", desc: "Samples taken along CalCOFI’s line and station grid, current and historical." },
  { id: "hex", label: "Hexagons", icon: "lens-hexagons", desc: "Every sample, on or off CalCOFI’s line and station grid, grouped into hexagons. Pick the size." },
  { id: "region", label: "Regions", icon: "lens-regions", desc: "Every sample, on or off CalCOFI’s line and station grid, within a named area, like a sanctuary, wind energy area or maritime zones." },
];
const HEX_SIZES: { res: number; label: string }[] = [{ res: 3, label: "~120 km" }, { res: 4, label: "~45 km" }, { res: 5, label: "~17 km" }, { res: 6, label: "~6 km" }, { res: 7, label: "~2.5 km" }];
const PLACE_OPTS: Record<Lens, { id: Place; label: string }[]> = {
  station: [{ id: "station", label: "Per station" }, { id: "line", label: "Per CalCOFI line" }, { id: "all", label: "All stations together" }],
  hex: [{ id: "hex", label: "Per hexagon" }, { id: "all", label: "All hexagons together" }],
  region: [{ id: "region", label: "Per region" }, { id: "all", label: "All regions together" }],
};
const DEN_LABEL: Record<Den, string> = { density_per_10m2: "Per 10 m² sea surface", density_per_1000m3: "Per 1000 m³ water", value: "As counted" };
const STAGES = ["larva", "egg", "juvenile", "adult"];
// the brand's toggle pair, as the Explorer header draws it (App.tsx)
const ICON_SUN = "M12 8a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4m0 10a6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z";
const ICON_MOON = "M12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6a6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z";
const today = () => new Date().toISOString().slice(0, 10);

export function Builder() {
  const params = new URLSearchParams(location.search);
  const [b, setB] = useState<Boot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 1 · columns
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<{ bio: string; env: string }>({ bio: "", env: "" });
  // Betty 2026-11-13 (option A): grouped by category, each row naming its dataset; "Group by: Dataset" switches to one group per dataset
  const [groupBy, setGroupBy] = useState<"category" | "dataset">("category");
  // 2 · rows
  const [lens, setLens] = useState<Lens>("station");
  const [stations, setStations] = useState<"std" | "std,ext" | "all">("std");
  const [regionLayer, setRegionLayer] = useState<string>("");   // Region filter (Stations / Hexagons): "" = anywhere
  const [layer, setLayer] = useState<string>("");               // Regions: the layer
  const [regionNames, setRegionNames] = useState<string[] | null>(null);
  const [regionList, setRegionList] = useState<Map<string, string[]> | null>(null);
  const [hexRes, setHexRes] = useState(5);
  const [years, setYears] = useState<[number, number]>([1949, 2026]);
  const [season, setSeason] = useState<number | 0>(0);
  const [depth, setDepth] = useState<[number, number]>([0, 500]);
  const [preset, setPreset] = useState<Preset>("year");
  const [place, setPlace] = useState<Place>("station");
  const [time, setTime] = useState<TimeBy>("year");
  const [depthBy, setDepthBy] = useState<DepthBy>("avg");
  const [stat, setStat] = useState<Stat>("avg");
  // more options
  const [stages, setStages] = useState<string[]>(["larva"]);
  const [den, setDen] = useState<Den>("density_per_10m2");
  const [zeros, setZeros] = useState(true);
  const [qualOnly, setQualOnly] = useState(true);
  // 3 · preview
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; rows: Row[]; sql: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [ds, setDs] = useState<Map<string, { name: string; category: string | null }>>(new Map());
  // a link can pick for the reader (?pick=…) and start the CSV (&download=1): src/builder/picks.ts
  const [notice, setNotice] = useState<string | null>(null);
  const [dsReady, setDsReady] = useState(false);   // the datasets' short names name the columns, so an automatic download waits for them
  const autoDl = useRef(false);

  useEffect(() => {
    boot(params.get("release")).then((x) => {
      setB(x); setYears([Math.max(x.years[0], 1949), x.years[1]]);
      const ids = new Set(x.groups.flatMap((g) => g.items.map((it) => it.id)));
      const link = parsePicks(location.search, (id) => ids.has(id));
      if (link.picked.length) setPicked(new Set(link.picked));
      setNotice(unknownNotice(link.unknown));
      autoDl.current = link.download;
      datasetInfo(x.catalog).then(setDs).catch((e) => console.warn("dataset names:", e.message)) // names arrive after the list; keys until then
        .finally(() => setDsReady(true));
    })
      .catch((e) => { console.error(e); setErr("Could not load the CalCOFI release. Reload the page to try again."); });
  }, []);
  const needRegions = lens === "region" || !!regionLayer;
  useEffect(() => {
    if (!b || regionList || !(needRegions)) return;
    regions(b.catalog).then((m) => { setRegionList(m); if (!layer) setLayer([...m.keys()].find((k) => /sanctuar/i.test(k)) ?? [...m.keys()][0] ?? ""); })
      .catch((e) => console.error("regions:", e));
  }, [b, needRegions]);

  const items = useMemo(() => new Map((b?.groups ?? []).flatMap((g) => g.items).map((it) => [it.id, it])), [b]);
  const dsName = (k: string) => ds.get(k)?.name ?? k;
  const catOf = (it: ListItem) => ds.get(it.dataset)?.category ?? it.category;
  type View = { key: string; name: string; sub: string | null; icon: string; items: ListItem[] };
  const views = (realm: "bio" | "env"): View[] => {
    const gs = (b?.groups ?? []).filter((g) => g.realm === realm);
    if (groupBy === "dataset") return gs.map((g) => ({ key: g.dataset, name: dsName(g.dataset), sub: ds.get(g.dataset)?.category ?? g.category, icon: ds.get(g.dataset)?.category ?? g.category, items: g.items }));
    // by category: the same species or measurement from several datasets sits together, each row saying which dataset
    const m = new Map<string, ListItem[]>();
    for (const g of gs) for (const it of g.items) { const c = catOf(it); (m.get(c) ?? m.set(c, []).get(c)!).push(it); }
    const order = [...new Set(gs.map((g) => ds.get(g.dataset)?.category ?? g.category))];
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([c, its]) => {
        const tot = new Map<string, number>(); its.forEach((it) => tot.set(it.label, (tot.get(it.label) ?? 0) + it.n));
        return { key: c, name: c, sub: null, icon: c, items: [...its].sort((a, b) => (tot.get(b.label)! - tot.get(a.label)!) || a.label.localeCompare(b.label) || dsName(a.dataset).localeCompare(dsName(b.dataset))) };
      });
  };
  const picks: ListItem[] = [...picked].map((k) => items.get(k)!).filter(Boolean);
  const nBio = picks.filter((p) => p.realm === "bio").length, nEnv = picks.length - nBio;

  // the preset sets the grouping; Custom hands it over
  const effPlace: Place = preset === "custom" ? place : PLACE_OPTS[lens][0].id;
  const effTime: TimeBy = preset === "custom" ? time : preset;
  const effDepth: DepthBy = preset === "custom" ? depthBy : preset === "sample" ? "10" : "avg";
  const effStat: Stat = preset === "custom" ? stat : "avg";
  const raw = effPlace === "station" && effTime === "sample" && effDepth === "10";

  const area: Area | null = lens === "station" && stations !== "all" ? { kind: "pattern", patterns: stations === "std" ? ["standard"] : ["standard", "extended"] } : null;
  const areaPred = b ? (areaSql(area, { gridKeys: b.gridKeys, spatialSrc: `'${REG.sample_spatial}'`, allKeys: b.allKeys }) ?? "TRUE") : "TRUE";
  const regionPred = lens !== "region" && regionLayer ? `root_id IN (SELECT root_id FROM '${REG.sample_spatial}' WHERE layer = '${regionLayer.replace(/'/g, "''")}')` : "TRUE";
  const spec: Spec = {
    picks: picks.map((p): Item => p.realm === "bio" ? { realm: "bio", taxon: p.key, label: p.label, dataset: p.dataset, tag: dsName(p.dataset) }
      : { realm: "env", key: p.key, label: p.label, members: p.members, units: p.units, dataset: p.dataset, tag: dsName(p.dataset) }),
    lens, place: effPlace, hexRes, layer: lens === "region" ? layer : null, regionNames: lens === "region" ? regionNames : null,
    area: [areaPred, regionPred].filter((x) => x !== "TRUE").join(" AND ") || "TRUE",
    years, seasons: season ? [season] : null, depth, time: effTime, depthBy: effDepth, stat: effStat,
    stages: nBio ? stages : null, den, zeros, qualOnly, datasets: null,
  };
  const specKey = JSON.stringify(spec);
  const stale = result && result.key !== specKey;

  async function build(): Promise<{ rows: Row[]; sql: string[] } | null> {
    if (!b || !picks.length) return null;
    if (result && !stale) return result;
    try {
      setBusy("Loading data…");
      const needBio = nBio > 0;
      const files = [...(needBio ? [REG.obs_bio] : []), ...picks.filter((p) => p.realm === "env").flatMap((p) => p.members.map(envReg)),
        ...(lens === "region" || regionLayer ? [REG.sample_spatial] : [])];
      await Promise.all(files.map((f) => ensure(b.catalog, f)));
      const pr = await probe(b.catalog, needBio);
      setBusy("Building your table…");
      const sql = builderSql(spec, { bioSrc: `'${REG.obs_bio}'`, envSrc, spatialSrc: `'${REG.sample_spatial}'`, cruiseSrc: pr.cruiseSrc, netKey: pr.netKey });
      for (const s of sql.slice(0, -1)) await engine.exec(s, "builder");
      const rows = await engine.exec(sql[sql.length - 1], "builder:table");
      const r = { key: specKey, rows, sql };
      setResult(r); setBusy(null);
      return r;
    } catch (e: any) {
      console.error(e); setBusy(null); setErr("Something went wrong building this table. Try fewer columns, or reload the page."); return null;
    }
  }
  async function download() {
    const r = await build(); if (!r || !b) return;
    saveBlob(new Blob([csv(r.rows)], { type: "text/csv" }), `calcofi_table_${b.version}_${today()}.csv`);
  }
  async function copySql() {
    const r = await build(); if (!r || !b) return;
    // the registered names become the release's own object URLs, so the SQL runs in any DuckDB
    const txt = r.sql.join(";\n\n").replace(/'((?:obs_env_[^']+|obs_bio|sample_spatial|cruise)\.parquet)'/g, (m, n) => { const u = urlOf(b.catalog, n); return u ? `'${u}'` : m; }) + ";\n";
    await navigator.clipboard.writeText(`-- CalCOFI Query Builder · release ${b.version} · ${today()}\n${txt}`);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  // ?pick=…&download=1: once the lists, the picks and the datasets' names are in, start the CSV — once. The address then
  // drops download=1, so a reload or a copied link opens the same picks without downloading again.
  useEffect(() => {
    if (!b || !dsReady || !autoDl.current || !picks.length) return;
    autoDl.current = false;
    history.replaceState(null, "", location.pathname + withoutDownload(location.search) + location.hash);
    download();
  }, [b, dsReady, picked]);

  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const setMany = (ks: string[], on: boolean) => setPicked((s) => { const n = new Set(s); ks.forEach((k) => on ? n.add(k) : n.delete(k)); return n; });
  const cols = spec.picks.flatMap((p) => pickColumns(p, spec).map((c) => c.col));
  const stageChoices = useMemo(() => { const s = new Set<string>(); picks.forEach((p) => p.stages.forEach((x) => s.add(x))); const l = [...s]; return l.length ? l : STAGES; }, [picked, items]);

  if (err && !b) return <div className="tb-err">{err}</div>;
  return (
    <div className="tb">
      <header className="tb-hd"><div className="in">
        <a href="https://calcofi.io"><img className="logo-l" src={LOGO.light} alt="CalCOFI.io" /><img className="logo-d" src={LOGO.dark} alt="CalCOFI.io" /></a>
        <span className="crumb">Pull exact data › <b>Query Builder</b></span>
        <nav><a href="https://calcofi.io/#find">Data</a><a href="./">Explorer</a><a href="https://calcofi.io/docs/">Docs</a></nav>
        <button className="cc-theme-toggle" type="button" aria-label="Toggle dark / light theme">
          <svg className="cc-theme-icon cc-icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_SUN} /></svg>
          <svg className="cc-theme-icon cc-icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_MOON} /></svg>
        </button>
      </div></header>

      <main>
        <div className="tb-title"><h1>Query Builder</h1><p>Build your own table: any species and measurements, in one CSV.</p>{b && <span className="rel">Release {b.version}</span>}</div>
        {notice && <div className="tb-note" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss this notice" onClick={() => setNotice(null)}>×</button></div>}
        <div className="tb-top">
          {/* 1 · COLUMNS */}
          <section className="card cols">
            <div className="chead"><span className="num">1</span><b>Choose what to include</b>
              <label className="gb">Group by <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}><option value="category">Category</option><option value="dataset">Dataset</option></select></label>
              <span className="r">{picks.length} selected{picks.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); setPicked(new Set()); }}>Clear</a>}</span></div>
            <div className="lists">
              {(["bio", "env"] as const).map((realm) => {
                const gs = views(realm);
                const qy = search[realm].trim().toLowerCase();
                const all = gs.flatMap((g) => g.items.map((it) => it.id));
                const on = all.filter((k) => picked.has(k)).length;
                return (
                  <div className="list" key={realm}>
                    <div className="lh"><span className="t">{realm === "bio" ? "Species" : "Water & weather"}</span>
                      <label><input type="checkbox" checked={!!all.length && on === all.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < all.length; }} onChange={(e) => setMany(all, e.target.checked)} />Select all</label></div>
                    <div className="search"><Icon name="ui-search" /><input placeholder={realm === "bio" ? "Search species" : "Search measurements"} value={search[realm]} onChange={(e) => setSearch({ ...search, [realm]: e.target.value })} /></div>
                    <div className="scroll">
                      {!b && <div className="muted pad">Loading the list…</div>}
                      {gs.map((g) => {
                        const its = g.items.filter((it) => !qy || `${it.label} ${it.sub ?? ""} ${dsName(it.dataset)} ${g.name}`.toLowerCase().includes(qy));
                        if (!its.length) return null;
                        const ks = its.map((it) => it.id), n = ks.filter((k) => picked.has(k)).length;
                        const isOpen = open.has(`${realm}:${groupBy}:${g.key}`) || !!qy;
                        return (
                          <div className={`grp${isOpen ? " open" : ""}`} key={g.key}>
                            <div className="gh">
                              <input type="checkbox" aria-label={`Select all of ${g.name}`} checked={n === ks.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < ks.length; }} onChange={(e) => setMany(ks, e.target.checked)} />
                              <button type="button" className="gt" onClick={() => setOpen((s) => { const x = new Set(s), k = `${realm}:${groupBy}:${g.key}`; x.has(k) ? x.delete(k) : x.add(k); return x; })}>
                                <Icon name={CATEGORY_ICON[g.icon] ?? "cat-other"} /><span className="gname">{g.name}{g.sub && <small>{g.sub}</small>}</span><span className="n">{n ? `${n} selected` : its.length}</span><Icon name="ui-down" className="chev" />
                              </button>
                            </div>
                            {isOpen && <div className="its">{its.slice(0, qy ? 200 : 400).map((it) => (
                              <label className="it" key={it.id}><input type="checkbox" checked={picked.has(it.id)} onChange={() => toggle(it.id)} />
                                {it.label}{it.sub && <i>{it.sub}</i>}{it.units && <i>{it.units}</i>}{groupBy === "category" && <em title={it.dataset}>{dsName(it.dataset)}</em>}</label>))}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2 · ROWS */}
          <section className="card filters">
            <div className="chead"><span className="num">2</span><b>Filter and shape the rows</b></div>
            <div className="fbody">
              <div className="lens">{LENS.map((l) => (
                <label key={l.id} className={lens === l.id ? "on" : ""}><input type="radio" name="lens" checked={lens === l.id} onChange={() => { setLens(l.id); setPlace(PLACE_OPTS[l.id][0].id); }} /><Icon name={l.icon} /><b>{l.label}</b></label>))}</div>
              <div className="lensdesc">{LENS.find((l) => l.id === lens)!.desc}</div>

              {lens === "station" && <div className="row"><span>Stations</span><div className="ctl">
                <select value={stations} onChange={(e) => setStations(e.target.value as any)}><option value="std">Standard grid (lines 76.7–93.3)</option><option value="std,ext">Standard + extended lines</option><option value="all">Every station, current and historical</option></select></div></div>}
              {lens === "hex" && <div className="row"><span>Size</span><div className="ctl">
                <select value={hexRes} onChange={(e) => setHexRes(Number(e.target.value))}>{HEX_SIZES.map((h) => <option key={h.res} value={h.res}>{h.label} across</option>)}</select><span className="sub">Bigger = fewer rows</span></div></div>}
              {lens !== "region" && <div className="row"><span>Region</span><div className="ctl">
                <select value={regionLayer} onFocus={() => { if (!regionList && b) regions(b.catalog).then(setRegionList).catch(console.error); }} onChange={(e) => setRegionLayer(e.target.value)}><option value="">Anywhere</option>
                  {regionLayer && !regionList && <option value={regionLayer}>{regionLayer}</option>}
                  {[...(regionList?.keys() ?? [])].sort().map((l) => <option key={l} value={l}>Inside any of: {l}</option>)}</select>
</div></div>}
              {lens === "region" && <div className="row"><span>Layer</span><div className="ctl">
                <select value={layer} onChange={(e) => { setLayer(e.target.value); setRegionNames(null); }}>{!regionList && <option>Loading regions…</option>}
                  {[...(regionList?.keys() ?? [])].sort().map((l) => <option key={l}>{l}</option>)}</select>
                <select value={regionNames?.[0] ?? ""} onChange={(e) => setRegionNames(e.target.value ? [e.target.value] : null)}><option value="">All regions in it</option>
                  {(regionList?.get(layer) ?? []).map((n) => <option key={n}>{n}</option>)}</select></div></div>}

              <div className="row"><span>When</span><div className="ctl">
                <input className="num-in" type="number" value={years[0]} onChange={(e) => setYears([Number(e.target.value), years[1]])} /><span className="sub">to</span>
                <input className="num-in" type="number" value={years[1]} onChange={(e) => setYears([years[0], Number(e.target.value)])} />
                <select value={season} onChange={(e) => setSeason(Number(e.target.value))}><option value={0}>All seasons</option><option value={1}>Winter</option><option value={2}>Spring</option><option value={3}>Summer</option><option value={4}>Fall</option></select></div></div>
              <div className="row"><span>Depth</span><div className="ctl">
                <input className="num-in" type="number" value={depth[0]} onChange={(e) => setDepth([Number(e.target.value), depth[1]])} /><span className="sub">to</span>
                <input className="num-in" type="number" value={depth[1]} onChange={(e) => setDepth([depth[0], Number(e.target.value)])} /><span className="sub">m</span></div></div>
              <div className="row"><span>Rows</span><div className="ctl">
                <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}><option value="sample">Every sample, as measured</option><option value="year">Yearly averages</option><option value="season">Seasonal averages</option><option value="month">Monthly averages</option><option value="custom">Custom…</option></select></div></div>
              {preset === "custom" && <>
                <div className="row"><span>Group by</span><div className="ctl rowsel">
                  <select value={place} onChange={(e) => setPlace(e.target.value as Place)}>{PLACE_OPTS[lens].map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                  <select value={time} onChange={(e) => setTime(e.target.value as TimeBy)}><option value="sample">Per sample date</option><option value="month">Per month</option><option value="season">Per season</option><option value="year">Per year</option><option value="decade">Per decade</option><option value="all">All years together</option></select>
                  <select value={depthBy} onChange={(e) => setDepthBy(e.target.value as DepthBy)}><option value="avg">Depths together</option><option value="10">Per 10 m</option></select></div></div>
                <div className={`statline${raw ? " dis" : ""}`}>If a row covers several samples, show their
                  <select value={stat} onChange={(e) => setStat(e.target.value as Stat)}>{(Object.keys(STAT_WORD) as Stat[]).map((s) => <option key={s} value={s}>{STAT_WORD[s][0].toUpperCase() + STAT_WORD[s].slice(1)}</option>)}</select></div>
              </>}
              <div className="explain">{sentence({ lens, place: effPlace, time: effTime, depthBy: effDepth, stat: effStat }, raw)}</div>
              <details className="adv">
                <summary><span>More options</span><span className="sub">{nBio ? `${stages.join(", ") || "all stages"} · ${DEN_LABEL[den].toLowerCase()} · ${zeros ? "no catch = 0" : "catches only"} · ` : ""}{qualOnly ? "quality-checked" : "all values"}</span><Icon name="ui-down" className="chev" /></summary>
                <div className={`row${nBio ? "" : " dis"}`}><span>Life stage</span><div className="ctl">{stageChoices.map((s) => (
                  <label key={s}><input type="checkbox" checked={stages.includes(s)} onChange={(e) => setStages(e.target.checked ? [...stages, s] : stages.filter((x) => x !== s))} />{s[0].toUpperCase() + s.slice(1)}</label>))}</div></div>
                <div className={`row${nBio ? "" : " dis"}`}><span>Species units</span><div className="ctl"><select value={den} onChange={(e) => setDen(e.target.value as Den)}>{(Object.keys(DEN_LABEL) as Den[]).map((d) => <option key={d} value={d}>{DEN_LABEL[d]}</option>)}</select></div></div>
                <div className={`row${nBio ? "" : " dis"}`}><span>No catch</span><div className="ctl"><label><input type="checkbox" checked={zeros} onChange={(e) => setZeros(e.target.checked)} />Show as 0 when a net was sampled and nothing was found</label></div></div>
                <div className="row"><span>Quality</span><div className="ctl"><label><input type="checkbox" checked={qualOnly} onChange={(e) => setQualOnly(e.target.checked)} />Quality-checked values only</label></div></div>
              </details>
            </div>
          </section>
        </div>

        {/* 3 · PREVIEW */}
        <section className="card prev">
          <div className="chead"><span className="num">3</span><b>Preview</b>
            <span className="r">{busy ?? (result && !stale ? `${result.rows.length.toLocaleString()} rows` : picks.length ? "" : "Choose at least one species or measurement")}
              {picks.length > 0 && !busy && (!result || stale) && <a href="#" onClick={(e) => { e.preventDefault(); build(); }}>Show preview</a>}</span></div>
          <div className="twrap"><table><thead><tr>{(result && !stale && result.rows[0] ? Object.keys(result.rows[0]) : cols).map((c) => <th key={c} title={c}>{c}</th>)}</tr></thead>
            <tbody>{result && !stale ? result.rows.slice(0, 3).map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{v == null ? "" : typeof v === "number" ? +v.toPrecision(5) : String(v instanceof Date ? v.toISOString().slice(0, 10) : v)}</td>)}</tr>)
              : [0, 1].map((i) => <tr key={i}>{cols.map((c) => <td key={c}><span className="sk" /></td>)}</tr>)}</tbody></table></div>
        </section>
      </main>

      <div className="tb-bar"><div className="in">
        <span className="sum"><b>{nBio}</b> species · <b>{nEnv}</b> water &amp; weather · <b>{years[0]}–{years[1]}</b> · {LENS.find((l) => l.id === lens)!.label.toLowerCase()}</span>
        {err && b && <span className="warn">{err}</span>}
        <span className="sp" />
        <a className="lnk" href="#" onClick={(e) => { e.preventDefault(); copySql(); }}><Icon name="ui-sql" />{copied ? "Copied" : "Copy as SQL"}</a>
        <button className="dl" type="button" disabled={!picks.length || !!busy} onClick={download}><Icon name="ui-download" />Download CSV</button>
      </div></div>
    </div>
  );
}
