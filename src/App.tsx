// the shell: brand header, controls (lens · picker · years · stat), map + legend + status, depth strip,
// year strip, section / cruise / station panels, timing panel. every view is a pure function of the
// release slice + the URL. data comes from the release catalog (release.ts), never a hand-built path.
import { useEffect, useMemo, useRef, useState } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { engine, timing, hexExpr, type Mark, type Row } from "./engine";
import { buildLayers, MapView, quantileDomain, viridisCss, type GridCell, type StatRow } from "./map";
import { DepthStrip, YearStrip, SectionPlot, CruiseSeries, StationCard, type DepthRow, type YearRow, type SectionCell, type CruiseRow } from "./charts";
import { resolveVersion, fetchCatalog, fetchVersions, sources, sidecarUrl, type Catalog } from "./release";
import { buildBundle, saveBlob } from "./bundle";
import {
  fromUrl, toUrl, defaultStage, defaultDen, LENSES, LENS_TITLE, LENS_SHORT, LAYERS, ENV_VARS_FALLBACK, VAL_COL, DEN_LABEL, STAT_LABEL,
  type Sel, type Lens, type Den, type Stat, type PickerRow,
} from "./state";

const DS_SHORT: Record<string, string> = {
  swfsc_ichthyo: "ichthyo", swfsc_cufes: "CUFES", calcofi_bottle: "bottle", "calcofi_ctd-cast": "CTD", calcofi_dic: "DIC", calcofi_mets: "METS",
  "cce-lter_zoodb": "zoodb", "cce-lter_zooscan": "zooscan", "cce-lter_euphausiids": "euphausiids", calcofi_phytoplankton: "phyto",
  calcofi_phyllosoma: "phyllosoma", "sio_mesopelagic-fish": "mesopelagic", "farallon_bird-mammal": "farallon", "cdfw_dungeness-crab": "dungeness",
  "sio_pic-zooplankton": "PIC", "calcofi_picoplankton": "picoplankton",
};
const short = (d: string) => DS_SHORT[d] ?? d;
const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const fmtN = (v: number) => v.toLocaleString();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// registered buffer names: the SQL templates read these (`{{src}}` etc.), never a URL
const REG = { obs_bio: "obs_bio.parquet", sample_root: "sample_root.parquet", sample_spatial: "sample_spatial.parquet", taxon: "taxon.parquet", measurement_type: "measurement_type.parquet", dataset: "dataset.parquet" } as const;
const envReg = (v: string) => `obs_env_${v}.parquet`;
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
  const [envVars, setEnvVars] = useState<{ key: string; label: string; n: number }[]>([]);
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
  const lensClickAt = useRef<number | null>(null);
  const opened = useRef(false);
  const gen = useRef(0);
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
        fetch(sidecarUrl(v, "grid.geojson")).then((r) => r.json()),
        fetch(sidecarUrl(v, "coverage.json")).then((r) => r.json()) as Promise<Coverage>,
      ]);
      const cells: GridCell[] = gj.features.map((f: any) => ({
        grid_key: f.properties.grid_key, line: f.properties.line, station: f.properties.station, home: [f.properties.lon_ctr, f.properties.lat_ctr],
      })).sort((a: GridCell, b: GridCell) => a.line - b.line || a.station - b.station);
      setGrid(cells); setCov(cv);
      timing.add("fetch:sidecars", performance.now() - t, `${cells.length} cells · coverage ${cv.datasets.length} datasets`);
      // the engine + the objects every lens needs, in parallel with the paint
      setStatus("engine warming…");
      ensure(REG.obs_bio); ensure(REG.taxon); ensure(REG.measurement_type); ensure(REG.sample_spatial); ensure(REG.dataset);
      if (sel.realm === "env") ensure(envReg(sel.var));
      Promise.all([ensure(REG.obs_bio), ensure(REG.taxon)])
        .then(() => engine.query("taxa", { src: q(REG.obs_bio), taxon_src: q(REG.taxon) })).then((r) => setTaxa(r.slice(0, 400)));
      Promise.all([ensure(REG.measurement_type), ensure(REG.dataset)]).then(async () => {
        const mt = await engine.exec(`SELECT measurement_type, description, units FROM ${q(REG.measurement_type)}`, "measurement_type");
        const lab = new Map(mt.map((r) => [r.measurement_type, r]));
        const env = cv.variables.filter((x) => x.realm === "env");
        const byType = new Map<string, number>();
        for (const x of env) byType.set(x.measurement_type, (byType.get(x.measurement_type) ?? 0) + x.n_obs);
        setEnvVars([...byType.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
          const m = lab.get(k); return { key: k, label: `${m?.description ?? ENV_VARS_FALLBACK[k] ?? k}${m?.units ? ` (${m.units})` : ""}`, n };
        }));
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
      const file = sel.realm === "bio" ? REG.obs_bio : envReg(sel.var);
      setStatus(`fetching ${file}…`);
      await ensure(file);
      if (g !== gen.current) return;
      setStatus("building slice…");
      const t = performance.now();
      await (sel.realm === "bio" ? engine.query("slice_bio", { src: q(file), taxon: sel.taxon }) : engine.query("slice_env", { src: q(file), var: sel.var }));
      const rows = (await engine.query("picker", {})) as PickerRow[];
      if (g !== gen.current) return;
      timing.add(`slice:${key}`, performance.now() - t, `${fmtN(rows.reduce((a, r) => a + r.n, 0))} rows`);
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
  const params = useMemo(() => ({
    val, y0: sel.years[0], y1: sel.years[1], d0: sel.depth[0], d1: sel.depth[1], stage: sel.realm === "bio" ? sel.stage : null,
  }), [val, sel.years, sel.depth, sel.stage, sel.realm]);

  useEffect(() => {
    if (!sliceKey || (sel.realm === "bio" && !sel.den)) return;
    const g = gen.current;
    const lens = sel.lens;
    (async () => {
      const t = performance.now();
      const need_station = !opened.current || lens === "station";
      if (need_station) setStationRows(await engine.query("station", params));
      if (lens === "hex") setHexRows(await engine.query("hex", { ...params, hex: hexExpr(sel.res) }));
      if (lens === "region") {
        await ensure(REG.sample_spatial); await ensure(REG.sample_root);
        setRegionRows(await engine.query("region", { ...params, layer: sel.layer, spatial_src: q(REG.sample_spatial) }));
        const rs = await engine.query("region_station", { layer: sel.layer, root_src: q(REG.sample_root), spatial_src: q(REG.sample_spatial) });
        setRegionStation(new Map(rs.map((r) => [r.grid_key, r.spatial_key])));
      }
      if (lens === "cruise") {
        const cr = (await engine.query("cruise", params)) as CruiseRow[];
        setCruiseRows(cr);
        let ck = sel.cruise && cr.some((c) => c.cruise_key === sel.cruise) ? sel.cruise : null;
        if (!ck && cr.length) ck = cr.slice().sort((a, b) => b.n_sta - a.n_sta || b.t0 - a.t0)[0].cruise_key;
        if (ck !== sel.cruise) { setSel({ cruise: ck }); return; } // the effect re-runs once with the cruise set
        if (ck) {
          await ensure(REG.sample_root);
          const tr = await engine.query("cruise_track", { cruise: ck, root_src: q(REG.sample_root) });
          if (tr.length > 1) {
            const t0 = tr[0].t, t1 = tr[tr.length - 1].t || t0 + 1;
            setTrack({ path: tr.map((r) => [r.longitude, r.latitude]), ts: tr.map((r) => ((r.t - t0) / (t1 - t0)) * 1000) });
          } else setTrack(null);
          setCruiseSamples(await engine.query("cruise_samples", { ...params, cruise: ck }));
        }
      }
      if (lens === "section") {
        const cs = await engine.query("section_cruises", { ...params, line: sel.line });
        setSectionCruises(cs);
        let ck = sel.cruise && cs.some((c) => c.cruise_key === sel.cruise) ? sel.cruise : null;
        if (!ck && cs.length) ck = cs[0].cruise_key;
        if (ck !== sel.cruise) { setSel({ cruise: ck }); return; }
        if (sel.realm === "env") {
          const sc = ck ? await engine.query("section", { ...params, line: sel.line, cruise: ck }) : [];
          setSectionCells(sc.map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n })));
          const cl = await engine.query("section_clim", { ...params, line: sel.line });
          setClimCells(cl.map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n })));
        } else {
          const sc = await engine.query("section_bio", { ...params, line: sel.line });
          setSectionCells(sc.map((r) => ({ station: r.station, y: r.year, v: r.v, n: r.n })));
          setClimCells(null);
        }
      }
      setDepthRows((await engine.query("depth_strip", params)) as DepthRow[]);
      setYearRows((await engine.query("years", params)) as YearRow[]);
      if (g !== gen.current) return;
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
  const stageRows = picker.filter((r) => sel.realm === "env" || r.life_stage === sel.stage);
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
  const inView = stageRows.reduce((a, r) => a + (sel.den === "per_10m2" ? r.n_10m2 : sel.den === "per_1000m3" ? r.n_1000m3 : r.n), 0);
  const envVar = envVars.find((v) => v.key === sel.var);
  const unitLabel = sel.realm === "bio" ? (sel.den === "raw" ? "count" : sel.den === "per_10m2" ? "per 10 m²" : "per 1000 m³") : (picker[0]?.units ?? sel.var);
  const taxonRow = taxa.find((t) => t.taxon_key === sel.taxon);
  const legendTitle = preSlice ? "root samples · all datasets (coverage.json, before the engine is warm)" : sel.realm === "bio"
    ? `${STAT_LABEL[stat]} · ${taxonRow?.common_name ?? taxonRow?.scientific_name ?? sel.taxon} · ${sel.stage ?? "all stages"} · ${unitLabel}`
    : `${STAT_LABEL[stat]} · ${envVar?.label ?? sel.var} · ${sel.depth[0]}–${sel.depth[1]} m`;
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
  const getTooltip = (info: PickingInfo) => {
    const o: any = info.object; if (!o) return null;
    const id = info.layer?.id;
    if (id === "stations") { const s = stationMap.get(o.grid_key); return { text: `${o.grid_key} · line ${o.line} station ${o.station}\n${s ? (preSlice ? `${fmtN(s.n)} root samples, all datasets` : `${STAT_LABEL[stat]} ${fmt(statOf(s))} · ${s.n} rows · ${s.n_samples} samples · ${s.y0}–${s.y1}`) : "no rows in selection"}\nclick for the station's coverage card` }; }
    if (id === "hexes") return { text: `${o.hex}\n${STAT_LABEL[stat]} ${fmt(statOf(o))} · ${o.n} rows · ${o.n_samples} samples` };
    if (id === "regions") { const s = regionStats.get(o.properties.spatial_key); return { text: `${o.properties.name}\n${s ? `${STAT_LABEL[stat]} ${fmt(statOf(s))} · ${s.n} rows · ${s.n_samples} samples · ${s.y0}–${s.y1}` : "no data"}` }; }
    if (id === "cruise-samples") return { text: `${o.grid_key ?? "—"} · ${new Date(o.t * 1000).toISOString().slice(0, 10)}\n${STAT_LABEL[stat]} ${fmt(statOf(o))} · ${o.n} rows` };
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

  return (
    <div className="app">
      <header className="cc-header">
        <a className="cc-home" href="https://calcofi.io" aria-label="CalCOFI.io home">
          <img className="cc-logo-dark" src="https://calcofi.io/brand/v1/logo_calcofi.svg" alt="CalCOFI" width="32" height="32" />
          <img className="cc-logo-light" src="https://calcofi.io/brand/v1/logo_calcofi_light.svg" alt="CalCOFI" width="32" height="32" />
        </a>
        <a className="cc-title" href="./">CalCOFI Explorer<small>{LENS_TITLE[sel.lens]}</small></a>
        <a className="cc-release" href={`https://calcofi.io/db-schema/#erd?v=${rel}`} title="CalCOFI integrated database release — every value shown comes from this frozen release; schema and release notes">release <b>{rel}</b></a>
        {versions.length > 1 && <select className="cc-versions" value={version ?? ""} onChange={(e) => { setSel({ release: e.target.value }); location.search = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), release: e.target.value }).toString(); }} title="switch release (reloads)">
          {versions.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
        <span className="cc-spacer" />
        <nav className="cc-links"><a href="https://calcofi.io/db-query/">query</a><a href="https://calcofi.io/db-schema/">schema</a><a href="https://calcofi.io/docs/">docs</a></nav>
        <button className="cc-theme-toggle" type="button" aria-label="Toggle dark / light theme">🌓</button>
      </header>
      <div className="main">
        <div className="panel controls">
          <div className="lenses">
            {LENSES.map((l) => <button key={l} className={sel.lens === l ? "on" : ""} onClick={() => onLens(l)}>{LENS_SHORT[l]}</button>)}
          </div>
          {sel.lens === "hex" && <div className="row"><span className="hint">H3 res</span><span className="seg">{[3, 4, 5, 6, 7].map((r) => <button key={r} className={sel.res === r ? "on" : ""} onClick={() => { lensClickAt.current = performance.now(); setSel({ res: r }); }}>{r}</button>)}</span></div>}
          <div className="row"><span className="seg">
            <button className={sel.realm === "bio" ? "on" : ""} onClick={() => setSel({ realm: "bio" })}>taxon</button>
            <button className={sel.realm === "env" ? "on" : ""} onClick={() => setSel({ realm: "env", cruise: null })}>variable</button>
          </span></div>
          {sel.realm === "bio" ? <>
            <label className="f">taxon
              <select value={sel.taxon} onChange={(e) => setSel({ taxon: e.target.value, stage: null, den: null, cruise: null })}>
                {!taxa.length && <option value={sel.taxon}>{sel.taxon}</option>}
                {taxa.map((t) => <option key={t.taxon_key} value={t.taxon_key}>{t.common_name ? `${t.common_name} — ${t.scientific_name}` : t.scientific_name ?? t.taxon_key} ({fmtN(t.n)})</option>)}
              </select></label>
            <label className="f">life stage
              <select value={sel.stage ?? ""} onChange={(e) => { const st = e.target.value || null; setSel({ stage: st, den: defaultDen(picker, st) }); }}>
                {stages.map(([s, n]) => <option key={s ?? "null"} value={s ?? ""}>{s ?? "(none)"} ({fmtN(n)})</option>)}
              </select></label>
            <div className="den"><h4>denominator</h4>
              {(["per_10m2", "per_1000m3", "raw"] as Den[]).map((d) => { const i = denInfo(d); return (
                <label key={d} className={i.rows === 0 ? "off" : ""}>
                  <input type="radio" name="den" checked={sel.den === d} disabled={i.rows === 0} onChange={() => setSel({ den: d })} />
                  {DEN_LABEL[d]}<br /><span className="hint">{i.ok.map(short).join(", ") || "no dataset"}{i.excluded > 0 ? ` · ${fmtN(i.excluded)} rows excluded` : ""}{i.off.length ? ` (${i.off.map(short).join(", ")} cannot)` : ""}</span>
                </label>); })}
            </div>
            <div className="pills">
              {picker.length === 0 && <span className="pill off">{status}</span>}
              {[...new Map(picker.map((r) => [`${r.dataset_key}|${r.life_stage}`, r])).keys()].map((k) => {
                const rs = picker.filter((r) => `${r.dataset_key}|${r.life_stage}` === k); const r0 = rs[0];
                const n = rs.reduce((a, r) => a + r.n, 0); const raw = rs.every((r) => r.effort_class === "raw_count_no_effort");
                return <span key={k} className={`pill ${r0.life_stage === sel.stage ? "" : "off"} ${raw ? "warn" : ""}`} title={raw ? "raw count, no effort in release" : rs.map((r) => `${r.tow_type ?? "—"}: ${r.n}`).join(", ")}>{short(r0.dataset_key)} {r0.life_stage ?? "—"} {fmtN(n)}{raw ? " ⚠" : ""}</span>;
              })}
            </div>
            <div className="hint">{fmtN(inView)} rows in view · {sel.den === "raw" ? "raw counts are not comparable across gear or datasets" : "nothing averaged across denominators, datasets or stages"}</div>
          </> : <>
            <label className="f">variable ({envVars.length || "…"} in this release)
              <select value={sel.var} onChange={(e) => setSel({ var: e.target.value, cruise: null })}>
                {!envVars.length && <option value={sel.var}>{sel.var}</option>}
                {envVars.map((v) => <option key={v.key} value={v.key}>{v.label} · {fmtN(v.n)}</option>)}</select></label>
            <div className="pills">{picker.map((r) => <span key={r.dataset_key} className="pill" title="bottle and CTD values of one variable are comparable">{short(r.dataset_key)} {fmtN(r.n)}{r.n_flagged ? ` · ${fmtN(r.n_flagged)} flagged` : ""}</span>)}</div>
          </>}
          <div className="row">
            <label className="f">years <span className="row"><input type="number" style={{ width: 62 }} value={sel.years[0]} min={1949} max={2023} onChange={(e) => setSel({ years: [+e.target.value, sel.years[1]] })} />–<input type="number" style={{ width: 62 }} value={sel.years[1]} min={1949} max={2023} onChange={(e) => setSel({ years: [sel.years[0], +e.target.value] })} /></span></label>
            <label className="f">stat<select value={stat} onChange={(e) => setSel({ stat: e.target.value as Stat })}>{Object.entries(STAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="row"><span className="hint">depth band {sel.depth[0]}–{sel.depth[1]} m (brush the strip)</span>{(sel.depth[0] !== 0 || sel.depth[1] !== 500) && <button className="pill" onClick={() => setSel({ depth: [0, 500] })}>reset</button>}</div>
          {sel.lens === "region" && <>
            <label className="f">layer<select value={sel.layer} onChange={(e) => setSel({ layer: e.target.value, region: null })}>{(spatial.length ? [...new Set(spatial.map((f) => f.properties.layer))].sort() : LAYERS).map((l) => <option key={l}>{l}</option>)}</select></label>
            <div className="pills">{regionRows.slice().sort((a, b) => b.n - a.n).slice(0, 10).map((r) => <span key={r.spatial_key} className={`pill ${sel.region === r.spatial_key ? "" : "off"}`} onClick={() => setSel({ region: sel.region === r.spatial_key ? null : r.spatial_key })} style={{ cursor: "pointer" }}>{r.spatial_name} · {fmt(statOf(r))} ({fmtN(r.n)})</span>)}</div>
            <div className="hint">{layerFeatures.length} polygons · {regionRows.length} with data · membership exact per root sample (sample_spatial)</div>
          </>}
          {sel.lens === "section" && <>
            <label className="f">line<select value={sel.line} onChange={(e) => setSel({ line: +e.target.value, cruise: null })}>{lines.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="f">cruise<select value={sel.cruise ?? ""} onChange={(e) => setSel({ cruise: e.target.value })}>{sectionCruises.map((c) => <option key={c.cruise_key} value={c.cruise_key}>{c.cruise_key} ({c.n_sta} sta)</option>)}</select></label>
            {sel.realm === "env" && <label className="row" style={{ fontSize: 12 }}><input type="checkbox" checked={sel.anom} onChange={(e) => setSel({ anom: e.target.checked })} /> anomaly vs climatology ({sel.years[0]}–{sel.years[1]})</label>}
          </>}
          {sel.lens === "cruise" && <>
            <label className="f">cruise<select value={sel.cruise ?? ""} onChange={(e) => setSel({ cruise: e.target.value })}>{cruiseRows.slice().reverse().map((c) => <option key={c.cruise_key} value={c.cruise_key}>{c.cruise_key} ({c.n_sta} sta, {c.n} rows)</option>)}</select></label>
            <div className="hint">{track ? `${track.path.length} root sampling events on the track` : "no track"}</div>
          </>}
          {stationCard && <div className="station-card">
            <div className="row" style={{ justifyContent: "space-between" }}><b>{stationCard.grid_key}</b><span className="hint">line {stationCard.cell?.line} · station {stationCard.cell?.station}</span><button className="pill" onClick={() => setSel({ station: null })}>×</button></div>
            <StationCard summary={stationCard.summary} detail={stationCard.detail} theme={theme} short={short} />
          </div>}
          <div className="row" style={{ marginTop: 4 }}>
            <button className="pill" disabled={!sliceKey || !!bundling} onClick={download} title="README · CITATION · summary (+GeoJSON) · observations (parquet/CSV) · the exact SQL against the release's object URLs · reproduce.R / .py">
              {bundling ? `bundle: ${bundling}` : "⬇ download bundle"}</button>
          </div>
          <div className="hint" style={{ marginTop: "auto" }}>{LENS_TITLE[sel.lens]}. Release {rel}{catalog ? ` · ${catalog.tables.length} tables` : ""} · DuckDB-WASM in a worker, no extensions, objects fetched whole from the release catalog.</div>
        </div>
        <div className="panel mapwrap">
          <MapView layers={layers} theme={theme} getTooltip={getTooltip} onClick={onClick} onFirstFrame={() => timing.add("first_paint", performance.now() - window.__t0, "basemap + grid dots")} />
          <div className="status"><b>{status}</b>{sliceKey ? ` · ${fmtN(inView)} rows` : ""}</div>
          <div className="legend">
            <div className="ttl">{legendTitle}</div>
            <div className="bar" style={{ background: viridisCss }} />
            <div className="ticks"><span>{fmt(domain[0])}</span><span>5–95 %</span><span>{fmt(domain[1])}</span></div>
            {!preSlice && sel.realm === "bio" && <div className="hint">{stageRows.filter((r) => (sel.den === "per_10m2" ? r.n_10m2 : sel.den === "per_1000m3" ? r.n_1000m3 : r.n) > 0).map((r) => r.dataset_key).filter((v, i, a) => a.indexOf(v) === i).map(short).join(" + ") || "—"}{denInfo(sel.den ?? "raw").excluded ? ` · ${fmtN(denInfo(sel.den ?? "raw").excluded)} rows excluded` : ""}</div>}
          </div>
          {displayLens === "section" && <div className="section-panel">
            <SectionPlot cells={sectionCells} clim={climCells} anom={sel.anom && sel.realm === "env"} yLabel={sel.realm === "env" ? "depth (m)" : "year"} theme={theme} unit={unitLabel}
              title={`line ${sel.line} · ${sel.realm === "env" ? `cruise ${sel.cruise ?? "—"}${sel.anom ? " · anomaly vs climatology" : ""}` : "all cruises · tows are depth-integrated, so y is year"}`} />
          </div>}
          {displayLens === "cruise" && <div className="cruise-panel">
            <CruiseSeries rows={cruiseRows} stat={stat} selected={sel.cruise} theme={theme} unit={unitLabel} onPick={(k) => setSel({ cruise: k })} />
          </div>}
          <details className="timing">
            <summary>timing · {anyCached ? "warm" : "cold"} · paint {firstPaint ?? "…"} · ready {readyAt ?? "…"} · query {lastQ ? lastQ.ms : "…"} · switch {grain ? grain.ms : "…"} ms</summary>
            <div className="hint" style={{ padding: "0 8px" }}>{anyCached ? "objects from cache" : "first visit"} · {navigator.hardwareConcurrency} cores{(navigator as any).deviceMemory ? ` · ${(navigator as any).deviceMemory} GB` : ""}</div>
            <table><tbody>
              <tr><td>first paint (&lt; 1 s)</td><td className={`ms ${go(firstPaint, 1000)}`}>{firstPaint ?? "…"} ms</td></tr>
              <tr><td>engine + slice ready</td><td className="ms">{readyAt ?? "…"} ms</td></tr>
              <tr><td>first lens query (&lt; 4 s cold)</td><td className={`ms ${go(firstQ?.ms, 4000)}`}>{firstQ ? `${firstQ.ms} ms` : "…"}</td></tr>
              <tr><td>last lens query (&lt; 100 ms warm)</td><td className={`ms ${go(lastQ?.ms, 100)}`}>{lastQ ? `${lastQ.ms} ms (${lastQ.name.slice(6)})` : "…"}</td></tr>
              <tr><td>grain switch (&lt; 300 ms)</td><td className={`ms ${go(grain?.ms, 300)}`}>{grain ? `${grain.ms} ms` : "…"}</td></tr>
              {marks.map((m, i) => <tr key={i}><td>{m.name}{m.note ? <span className="hint"> {m.note}</span> : null}</td><td className="ms">{m.ms} ms <span className="hint">@{m.at}</span></td></tr>)}
            </tbody></table>
            <pre>{lastSql}</pre>
          </details>
        </div>
        <div className="panel depth">
          <DepthStrip rows={depthRows} band={sel.depth} theme={theme} unit={unitLabel} onBand={(b) => setSel({ depth: b ?? [0, 500] })} />
        </div>
        <div className="panel strip">
          <YearStrip rows={yearRows} years={sel.years} theme={theme} mode={seriesMode} unit={unitLabel} onYears={(y) => setSel({ years: y ?? [1949, 2023] })} />
          <span className="seg strip-mode"><button className={seriesMode === "n" ? "on" : ""} onClick={() => setSeriesMode("n")}>rows</button><button className={seriesMode === "mean" ? "on" : ""} onClick={() => setSeriesMode("mean")}>mean ± se</button></span>
        </div>
      </div>
    </div>
  );
}
