// the shell: brand header, controls (lens · picker · years · stat), map + legend + status, depth strip,
// year strip, section / cruise / station panels, timing panel. every view is a pure function of the
// release slice + the URL. data comes from the release catalog (release.ts), never a hand-built path.
import { useEffect, useMemo, useRef, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { engine, timing, hexExpr, datasetFilterSql, type Mark, type Row } from "./engine";
import { UNIFIED, members } from "./variables";
import { buildLayers, MapView, quantileDomain, viridisCss, type GridCell, type StatRow } from "./map";
import { DepthStrip, YearStrip, SectionPlot, CruiseSeries, StationCard, type DepthRow, type YearRow, type SectionCell, type CruiseRow } from "./charts";
import { resolveVersion, fetchCatalog, fetchVersions, sources, sidecarUrl, earlySidecar, type Catalog } from "./release";
import { buildBundle, saveBlob, copyAs } from "./bundle";
import { Icon } from "./icons";
import { Picker, type PickerItem, type GroupOpt } from "./picker";
import { Menu, Group } from "./ui";
import { Rail, FloatCard, PillRow, MaxPanel, Sheet, Sparkline, FOLDED_PX, SHEET_PEEK, type CardId, type CardBox, type Detent } from "./panels";
import type { IconName } from "./icons";
import { categoryRank, categoryIcon, envCategory, DATASET_CATEGORY_FALLBACK } from "./categories";
import {
  fromUrl, toUrl, defaultStage, defaultDen, LENSES, LENS_TITLE, LENS_SHORT, LENS_ICON, RES_KM, LAYERS, ENV_VARS_FALLBACK, VAL_COL, DEN_LABEL, STAT_LABEL, YEAR_OPEN,
  type Sel, type Lens, type Den, type Stat, type PickerRow, type PanelId,
} from "./state";

const DS_SHORT: Record<string, string> = {
  swfsc_ichthyo: "ichthyo", swfsc_cufes: "CUFES", calcofi_bottle: "bottle", "calcofi_ctd-cast": "CTD", calcofi_dic: "DIC", calcofi_mets: "METS",
  "cce-lter_zoodb": "zoodb", "cce-lter_zooscan": "zooscan", "cce-lter_euphausiids": "euphausiids", calcofi_phytoplankton: "phyto",
  calcofi_phyllosoma: "phyllosoma", "sio_mesopelagic-fish": "mesopelagic", "farallon_bird-mammal": "farallon", "cdfw_dungeness-crab": "dungeness",
  "sio_pic-zooplankton": "PIC", "calcofi_picoplankton": "picoplankton",
};
const short = (d: string) => DS_SHORT[d] ?? d;
// brand v1's theme-toggle pair (Material Design Icons brightness-7 / brightness-4, Apache-2.0): the same
// paths theme.js injects elsewhere; rendered here so React owns the nodes and theme.js only sets the title
const ICON_SUN = "M12 8a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4m0 10a6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z";
const ICON_MOON = "M12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6a6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z";
const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const fmtN = (v: number) => v.toLocaleString();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const native = new URLSearchParams(location.search).get("native") === "1"; // D13: the plain <select> fallback, one release
const phoneQuery = matchMedia("(max-width: 899px)");

// registered buffer names: the SQL templates read these (`{{src}}` etc.), never a URL
const REG = { obs_bio: "obs_bio.parquet", sample_root: "sample_root.parquet", sample_spatial: "sample_spatial.parquet", taxon: "taxon.parquet", measurement_type: "measurement_type.parquet", dataset: "dataset.parquet" } as const;
const envReg = (v: string) => `obs_env_${v}.parquet`;
// an env variable's source: the union of its member objects, each stamped with its measurement_type (the hive key)
const envSrc = (key: string) => `(${members(key).map((m) => `SELECT *, '${m}' AS measurement_type FROM '${envReg(m)}'`).join(" UNION ALL ")})`;
const q = (name: string) => `'${name}'`;

export interface Coverage {
  version: string;
  datasets: { dataset_key: string; realm: string; n_obs: number; n_roots: number; year_min: number; year_max: number }[];
  stations: { grid_key: string; datasets: { dataset_key: string; n_obs: number; n_roots: number; year_min: number; year_max: number }[] }[];
  years: { dataset_key: string; year: number; n_obs: number; n_roots: number }[];
  variables: { dataset_key: string; realm: string; measurement_type: string; n_obs: number; n_roots: number; year_min: number; year_max: number; depth_min_m: number | null; depth_max_m: number | null }[];
}
export interface CoverageStations { version: string; stations: { grid_key: string; datasets: { dataset_key: string; n_obs: number; year_min: number; year_max: number; years: [number, number][]; months: number[] }[] }[] }

function polyCentroid(f: any): [number, number] {
  const g = f.geometry;
  const polys: any[] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let best: number[][] = [];
  for (const p of polys) if (p[0].length > best.length) best = p[0];
  if (!best.length) return [0, 0];
  const s = best.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
  return [s[0] / best.length, s[1] / best.length];
}

export function App() {
  const [sel, setSelRaw] = useState<Sel>(() => fromUrl());
  const [displayLens, setDisplayLens] = useState<Lens>("station");
  const [theme, setTheme] = useState<"dark" | "light">(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [version, setVersion] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cov, setCov] = useState<Coverage | null>(null);
  const [covStations, setCovStations] = useState<CoverageStations | null>(null);
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [spatial, setSpatial] = useState<any[]>([]);
  const [taxa, setTaxa] = useState<Row[]>([]);
  const [mt, setMt] = useState<Map<string, { description: string; units: string }>>(new Map());
  const [yearsEdit, setYearsEdit] = useState(false);
  const [phone, setPhone] = useState(phoneQuery.matches);
  const [datasets, setDatasets] = useState<Row[]>([]);
  const [picker, setPicker] = useState<PickerRow[]>([]);
  const [sliceKey, setSliceKey] = useState<string | null>(null);
  const [status, setStatus] = useState("grid (static)");
  const [marks, setMarks] = useState<Mark[]>(timing.marks);
  const [stationRows, setStationRows] = useState<Row[]>([]);
  const [hexRows, setHexRows] = useState<Row[]>([]);
  const [regionRows, setRegionRows] = useState<Row[]>([]);
  const [regionStation, setRegionStation] = useState<Map<string, string>>(new Map());
  const [cruiseRows, setCruiseRows] = useState<CruiseRow[]>([]);
  const [track, setTrack] = useState<{ path: [number, number][]; ts: number[] } | null>(null);
  const [cruiseSamples, setCruiseSamples] = useState<Row[]>([]);
  const [sectionCells, setSectionCells] = useState<SectionCell[]>([]);
  const [climCells, setClimCells] = useState<SectionCell[] | null>(null);
  const [sectionCruises, setSectionCruises] = useState<Row[]>([]);
  const [depthRows, setDepthRows] = useState<DepthRow[]>([]);
  const [yearRows, setYearRows] = useState<YearRow[]>([]);
  const [time, setTime] = useState(0);
  const [lastSql, setLastSql] = useState("");
  const [bundling, setBundling] = useState<string | null>(null);
  const [seriesMode, setSeriesMode] = useState<"n" | "mean">("n");
  // advanced: the timing marks + the last SQL, behind a gear (off by default; ?timing=1 opens it)
  const [advanced, setAdvanced] = useState<boolean>(() => new URLSearchParams(location.search).get("timing") === "1");
  const lensClickAt = useRef<number | null>(null);
  const opened = useRef(false);
  const gen = useRef(0);
  const lensGen = useRef(0); // a lens effect that finishes after a newer selection must not touch the view
  const catRef = useRef<Catalog | null>(null);
  const loads = useRef(new Map<string, Promise<void>>());
  const setSel = (patch: Partial<Sel>) => setSelRaw((s) => ({ ...s, ...patch }));
  const duration = reducedMotion ? 0 : 700;

  // fetch a release object whole and register it under its short name (idempotent)
  const ensure = (name: string, url?: string) => {
    if (!loads.current.has(name)) {
      const cat = catRef.current;
      let u = url;
      if (!u && cat) {
        if (name.startsWith("obs_env_")) {
          const v = name.slice(8, -8);
          u = sources(cat, "obs_env").partitions.get(v);
          if (!u) return Promise.reject(new Error(`obs_env has no object for ${v} in ${cat.version}`));
        } else u = sources(cat, name.replace(/\.parquet$/, "")).urls[0];
      }
      if (!u) return Promise.reject(new Error(`no catalog yet for ${name}`));
      loads.current.set(name, engine.load(name, u));
    }
    return loads.current.get(name)!;
  };

  // ── boot: catalog + sidecars (static first paint), engine + objects behind it ─
  useEffect(() => {
    timing.subscribe(() => setMarks(timing.marks));
    document.addEventListener("cc:theme", (e: any) => setTheme(e.detail.theme));
    phoneQuery.addEventListener("change", (e) => setPhone(e.matches));
    if (sel.theme && document.documentElement.dataset.theme !== sel.theme) document.documentElement.dataset.theme = sel.theme;
    (async () => {
      const t = performance.now();
      const v = await resolveVersion(sel.release);
      const cat = await fetchCatalog(v);
      catRef.current = cat; setCatalog(cat); setVersion(v);
      timing.add("catalog", performance.now() - t, `${v} · ${cat.tables.length} tables`);
      fetchVersions().then((vs) => setVersions(vs.filter((x: any) => !x.retired).map((x: any) => x.version)));
      // static first paint: grid cells + the coverage cube (no WASM in the path)
      const [gj, cv] = await Promise.all([
        earlySidecar("grid") ?? fetch(sidecarUrl(v, "grid.geojson")).then((r) => r.json()),
        (earlySidecar("coverage") ?? fetch(sidecarUrl(v, "coverage.json")).then((r) => r.json())) as Promise<Coverage>,
      ]);
      const cells: GridCell[] = gj.features.map((f: any) => ({
        grid_key: f.properties.grid_key, line: f.properties.line, station: f.properties.station, home: [f.properties.lon_ctr, f.properties.lat_ctr],
      })).sort((a: GridCell, b: GridCell) => a.line - b.line || a.station - b.station);
      setGrid(cells); setCov(cv);
      timing.add("fetch:sidecars", performance.now() - t, `${cells.length} cells · coverage ${cv.datasets.length} datasets`);
      // the engine + the objects every lens needs, in parallel with the paint
      setStatus("engine warming…");
      ensure(REG.obs_bio); ensure(REG.taxon); ensure(REG.measurement_type); ensure(REG.sample_spatial); ensure(REG.dataset);
      if (sel.realm === "env") for (const m of members(sel.var)) ensure(envReg(m));
      Promise.all([ensure(REG.obs_bio), ensure(REG.taxon)])
        .then(() => engine.query("taxa", { src: q(REG.obs_bio), taxon_src: q(REG.taxon) })).then((r) => setTaxa(r));
      Promise.all([ensure(REG.measurement_type), ensure(REG.dataset)]).then(async () => {
        const rows = await engine.exec(`SELECT measurement_type, description, units FROM ${q(REG.measurement_type)}`, "measurement_type");
        setMt(new Map(rows.map((r) => [r.measurement_type, { description: r.description, units: r.units }])));
        setDatasets(await engine.exec(`SELECT * FROM ${q(REG.dataset)}`, "dataset"));
      });
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, []);

  useEffect(() => { toUrl(sel); }, [sel]);

  // the per-station card's detail is its own sidecar, fetched on the first station selection
  useEffect(() => {
    if (!sel.station || !version || covStations) return;
    fetch(sidecarUrl(version, "coverage_stations.json")).then((r) => r.json()).then(setCovStations).catch(console.error);
  }, [sel.station, version]);
  // the polygon layers are heavy (all layers, simplified): only the Regions lens needs them
  useEffect(() => {
    if (sel.lens !== "region" || !version || spatial.length) return;
    const t = performance.now();
    fetch(sidecarUrl(version, "spatial.geojson")).then((r) => r.json()).then((gj) => { setSpatial(gj.features); timing.add("fetch:spatial.geojson", performance.now() - t, `${gj.features.length} polygons`); }).catch(console.error);
  }, [sel.lens, version]);

  // ── the slice: one taxon or one variable, materialized in the worker ───────
  useEffect(() => {
    if (!catalog) return;
    const key = sel.realm === "bio" ? `bio:${sel.taxon}` : `env:${sel.var}`;
    if (key === sliceKey) return;
    const g = ++gen.current;
    (async () => {
      const files = sel.realm === "bio" ? [REG.obs_bio] : members(sel.var).map(envReg);
      setPicker([]); // the old realm's rows must never render under the new one (stale keyed DOM)
      setStatus(`fetching ${files.join(", ")}…`);
      await Promise.all(files.map((f) => ensure(f)));
      if (g !== gen.current) return;
      setStatus("building slice…");
      const t = performance.now();
      await (sel.realm === "bio" ? engine.query("slice_bio", { src: q(REG.obs_bio), taxon: sel.taxon }) : engine.query("slice_env", { src: envSrc(sel.var) }));
      const rows = (await engine.query("picker", {})) as PickerRow[];
      if (g !== gen.current) return;
      timing.add(`slice:${key}`, performance.now() - t, `${fmtN(rows.reduce((a, r) => a + r.n, 0))} observations`);
      setPicker(rows);
      if (sel.realm === "bio") {
        const stages = new Set(rows.map((r) => r.life_stage));
        const stage = sel.stage != null && stages.has(sel.stage) ? sel.stage : defaultStage(rows);
        const den = sel.den ?? defaultDen(rows, stage);
        setSelRaw((s) => ({ ...s, stage, den }));
      }
      setSliceKey(key);
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, [catalog, sel.realm, sel.taxon, sel.var]);

  // ── lens queries ───────────────────────────────────────────────────────────
  const val = sel.realm === "bio" ? VAL_COL[sel.den ?? "raw"] : "value";
  // the release's last year (coverage.json) closes an open-ended year range; never a constant
  const yearMax = useMemo(() => Math.max(2023, ...(cov?.variables ?? []).map((v) => v.year_max ?? 0)), [cov]);
  const years: [number, number] = [sel.years[0], sel.years[1] === YEAR_OPEN ? yearMax : sel.years[1]];
  const params = useMemo(() => ({
    val, y0: years[0], y1: years[1], d0: sel.depth[0], d1: sel.depth[1], stage: sel.realm === "bio" ? sel.stage : null,
    dataset_filter: datasetFilterSql(sel.datasets),
  }), [val, years[0], years[1], sel.depth, sel.stage, sel.realm, sel.datasets]);
  const dsOn = (dk: string) => !sel.datasets || sel.datasets.includes(dk);
  const toggleDataset = (dk: string) => {
    const all = [...new Set(picker.map((r) => r.dataset_key))];
    const cur = sel.datasets ?? all;
    const next = cur.includes(dk) ? cur.filter((d) => d !== dk) : [...cur, dk];
    setSel({ datasets: next.length === 0 || next.length === all.length ? null : next });
  };

  useEffect(() => {
    if (!sliceKey || (sel.realm === "bio" && !sel.den)) return;
    const g = gen.current;
    const lg = ++lensGen.current;
    const stale = () => g !== gen.current || lg !== lensGen.current;
    const lens = sel.lens;
    (async () => {
      const t = performance.now();
      const need_station = !opened.current || lens === "station";
      if (need_station) { const r = await engine.query("station", params); if (stale()) return; setStationRows(r); }
      if (lens === "hex") { const r = await engine.query("hex", { ...params, hex: hexExpr(sel.res) }); if (stale()) return; setHexRows(r); }
      if (lens === "region") {
        await ensure(REG.sample_spatial); await ensure(REG.sample_root);
        const rr = await engine.query("region", { ...params, layer: sel.layer, spatial_src: q(REG.sample_spatial) });
        const rs = await engine.query("region_station", { layer: sel.layer, root_src: q(REG.sample_root), spatial_src: q(REG.sample_spatial) });
        if (stale()) return;
        setRegionRows(rr); setRegionStation(new Map(rs.map((r) => [r.grid_key, r.spatial_key])));
      }
      if (lens === "cruise") {
        const cr = (await engine.query("cruise", params)) as CruiseRow[];
        if (stale()) return;
        setCruiseRows(cr);
        let ck = sel.cruise && cr.some((c) => c.cruise_key === sel.cruise) ? sel.cruise : null;
        if (!ck && cr.length) ck = cr.slice().sort((a, b) => b.n_sta - a.n_sta || b.t0 - a.t0)[0].cruise_key;
        if (ck !== sel.cruise) { setSel({ cruise: ck }); return; } // the effect re-runs once with the cruise set
        if (ck) {
          await ensure(REG.sample_root);
          const tr = await engine.query("cruise_track", { cruise: ck, root_src: q(REG.sample_root) });
          const cs2 = await engine.query("cruise_samples", { ...params, cruise: ck });
          if (stale()) return;
          if (tr.length > 1) {
            const t0 = tr[0].t, t1 = tr[tr.length - 1].t || t0 + 1;
            setTrack({ path: tr.map((r) => [r.longitude, r.latitude]), ts: tr.map((r) => ((r.t - t0) / (t1 - t0)) * 1000) });
          } else setTrack(null);
          setCruiseSamples(cs2);
        }
      }
      if (lens === "section") {
        const cs = await engine.query("section_cruises", { ...params, line: sel.line });
        if (stale()) return;
        setSectionCruises(cs);
        let ck = sel.cruise && cs.some((c) => c.cruise_key === sel.cruise) ? sel.cruise : null;
        if (!ck && cs.length) ck = cs.slice().sort((a, b) => b.n_sta - a.n_sta || b.cruise_key.localeCompare(a.cruise_key))[0].cruise_key;
        if (ck !== sel.cruise) { setSel({ cruise: ck }); return; }
        if (sel.realm === "env") {
          const sc = ck ? await engine.query("section", { ...params, line: sel.line, cruise: ck }) : [];
          const cl = await engine.query("section_clim", { ...params, line: sel.line });
          if (stale()) return;
          setSectionCells(sc.map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n })));
          setClimCells(cl.map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n })));
        } else {
          const sc = await engine.query("section_bio", { ...params, line: sel.line });
          if (stale()) return;
          setSectionCells(sc.map((r) => ({ station: r.station, y: r.year, v: r.v, n: r.n })));
          setClimCells(null);
        }
      }
      const dr = (await engine.query("depth_strip", params)) as DepthRow[];
      const yr = (await engine.query("years", params)) as YearRow[];
      if (stale()) return;
      setDepthRows(dr); setYearRows(yr);
      setLastSql(engine.lastSql);
      const ms = performance.now() - t;
      if (lensClickAt.current != null) { timing.add(`grain_switch:${lens}`, performance.now() - lensClickAt.current, `${LENS_SHORT[lens]} data ready (transition ${duration} ms on top)`); lensClickAt.current = null; }
      if (!opened.current) {
        opened.current = true;
        timing.add("first_lens_ready", ms, "all panels answered");
        // the opening move: stations first, then the URL's lens (D6), unless ?tour=off or reduced motion
        if (lens !== "station" && sel.tour && !reducedMotion) setTimeout(() => setDisplayLens(lens), 900);
        else setDisplayLens(lens);
      } else setDisplayLens(lens);
      setStatus("ready");
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, [sliceKey, sel.lens, sel.res, sel.layer, sel.line, sel.cruise, params]);

  // cruise playback
  useEffect(() => {
    if (displayLens !== "cruise" || !track || reducedMotion) return;
    let raf = 0;
    const tick = () => { setTime((t) => (t + 3) % 1250); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [displayLens, track]);

  // ── derived ────────────────────────────────────────────────────────────────
  const stat: Stat = sel.stat;
  const statOf = (r: Row) => (stat === "n" ? r.n : r[stat]);
  // before the slice answers, the station dots carry the coverage cube (root samples, all datasets)
  const covStation = useMemo(() => {
    const m = new Map<string, StatRow>();
    for (const s of cov?.stations ?? []) { const n = s.datasets.reduce((a, d) => a + d.n_roots, 0); m.set(s.grid_key, { n, n_samples: n, mean: n, med: n }); }
    return m;
  }, [cov]);
  const stationMap = useMemo(() => (stationRows.length ? new Map<string, StatRow>(stationRows.map((r) => [r.grid_key, r as StatRow])) : covStation), [stationRows, covStation]);
  const layerFeatures = useMemo(() => spatial.filter((f) => f.properties.layer === sel.layer), [spatial, sel.layer]);
  const centroids = useMemo(() => new Map<string, [number, number]>(layerFeatures.map((f) => [f.properties.spatial_key, polyCentroid(f)])), [layerFeatures]);
  const regionStats = useMemo(() => new Map(regionRows.map((r) => [r.spatial_key, r as any])), [regionRows]);
  const cruiseStations = useMemo(() => new Set<string>(cruiseSamples.map((r) => r.grid_key).filter(Boolean)), [cruiseSamples]);
  const preSlice = !stationRows.length;
  const domain = useMemo(() => {
    const rows = displayLens === "hex" ? hexRows : displayLens === "region" ? regionRows : displayLens === "cruise" ? cruiseSamples : stationRows.length ? stationRows : [...covStation.values()];
    return quantileDomain(rows.map(stationRows.length || displayLens !== "station" ? statOf : (r) => r.n), stationRows.length ? stat : "n");
  }, [displayLens, hexRows, regionRows, cruiseSamples, stationRows, covStation, stat]);

  const layers = useMemo(() => buildLayers({
    lens: displayLens, res: sel.res, stat: preSlice ? "n" : stat, grid, station: stationMap, hex: hexRows as any,
    region: { features: layerFeatures, stats: regionStats, stationTo: regionStation, centroid: centroids, selected: sel.region },
    cruise: { track, samples: cruiseSamples as any, time },
    section: { line: sel.line, cruiseStations },
    duration, domain, selectedStation: sel.station,
  }), [displayLens, sel.res, stat, preSlice, grid, stationMap, hexRows, layerFeatures, regionStats, regionStation, centroids, sel.region, track, cruiseSamples, time, sel.line, cruiseStations, domain, sel.station]);

  // picker derivations (D8 rule 4)
  const stages = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const r of picker) m.set(r.life_stage, (m.get(r.life_stage) ?? 0) + r.n);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [picker]);
  const stageRows = picker.filter((r) => (sel.realm === "env" || r.life_stage === sel.stage) && dsOn(r.dataset_key));
  // env pills: one per dataset (the picker rows are per dataset x stage x class x gear)
  const envPills = useMemo(() => { const m = new Map<string, { n: number; n_flagged: number }>(); for (const r of picker) { const c = m.get(r.dataset_key) ?? { n: 0, n_flagged: 0 }; c.n += r.n; c.n_flagged += r.n_flagged; m.set(r.dataset_key, c); } return [...m.entries()]; }, [picker]);
  const denInfo = (den: Den) => {
    const ok = new Set<string>(), all = new Set<string>();
    let excluded = 0, rows = 0;
    for (const r of stageRows) {
      all.add(r.dataset_key);
      const k = den === "per_10m2" ? r.n_10m2 : den === "per_1000m3" ? r.n_1000m3 : r.n;
      if (k > 0) ok.add(r.dataset_key);
      excluded += r.n - k; rows += k;
    }
    return { ok: [...ok], off: [...all].filter((d) => !ok.has(d)), excluded, rows };
  };
  const inView = stageRows.reduce((a, r) => a + (sel.realm === "env" ? r.n : sel.den === "per_10m2" ? r.n_10m2 : sel.den === "per_1000m3" ? r.n_1000m3 : r.n), 0);
  // ── picker items (D13): organisms from taxa.sql, variables from coverage.json (+ measurement_type labels once loaded), cruises from the lens
  const dsRow = (dk: string) => datasets.find((d) => d.dataset_key === dk);
  const dsColor = (dk: string) => dsRow(dk)?.color ?? "var(--muted)";
  const dsCategory = (dk: string) => dsRow(dk)?.category ?? DATASET_CATEGORY_FALLBACK[dk] ?? "Other";
  const organismItems = useMemo<PickerItem[]>(() => taxa.map((t) => {
    const ds: string[] = (t.datasets ?? "").split(",").filter(Boolean);
    const local = !/^(worms|itis):/.test(t.taxon_key); // a dataset-local class (zooscan eggs, phyto "other"): the code, and the dataset as its subtitle
    return { key: t.taxon_key, label: t.common_name ?? t.scientific_name ?? (local ? t.taxon_key.replace(/^[^:]+:/, "") : t.taxon_key), sub: t.common_name ? t.scientific_name : local ? `${short(ds[0])} class` : undefined, subItalic: !!t.common_name, n: t.n, year: t.y1,
      datasets: ds, groups: { category: dsCategory(ds[0]), dataset: ds[0] ?? "—", class: t.class ?? "—" }, search: t.taxon_key };
  }), [taxa, datasets]);
  const organismGroups = useMemo<GroupOpt[]>(() => [
    { key: "category", label: "category", icon: (c) => categoryIcon(c), rank: categoryRank },
    { key: "dataset", label: "dataset", short: short },
    { key: "class", label: "class" }], []);
  const variableItems = useMemo<PickerItem[]>(() => {
    const env = (cov?.variables ?? []).filter((x) => x.realm === "env");
    const byType = new Map<string, { n: number; y1: number; ds: Map<string, number> }>();
    for (const x of env) { const c = byType.get(x.measurement_type) ?? { n: 0, y1: 0, ds: new Map() }; c.n += x.n_obs; c.y1 = Math.max(c.y1, x.year_max ?? 0); c.ds.set(x.dataset_key, (c.ds.get(x.dataset_key) ?? 0) + x.n_obs); byType.set(x.measurement_type, c); }
    const inUnified = new Set(UNIFIED.flatMap((v) => v.members));
    const item = (key: string, label: string, units: string | undefined, c: { n: number; y1: number; ds: Map<string, number> }, search = ""): PickerItem => {
      const ds = [...c.ds.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      return { key, label, sub: units, n: c.n, year: c.y1 || null, datasets: ds, groups: { category: envCategory(key, label), dataset: ds[0] ?? "—" }, search: `${key} ${search}` };
    };
    // a unified variable (bottle + CTD headline types, comparable) is one row; every other type is its own
    const uni = UNIFIED.map((v) => { const c = { n: 0, y1: 0, ds: new Map<string, number>() }; for (const m of v.members) { const x = byType.get(m); if (x) { c.n += x.n; c.y1 = Math.max(c.y1, x.y1); for (const [k, n] of x.ds) c.ds.set(k, (c.ds.get(k) ?? 0) + n); } }
      const u = v.label.match(/\(([^)]+)\)$/)?.[1]; return item(v.key, v.label.replace(/\s*\([^)]+\)$/, ""), u, c, v.members.join(" ")); }).filter((v) => v.n > 0);
    const rest = [...byType.entries()].filter(([k]) => !inUnified.has(k)).map(([k, c]) => { const m = mt.get(k); return item(k, m?.description ?? ENV_VARS_FALLBACK[k] ?? k, m?.units, c); });
    return [...uni, ...rest];
  }, [cov, mt]);
  const variableGroups = useMemo<GroupOpt[]>(() => [
    { key: "category", label: "category", icon: (c) => categoryIcon(c), rank: categoryRank },
    { key: "dataset", label: "dataset", short: short }], []);
  const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const cruiseItems = useMemo<PickerItem[]>(() => cruiseRows.map((c) => ({ key: c.cruise_key, label: c.cruise_key, sub: `${dateOf(c.t0)} → ${dateOf(c.t1)} · ${c.n_sta} stations`, n: c.n, year: +c.cruise_key.slice(0, 4) })), [cruiseRows]);
  const sectionCruiseItems = useMemo<PickerItem[]>(() => sectionCruises.map((c) => ({ key: c.cruise_key, label: c.cruise_key, sub: `${c.n_sta} stations · ${fmtN(c.n)} observations`, n: c.n_sta, year: c.year })), [sectionCruises]);
  const envVar = variableItems.find((v) => v.key === sel.var);
  const yearsSet = sel.years[0] !== 1949 || sel.years[1] !== YEAR_OPEN;
  const depthSet = sel.depth[0] !== 0 || sel.depth[1] !== 500;
  const copyLink = async () => { try { await navigator.clipboard.writeText(location.href); setStatus("link copied"); } catch { setStatus("clipboard blocked"); } };

  // ── panels (D11 · D18): folds + maximize in the URL; card minimize, rail width and the phone sheet in memory ────
  const [railW, setRailW] = useState<number>(() => { try { const v = +(localStorage.getItem("explore.rail.select.w") ?? 0); return v >= 260 && v <= 440 ? v : 320; } catch { return 320; } });
  const [minCards, setMinCards] = useState<Record<CardId, boolean>>({ section: false, cruise: false, station: false, timing: false });
  const [topCard, setTopCard] = useState<CardId | null>(null);
  const [sheet, setSheet] = useState<{ panel: PanelId; detent: Detent }>({ panel: "select", detent: "peek" });
  const [depthPulse, setDepthPulse] = useState(false);
  const [depthDs, setDepthDs] = useState<DepthRow[]>([]);
  const mapBox = useRef<HTMLDivElement>(null);
  const folded = (id: PanelId) => sel.hide.includes(id);
  const toggleFold = (id: PanelId) => setSelRaw((s) => ({ ...s, hide: s.hide.includes(id) ? s.hide.filter((h) => h !== id) : [...s.hide, id] }));
  const toggleMax = (id: PanelId) => setSelRaw((s) => ({ ...s, max: s.max === id ? null : id }));
  const openCard = (id: CardId) => { setMinCards((m) => ({ ...m, [id]: false })); setTopCard(id); if (phone) setSheet({ panel: id, detent: "half" }); };
  const minCard = (id: CardId) => { setMinCards((m) => ({ ...m, [id]: true })); if (phone) setSheet({ panel: "select", detent: "peek" }); };
  // a lens owns its cards (rule 2): Sections opens the section card, Cruises the cruise card; the others open none
  useEffect(() => {
    if (sel.lens === "section") openCard("section"); else if (sel.lens === "cruise") openCard("cruise");
    else if (phone) setSheet((s) => (s.panel === "section" || s.panel === "cruise" ? { panel: "select", detent: "peek" } : s));
  }, [sel.lens]);
  useEffect(() => { if (sel.station) openCard("station"); }, [sel.station]);   // a station click opens its card (a sheet on the phone)
  useEffect(() => { try { localStorage.setItem("explore.rail.select.w", String(railW)); } catch { /* private mode */ } }, [railW]);
  // the depth axis APPEARING while the rail is folded: one 600 ms pulse on the pill (rule 1) — never a re-layout
  const hasDepthAxis = !sliceKey || depthRows.length > 0;
  const prevAxis = useRef(hasDepthAxis);
  useEffect(() => { if (hasDepthAxis && !prevAxis.current && sel.hide.includes("depth")) { setDepthPulse(true); setTimeout(() => setDepthPulse(false), 700); } prevAxis.current = hasDepthAxis; }, [hasDepthAxis]);
  // the maximized water column adds one median line per dataset
  useEffect(() => { if (sel.max !== "depth" || !sliceKey) { setDepthDs([]); return; } engine.query("depth_strip_ds", params).then((r) => setDepthDs(r as DepthRow[])).catch(console.error); }, [sel.max, sliceKey, params]);
  const yearsSpark = useMemo(() => { const m = new Map(yearRows.map((r) => [r.year, r.n])); const out: number[] = []; for (let y = 1949; y <= yearMax; y++) out.push(m.get(y) ?? 0); return out; }, [yearRows, yearMax]);
  const unitLabel = sel.realm === "bio" ? (sel.den === "raw" ? "count" : sel.den === "per_10m2" ? "per 10 m²" : "per 1000 m³") : (picker[0]?.units ?? sel.var);
  const taxonRow = taxa.find((t) => t.taxon_key === sel.taxon);
  const legendTitle = preSlice ? "root samples · all datasets (coverage.json, before the engine is warm)" : sel.realm === "bio"
    ? `${STAT_LABEL[stat]} · ${taxonRow?.common_name ?? taxonRow?.scientific_name ?? sel.taxon} · ${sel.stage ?? "all stages"} · ${unitLabel}`
    : `${STAT_LABEL[stat]} · ${envVar ? `${envVar.label}${envVar.sub ? ` (${envVar.sub})` : ""}` : sel.var} · ${sel.depth[0]}–${sel.depth[1]} m`;
  const lines = useMemo(() => [...new Set(grid.map((c) => c.line))].sort((a, b) => a - b), [grid]);
  const stationCard = useMemo(() => {
    if (!sel.station) return null;
    const detail = covStations?.stations.find((s) => s.grid_key === sel.station);
    const summary = cov?.stations.find((s) => s.grid_key === sel.station);
    const cell = grid.find((c) => c.grid_key === sel.station);
    return { grid_key: sel.station, cell, summary, detail };
  }, [sel.station, cov, covStations, grid]);

  const onLens = (l: Lens) => { lensClickAt.current = performance.now(); setSel({ lens: l }); };
  const download = async () => {
    if (!catalog || !version || bundling) return;
    try {
      const lensTemplate = sel.lens === "hex" ? "hex" : sel.lens === "region" ? "region" : sel.lens === "cruise" ? "cruise" : sel.lens === "section" ? (sel.realm === "env" ? "section" : "section_bio") : "station";
      const lensParams: Record<string, any> = sel.lens === "hex" ? { hex: hexExpr(sel.res) } : sel.lens === "region" ? { layer: sel.layer } : sel.lens === "section" ? { line: sel.line, cruise: sel.cruise } : {};
      const summary = sel.lens === "hex" ? hexRows : sel.lens === "region" ? regionRows : sel.lens === "cruise" ? cruiseRows : sel.lens === "section" ? sectionCells : stationRows;
      const { blob, name } = await buildBundle({
        sel, version, catalog, params, lensParams, lensTemplate, summary: summary as Row[], summaryKey: sel.lens, grid, regionFeatures: layerFeatures,
        datasets, unit: unitLabel, envFile: sel.realm === "env" ? envReg(sel.var) : null, bioSrcName: REG.obs_bio, hexRes: sel.res, onStatus: setBundling,
      });
      (window as any).__lastBundle = { name, bytes: blob.size };
      saveBlob(blob, name);
      timing.add("bundle", 0, `${name} ${(blob.size / 1e6).toFixed(1)} MB`);
    } catch (e: any) { console.error(e); setStatus(`bundle error: ${e.message}`); }
    setBundling(null);
  };
  (window as any).__download = download; // spike/verify hook
  (window as any).__picker = picker; (window as any).__sliceKey = sliceKey;
  const lensTpl = () => sel.lens === "hex" ? "hex" : sel.lens === "region" ? "region" : sel.lens === "cruise" ? "cruise" : sel.lens === "section" ? (sel.realm === "env" ? "section" : "section_bio") : "station";
  const lensPar = (): Record<string, any> => sel.lens === "hex" ? { hex: hexExpr(sel.res) } : sel.lens === "region" ? { layer: sel.layer } : sel.lens === "section" ? { line: sel.line, cruise: sel.cruise } : {};
  const copy = async (kind: "sql" | "r" | "py") => {
    if (!catalog || !version) return;
    const text = copyAs(kind, { sel, catalog, version, params, lensParams: lensPar(), lensTemplate: lensTpl() });
    try { await navigator.clipboard.writeText(text); setStatus(`copied ${kind.toUpperCase()} (${text.length.toLocaleString()} chars)`); } catch { setStatus("clipboard blocked"); }
    (window as any).__lastCopy = text;
  };
  const getTooltip = (info: PickingInfo) => {
    const o: any = info.object; if (!o) return null;
    const id = info.layer?.id;
    if (id === "stations") { const s = stationMap.get(o.grid_key); return { text: `${o.grid_key} · line ${o.line} station ${o.station}\n${s ? (preSlice ? `${fmtN(s.n)} root samples, all datasets` : `${STAT_LABEL[stat]} ${fmt(statOf(s))} · ${fmtN(s.n)} observations · ${s.n_samples} samples · ${s.y0}–${s.y1}`) : "no observations in selection"}\nclick for the station's coverage card` }; }
    if (id === "hexes") return { text: `${o.hex}\n${STAT_LABEL[stat]} ${fmt(statOf(o))} · ${fmtN(o.n)} observations · ${o.n_samples} samples` };
    if (id === "regions") { const s = regionStats.get(o.properties.spatial_key); return { text: `${o.properties.name}\n${s ? `${STAT_LABEL[stat]} ${fmt(statOf(s))} · ${fmtN(s.n)} observations · ${s.n_samples} samples · ${s.y0}–${s.y1}` : "no data"}` }; }
    if (id === "cruise-samples") return { text: `${o.grid_key ?? "—"} · ${new Date(o.t * 1000).toISOString().slice(0, 10)}\n${STAT_LABEL[stat]} ${fmt(statOf(o))} · ${fmtN(o.n)} observations` };
    return null;
  };
  const onClick = (info: PickingInfo) => {
    const o: any = info.object; if (!o) return;
    if (info.layer?.id === "regions") setSel({ region: o.properties.spatial_key === sel.region ? null : o.properties.spatial_key });
    if (info.layer?.id === "stations" && sel.lens === "section") setSel({ line: o.line, cruise: null });
    else if (info.layer?.id === "stations") setSel({ station: o.grid_key === sel.station ? null : o.grid_key });
  };

  // ── timing summary ─────────────────────────────────────────────────────────
  const firstPaint = marks.find((m) => m.name === "first_paint")?.at;
  const readyAt = marks.find((m) => m.name.startsWith("slice:"))?.at;
  const firstQ = marks.find((m) => /^query:(station|hex|cruise|region|section)$/.test(m.name));
  const lensQs = marks.filter((m) => /^query:(station|hex|cruise|region|section|section_bio)$/.test(m.name));
  const lastQ = lensQs[lensQs.length - 1];
  const grain = marks.filter((m) => m.name.startsWith("grain_switch")).slice(-1)[0];
  const anyCached = [...engine.files.values()].some((f) => f.cached);
  const go = (v: number | undefined, lim: number) => (v == null ? "" : v < lim ? "go" : "nogo");
  const rel = version ?? sel.release ?? "…";

  // ── panels (D11 · D18): folds + maximize live in the URL; card minimize, rail width and the phone sheet in memory ─
  const tracks = { "--l": phone ? "0px" : folded("select") ? `${FOLDED_PX}px` : `${railW}px`, "--r": folded("depth") ? `${FOLDED_PX}px` : "210px", "--b": folded("years") ? `${FOLDED_PX}px` : "140px" } as React.CSSProperties;
  const organism = organismItems.find((i) => i.key === sel.taxon);
  const selectSummary = sel.realm === "bio" ? `${organism?.label ?? sel.taxon} · ${sel.stage ?? "all stages"} · ${unitLabel}` : `${envVar?.label ?? sel.var} · ${sel.depth[0]}–${sel.depth[1]} m`;
  const depthSummary = sliceKey && !depthRows.length ? "Depth · integrated tows" : `Depth ${sel.depth[0]}–${sel.depth[1]} m`;
  const depthEmpty = "depth-integrated net tows —<br>no water-column profile for this selection;<br>the tow span will draw here<br>once the release carries it";
  const seriesToggle = <span className="seg" role="group" aria-label="year strip mode"><button className={seriesMode === "n" ? "on" : ""} onClick={() => setSeriesMode("n")}>observations</button><button className={seriesMode === "mean" ? "on" : ""} onClick={() => setSeriesMode("mean")}>mean ± se</button></span>;
  const selectBody = <>
    <Group title="Lens" icon="ui-layers" data-tour="lenses">
      <div className="lenses">
        {LENSES.map((l) => <button key={l} className={sel.lens === l ? "on" : ""} onClick={() => onLens(l)} title={LENS_TITLE[l]}><Icon name={LENS_ICON[l]} />{LENS_SHORT[l]}</button>)}
      </div>
      {sel.lens === "hex" && <div className="row opt"><span className="hint">hexagon size</span><span className="seg">{[3, 4, 5, 6, 7].map((r) => <button key={r} className={sel.res === r ? "on" : ""} title={`H3 resolution ${r} · mean edge ${RES_KM[r]}`} onClick={() => { lensClickAt.current = performance.now(); setSel({ res: r }); }}>{RES_KM[r]}</button>)}</span></div>}
      {sel.lens === "region" && <div className="opt">
        <label className="f">boundary layer<select value={sel.layer} onChange={(e) => setSel({ layer: e.target.value, region: null })}>{(spatial.length ? [...new Set(spatial.map((f) => f.properties.layer))].sort() : LAYERS).map((l) => <option key={l}>{l}</option>)}</select></label>
        <div className="pills">{regionRows.slice().sort((a, b) => b.n - a.n).slice(0, 10).map((r) => <span key={r.spatial_key} className={`pill ${sel.region === r.spatial_key ? "" : "off"}`} onClick={() => setSel({ region: sel.region === r.spatial_key ? null : r.spatial_key })} style={{ cursor: "pointer" }}>{r.spatial_name} · {fmt(statOf(r))} ({fmtN(r.n)})</span>)}</div>
        <div className="hint">{layerFeatures.length} polygons · {regionRows.length} with data · membership exact per root sample (sample_spatial)</div>
      </div>}
      {sel.lens === "section" && <div className="opt">
        <label className="f">line<select value={sel.line} onChange={(e) => setSel({ line: +e.target.value, cruise: null })}>{lines.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
        <Picker id="section-cruise" label="cruise" hint="newest first" value={sel.cruise ?? ""} items={sectionCruiseItems} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "n"]} countLabel="stations" placeholder="search YYYY-MM-NODC…" loading={sectionCruises.length ? null : "…"} native={native} sheet={phone} />
        {sel.realm === "env" && <label className="row" style={{ fontSize: 12 }}><input type="checkbox" checked={sel.anom} onChange={(e) => setSel({ anom: e.target.checked })} /> anomaly vs climatology ({years[0]}–{years[1]})</label>}
      </div>}
      {sel.lens === "cruise" && <div className="opt">
        <Picker id="cruise" label="cruise" hint="newest first" value={sel.cruise ?? ""} items={cruiseItems} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "n"]} placeholder="search YYYY-MM-NODC…" loading={cruiseRows.length ? null : "…"} native={native} sheet={phone} />
        <div className="hint">{track ? `${track.path.length} root sampling events on the track` : "no track"}</div>
      </div>}
    </Group>
    <Group title="Data" icon="ui-data" data-tour="data">
      <div className="row"><span className="seg realm" data-tour="realm">
        <button className={sel.realm === "bio" ? "on" : ""} onClick={() => setSel({ realm: "bio" })} title="one organism (taxon) at a time — realm bio"><Icon name="realm-bio" />Biology</button>
        <button className={sel.realm === "env" ? "on" : ""} onClick={() => setSel({ realm: "env", cruise: null })} title="one variable (measurement type) at a time — realm env"><Icon name="realm-env" />Environment</button>
      </span></div>
      {sel.realm === "bio" ? <>
        <Picker id="organism" label="organism" hint="(taxon)" value={sel.taxon} items={organismItems} onChange={(k) => setSel({ taxon: k, stage: null, den: null, cruise: null })}
          groups={organismGroups} letters placeholder="search species, genus, family…" dsColor={dsColor} dsShort={short} loading={taxa.length ? null : status} native={native} sheet={phone} data-tour="picker" />
        <div className="row">
          <label className="f">life stage
            <select value={sel.stage ?? ""} onChange={(e) => { const st = e.target.value || null; setSel({ stage: st, den: defaultDen(picker, st) }); }}>
              {stages.map(([s, n]) => <option key={s ?? "null"} value={s ?? ""}>{s ?? "(none)"} ({fmtN(n)})</option>)}
            </select></label>
          <label className="f">summary<select value={stat} onChange={(e) => setSel({ stat: e.target.value as Stat })}>{Object.entries(STAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <div className="den" data-tour="denominator"><h4>denominator <span className="hint" style={{ textTransform: "none", letterSpacing: 0 }}>· how counts are standardized</span></h4>
          {(["per_10m2", "per_1000m3", "raw"] as Den[]).map((d) => { const i = denInfo(d); return (
            <label key={d} className={i.rows === 0 ? "off" : ""}>
              <input type="radio" name="den" checked={sel.den === d} disabled={i.rows === 0} onChange={() => setSel({ den: d })} />
              {DEN_LABEL[d]}<br /><span className="hint">{i.ok.map(short).join(", ") || "no dataset"}{i.excluded > 0 ? ` · ${fmtN(i.excluded)} observations excluded` : ""}{i.off.length ? ` (${i.off.map(short).join(", ")} cannot)` : ""}</span>
            </label>); })}
        </div>
        <div className="pills">
          {picker.length === 0 && <span className="pill off">{status}</span>}
          {[...new Map(picker.map((r) => [`${r.dataset_key}|${r.life_stage}`, r])).keys()].map((k) => {
            const rs = picker.filter((r) => `${r.dataset_key}|${r.life_stage}` === k); const r0 = rs[0];
            const n = rs.reduce((a, r) => a + r.n, 0); const raw = rs.every((r) => r.effort_class === "raw_count_no_effort");
            const on = r0.life_stage === sel.stage && dsOn(r0.dataset_key);
            return <span key={k} className={`pill ${on ? "" : "off"} ${raw ? "warn" : ""} ${sel.datasets && dsOn(r0.dataset_key) ? "sel" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggleDataset(r0.dataset_key)}
              title={`${raw ? "raw count, no effort in release" : rs.map((r) => `${r.tow_type ?? "—"}: ${r.n}`).join(", ")} · click to toggle this dataset`}><i className="dot" style={{ background: dsColor(r0.dataset_key) }} />{short(r0.dataset_key)} {r0.life_stage ?? "—"} {fmtN(n)}{raw ? " ⚠" : ""}</span>;
          })}
        </div>
        <div className="hint">{fmtN(inView)} observations in view · {sel.den === "raw" ? "raw counts are not comparable across gear or datasets" : "nothing averaged across denominators, datasets or stages"}</div>
      </> : <>
        <Picker id="variable" label="variable" value={sel.var} items={variableItems} onChange={(k) => setSel({ var: k, cruise: null })}
          groups={variableGroups} defaultGroup="category" placeholder="search temperature, nitrate, chlorophyll…" dsColor={dsColor} dsShort={short} loading={variableItems.length ? null : "…"} native={native} sheet={phone} data-tour="picker" />
        <div className="row"><label className="f">summary<select value={stat} onChange={(e) => setSel({ stat: e.target.value as Stat })}>{Object.entries(STAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
        <div className="pills" data-tour="denominator">
          {picker.length === 0 && <span className="pill off">{status}</span>}
          {envPills.map(([dk, c]) => <span key={dk} className={`pill ${dsOn(dk) ? "" : "off"} ${sel.datasets && dsOn(dk) ? "sel" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggleDataset(dk)} title="bottle and CTD values of one variable are comparable · click to toggle this dataset"><i className="dot" style={{ background: dsColor(dk) }} />{short(dk)} {fmtN(c.n)}{c.n_flagged ? ` · ${fmtN(c.n_flagged)} flagged` : ""}</span>)}
        </div>
        <div className="hint">{fmtN(inView)} observations in view</div>
      </>}
    </Group>
    <Group title="Filters" icon="ui-filter" data-tour="filters">
      <div className="chips">
        <button type="button" className={`chip${yearsSet ? " on" : ""}`} onClick={() => setYearsEdit((v) => !v)} title="the year range · brush the years strip, or click to type"><Icon name="ui-years" />years {years[0]}–{years[1]}{yearsSet && <span className="x" role="button" aria-label="reset years" onClick={(e) => { e.stopPropagation(); setSel({ years: [1949, YEAR_OPEN] }); }}><Icon name="ui-close" /></span>}</button>
        <button type="button" className={`chip${depthSet ? " on" : ""}`} onClick={() => { if (phone) setSheet({ panel: "depth", detent: "half" }); else if (folded("depth")) toggleFold("depth"); }} title="the depth band · brush the water column to change it"><Icon name="ui-tune" />depth {sel.depth[0]}–{sel.depth[1]} m{depthSet && <span className="x" role="button" aria-label="reset depth" onClick={(e) => { e.stopPropagation(); setSel({ depth: [0, 500] }); }}><Icon name="ui-close" /></span>}</button>
        <span className={`chip${sel.datasets ? " on" : ""}`} title="the dataset filter · click the dataset pills under the organism or variable"><Icon name="ui-data" />datasets {sel.datasets ? sel.datasets.map(short).join(", ") : "all"}{sel.datasets && <button type="button" aria-label="all datasets" onClick={() => setSel({ datasets: null })}><Icon name="ui-close" /></button>}</span>
      </div>
      {yearsEdit && <div className="row"><input type="number" style={{ width: 62 }} value={years[0]} min={1949} max={yearMax} onChange={(e) => setSel({ years: [+e.target.value, years[1]] })} />–<input type="number" style={{ width: 62 }} value={years[1]} min={1949} max={yearMax} onChange={(e) => setSel({ years: [years[0], +e.target.value] })} /><span className="hint">or brush the years strip</span></div>}
    </Group>
    <Group title="Export" icon="ui-download" data-tour="export">
      <div className="row">
        <button className="pill act" disabled={!sliceKey || !!bundling} onClick={download} title="README · CITATION · summary (+GeoJSON) · observations (parquet/CSV) · the exact SQL against the release's object URLs · reproduce.R / .py">
          <Icon name="ui-download" />{bundling ? `bundle: ${bundling}` : "Download data (zip)"}</button>
        <Menu label="Copy code" icon="ui-code" title="the SQL this view ran, or R / Python that runs it" items={[
          { label: "SQL", hint: "against the release's object URLs", onSelect: () => copy("sql") },
          { label: "R", hint: "DBI + duckdb; calcofi4r noted", onSelect: () => copy("r") },
          { label: "Python", hint: "duckdb; calcofi4py noted", onSelect: () => copy("py") }]} />
        <Menu label="Share" icon="ui-share" title="the URL is the whole view" items={[
          { label: "Copy link", icon: "ui-link", hint: "this view, folds and zoom included", onSelect: copyLink }]} />
        <button className="pill act" onClick={() => { if (advanced && !minCards.timing) setAdvanced(false); else { setAdvanced(true); openCard("timing"); } }} aria-pressed={advanced} title="the timing marks and the SQL behind the view"><Icon name="ui-sql" />SQL &amp; timing</button>
      </div>
    </Group>
    <div className="hint" style={{ marginTop: "auto" }}>{LENS_TITLE[sel.lens]}. Release {rel}{catalog ? ` · ${catalog.tables.length} tables` : ""} · DuckDB-WASM in a worker, no extensions, objects fetched whole from the release catalog.</div>
  </>;
  const depthBody = (wide: boolean) => <DepthStrip rows={depthRows} band={sel.depth} theme={theme} unit={unitLabel} empty={depthEmpty} onBand={(b) => setSel({ depth: b ?? [0, 500] })} byDataset={wide && depthDs.length ? { rows: depthDs, color: dsColor, short } : null} />;
  const yearsBody = <YearStrip rows={yearRows} years={years} yearMax={yearMax} theme={theme} mode={seriesMode} unit={unitLabel} onYears={(y) => setSel({ years: y ?? [1949, YEAR_OPEN] })} />;
  const sectionBody = <SectionPlot cells={sectionCells} clim={climCells} anom={sel.anom && sel.realm === "env"} yLabel={sel.realm === "env" ? "depth (m)" : "year"} theme={theme} unit={unitLabel}
    title={`line ${sel.line} · ${sel.realm === "env" ? `cruise ${sel.cruise ?? "—"}${sel.anom ? " · anomaly vs climatology" : ""}` : "all cruises · tows are depth-integrated, so y is year"}`} />;
  const cruiseBody = <CruiseSeries rows={cruiseRows} stat={stat} selected={sel.cruise} theme={theme} unit={unitLabel} onPick={(k) => setSel({ cruise: k })} />;
  const stationBody = <StationCard summary={stationCard?.summary} detail={stationCard?.detail} theme={theme} short={short} yearMax={yearMax} />;
  const timingBody = <div className="timing-body">
    <div className="hint" style={{ padding: "4px 8px" }}>{anyCached ? "objects from cache" : "first visit"} · {navigator.hardwareConcurrency} cores{(navigator as any).deviceMemory ? ` · ${(navigator as any).deviceMemory} GB` : ""} · release {rel}</div>
    <table><tbody>
      <tr><td>first paint (&lt; 1 s)</td><td className={`ms ${go(firstPaint, 1000)}`}>{firstPaint ?? "…"} ms</td></tr>
      <tr><td>engine + slice ready</td><td className="ms">{readyAt ?? "…"} ms</td></tr>
      <tr><td>first lens query (&lt; 4 s cold)</td><td className={`ms ${go(firstQ?.ms, 4000)}`}>{firstQ ? `${firstQ.ms} ms` : "…"}</td></tr>
      <tr><td>last lens query (&lt; 100 ms warm)</td><td className={`ms ${go(lastQ?.ms, 100)}`}>{lastQ ? `${lastQ.ms} ms (${lastQ.name.slice(6)})` : "…"}</td></tr>
      <tr><td>grain switch (&lt; 300 ms)</td><td className={`ms ${go(grain?.ms, 300)}`}>{grain ? `${grain.ms} ms` : "…"}</td></tr>
      {marks.map((m, i) => <tr key={i}><td>{m.name}{m.note ? <span className="hint"> {m.note}</span> : null}</td><td className="ms">{m.ms} ms <span className="hint">@{m.at}</span></td></tr>)}
    </tbody></table>
    <pre>{lastSql}</pre>
  </div>;
  const titles: Record<PanelId, string> = {
    select: "Select", depth: "Depth", years: "Years", section: `Section · line ${sel.line}${sel.realm === "env" && sel.cruise ? ` · ${sel.cruise}` : ""}`, cruise: "Cruise series",
    station: stationCard ? `${stationCard.grid_key} · line ${stationCard.cell?.line} station ${stationCard.cell?.station}` : "Station",
    timing: `SQL & timing · ${anyCached ? "warm" : "cold"} · paint ${firstPaint ?? "…"} · ready ${readyAt ?? "…"} · query ${lastQ ? lastQ.ms : "…"} · switch ${grain ? grain.ms : "…"} ms`,
  };
  const icons: Record<PanelId, IconName> = { select: "ui-tune", depth: "ui-tune", years: "ui-years", section: "lens-sections", cruise: "lens-cruises", station: "lens-stations", timing: "ui-sql" };
  const body = (id: PanelId, wide = false) => id === "select" ? selectBody : id === "depth" ? depthBody(wide) : id === "years" ? yearsBody : id === "section" ? sectionBody : id === "cruise" ? cruiseBody : id === "station" ? stationBody : timingBody;
  const actions = (id: PanelId) => (id === "years" ? seriesToggle : null);
  const cardOpen: Record<CardId, boolean> = { section: displayLens === "section", cruise: displayLens === "cruise", station: !!stationCard, timing: advanced };
  const maxId: PanelId | null = sel.max && !phone && (sel.max === "select" || sel.max === "depth" || sel.max === "years" || cardOpen[sel.max as CardId]) ? sel.max : null;
  const bottomBand = cardOpen.section && !minCards.section ? "46%" : cardOpen.cruise && !minCards.cruise ? "34%" : "0%";
  const stationUp = cardOpen.station && !minCards.station;
  const cardBox: Record<CardId, CardBox> = {
    section: { left: 10, right: 44, bottom: 10, height: "46%" },
    cruise: { left: 10, right: 44, bottom: 10, height: "34%" },
    station: { top: 84, right: 10, width: 340, maxHeight: `calc(100% - 94px - ${bottomBand} - 10px)` },   // under the status chip + the map's +/− control
    timing: { top: 84, right: stationUp ? 360 : 10, width: 420, maxHeight: `calc(100% - 94px - ${bottomBand} - 10px)` },
  };
  const closeCard: Partial<Record<CardId, () => void>> = { station: () => setSel({ station: null }), timing: () => setAdvanced(false) };
  const pills = (["section", "cruise", "station", "timing"] as CardId[]).filter((c) => cardOpen[c] && minCards[c]).map((c) => ({ id: c, label: c === "station" ? stationCard!.grid_key : c === "timing" ? "SQL & timing" : titles[c], icon: icons[c], onRestore: () => openCard(c), onClose: closeCard[c] }));
  const card = (c: CardId) => cardOpen[c] && !phone && <FloatCard key={c} id={c} title={titles[c]} icon={icons[c]} boxRef={mapBox} defaults={cardBox[c]} minimized={minCards[c]} onMinimize={() => minCard(c)} maximized={maxId === c} onMax={() => toggleMax(c)} onClose={closeCard[c]} raised={topCard === c} onTouch={() => setTopCard(c)} data-tour={c === "station" ? "station" : undefined}>{body(c)}</FloatCard>;
  const lensStrip = <div className="lens-strip" data-tour="lenses">{LENSES.map((l) => <button key={l} className={sel.lens === l ? "on" : ""} onClick={() => onLens(l)} title={LENS_TITLE[l]}><Icon name={LENS_ICON[l]} />{LENS_SHORT[l]}</button>)}</div>;
  const closeSheet = () => { const pnl = sheet.panel; if (pnl === "station") setSel({ station: null }); else if (pnl === "timing") setAdvanced(false); else if (pnl === "section" || pnl === "cruise") setMinCards((m) => ({ ...m, [pnl]: true })); setSheet({ panel: "select", detent: "peek" }); };

  return (
    <div className="app">
      <header className="cc-header">
        <a className="cc-home" href="https://calcofi.io" aria-label="CalCOFI.io home">
          <img className="cc-logo-dark" src="https://calcofi.io/brand/v1/logo_calcofi.svg" alt="CalCOFI" width="32" height="32" />
          <img className="cc-logo-light" src="https://calcofi.io/brand/v1/logo_calcofi_light.svg" alt="CalCOFI" width="32" height="32" />
        </a>
        <a className="cc-title" href="./">CalCOFI Explorer<small><Icon name={LENS_ICON[sel.lens]} /> {LENS_TITLE[sel.lens]}</small></a>
        <a className="cc-release" href={`https://calcofi.io/db-schema/#erd?v=${rel}`} title="CalCOFI integrated database release — every value shown comes from this frozen release; schema and release notes"><span className="cc-release-word">release</span> <b>{rel}</b></a>
        {versions.length > 1 && <select className="cc-versions" value={version ?? ""} onChange={(e) => { setSel({ release: e.target.value }); location.search = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), release: e.target.value }).toString(); }} title="switch release (reloads)">
          {versions.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
        <span className="cc-spacer" />
        <nav className="cc-links"><a href="https://calcofi.io/db-query/">query</a><a href="https://calcofi.io/db-schema/">schema</a><a href="https://calcofi.io/docs/">docs</a></nav>
        <Menu className="cc-more" icon="ui-more" label="" title="more" align="right" items={[{ label: "query", href: "https://calcofi.io/db-query/", icon: "ui-open" }, { label: "schema", href: "https://calcofi.io/db-schema/", icon: "ui-open" }, { label: "docs", href: "https://calcofi.io/docs/", icon: "ui-open" }]} />
        <button className="cc-theme-toggle" type="button" aria-label="Toggle dark / light theme" title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
          {/* the sun while dark, the moon-in-sun while light — what a click switches to (theme.css shows one per theme) */}
          <svg className="cc-theme-icon cc-icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_SUN} /></svg>
          <svg className="cc-theme-icon cc-icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_MOON} /></svg>
        </button>
      </header>
      <div className="main" style={tracks}>
        {!phone && <Rail id="select" side="left" title="Select" icon="ui-tune" folded={folded("select")} onFold={() => toggleFold("select")} maximized={maxId === "select"} onMax={() => toggleMax("select")}
          resizable={{ width: railW, min: 260, max: 440, onResize: setRailW }} data-tour="rail"
          summary={<><Icon name={LENS_ICON[sel.lens]} /><Icon name={sel.realm === "bio" ? "realm-bio" : "realm-env"} />{selectSummary}</>}>{selectBody}</Rail>}
        <div className="panel mapwrap" ref={mapBox} data-tour="map">
          <MapView layers={layers} theme={theme} getTooltip={getTooltip} onClick={onClick} onFirstFrame={() => timing.add("first_paint", performance.now() - window.__t0, "basemap + grid dots")} />
          <div className="status"><b>{status}</b>{sliceKey ? ` · ${fmtN(inView)} observations` : ""}</div>
          <div className="map-tl">
            {!phone && <PillRow pills={pills} />}
            <div className="legend" data-tour="legend">
              <div className="ttl">{legendTitle}</div>
              <div className="bar" style={{ background: viridisCss }} />
              <div className="ticks"><span>{fmt(domain[0])}</span><span>5–95 %</span><span>{fmt(domain[1])}</span></div>
              {!preSlice && sel.realm === "bio" && <div className="hint">{stageRows.filter((r) => (sel.den === "per_10m2" ? r.n_10m2 : sel.den === "per_1000m3" ? r.n_1000m3 : r.n) > 0).map((r) => r.dataset_key).filter((v, i, a) => a.indexOf(v) === i).map(short).join(" + ") || "—"}{denInfo(sel.den ?? "raw").excluded ? ` · ${fmtN(denInfo(sel.den ?? "raw").excluded)} observations excluded` : ""}</div>}
            </div>
          </div>
          {card("section")}{card("cruise")}{card("station")}{card("timing")}
          {phone && <>
            <div className="phone-pills" style={{ bottom: SHEET_PEEK + 8 }}>
              <button type="button" className={`pill${sliceKey && !depthRows.length ? " muted" : ""}`} onClick={() => setSheet({ panel: "depth", detent: "half" })} data-tour="depth"><Icon name="ui-tune" />{depthSummary}</button>
              <button type="button" className="pill" onClick={() => setSheet({ panel: "years", detent: "half" })} data-tour="years"><Icon name="ui-years" />Years {years[0]}–{years[1]}<Sparkline values={yearsSpark} width={40} height={10} /></button>
              {(["section", "cruise", "station", "timing"] as CardId[]).filter((c) => cardOpen[c] && sheet.panel !== c).map((c) => <button key={c} type="button" className="pill" onClick={() => openCard(c)}><Icon name={icons[c]} />{c === "station" ? stationCard!.grid_key : c === "timing" ? "SQL & timing" : titles[c]}</button>)}
            </div>
            <Sheet detent={sheet.detent} onDetent={(d) => setSheet((s) => ({ ...s, detent: d }))} title={sheet.panel === "select" ? undefined : titles[sheet.panel]} onClose={sheet.panel === "select" ? undefined : closeSheet} data-tour="sheet"
              peek={sheet.panel === "select" ? <>
                <div className="sheet-summary" onClick={() => setSheet((s) => ({ ...s, detent: s.detent === "peek" ? "half" : "peek" }))}><Icon name={LENS_ICON[sel.lens]} /><Icon name={sel.realm === "bio" ? "realm-bio" : "realm-env"} /><span>{selectSummary}</span></div>
                {lensStrip}</> : sheet.panel === "years" ? seriesToggle : null}>
              {sheet.panel === "select" ? selectBody : body(sheet.panel, true)}
            </Sheet>
          </>}
        </div>
        {!phone && <Rail id="years" side="bottom" title="Years" icon="ui-years" folded={folded("years")} onFold={() => toggleFold("years")} maximized={maxId === "years"} onMax={() => toggleMax("years")} actions={seriesToggle} data-tour="years"
          summary={<>Years {years[0]}–{years[1]}<Sparkline values={yearsSpark} /></>}>{yearsBody}</Rail>}
        {!phone && <Rail id="depth" side="right" title="Depth" icon="ui-tune" folded={folded("depth")} onFold={() => toggleFold("depth")} maximized={maxId === "depth"} onMax={() => toggleMax("depth")} muted={!!sliceKey && !depthRows.length} pulse={depthPulse} data-tour="depth"
          summary={depthSummary}>{depthBody(false)}</Rail>}
        {maxId && <MaxPanel id={maxId} title={titles[maxId]} icon={icons[maxId]} onRestore={() => setSel({ max: null })} actions={actions(maxId)}>{body(maxId, true)}</MaxPanel>}
      </div>
    </div>
  );
}
