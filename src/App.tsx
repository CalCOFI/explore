// the shell: brand header, controls (lens · picker · years · stat), map + legend + status, depth strip,
// year strip, section / cruise / station panels, timing panel. every view is a pure function of the
// release slice + the URL. data comes from the release catalog (release.ts), never a hand-built path.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { engine, timing, hexExpr, datasetFilterSql, type Mark, type Row } from "./engine";
import { UNIFIED, members, setUnified, unifiedDefs } from "./variables";
import { buildLayers, MapView, quantileDomain, colorScale, type GridCell, type StatRow, type LayerInputs } from "./map";
import { computeSurface, surfaceImage, isolines, niceLevels, cellToLonLat, cellValue, landMask, MASK_KM, type Surface as SurfaceResult } from "./contour";
import { LensPicker } from "./lenspicker";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import { defaultRamp, rampCss } from "./ramps";
import { DepthStrip, YearStrip, SectionPlot, CruiseSeries, StationCard, MONTH_LOD_YEARS, type DepthRow, type YearRow, type SectionCell, type CruiseRow, type GanttRow, type StripMode } from "./charts";
import { resolveVersion, fetchCatalog, fetchVersions, sources, sidecarUrl, earlySidecar, type Catalog } from "./release";
import { buildBundle, saveBlob, copyAs } from "./bundle";
import { Icon } from "./icons";
import { Picker, type PickerItem, type GroupOpt } from "./picker";
import { Menu, Group } from "./ui";
import { Panel, EdgePills, MaxPanel, Sheet, Sparkline, VSpark, SHEET_PEEK, type CardId, type CardBox, type Detent, type Dock, type EdgePill } from "./panels";
import { Sentence } from "./sentence";
import { LayersCard } from "./layers";
import { Curtain3D } from "./curtain";
import { bathyFromSel, bathyOn, boundaryLayerIds, isPalette, PALETTES, type BoundaryState, type SpatialLayerDef, type SpatialLayers } from "./basemap";
import spatialFallback from "./spatial_layers.fallback";
import type { IconName } from "./icons";
import { Welcome, About, seenWelcome, markWelcome, markCiteAck } from "./help";
import { fromUrl as selFromUrl } from "./state";
import { SourcesLine, SourcesModal } from "./sources";
import { citeBibtex, citeText } from "./cite";
import { FeedbackDialog } from "./feedback";
import { startTour, type TourActions } from "./tour";
import { IconButton, type MenuItem } from "./ui";
import { figureName, plotPng, plotSvg, csvBlob, copyImage, stampLines, type Stamp } from "./export";
import { captureView, canvasBlob, luminanceStats, blobStats } from "./capture";
import { track as trackEvent } from "./track";
import { BRAND, LOGO, DEFAULT_THEME, fontEmbedCss } from "./brand";
import { categoryRank, categoryIcon, envCategory, DATASET_CATEGORY_FALLBACK } from "./categories";
import {
  fromUrl, toUrl, defaultStage, defaultDen, LENSES, LENS_TITLE, LENS_SHORT, LENS_DESC, LENS_ICON, RES_KM, INTERPS, INTERP_LABEL, INTERP_WORD, INTERP_HOW, SURFACES, SURFACE_LABEL, GRAIN_LABEL, GRAIN_HOW, type Surface, type Grain, ENV_VARS_FALLBACK, VAL_COL, DEN_LABEL, DEN_HOW, SHF_NOTE, STAT_LABEL, YEAR_OPEN, MAP_HOME,
  type Sel, type Lens, type Den, type Stat, type PickerRow, type PanelId,
} from "./state";
type FigureId = PanelId | "map"; // what exports PNG · SVG · CSV from a header: every panel, and the map from its own ⬇
type Tab = "select" | "refine" | "share"; // the Select panel's tabs (the light layout, 2026-09-06)
type ModalId = "welcome" | "about" | "feedback" | "product" | "sources"; // "product" is the feedback dialog's second kind (WS-A3)

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
const fmtYear = (v: number) => String(Math.round(v)); // a year reads 1951, not 1,951.27
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const native = new URLSearchParams(location.search).get("native") === "1"; // D13: the plain <select> fallback, one release
const phoneQuery = matchMedia("(max-width: 899px)");

// registered buffer names: the SQL templates read these (`{{src}}` etc.), never a URL
const REG = { obs_bio: "obs_bio.parquet", sample_root: "sample_root.parquet", sample_spatial: "sample_spatial.parquet", taxon: "taxon.parquet", measurement_type: "measurement_type.parquet", dataset: "dataset.parquet", cruise: "cruise.parquet", provider: "provider.parquet" } as const;
const envReg = (v: string) => `obs_env_${v}.parquet`;
// the release's `climatology` table, one hive object per measurement type like obs_env (calcofi4db::build_climatology())
const climReg = (v: string) => `climatology_${v}.parquet`;
const hasClim = (cat: Catalog | null) => !!cat?.tables.some((t) => t.name === "climatology");
const ZEROS_TIP = `Datasets such as ichthyo record a tow only when it caught the taxon, so a mean over their records alone is a mean over positive tows — biased high, and a surveyed year with no catch looks like a year with no survey.
By default every tow such a dataset sampled counts as 0 for this taxon (a "zero-filled tow": obs_id NULL in the export; never counted as an observation).
positive-only turns that off: mean, median and se run over the tows with a catch, as the raw records do. Datasets that record their own zeros (CUFES, ZooScan, ZooDB, phyllosoma) read the same either way.`;
// an env variable's source: the union of its member objects, each stamped with its measurement_type (the hive key)
const envSrc = (key: string) => `(${members(key).map((m) => `SELECT *, '${m}' AS measurement_type FROM '${envReg(m)}'`).join(" UNION ALL ")})`;
// the variable's member types that have a baseline object (a type with no cell >= 3 cruises has no partition)
const climMembers = (cat: Catalog, key: string) => { const parts = sources(cat, "climatology").partitions; return members(key).filter((m) => parts.has(m)); };
const climSrc = (ms: string[]) => `(${ms.map((m) => `SELECT *, '${m}' AS measurement_type FROM '${climReg(m)}'`).join(" UNION ALL ")})`;
const q = (name: string) => `'${name}'`;

export interface Coverage {
  version: string;
  datasets: { dataset_key: string; realm: string; n_obs: number; n_roots: number; year_min: number; year_max: number }[];
  stations: { grid_key: string; datasets: { dataset_key: string; n_obs: number; n_roots: number; year_min: number; year_max: number }[] }[];
  years: { dataset_key: string; year: number; n_obs: number; n_roots: number }[];
  variables: { dataset_key: string; realm: string; measurement_type: string; n_obs: number; n_roots: number; year_min: number; year_max: number; depth_min_m: number | null; depth_max_m: number | null; category?: string | null; variable?: string | null }[];
  // since calcofi4db 3.25.0 (plan D14): one row per taxon, so the organism list opens before the engine is warm
  taxa?: { taxon_key: string; scientific_name: string | null; common_name: string | null; rank: string | null; class: string | null; n_obs: number; n_roots: number; year_min: number | null; year_max: number | null; life_stages: string[]; datasets: { dataset_key: string; n_obs: number; n_roots: number; year_min: number; year_max: number }[] }[];
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
  const [theme, setTheme] = useState<"dark" | "light">(document.documentElement.dataset.theme === "light" ? "light" : document.documentElement.dataset.theme === "dark" ? "dark" : DEFAULT_THEME);
  const [version, setVersion] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cov, setCov] = useState<Coverage | null>(null);
  const [covStations, setCovStations] = useState<CoverageStations | null>(null);
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [spatial, setSpatial] = useState<any[]>([]);
  const [spatialLayers, setSpatialLayers] = useState<SpatialLayers>(spatialFallback as unknown as SpatialLayers);
  // D36: `layers=` may carry a `data` entry — the data layer's place in the draw order (top-first); absent = on top.
  // deck draws under the boundary immediately above it: that entry's first MapLibre layer (fill before line)
  const dataBeforeId = useMemo(() => {
    const ls = sel.layers ?? []; const i = ls.findIndex((l) => l.id === "data"); if (i <= 0) return undefined;
    const above = ls[i - 1]; const d = spatialLayers.layers.find((x) => x.id === above.id); if (!d) return undefined;
    return d.geom === "polygon" ? `sp-${above.id}-fill` : d.geom === "line" ? `sp-${above.id}-line` : `sp-${above.id}-circle`;
  }, [sel.layers, spatialLayers]);
  const [taxa, setTaxa] = useState<Row[]>([]);
  const [mt, setMt] = useState<Map<string, { description: string; units: string }>>(new Map());
  const [yearsEdit, setYearsEdit] = useState(false);
  const [phone, setPhone] = useState(phoneQuery.matches);
  const [datasets, setDatasets] = useState<Row[]>([]);
  const [providerTable, setProviderTable] = useState<Map<string, string> | null>(null); // provider -> provider_short, when the release carries the registry
  const [picker, setPicker] = useState<PickerRow[]>([]);
  const [sliceKey, setSliceKey] = useState<string | null>(null);
  const [status, setStatus] = useState("grid (static)");
  const [lensReady, setLensReady] = useState(false); // the first lens has answered: from here an empty result is "nothing in the selection", never the coverage cube
  const [marks, setMarks] = useState<Mark[]>(timing.marks);
  const [stationRows, setStationRows] = useState<Row[]>([]);
  const [hexRows, setHexRows] = useState<Row[]>([]);
  const [regionRows, setRegionRows] = useState<Row[]>([]);
  const [regionStation, setRegionStation] = useState<Map<string, string>>(new Map());
  const [cruiseRows, setCruiseRows] = useState<CruiseRow[]>([]);
  const [track, setTrack] = useState<{ path: [number, number][]; ts: number[]; events: number } | null>(null);
  const [cruiseSamples, setCruiseSamples] = useState<Row[]>([]);
  const [sectionCells, setSectionCells] = useState<SectionCell[]>([]);
  const [climCells, setClimCells] = useState<SectionCell[] | null>(null);
  const [climWindow, setClimWindow] = useState<[number, number] | null>(null);   // the table's clim_yr_min–clim_yr_max
  const [sectionCruises, setSectionCruises] = useState<Row[]>([]);
  const [depthRows, setDepthRows] = useState<DepthRow[]>([]);
  const [yearRows, setYearRows] = useState<YearRow[]>([]);
  const [surf, setSurf] = useState<SurfaceResult | null>(null); // the contour lens's interpolated surface (contour.worker.ts)
  const surfGen = useRef(0);
  const [castRows, setCastRows] = useState<Row[]>([]);          // the site grain: one row per site (contour_cast.sql)
  const [land, setLand] = useState<{ key: string; mask: Uint8Array } | null>(null); // the land clip for the surface's grid (Natural Earth land, D42)
  const overlayRef = useRef<MapboxOverlay | null>(null);        // the deck overlay, driven directly by the cruise playback (D37)
  const [lastSql, setLastSql] = useState("");
  const [bundling, setBundling] = useState<string | null>(null);
  const [ylog, setYlog] = useState(false);
  const [monthRows, setMonthRows] = useState<YearRow[] | null>(null);
  const [needMonths, setNeedMonths] = useState(false);
  const [ganttRows, setGanttRows] = useState<CruiseRow[]>([]);
  const [cruiseRef, setCruiseRef] = useState<Map<string, { ship: string; nodc: string }> | null>(null);
  const [seasonEdit, setSeasonEdit] = useState(false);
  // advanced: the timing marks + the last SQL, behind a gear (off by default; ?timing=1 opens it)
  const [advanced, setAdvanced] = useState<boolean>(() => new URLSearchParams(location.search).get("timing") === "1");
  // the Select panel: three tabs (Select · Refine · Share) and one disclosure, More options, that REMEMBERS its state per
  // browser — an expert opens it once and it stays open; a newcomer meets the panel without the expert controls.
  const [tab, setTab] = useState<Tab>("select");
  const [more, setMoreRaw] = useState<boolean>(() => { try { return localStorage.getItem("explore.more") === "1"; } catch { return false; } });
  const setMore = (v: boolean) => { setMoreRaw(v); try { localStorage.setItem("explore.more", v ? "1" : "0"); } catch { /* private mode */ } };
  // the tour's "open this for its step": More options, the Share tab, the Refine tab
  const expand = (k: "filters" | "export" | "denominator") => { if (k === "denominator") setMore(true); else setTab(k === "export" ? "share" : "refine"); };
  // the years strip's mode lives in the URL (`strip=`), so a welcome question can ask for the mean or the cruise calendar
  const seriesMode: StripMode = sel.strip ?? "n";
  const setSeriesMode = (m: StripMode) => setSel({ strip: m === "n" ? null : m });
  // the title sentence, open as chips: one control surface at a time (opening it folds the Select panel)
  const [sentenceOpen, setSentenceOpen] = useState(false);
  const [pickerSignal, setPickerSignal] = useState(0); // a welcome door opens the organism / variable picker
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
        } else if (name.startsWith("climatology_")) {
          const v = name.slice(12, -8);
          u = sources(cat, "climatology").partitions.get(v);
          if (!u) return Promise.reject(new Error(`climatology has no object for ${v} in ${cat.version}`));
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
      // the release's cross-dataset crosswalk (measurement_type.variable) supersedes src/variables.ts once it is there
      const byVar = new Map<string, Set<string>>();
      for (const x of cv.variables) if (x.realm === "env" && x.variable) (byVar.get(x.variable) ?? byVar.set(x.variable, new Set()).get(x.variable)!).add(x.measurement_type);
      const defs = [...byVar.entries()].filter(([, m]) => m.size > 1).map(([key, m]) => ({ key, label: UNIFIED.find((u) => u.key === key)?.label ?? key, members: [...m].sort() }));
      if (defs.length) { setUnified(defs); timing.add("variables:release", 0, `${defs.length} unified variables from coverage.json`); }
      timing.add("fetch:sidecars", performance.now() - t, `${cells.length} cells · coverage ${cv.datasets.length} datasets`);
      // the engine + the objects every lens needs, in parallel with the paint
      setStatus("engine warming…");
      ensure(REG.obs_bio); ensure(REG.taxon); ensure(REG.measurement_type); ensure(REG.sample_spatial); ensure(REG.dataset);
      if (sel.realm === "env") for (const m of members(sel.var)) ensure(envReg(m)); // after setUnified(), so the members are the release's
      Promise.all([ensure(REG.obs_bio), ensure(REG.taxon)])
        .then(() => engine.query("taxa", { src: q(REG.obs_bio), taxon_src: q(REG.taxon) })).then((r) => setTaxa(r));
      Promise.all([ensure(REG.measurement_type), ensure(REG.dataset)]).then(async () => {
        const rows = await engine.exec(`SELECT measurement_type, description, units FROM ${q(REG.measurement_type)}`, "measurement_type");
        setMt(new Map(rows.map((r) => [r.measurement_type, { description: r.description, units: r.units }])));
        setDatasets(await engine.exec(`SELECT * FROM ${q(REG.dataset)}`, "dataset"));
      });
      // the curating organizations (metadata/provider.csv) when the release ships them: `provider_short` is the
      // label the Sources line and the Sources modal want. No table -> cite.ts's PROVIDER_SHORT map, as before.
      if (cat.tables.some((t) => t.name === "provider"))
        ensure(REG.provider).then(() => engine.exec(`SELECT * FROM ${q(REG.provider)}`, "provider"))
          .then((rows) => setProviderTable(new Map(rows.map((r) => [String(r.provider), String(r.provider_short ?? r.provider_name ?? r.provider)]))))
          .catch((e) => console.warn("provider table:", e.message));
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, []);

  useEffect(() => { toUrl(sel); }, [sel]);

  // the per-station card's detail is its own sidecar, fetched on the first station selection
  useEffect(() => {
    if (!sel.station || !version || covStations) return;
    fetch(sidecarUrl(version, "coverage_stations.json")).then((r) => r.json()).then(setCovStations).catch(console.error);
  }, [sel.station, version]);
  useEffect(() => {
    if (!version) return;
    fetch(sidecarUrl(version, "spatial_layers.json")).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setSpatialLayers(j)).catch(() => console.log("spatial_layers.json: not in this release — using the bundled registry"));
  }, [version]);
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
      // the dataset filter is set against THIS slice's pills: a dataset the new slice does not have (ichthyo carried from
      // Biology into a temperature view, whose datasets are bottle and CTD) would filter everything out — prune it, and
      // drop it when nothing is left or everything is
      const present = new Set(rows.map((r) => r.dataset_key));
      const prune = (ds: string[] | null) => { if (!ds) return null; const kept = ds.filter((d) => present.has(d)); return kept.length && kept.length < present.size ? kept : null; };
      if (sel.realm === "bio") {
        const stages = new Set(rows.map((r) => r.life_stage));
        const stage = sel.stage != null && stages.has(sel.stage) ? sel.stage : defaultStage(rows);
        const den = sel.den ?? defaultDen(rows, stage);
        setSelRaw((s) => ({ ...s, stage, den, datasets: prune(s.datasets) }));
      } else setSelRaw((s) => { const d = prune(s.datasets); return d === s.datasets ? s : { ...s, datasets: d }; });
      setSliceKey(key);
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, [catalog, sel.realm, sel.taxon, sel.var]);

  // ── lens queries ───────────────────────────────────────────────────────────
  const val = sel.realm === "bio" ? VAL_COL[sel.den ?? "raw"] : "value";
  // the release's last year (coverage.json) closes an open-ended year range; never a constant
  const yearMax = useMemo(() => Math.max(2023, ...(cov?.variables ?? []).map((v) => v.year_max ?? 0)), [cov]);
  const years: [number, number] = [sel.years[0], sel.years[1] === YEAR_OPEN ? yearMax : sel.years[1]];
  const params = useMemo(() => ({
    val, y0: years[0], y1: years[1], ym0: years[0] * 100 + (sel.months?.[0] ?? 1), ym1: years[1] * 100 + (sel.months?.[1] ?? 12),
    quarter_filter: sel.q?.length && sel.q.length < 4 ? `quarter IN (${sel.q.join(", ")})` : "TRUE", bin: "year",
    d0: sel.depth[0], d1: sel.depth[1], stage: sel.realm === "bio" ? sel.stage : null,
    dataset_filter: datasetFilterSql(sel.datasets), zeros: sel.realm !== "bio" || sel.zeros,
  }), [val, years[0], years[1], sel.months, sel.q, sel.depth, sel.stage, sel.realm, sel.datasets, sel.zeros]);
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
      const need_station = !opened.current || lens === "station" || lens === "contour"; // the contour lens interpolates the station summary
      if (need_station) { const r = await engine.query("station", params); if (stale()) return; setStationRows(r); }
      if (lens === "hex") { const r = await engine.query("hex", { ...params, hex: hexExpr(sel.res) }); if (stale()) return; setHexRows(r); }
      if (lens === "contour" && sel.grain === "site" && sel.interp !== "tps") { const r = await engine.query("contour_cast", params); if (stale()) return; setCastRows(r); }
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
        // newest first, like the picker says (was: the most stations occupied, which opened the lens on 2009)
        if (!ck && cr.length) ck = cr.slice().sort((a, b) => b.t0 - a.t0 || b.n_sta - a.n_sta)[0].cruise_key;
        if (ck !== sel.cruise) { setSel({ cruise: ck }); return; } // the effect re-runs once with the cruise set
        if (ck) {
          await ensure(REG.sample_root);
          const tr = await engine.query("cruise_track", { cruise: ck, root_src: q(REG.sample_root) });
          const cs2 = await engine.query("cruise_samples", { ...params, cruise: ck });
          if (stale()) return;
          if (tr.length > 1) {
            const t0 = tr[0].t, t1 = tr[tr.length - 1].t || t0 + 1;
            setTrack({ path: tr.map((r) => [r.longitude, r.latitude]), ts: tr.map((r) => ((r.t - t0) / (t1 - t0)) * 1000), events: tr.reduce((a, r) => a + Number(r.n_events), 0) });
          } else setTrack(null);
          setCruiseSamples(cs2);
        }
      }
      if (lens === "section") {
        const cs = await engine.query("section_cruises", { ...params, line: sel.line });
        if (stale()) return;
        setSectionCruises(cs);
        let ck = sel.cruise && cs.some((c) => c.cruise_key === sel.cruise) ? sel.cruise : null;
        // the default is the NEWEST cruise on this line, not the one that occupied the most stations: ranking by
        // n_sta put line 90 on 1950-09-31CR, so the lens opened in 1950 under a picker labelled "newest first"
        // (and an anomaly there is always blank — the climatology starts in 1993). A YYYY-MM-NODC key sorts
        // chronologically by itself; n_sta only breaks a tie between two cruises of the same month.
        if (!ck && cs.length) ck = cs.slice().sort((a, b) => b.cruise_key.localeCompare(a.cruise_key) || b.n_sta - a.n_sta)[0].cruise_key;
        if (ck !== sel.cruise) { setSel({ cruise: ck }); return; }
        if (sel.realm === "env") {
          const sc = ck ? await engine.query("section", { ...params, line: sel.line, cruise: ck }) : [];
          // the baseline: the release's climatology objects for this variable's types (fetched once, cached by ensure);
          // a release without the table (before v2026.09) has no anomaly view
          const cat = catRef.current;
          const cms = cat && hasClim(cat) ? climMembers(cat, sel.var) : [];
          let cl: Row[] = [];
          if (cms.length) {
            await Promise.all(cms.map((m) => ensure(climReg(m))));
            cl = await engine.query("section_clim", { ...params, line: sel.line, clim_src: climSrc(cms) });
          }
          if (stale()) return;
          setSectionCells(sc.map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n, month: r.month })));
          setClimCells(cms.length ? cl.map((r) => ({ station: r.station, y: r.depth_bin, v: r.v, n: r.n, month: r.month })) : null);
          setClimWindow(cl.length ? [cl[0].yr_min, cl[0].yr_max] : null);
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
        opened.current = true; setLensReady(true);
        timing.add("first_lens_ready", ms, "all panels answered");
        // the opening move: stations first, then the URL's lens (D6), unless ?tour=off or reduced motion
        if (lens !== "station" && sel.tour && !reducedMotion) setTimeout(() => setDisplayLens(lens), 900);
        else setDisplayLens(lens);
      } else setDisplayLens(lens);
      setStatus("ready");
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, [sliceKey, sel.lens, sel.res, sel.layer, sel.line, sel.cruise, sel.grain, sel.interp === "tps", params]);

  // cruise playback (D37): the clock lives in a ref and the loop hands deck new layers itself — no App render per frame
  const timeRef = useRef(0);
  const inputsRef = useRef<LayerInputs | null>(null);
  useEffect(() => {
    if (displayLens !== "cruise" || !track || reducedMotion) return;
    let raf = 0;
    const tick = () => {
      timeRef.current = (timeRef.current + 3) % 1250;
      const inp = inputsRef.current;
      if (inp && overlayRef.current) overlayRef.current.setProps({ layers: buildLayers({ ...inp, cruise: { ...inp.cruise, time: timeRef.current } }) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [displayLens, track]);

  // ── derived ────────────────────────────────────────────────────────────────
  const stat: Stat = sel.stat;
  const statOf = (r: Row) => (stat === "n" ? r.n : r[stat]);

  // the contour lens: interpolate one field of the station summary in a worker; the error surface follows when the
  // method has one. A new selection, method or field supersedes an answer still in flight (surfGen).
  const surfaceField = sel.surface === "value" || sel.surface === "se" ? "stat" : sel.surface;
  const gridHome = useMemo(() => new Map<string, [number, number]>(grid.map((c) => [c.grid_key, c.home])), [grid]);
  const wantSe = sel.surface === "se";
  const fitGrain: Grain = sel.interp === "tps" ? "station" : sel.grain; // the spline needs every point in one system: station grid only (D40)
  const CAST_NMAX = 24, CAST_CELL = 0.1; // the site grain: 24 nearest per cell on 0.1° cells (measured 2026-09-07: 32 on 0.06° took 12.8 s for 44,946 casts)
  useEffect(() => {
    if (sel.lens !== "contour" || !lensReady) return;
    const pts: { lon: number; lat: number; z: number }[] = [];
    const zOf = (r: Row) => (surfaceField === "stat" ? statOf(r) : surfaceField === "spread" ? (r.p95 != null && r.p05 != null ? r.p95 - r.p05 : null) : r[surfaceField]);
    if (fitGrain === "site") { for (const r of castRows) { const z = zOf(r); if (z != null && Number.isFinite(+z)) pts.push({ lon: r.longitude, lat: r.latitude, z: +z }); } }
    else for (const r of stationRows) { const h = gridHome.get(r.grid_key); const z = zOf(r); if (h && z != null && Number.isFinite(+z)) pts.push({ lon: h[0], lat: h[1], z: +z }); }
    const g = ++surfGen.current;
    if (pts.length < 4) { setSurf(null); return; }
    const t = performance.now();
    computeSurface(pts, sel.interp, { wantSe, nmax: fitGrain === "site" ? CAST_NMAX : 0, cellDeg: fitGrain === "site" ? CAST_CELL : 0.06, onSe: (se, ms) => { if (g === surfGen.current) setSurf((s) => (s ? { ...s, se, seMs: ms } : s)); } })
      .then((s) => { if (g !== surfGen.current) return; setSurf(s); timing.add(`contour:${sel.interp}:${fitGrain}`, performance.now() - t, `${s.fit.n} points · ${s.fit.nCells} cells · LOO RMSE ${s.fit.loo.toFixed(3)}${s.fit.phases ? " · " + Object.entries(s.fit.phases).map(([k, v]) => `${k} ${v}`).join(" ") : ""}`); })
      .catch((e) => { console.error(e); setStatus(`contour failed: ${e.message}`); });
  }, [sel.lens, lensReady, stationRows, castRows, gridHome, sel.interp, fitGrain, surfaceField, wantSe, stat]);
  // before the slice answers, the station dots carry the coverage cube (root samples, all datasets)
  const covStation = useMemo(() => {
    const m = new Map<string, StatRow>();
    for (const s of cov?.stations ?? []) { const n = s.datasets.reduce((a, d) => a + d.n_roots, 0); m.set(s.grid_key, { n, n_samples: n, mean: n, med: n }); }
    return m;
  }, [cov]);
  // before the first lens answers the dots carry the coverage cube; after it, what the lens returned — an empty table draws every dot as "no data"
  const stationMap = useMemo(() => (stationRows.length || lensReady ? new Map<string, StatRow>(stationRows.map((r) => [r.grid_key, r as StatRow])) : covStation), [stationRows, covStation, lensReady]);
  const layerFeatures = useMemo(() => spatial.filter((f) => f.properties.layer === sel.layer), [spatial, sel.layer]);
  const centroids = useMemo(() => new Map<string, [number, number]>(layerFeatures.map((f) => [f.properties.spatial_key, polyCentroid(f)])), [layerFeatures]);
  const regionStats = useMemo(() => new Map(regionRows.map((r) => [r.spatial_key, r as any])), [regionRows]);
  const cruiseStations = useMemo(() => new Set<string>(cruiseSamples.map((r) => r.grid_key).filter(Boolean)), [cruiseSamples]);
  const preSlice = !lensReady;
  const lensRows = displayLens === "hex" ? hexRows : displayLens === "region" ? regionRows : displayLens === "cruise" ? cruiseSamples : stationRows;
  const emptyResult = lensReady && sliceKey != null && !lensRows.length; // the selection answers with nothing (a filter that excludes every dataset, a season no cruise sampled)
  const domain = useMemo(() => {
    const rows = preSlice && displayLens === "station" ? [...covStation.values()] : lensRows;
    return quantileDomain(rows.map(preSlice && displayLens === "station" ? (r) => r.n : statOf), preSlice ? "n" : stat);
  }, [displayLens, lensRows, covStation, stat, preSlice]);

  // what the contour lens draws: the chosen surface coloured on its own 5–95 % window (the statistic itself shares the
  // station dots' window, so the two lenses agree), pretty isolines, and the legend's unit
  const rampId = sel.ramp ?? defaultRamp(sel.realm, sel.var, sel.anom && sel.lens === "section" && sel.realm === "env");
  // the land clip follows the grid (one fetch per grid extent; the tiles are cached by the curtain's mosaic map)
  const gridKey = surf ? [surf.grid.lon0, surf.grid.latS, surf.grid.nx, surf.grid.ny].join(",") : null;
  useEffect(() => {
    if (!gridKey || !surf) return;
    let live = true;
    landMask(surf.grid).then((mask) => { if (live) setLand({ key: gridKey, mask }); }).catch((e) => console.warn("land clip unavailable", e));
    return () => { live = false; };
  }, [gridKey]);
  const surfValsRaw = surf ? (wantSe ? surf.se : surf.values) : null;
  const surfVals = useMemo(() => {
    if (!surfValsRaw || !land || land.key !== gridKey) return surfValsRaw;
    const v = Float32Array.from(surfValsRaw); for (let i = 0; i < v.length; i++) if (land.mask[i]) v[i] = NaN; return v;
  }, [surfValsRaw, land, gridKey]);
  const legendDomain: [number, number] = useMemo(() => {
    if (displayLens !== "contour" || sel.surface === "value" || !surfVals) return domain;
    const v: number[] = []; for (let i = 0; i < surfVals.length; i++) if (Number.isFinite(surfVals[i])) v.push(surfVals[i]);
    return quantileDomain(v, sel.surface === "n" || sel.surface === "se" || sel.surface === "spread" ? "n" : "mean");
  }, [displayLens, sel.surface, surfVals, domain]);
  const contourInputs = useMemo(() => {
    if (displayLens !== "contour" || !surf || !surfVals) return null;
    const g = surf.grid, image = surfaceImage(surfVals, g.nx, g.ny, colorScale(legendDomain, 255, rampId), 235, surf.dist, MASK_KM);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < surfVals.length; i++) { const x = surfVals[i]; if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }
    const lines = isolines(surfVals, g.nx, g.ny, niceLevels(lo, hi, 8)).flatMap((l) => l.segs.map((s) => ({ path: [cellToLonLat(g, s[0], s[1]), cellToLonLat(g, s[2], s[3])], level: l.level })));
    return { image, bounds: [g.lon0, g.latS, g.lon1, g.latN] as [number, number, number, number], lines, casts: surf.fit.nmax > 0 ? (castRows as any[]) : null };
  }, [displayLens, surf, surfVals, legendDomain, rampId, castRows]);

  const layerInputs = useMemo((): LayerInputs => ({
    lens: displayLens, res: sel.res, stat: preSlice ? "n" : stat, grid, station: stationMap, hex: hexRows as any,
    region: { features: layerFeatures, stats: regionStats, stationTo: regionStation, centroid: centroids, selected: sel.region },
    cruise: { track, samples: cruiseSamples as any, time: timeRef.current },
    section: { line: sel.line, cruiseStations },
    contour: contourInputs,
    duration, domain, ramp: rampId, dataOn: sel.data, dataOpacity: sel.datao ?? 1, beforeId: dataBeforeId, selectedStation: sel.station,
  }), [displayLens, sel.res, stat, preSlice, grid, stationMap, hexRows, layerFeatures, regionStats, regionStation, centroids, sel.region, track, cruiseSamples, sel.line, cruiseStations, domain, sel.station, contourInputs, rampId, sel.data, sel.datao, dataBeforeId]);
  inputsRef.current = layerInputs;
  const layers = useMemo(() => buildLayers(layerInputs), [layerInputs]);

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
  // ── attribution (WS-A3): the datasets this view POOLS ──────────────────────
  // the statistic averages across the datasets that share the chosen life stage and denominator (bio) or the
  // chosen variable (env) — so these are exactly the datasets the number on the screen rests on, and exactly
  // the ones that must be cited. Every attribution surface reads this one list: the Sources line, the figure
  // footer's third line, every panel CSV's `dataset_key` column, Cite this data, and the product registration.
  const viewDatasetKeys = useMemo(() => {
    const keys = sel.realm === "bio"
      ? stageRows.filter((r) => (sel.den === "per_10m2" ? r.n_10m2 : sel.den === "per_1000m3" ? r.n_1000m3 : r.n) > 0).map((r) => r.dataset_key)
      : envPills.filter(([dk]) => dsOn(dk)).map(([dk]) => dk);
    return [...new Set(keys as string[])].sort((a, b) => short(a).localeCompare(short(b)));
  }, [sel.realm, sel.den, sel.datasets, sel.stage, picker, envPills]);
  // ── picker items (D13): organisms from taxa.sql, variables from coverage.json (+ measurement_type labels once loaded), cruises from the lens
  const dsRow = (dk: string) => datasets.find((d) => d.dataset_key === dk);
  const dsColor = (dk: string) => dsRow(dk)?.color ?? "var(--muted)";
  const dsCategory = (dk: string) => dsRow(dk)?.category ?? DATASET_CATEGORY_FALLBACK[dk] ?? "Other";
  // the pooled datasets as their release rows; before `dataset.parquet` lands, a stand-in carrying the key, so the
  // Sources line names the datasets from the first paint rather than appearing late
  const viewDatasetRows = useMemo(() => viewDatasetKeys.map((dk) => dsRow(dk) ?? { dataset_key: dk, dataset_name_short: short(dk), provider: dk.split("_")[0], category: dsCategory(dk) }), [viewDatasetKeys, datasets]);
  const organismItems = useMemo<PickerItem[]>(() => (taxa.length ? taxa : (cov?.taxa ?? []).map((t) => ({
    taxon_key: t.taxon_key, scientific_name: t.scientific_name, common_name: t.common_name, class: t.class, n: t.n_obs, y0: t.year_min, y1: t.year_max,
    datasets: t.datasets.slice().sort((a, b) => b.n_obs - a.n_obs).map((d) => d.dataset_key).join(","), rank: t.rank }))).map((t: Row) => {
    const ds: string[] = (t.datasets ?? "").split(",").filter(Boolean);
    const local = !/^(worms|itis):/.test(t.taxon_key); // a dataset-local class (zooscan eggs, phyto "other"): the code, and the dataset as its subtitle
    return { key: t.taxon_key, label: t.common_name ?? t.scientific_name ?? (local ? t.taxon_key.replace(/^[^:]+:/, "") : t.taxon_key), sub: t.common_name ? t.scientific_name : local ? `${short(ds[0])} class` : undefined, subItalic: !!t.common_name, n: t.n, year: t.y1, year0: t.y0,
      datasets: ds, groups: { category: dsCategory(ds[0]), dataset: ds[0] ?? "—", class: t.class ?? "—" }, search: t.taxon_key };
  }), [taxa, cov, datasets]);
  const organismGroups = useMemo<GroupOpt[]>(() => [
    { key: "category", label: "category", icon: (c) => categoryIcon(c), rank: categoryRank },
    { key: "dataset", label: "dataset", short: short },
    { key: "class", label: "class" }], []);
  const variableItems = useMemo<PickerItem[]>(() => {
    const env = (cov?.variables ?? []).filter((x) => x.realm === "env");
    const byType = new Map<string, { n: number; y0: number; y1: number; ds: Map<string, number>; cat: string | null }>();
    for (const x of env) { const c = byType.get(x.measurement_type) ?? { n: 0, y0: 9999, y1: 0, ds: new Map(), cat: null }; c.n += x.n_obs; c.y0 = Math.min(c.y0, x.year_min ?? 9999); c.y1 = Math.max(c.y1, x.year_max ?? 0); c.ds.set(x.dataset_key, (c.ds.get(x.dataset_key) ?? 0) + x.n_obs); c.cat = c.cat ?? x.category ?? null; byType.set(x.measurement_type, c); }
    const defs = unifiedDefs();
    const inUnified = new Set(defs.flatMap((v) => v.members));
    const item = (key: string, label: string, units: string | undefined, c: { n: number; y0: number; y1: number; ds: Map<string, number>; cat: string | null }, search = ""): PickerItem => {
      const ds = [...c.ds.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      // the registry's category (coverage.json, since calcofi4db 3.25.0) wins; the keyword rule is the stopgap for a release without it
      return { key, label, sub: units, n: c.n, year: c.y1 || null, year0: c.y0 < 9999 ? c.y0 : null, datasets: ds, groups: { category: c.cat ?? envCategory(key, label), dataset: ds[0] ?? "—" }, search: `${key} ${search}` };
    };
    // a unified variable (bottle + CTD headline types, comparable) is one row; every other type is its own
    const uni = defs.map((v) => { const c = { n: 0, y0: 9999, y1: 0, ds: new Map<string, number>(), cat: null as string | null }; for (const m of v.members) { const x = byType.get(m); if (x) { c.n += x.n; c.y0 = Math.min(c.y0, x.y0); c.y1 = Math.max(c.y1, x.y1); c.cat = c.cat ?? x.cat; for (const [k, n] of x.ds) c.ds.set(k, (c.ds.get(k) ?? 0) + n); } }
      const lab = v.label !== v.key ? v.label : (mt.get(v.members[0])?.description ?? ENV_VARS_FALLBACK[v.key] ?? v.key);
      const u = lab.match(/\(([^)]+)\)$/)?.[1] ?? mt.get(v.members[0])?.units; return item(v.key, lab.replace(/\s*\([^)]+\)$/, ""), u, c, v.members.join(" ")); }).filter((v) => v.n > 0);
    const rest = [...byType.entries()].filter(([k]) => !inUnified.has(k)).map(([k, c]) => { const m = mt.get(k); return item(k, m?.description ?? ENV_VARS_FALLBACK[k] ?? k, m?.units, c); });
    return [...uni, ...rest];
  }, [cov, mt, catalog]);
  const variableGroups = useMemo<GroupOpt[]>(() => [
    { key: "category", label: "category", icon: (c) => categoryIcon(c), rank: categoryRank },
    { key: "dataset", label: "dataset", short: short }], []);
  const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const cruiseItems = useMemo<PickerItem[]>(() => cruiseRows.map((c) => ({ key: c.cruise_key, label: c.cruise_key, sub: `${dateOf(c.t0)} → ${dateOf(c.t1)} · ${c.n_sta} stations`, n: c.n, year: +c.cruise_key.slice(0, 4) })), [cruiseRows]);
  const sectionCruiseItems = useMemo<PickerItem[]>(() => sectionCruises.map((c) => ({ key: c.cruise_key, label: c.cruise_key, sub: `${c.n_sta} stations · ${fmtN(c.n)} observations`, n: c.n_sta, year: c.year })), [sectionCruises]);
  const envVar = variableItems.find((v) => v.key === sel.var);
  const yearsSet = sel.years[0] !== 1949 || sel.years[1] !== YEAR_OPEN || !!sel.months;
  const depthSet = sel.depth[0] !== 0 || sel.depth[1] !== 500;
  const copyLink = async () => { try { await navigator.clipboard.writeText(location.href); setStatus("link copied"); } catch { setStatus("clipboard blocked"); } };

  // ── panels: folds + maximize in the URL; card minimize, geometry and the phone sheet in memory ────
  const [minCards, setMinCards] = useState<Record<CardId, boolean>>({ section: false, cruise: false, station: false, timing: false, layers: false });
  const [layersOpen, setLayersOpen] = useState(false);
  // the boundary registry: the release's spatial_layers.json sidecar, the bundled snapshot as the fallback (D23)
  const [topCard, setTopCard] = useState<PanelId | null>(null);
  const [sheet, setSheet] = useState<{ panel: PanelId; detent: Detent }>({ panel: "select", detent: "peek" });
  const [depthPulse, setDepthPulse] = useState(false);
  const [depthDs, setDepthDs] = useState<DepthRow[]>([]);
  const mapBox = useRef<HTMLDivElement>(null);
  const folded = (id: PanelId) => sel.hide.includes(id);
  const toggleFold = (id: PanelId) => { if (id === "select" && folded("select")) setSentenceOpen(false); setSelRaw((s) => ({ ...s, hide: s.hide.includes(id) ? s.hide.filter((h) => h !== id) : [...s.hide, id] })); };
  const toggleSentence = () => { if (!sentenceOpen) setSelRaw((s) => (s.hide.includes("select") ? s : { ...s, hide: [...s.hide, "select"] })); setSentenceOpen((v) => !v); };
  const toggleMax = (id: PanelId) => setSelRaw((s) => ({ ...s, max: s.max === id ? null : id }));
  const openCard = (id: CardId) => { setMinCards((m) => ({ ...m, [id]: false })); setTopCard(id); if (phone) setSheet({ panel: id, detent: "half" }); };
  const minCard = (id: CardId) => { setMinCards((m) => ({ ...m, [id]: true })); if (phone) setSheet({ panel: "select", detent: "peek" }); };
  // a lens owns its cards (rule 2): Sections opens the section card, Cruises the cruise card; the others open none
  useEffect(() => {
    if (sel.lens === "section") openCard("section"); else if (sel.lens === "cruise") openCard("cruise");
    else if (phone) setSheet((s) => (s.panel === "section" || s.panel === "cruise" ? { panel: "select", detent: "peek" } : s));
  }, [sel.lens]);
  useEffect(() => { if (sel.station) openCard("station"); }, [sel.station]);   // a station click opens its card (a sheet on the phone)
  // the depth axis ARRIVING while the panel is folded — a pick sampled at depth — is one 600 ms pulse on the pill, which
  // turns on (the band, a sparkline of the profile); it never opens itself and nothing else moves (signal, don't move)
  const depthAvail = !!sliceKey && depthRows.length > 0;
  const prevAxis = useRef(depthAvail);
  useEffect(() => { if (depthAvail && !prevAxis.current && sel.hide.includes("depth")) { setDepthPulse(true); setTimeout(() => setDepthPulse(false), 700); } prevAxis.current = depthAvail; }, [depthAvail]);
  // the maximized water column adds one median line per dataset
  useEffect(() => { if (sel.max !== "depth" || !sliceKey) { setDepthDs([]); return; } engine.query("depth_strip_ds", params).then((r) => setDepthDs(r as DepthRow[])).catch(console.error); }, [sel.max, sliceKey, params]);
  // ── help (D16): the welcome card once per browser (?tour=on forces it, ?tour=off never), about, feedback, the tour
  // `?modal=sources` (WS-A3) opens Data Sources & Attribution and is the ONE modal that round-trips through the
  // URL, so an attribution link is shareable; the rest are session state, and `?tour=off` still opens nothing
  // it was not asked for by name (the brand contract's deterministic screenshot).
  const [modal, setModal] = useState<ModalId | null>(() => (sel.modal === "sources" ? "sources" : sel.tour && (sel.tourOn || !seenWelcome()) ? "welcome" : null));
  const [aboutAt, setAboutAt] = useState<string | null>(null); // Help ▾ → Keyboard opens About on that section
  const openModal = (m: ModalId, at: string | null = null) => { setSel({ modal: m === "sources" ? "sources" : null }); setAboutAt(at); setModal(m); };
  const openSources = () => openModal("sources");
  const closeModal = () => { if (modal === "welcome") markWelcome(); if (sel.modal) setSel({ modal: null }); setModal(null); };
  // the welcome's ways in (2026-09-06): Start exploring, a door (opens the Select panel on that realm's picker) or a
  // question (a real view, as its URL). Each records `explore_cite_ack` beside `explore_welcome` — the citation norm is
  // a sentence on the card, accepted by continuing; a promise, never a gate (Esc and × enter too, without the ack).
  const enter = (how: string) => { markWelcome(); markCiteAck(); setModal(null); trackEvent("cite_ack", { ok: true, how }); };
  const startExploring = () => enter("start");
  const door = (realm: "bio" | "env") => {
    enter(`door:${realm}`);
    setSelRaw((s) => ({ ...s, ...(realm === "bio" ? { realm: "bio" as const, datasets: null } : { realm: "env" as const, cruise: null, datasets: null }), hide: s.hide.filter((h) => h !== "select") }));
    setSentenceOpen(false); setTab("select");
    if (phone) setSheet({ panel: "select", detent: "half" });
    setPickerSignal((n) => n + 1); setTimeout(() => setPickerSignal(0), 800); // the signal is a moment, not a state: a later remount must not reopen the list
  };
  const question = (qs: string) => {
    enter("question");
    const p = new URLSearchParams(qs);
    if (sel.theme) p.set("theme", sel.theme); if (sel.release) p.set("release", sel.release);
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
    setSelRaw(selFromUrl()); setSentenceOpen(false);
  };
  const copyCite = async (kind: "text" | "bibtex") => {
    const text = kind === "bibtex" ? citeBibtex(viewDatasetRows, catalog, rel) : citeText(viewDatasetRows, catalog, rel, location.href);
    (window as any).__lastCite = text;
    try { await navigator.clipboard.writeText(text); setStatus(`copied ${viewDatasetRows.length} dataset citation${viewDatasetRows.length === 1 ? "" : "s"} + the release${kind === "bibtex" ? " (BibTeX)" : ""}`); } catch { setStatus("clipboard blocked"); }
    trackEvent("cite", { kind, n: viewDatasetRows.length });
  };
  const tourSnap = useRef<{ lens: Lens; hide: PanelId[]; sheet: typeof sheet } | null>(null);
  const selRef = useRef(sel); selRef.current = sel;
  const sheetRef = useRef(sheet); sheetRef.current = sheet;
  const tourActions: TourActions = {
    phone, reducedMotion,
    getLens: () => selRef.current.lens, setLens: (l) => onLens(l),
    isFolded: (id) => selRef.current.hide.includes(id), unfold: (id) => { if (id === "select") setSentenceOpen(false); setSelRaw((s) => ({ ...s, hide: s.hide.filter((h) => h !== id) })); },
    sheet: (panel, detent) => setSheet({ panel, detent }),
    snapshot: () => { tourSnap.current = { lens: selRef.current.lens, hide: selRef.current.hide, sheet: sheetRef.current }; },
    restore: () => { const t = tourSnap.current; if (!t) return; setSelRaw((s) => ({ ...s, lens: t.lens, hide: t.hide })); if (phone) setSheet(t.sheet); tourSnap.current = null; },
    openFeedback: () => openModal("feedback"),
    expand,
  };
  const tour = () => { if (modal === "welcome") markWelcome(); setModal(null); setTimeout(() => startTour(tourActions), modal ? 250 : 0); };
  (window as any).__tour = tour; // verify.mjs steps it through window.__tourDriver
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((window as any).__tourDriver || modal) return;
      e.preventDefault(); tour();
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [modal, phone]);
  // D20: month bins once the strip is zoomed to <= 15 years; the cruise calendar's rows (every lens) + the ship reference
  useEffect(() => {
    if (!needMonths || !sliceKey) { setMonthRows(null); return; }
    let live = true;
    engine.query("years", { ...params, bin: "year::INTEGER + (month(datetime) - 0.5) / 12.0" }).then((r) => { if (live) setMonthRows(r as YearRow[]); }).catch(console.error);
    return () => { live = false; };
  }, [needMonths, sliceKey, params]);
  useEffect(() => {
    if (seriesMode !== "cruises" || !sliceKey) return;
    let live = true;
    engine.query("cruise", params).then((r) => { if (live) setGanttRows(r as CruiseRow[]); }).catch(console.error);
    if (!cruiseRef) ensure(REG.cruise).then(() => engine.query("cruise_ref", { src: q(REG.cruise) })).then((r) => { if (live) setCruiseRef(new Map(r.map((c) => [c.cruise_key, { ship: c.ship_name ?? c.ship_nodc ?? "", nodc: c.ship_nodc ?? "" }]))); }).catch(console.error);
    return () => { live = false; };
  }, [seriesMode, sliceKey, params]);
  const gantt = useMemo(() => {
    if (seriesMode !== "cruises") return null;
    const rows = (sel.lens === "cruise" && cruiseRows.length ? cruiseRows : ganttRows).filter((c) => c.t0 && c.t1);
    // the ship from the cruise reference (title case), for the hover; a key with no reference row shows its NODC code
    const shipOf = (k: string) => { const ref = cruiseRef?.get(k); const nodc = k.split("-")[2] ?? k; return ref?.ship ? ref.ship.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : nodc; };
    const gr: GanttRow[] = rows.map((c) => ({ ...c, ship: shipOf(c.cruise_key) }));
    return { rows: gr, selected: sel.cruise, onPick: (k: string) => setSel({ cruise: k }) };
  }, [seriesMode, cruiseRows, ganttRows, cruiseRef, sel.lens, sel.cruise]);
  const yearsSpark = useMemo(() => { const m = new Map(yearRows.map((r) => [r.year, r.n])); const out: number[] = []; for (let y = 1949; y <= yearMax; y++) out.push(m.get(y) ?? 0); return out; }, [yearRows, yearMax]);
  const nFilled = useMemo(() => picker.filter((r) => r.life_stage === sel.stage && dsOn(r.dataset_key)).reduce((a, r) => a + (r.n_filled ?? 0), 0), [picker, sel.stage, sel.datasets]);
  const zerosNote = sel.realm === "bio" && !sel.zeros ? " · positive tows only" : "";
  const legendUnit = sel.lens === "contour" && sel.surface === "n" ? "observations" : sel.lens === "contour" && (sel.surface === "y0" || sel.surface === "y1") ? "year" : undefined as string | undefined; // filled below once unitLabel exists
  const unitLabel = sel.realm === "bio" ? (sel.den === "raw" ? "count" : sel.den === "per_10m2" ? "per 10 m²" : "per 1000 m³") : (picker[0]?.units ?? sel.var);
  const taxonRow = taxa.find((t) => t.taxon_key === sel.taxon);
  const legendTitle = preSlice ? "root samples · all datasets (coverage.json, before the engine is warm)" : sel.realm === "bio"
    ? `${STAT_LABEL[stat]} · ${taxonRow?.common_name ?? taxonRow?.scientific_name ?? sel.taxon} · ${sel.stage ?? "all life stages"} · ${unitLabel}${zerosNote}`
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
    const o: any = info.object;
    if (!o) {
      // no deck object under the pointer: a visible boundary may be (MapLibre picking, D25)
      const m = (window as any).__map;
      if (m && visibleBoundaries.length && info.x != null && info.y != null) {
        const ids = boundaryLayerIds(sel.layers ?? []).filter((l) => m.getLayer(l));
        const fs = ids.length ? m.queryRenderedFeatures([info.x, info.y], { layers: ids }) : [];
        if (fs.length) {
          const d = spatialLayers.layers.find((dd) => String(fs[0].layer.id).startsWith(`sp-${dd.id}-`));
          const nm = fs[0].properties?.name;
          return { text: nm && d ? `${nm} · ${d.name}` : (nm ?? d?.name ?? "") };
        }
      }
      return null;
    }
    const id = info.layer?.id;
    if (id === "stations") { const s = stationMap.get(o.grid_key); return { text: `${o.grid_key} · line ${o.line} station ${o.station}\n${s ? (preSlice ? `${fmtN(s.n)} root samples, all datasets` : `${STAT_LABEL[stat]} ${fmt(statOf(s))} · ${fmtN(s.n)} observations · ${s.n_samples} samples · ${s.y0}–${s.y1}`) : "no observations in selection"}\nclick for the station's coverage card` }; }
    if (id === "surface") { const px = (info as any).bitmap?.pixel; const v = px && surf && surfVals ? cellValue(surfVals, surf.grid, px[0], px[1]) : null; return v == null ? null : { text: `${SURFACE_LABEL[sel.surface]}: ${fmt(v)} ${legendUnit}\n${INTERP_WORD[sel.interp]} over ${surf!.fit.n} stations · leave-one-out RMSE ${fmt(surf!.fit.loo)}` }; }
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

  // ── the light layout (2026-09-06): the map is the page, every panel floats, the title sentence says what you see ─
  const organism = organismItems.find((i) => i.key === sel.taxon);
  const subject = sel.realm === "bio" ? (organism?.label ?? taxonRow?.common_name ?? taxonRow?.scientific_name ?? sel.taxon) : (envVar?.label ?? sel.var);
  const selectSummary = sel.realm === "bio" ? `${subject} · ${sel.stage ?? "all life stages"} · ${unitLabel}${zerosNote}` : `${subject} · ${sel.depth[0]}–${sel.depth[1]} m`;
  const depthSummary = sliceKey && !depthRows.length ? "Depth · no depth axis" : `Depth ${sel.depth[0]}–${sel.depth[1]} m`;
  const depthEmpty = "depth-integrated net tows —<br>no water-column profile for this selection;<br>the tow span will draw here<br>once the release carries it";
  const seriesToggle = <span className="seg" role="group" aria-label="year strip mode" data-tour="strip-mode"><button className={seriesMode === "n" ? "on" : ""} onClick={() => setSeriesMode("n")}>observations</button><button className={seriesMode === "mean" ? "on" : ""} onClick={() => setSeriesMode("mean")}>mean ± se</button><button className={seriesMode === "cruises" ? "on" : ""} onClick={() => setSeriesMode("cruises")} title="a year × month calendar, one cell per cruise coloured by the summary stat; zoom in for the dates and codes; click a cell to pick the cruise"><Icon name="ui-gantt" />cruises</button></span>;
  const logChip = seriesMode === "mean" ? <button type="button" className={`chip${ylog ? " on" : ""}`} aria-pressed={ylog} title="log scale — the axis keeps the original values; the minor gridlines sit at one even step, so they bunch toward the top. A zero mean sits on the axis floor (log 0 does not exist); the hover always carries the true value" onClick={() => setYlog(!ylog)}>log</button> : null;
  const Q_LABEL = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
  const seasonLabel = sel.q?.length && sel.q.length < 4 ? sel.q.map((x) => `Q${x}`).join(" ") : "all";
  // the filters in force, in words — an empty result's note says them
  const filterWords = [yearsSet && (sel.months ? `${years[0]}-${String(sel.months[0]).padStart(2, "0")} → ${years[1]}-${String(sel.months[1]).padStart(2, "0")}` : `${years[0]}–${years[1]}`), sel.q && seasonLabel, depthSet && `${sel.depth[0]}–${sel.depth[1]} m`, sel.datasets && sel.datasets.map(short).join(", ")].filter(Boolean) as string[];
  const toggleQ = (x: number) => { const cur = sel.q ?? [1, 2, 3, 4]; const next = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x].sort(); setSel({ q: next.length === 0 || next.length === 4 ? null : next }); };
  const datasetsInSlice = useMemo(() => [...new Set(picker.map((r) => r.dataset_key))], [picker]);
  const layerNames = useMemo(() => spatialLayers.layers.filter((d) => d.n_memberships > 0).map((d) => d.name).sort(), [spatialLayers]);
  const regionName = sel.region ? (layerFeatures.find((f) => f.properties.spatial_key === sel.region)?.properties.name ?? sel.region) : null;
  const stdWord = sel.den ? DEN_LABEL[sel.den] : "…";
  // what the active lens asks for, under its line: the hexagon size, the boundary layer, the line + cruise, the cruise
  const lensOptions = <>
    {sel.lens === "hex" && <label className="row opt hexres" title={`H3 resolution ${sel.res} · mean edge ${RES_KM[sel.res]}`}>
      <span className="hint">hexagon size</span>
      <input type="range" min={3} max={7} step={1} list="h3res" value={sel.res} aria-label="hexagon size (H3 resolution)"
        onChange={(e) => { const r = +e.target.value; if (r !== sel.res) { lensClickAt.current = performance.now(); setSel({ res: r }); } }} />
      <datalist id="h3res">{[3, 4, 5, 6, 7].map((r) => <option key={r} value={r} label={String(r)} />)}</datalist>
      <span className="hint val">{RES_KM[sel.res]} <span className="dim">· H3 {sel.res}</span></span>
    </label>}
    {sel.lens === "contour" && <div className="opt contour-opt">
      <div className="row"><span className="hint">method</span><span className="seg">{INTERPS.map((m) => <button key={m} type="button" className={sel.interp === m ? "on" : ""} title={INTERP_HOW[m]} onClick={() => setSel({ interp: m, surface: m === "idw" && sel.surface === "se" ? "value" : sel.surface })}>{INTERP_LABEL[m]}</button>)}</span></div>
      <div className="row grain"><span className="hint">fitted to</span><span className="seg">{(["site", "station"] as Grain[]).map((g) => <button key={g} type="button" className={fitGrain === g ? "on" : ""} disabled={g === "site" && sel.interp === "tps"} title={GRAIN_HOW[g] + (g === "site" && sel.interp === "tps" ? " — not for the spline" : "")} onClick={() => setSel({ grain: g })}>{GRAIN_LABEL[g]}</button>)}</span></div>
      <label className="f">surface<select value={sel.surface} onChange={(e) => setSel({ surface: e.target.value as Surface })}>{SURFACES.map((s) => <option key={s} value={s} disabled={s === "se" && sel.interp === "idw"}>{SURFACE_LABEL[s]}{s === "se" && sel.interp === "idw" ? " — not for IDW" : ""}</option>)}</select></label>
      <div className="hint fit">{surf ? <>{fmtN(surf.fit.n)} {surf.fit.nmax ? `sites (${surf.fit.nmax} nearest per cell)` : "stations"} → {fmtN(surf.fit.nCells)} cells of {surf.grid.cellDeg}° · leave-one-out RMSE <b>{fmt(surf.fit.loo)}</b> {legendUnit === "year" ? "years" : legendUnit ?? unitLabel}{surf.fit.vg ? ` · variogram: nugget ${fmt(surf.fit.vg.nugget)} · sill ${fmt(surf.fit.vg.nugget + surf.fit.vg.psill)} · range ${Math.round(surf.fit.vg.range)} km` : ""}{surf.fit.edf != null ? ` · ${surf.fit.edf.toFixed(1)} effective df` : ""}{surf.fit.nLoo && surf.fit.nLoo < surf.fit.n ? ` (LOO on ${surf.fit.nLoo}${surf.fit.nFit && surf.fit.nFit < surf.fit.n ? `, variogram on ${fmtN(surf.fit.nFit)}` : ""})` : ""} · {Math.round(surf.fit.ms)} ms{surf.seMs != null ? ` (+${Math.round(surf.seMs)} ms for the error surface)` : ""}</> : sel.lens === "contour" && lensReady ? "computing the surface…" : "…"} · blank beyond {MASK_KM} km of a point · the dots are the inputs{fitGrain === "site" ? "" : ", sized by their observations"}</div>
    </div>}
    {sel.lens === "region" && <div className="opt">
      <label className="f">boundary layer<select value={sel.layer} onChange={(e) => setSel({ layer: e.target.value, region: null })}>{layerNames.map((l) => <option key={l}>{l}</option>)}</select></label>
      <div className="pills">{regionRows.slice().sort((a, b) => b.n - a.n).slice(0, 10).map((r) => <span key={r.spatial_key} className={`pill ${sel.region === r.spatial_key ? "" : "off"}`} onClick={() => setSel({ region: sel.region === r.spatial_key ? null : r.spatial_key })} style={{ cursor: "pointer" }}>{r.spatial_name} · {fmt(statOf(r))} ({fmtN(r.n)})</span>)}</div>
      <div className="hint">{layerFeatures.length} polygons · {regionRows.length} with data · membership exact per root sample (sample_spatial)</div>
    </div>}
    {sel.lens === "section" && <div className="opt">
      <div className="row">
        <label className="f">line<select value={sel.line} onChange={(e) => setSel({ line: +e.target.value, cruise: null })}>{lines.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
        <Picker id="section-cruise" label="cruise" hint="newest first" value={sel.cruise ?? ""} items={sectionCruiseItems} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "n"]} countLabel="stations" placeholder="search YYYY-MM-NODC…" loading={sectionCruises.length ? null : "…"} native={native} sheet={phone} />
      </div>
      {sel.realm === "env" && <label className="row" style={{ fontSize: 12 }} title={hasClim(catalog) ? `a departure from the release's climatology: this station, the cast's calendar month, this 10 m depth bin, ${climWindow ? `${climWindow[0]}–${climWindow[1]}` : "1993–2013"}, at least 3 cruises — the same table ctd-transects subtracts` : "this release carries no climatology table (releases from v2026.09 do)"}><input type="checkbox" checked={sel.anom && hasClim(catalog)} disabled={!hasClim(catalog)} onChange={(e) => setSel({ anom: e.target.checked })} /> difference from the {climWindow ? `${climWindow[0]}–${climWindow[1]}` : "1993–2013"} normal</label>}
    </div>}
    {sel.lens === "cruise" && <div className="opt">
      <Picker id="cruise" label="cruise" hint="newest first" value={sel.cruise ?? ""} items={cruiseItems} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "n"]} placeholder="search YYYY-MM-NODC…" loading={cruiseRows.length ? null : "…"} native={native} sheet={phone} />
      <div className="hint">{track ? `${track.path.length} station visits on the track · ${track.events} sampling events` : "no track"}</div>
    </div>}
  </>;
  const moreSummary = sel.realm === "bio"
    ? `${STAT_LABEL[stat]} · ${stdWord} · ${sel.zeros ? "zeros counted" : "positive tows only"} · ${datasetsInSlice.length} dataset${datasetsInSlice.length === 1 ? "" : "s"} · sources`
    : `${STAT_LABEL[stat]} · ${datasetsInSlice.map(short).join(" + ") || "…"} · sources`;
  // ① Data → ② View as → More options: the expert controls, one disclosure that remembers its state
  const selectTab = <>
    <Group title="Data" icon="ui-data" data-tour="data">
      <div className="row"><span className="seg realm" data-tour="realm">
        {/* a realm switch drops the dataset filter: it was set against the other realm's pills (the slice effect prunes it again for a URL) */}
        <button className={sel.realm === "bio" ? "on" : ""} onClick={() => setSel({ realm: "bio", datasets: null })} title="one organism (taxon) at a time — realm bio"><Icon name="realm-bio" />Biology</button>
        <button className={sel.realm === "env" ? "on" : ""} onClick={() => setSel({ realm: "env", cruise: null, datasets: null })} title="one variable (measurement type) at a time — realm env"><Icon name="realm-env" />Environment</button>
      </span></div>
      {sel.realm === "bio" ? <>
        <Picker id="organism" label="organism" hint="(taxon)" value={sel.taxon} items={organismItems} onChange={(k) => setSel({ taxon: k, stage: null, den: null, cruise: null })}
          groups={organismGroups} letters browse placeholder="search species, genus, family…" dsColor={dsColor} dsShort={short} loading={organismItems.length ? null : status} native={native} sheet={phone} data-tour="picker" openSignal={pickerSignal} />
        <label className="f">life stage
          <select value={sel.stage ?? ""} onChange={(e) => { const st = e.target.value || null; setSel({ stage: st, den: defaultDen(picker, st) }); }}>
            {stages.map(([s, n]) => <option key={s ?? "null"} value={s ?? ""}>{s ?? "(none)"} ({fmtN(n)})</option>)}
          </select></label>
      </> : <Picker id="variable" label="variable" value={sel.var} items={variableItems} onChange={(k) => setSel({ var: k, cruise: null })}
        groups={variableGroups} defaultGroup="category" browse placeholder="search temperature, nitrate, chlorophyll…" dsColor={dsColor} dsShort={short} loading={variableItems.length ? null : "…"} native={native} sheet={phone} data-tour="picker" openSignal={pickerSignal} />}
    </Group>
    <Group title="View as" icon="ui-layers" data-tour="lenses">
      <LensPicker lens={sel.lens} onLens={onLens} />
      {lensOptions}
    </Group>
    <section className="group more-group" data-group="more">
      {/* the tour anchors on the one-line toggle: the open body can be taller than a phone's sheet */}
      <button type="button" className="more-toggle" aria-expanded={more} onClick={() => setMore(!more)} title={`${more ? "fold" : "open"} the expert controls — they stay as you leave them`} data-tour="denominator"><Icon name={more ? "ui-down" : "ui-right"} size="0.95rem" /><b>More options</b><span>· {moreSummary}</span></button>
      {more && <div className="more-body">
        <label className="f">summary<select value={stat} onChange={(e) => setSel({ stat: e.target.value as Stat })}>{Object.entries(STAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {sel.realm === "bio" && <div className="den open">
          {/* one line says which standardization is in force and for whom; the radios carry the formulas and the haul-factor note */}
          <div className="den-toggle" style={{ cursor: "default" }}><span className="k">standardized as</span><b>{stdWord}</b>
            {sel.den && <span className="hint">· {denInfo(sel.den).ok.map(short).join(", ") || "no dataset"}{denInfo(sel.den).excluded > 0 ? ` · ${fmtN(denInfo(sel.den).excluded)} excluded` : ""}</span>}</div>
          <div className="den-list">
            {(["per_10m2", "per_1000m3", "raw"] as Den[]).map((d) => { const i = denInfo(d); return (
              <label key={d} className={i.rows === 0 ? "off" : ""}>
                <input type="radio" name="den" checked={sel.den === d} disabled={i.rows === 0} onChange={() => setSel({ den: d })} />
                <b>{DEN_LABEL[d]}</b> <span className="hint">— {DEN_HOW[d]}</span><br />
                <span className="hint ds">{i.ok.map(short).join(", ") || "no dataset"}{i.excluded > 0 ? ` · ${fmtN(i.excluded)} observations excluded` : ""}{i.off.length ? ` (${i.off.map(short).join(", ")} cannot)` : ""}</span>
              </label>); })}
            <div className="hint shf">{SHF_NOTE}</div>
          </div>
          {/* the zeros: a tow a positive-only dataset sampled with no catch counts as 0 (zeros counted) unless it is switched off (zeros=0) */}
          <div className="zeros">
            <button type="button" className={`chip${sel.zeros ? " on" : ""}`} aria-pressed={sel.zeros} onClick={() => setSel({ zeros: !sel.zeros })} title={sel.zeros ? "a sampled tow with no catch counts as 0 — click for the tows with a catch only" : "statistics over the tows with a catch only — click to count sampled tows with no catch as 0"}>
              zeros counted<i className={`sw${sel.zeros ? " on" : ""}`} />
            </button>
            <span className="hint">{sel.zeros ? (nFilled ? `${fmtN(nFilled)} sampled tows with no catch count as 0` : "no zero-filled tows in this slice") : "mean, median and se over tows with a catch only"}</span>
            <span className="info" tabIndex={0} title={ZEROS_TIP}><Icon name="ui-about" size="0.95rem" /></span>
          </div>
        </div>}
        <div className="pills">
          {picker.length === 0 && <span className="pill off">{status}</span>}
          {sel.realm === "bio" ? [...new Map(picker.map((r) => [`${r.dataset_key}|${r.life_stage}`, r])).keys()].map((k) => {
            const rs = picker.filter((r) => `${r.dataset_key}|${r.life_stage}` === k); const r0 = rs[0];
            const n = rs.reduce((a, r) => a + r.n, 0); const raw = rs.every((r) => r.effort_class === "raw_count_no_effort");
            const on = r0.life_stage === sel.stage && dsOn(r0.dataset_key);
            return <span key={k} className={`pill ${on ? "" : "off"} ${raw ? "warn" : ""} ${sel.datasets && dsOn(r0.dataset_key) ? "sel" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggleDataset(r0.dataset_key)}
              title={`${raw ? "raw count, no effort in release" : rs.map((r) => `${r.tow_type ?? "—"}: ${r.n}`).join(", ")} · click to toggle this dataset`}><i className="dot" style={{ background: dsColor(r0.dataset_key) }} />{short(r0.dataset_key)} {r0.life_stage ?? "—"} {fmtN(n)}{raw ? " ⚠" : ""}</span>;
          }) : envPills.map(([dk, c]) => <span key={dk} className={`pill ${dsOn(dk) ? "" : "off"} ${sel.datasets && dsOn(dk) ? "sel" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggleDataset(dk)} title="bottle and CTD values of one variable are comparable · click to toggle this dataset"><i className="dot" style={{ background: dsColor(dk) }} />{short(dk)} {fmtN(c.n)}{c.n_flagged ? ` · ${fmtN(c.n_flagged)} flagged` : ""}</span>)}
        </div>
        <SourcesLine datasets={viewDatasetRows} providerTable={providerTable} onAll={openSources} loading={picker.length ? "no dataset in view" : status} />
        <div className="hint">{fmtN(inView)} observations in view · {sel.realm === "env" ? "averaged across datasets that share this variable; never across variables" : sel.den === "raw" ? "raw counts are not comparable across gear or datasets" : "averaged across datasets that share this life stage and standardization; never across them"}</div>
      </div>}
    </section>
    <div className="card-foot">{sliceKey ? `${fmtN(inView)} observations in view` : status} · <button type="button" className="linkish" onClick={openSources}>{viewDatasetKeys.length ? `${viewDatasetKeys.length} source${viewDatasetKeys.length === 1 ? "" : "s"}` : "sources"}</button></div>
  </>;
  // ③ Refine: the years, the season, the depth band (only where a pick has a depth axis) and the datasets
  const refineTab = <>
    <Group title="Years" icon="ui-years">
      <div className="row"><input type="number" style={{ width: 66 }} value={years[0]} min={1949} max={yearMax} onChange={(e) => setSel({ years: [+e.target.value, years[1]] })} />–<input type="number" style={{ width: 66 }} value={years[1]} min={1949} max={yearMax} onChange={(e) => setSel({ years: [years[0], +e.target.value] })} /><button type="button" className="pill act" disabled={!yearsSet} onClick={() => setSel({ years: [1949, YEAR_OPEN], months: null })}>all years</button></div>
      <div className="hint">or drag on the Years panel{sel.months ? " · month edges from the brush" : ""}</div>
    </Group>
    <Group title="Season" icon="ui-calendar">
      <div className="season-row"><span className="seg">{[1, 2, 3, 4].map((x) => <button key={x} className={!sel.q || sel.q.includes(x) ? "on" : ""} onClick={() => toggleQ(x)} title={Q_LABEL[x - 1]}>Q{x}</button>)}</span><span className="hint">{sel.q ? sel.q.map((x) => Q_LABEL[x - 1]).join(", ") : "every quarter"}</span></div>
    </Group>
    <Group title="Depth band" icon="ui-tune">
      {depthAvail || !sliceKey ? <>
        <div className="row"><input type="number" style={{ width: 66 }} value={sel.depth[0]} min={0} max={sel.depth[1] - 10} step={10} onChange={(e) => setSel({ depth: [+e.target.value, sel.depth[1]] })} />–<input type="number" style={{ width: 66 }} value={sel.depth[1]} min={sel.depth[0] + 10} max={6500} step={10} onChange={(e) => setSel({ depth: [sel.depth[0], +e.target.value] })} /> m<button type="button" className="pill act" disabled={!depthSet} onClick={() => setSel({ depth: [0, 500] })}>0–500 m</button></div>
        <div className="hint">or drag on the Depth panel — <button type="button" className="linkish" onClick={() => { if (phone) setSheet({ panel: "depth", detent: "half" }); else if (folded("depth")) toggleFold("depth"); }}>open it</button></div>
      </> : <div className="hint">this pick has no depth axis — its net tows are depth-integrated, so the band does not apply</div>}
    </Group>
    <Group title="Datasets" icon="ui-data">
      <div className="pills">{datasetsInSlice.map((dk) => <button key={dk} type="button" className={`pill act${dsOn(dk) ? "" : " off"}`} onClick={() => toggleDataset(dk)} title="click to leave this dataset out, or to bring it back"><i className="dot" style={{ background: dsColor(dk) }} />{short(dk)}</button>)}{!datasetsInSlice.length && <span className="pill off">{status}</span>}</div>
      <div className="hint">{sel.datasets ? <>{sel.datasets.length} of {datasetsInSlice.length} in view · <button type="button" className="linkish" onClick={() => setSel({ datasets: null })}>all datasets</button></> : "every dataset in the slice is in view"}</div>
    </Group>
  </>;
  // Share: the data, the code, the citations, the link or the image, a product, feedback, the SQL
  const shareTab = <div className="share-col" data-tour="share">
    <button className="pill act" disabled={!sliceKey || !!bundling} onClick={download} title="README · CITATION · summary (+GeoJSON) · observations (parquet/CSV) · the exact SQL against the release's object URLs · reproduce.R / .py">
      <Icon name="ui-download" />{bundling ? `bundle: ${bundling}` : "Download data (zip)"}</button>
    <div className="hint">README · CITATION · the summary and the observations · the exact SQL · reproduce.R / .py</div>
    <Menu label="Copy code" icon="ui-code" title="the SQL this view ran, or R / Python that runs it" items={[
      { label: "SQL", hint: "against the release's object URLs", onSelect: () => copy("sql") },
      { label: "R", hint: "DBI + duckdb; calcofi4r noted", onSelect: () => copy("r") },
      { label: "Python", hint: "duckdb; calcofi4py noted", onSelect: () => copy("py") }]} />
    <Menu label="Cite this data" icon="ui-cite" title="the citations for the datasets this view pools, plus the integrated database" data-tour="cite" items={[
      { label: "Copy citations", icon: "ui-copy", hint: `text — the release + ${viewDatasetKeys.length} dataset${viewDatasetKeys.length === 1 ? "" : "s"} in view`, onSelect: () => copyCite("text") },
      { label: "Copy BibTeX", icon: "ui-code", hint: "@misc, one per dataset + the release", onSelect: () => copyCite("bibtex") },
      { label: "Data Sources & Attribution", icon: "ui-open", hint: "licences, DOIs, PIs, contacts — every dataset", onSelect: openSources },
      { label: "Register a product", icon: "ui-product", hint: "tell us what you built with these data", onSelect: () => openModal("product") }]} />
    <button className="pill act" onClick={() => { copyLink(); trackEvent("share", { kind: "link" }); }} title="the URL is the whole view: selection, filters, map extent, folds and the years' zoom"><Icon name="ui-link" />Copy link</button>
    <div className="row"><button className="pill act" onClick={() => shareImage("copy")} title="the view as a figure, to the clipboard"><Icon name="ui-copy" />Copy image</button><button className="pill act" onClick={() => shareImage("download")} title="the same figure, as a file"><Icon name="ui-image" />Download PNG</button></div>
    <div className="hint">the map and the open panels, with the selection, the release and the URL stamped</div>
    <button className="pill act" onClick={() => openModal("product")} title="tell us what you built with these data"><Icon name="ui-product" />Register a product</button>
    <button className="pill act" onClick={() => openModal("feedback")} title="this view's URL, a screenshot you can mark up, and your note — to the team"><Icon name="ui-feedback" />Send feedback</button>
    <button className="pill act" onClick={() => { if (advanced && !minCards.timing) setAdvanced(false); else { setAdvanced(true); openCard("timing"); } }} aria-pressed={advanced} title="the timing marks and the SQL behind the view"><Icon name="ui-sql" />SQL &amp; timing</button>
  </div>;
  const selectBody = <>
    <div className="tabs" role="tablist" aria-label="Controls">{(["select", "refine", "share"] as Tab[]).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}><Icon name={t === "select" ? "ui-data" : t === "refine" ? "ui-filter" : "ui-share"} />{t === "select" ? "Select" : t === "refine" ? "Refine" : "Share"}</button>)}</div>
    <div className={`tab-body tab-${tab}`} data-tour={tab === "refine" ? "filters" : undefined}>{tab === "select" ? selectTab : tab === "refine" ? refineTab : shareTab}</div>
  </>;
  const depthBody = (wide: boolean) => <DepthStrip rows={depthRows} band={sel.depth} theme={theme} unit={unitLabel} empty={depthEmpty} onBand={(b) => setSel({ depth: b ?? [0, 500] })} byDataset={wide && depthDs.length ? { rows: depthDs, color: dsColor, short } : null} />;
  const yearsBody = <YearStrip rows={yearRows} monthRows={monthRows} onNeedMonths={setNeedMonths} years={years} months={sel.months} yearMax={yearMax} theme={theme} mode={seriesMode} unit={unitLabel} stat={stat} log={ylog}
    view={sel.yview} onView={(v) => setSel({ yview: v })} onYears={(y, m) => setSel({ years: y ?? [1949, YEAR_OPEN], months: y ? m ?? null : null })} gantt={gantt} />;
  const sectionBody = <SectionPlot cells={sectionCells} clim={climCells} anom={sel.anom && sel.realm === "env" && !!climCells} yLabel={sel.realm === "env" ? "depth (m)" : "year"} theme={theme} unit={unitLabel}
    title={`line ${sel.line} · ${sel.realm === "env" ? `cruise ${sel.cruise ?? "—"}${sel.anom && climCells ? ` · the difference from the ${climWindow ? `${climWindow[0]}–${climWindow[1]}` : "1993–2013"} normal` : ""}` : "all cruises · tows are depth-integrated, so y is year"}`} />;
  const cruiseBody = <CruiseSeries rows={cruiseRows} stat={stat} selected={sel.cruise} theme={theme} unit={unitLabel} onPick={(k) => setSel({ cruise: k })} />;
  const stationBody = <StationCard summary={stationCard?.summary} detail={stationCard?.detail} theme={theme} short={short} yearMax={yearMax} />;
  const layersBody = <LayersCard sel={sel} setSel={setSel} theme={theme} defs={spatialLayers.layers} />;
  const seaFloorOn = bathyOn(bathyFromSel(sel));
  const visibleBoundaries = (sel.layers ?? []).map((st) => ({ st, d: spatialLayers.layers.find((d) => d.id === st.id) })).filter((x): x is { st: (typeof x)["st"]; d: SpatialLayerDef } => !!x.d);
  const boundaries: BoundaryState = { base: spatialLayers.pmtiles_base, defs: spatialLayers.layers, styles: sel.layers ?? [],
    regionOutline: displayLens === "region" ? sel.layer : null };
  // D28 reshaped: the Sections lens (env) as a deck-only curtain scene — desktop only, the phone keeps 2-D
  const view3dOn = sel.view3d && displayLens === "section" && sel.realm === "env" && !phone;
  // the scene needs the map box: the section card minimizes while 3-D is on (a URL-opened view too), and comes back
  useEffect(() => { setMinCards((m) => ({ ...m, section: view3dOn })); }, [view3dOn]);
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
  const titles: Record<PanelId, ReactNode> = {
    select: "Controls", depth: "Depth", years: "Time", section: <>Section <span className="plain">· line {sel.line}{sel.realm === "env" && sel.cruise ? ` · ${sel.cruise}` : ""}</span></>, cruise: "Cruise series", layers: "Layers",
    station: stationCard ? <>{stationCard.grid_key} <span className="plain">· line {stationCard.cell?.line} station {stationCard.cell?.station}</span></> : "Station",
    timing: <>SQL &amp; timing <span className="plain">· {anyCached ? "warm" : "cold"} · paint {firstPaint ?? "…"} · ready {readyAt ?? "…"} · query {lastQ ? lastQ.ms : "…"} · switch {grain ? grain.ms : "…"} ms</span></>,
  };
  const titleText: Record<PanelId, string> = { select: "Controls", depth: "Depth", years: "Time", section: `Section · line ${sel.line}${sel.realm === "env" && sel.cruise ? ` · ${sel.cruise}` : ""}`, cruise: "Cruise series", layers: "Layers", station: stationCard ? `${stationCard.grid_key} · line ${stationCard.cell?.line} station ${stationCard.cell?.station}` : "Station", timing: "SQL & timing" };
  const icons: Record<PanelId, IconName> = { select: "ui-tune", depth: "ui-tune", years: "ui-years", section: "lens-sections", cruise: "lens-cruises", station: "lens-stations", timing: "ui-sql", layers: "ui-map-layers" };
  const body = (id: PanelId, wide = false) => id === "select" ? selectBody : id === "depth" ? depthBody(wide) : id === "years" ? yearsBody : id === "section" ? sectionBody : id === "cruise" ? cruiseBody : id === "station" ? stationBody : id === "layers" ? layersBody : timingBody;
  const actions = (id: PanelId) => (id === "years" ? <>{sel.yview && <IconButton icon="ui-zoom-out" label="Reset zoom (double-click the strip)" className="sm" onClick={() => setSel({ yview: null })} data-tour="zoom-reset" />}{seriesToggle}{logChip}</> : null);
  // ── figures (D19) and the whole-view share (D17): every panel exports PNG · SVG · CSV from its header with the shared footer
  // the stamp's third line is the datasets the figure pools (WS-A3): a figure travels further than any other
  // download and used to leave the app with no way back to whom to cite
  const stampFor = (id: FigureId): Stamp => ({ title: `${id === "map" ? `Map · ${LENS_SHORT[sel.lens]}` : titleText[id]} · ${legendTitle}${id === "map" && seaFloorOn ? " · sea floor: GEBCO 2025" : ""}`, release: rel, url: location.href, datasets: viewDatasetKeys }); // the legend title carries the unit; the stamp credits GEBCO (D27)
  const plotDivOf = (id: PanelId) => document.querySelector<HTMLElement>(`.max-panel.panel-${id} .js-plotly-plot, .sheet .panel-body-${id} .js-plotly-plot, .card-${id} .js-plotly-plot`);
  const panelElOf = (id: PanelId) => document.querySelector<HTMLElement>(`.max-panel.panel-${id}, .sheet .panel-body-${id}, .card-${id}`);
  // the map's table is what it draws: the lens summary per station / hexagon / region, the samples along a cruise track
  const mapRows = (): Row[] => sel.lens === "hex" ? hexRows : sel.lens === "region" ? regionRows : sel.lens === "cruise" ? cruiseSamples : stationRows;
  const rowsOf = (id: FigureId): Row[] => id === "map" ? mapRows() : id === "years" ? (seriesMode === "cruises" && gantt ? gantt.rows : (monthRows ?? yearRows)) : id === "depth" ? (depthDs.length ? depthDs : depthRows)
    : id === "section" ? sectionCells : id === "cruise" ? cruiseRows : id === "timing" ? marks : id === "station" ? (stationCard?.detail?.datasets ?? stationCard?.summary?.datasets ?? []).flatMap((d: any) => (d.years?.length ? d.years.map((y: [number, number]) => ({ grid_key: stationCard!.grid_key, dataset_key: d.dataset_key, year: y[0], n_obs: y[1] })) : [{ grid_key: stationCard!.grid_key, dataset_key: d.dataset_key, n_obs: d.n_obs, year_min: d.year_min, year_max: d.year_max }])) : [];
  // the figure as a blob (no download): what the export items and window.__figure share
  const figure = async (id: FigureId, kind: "png" | "svg" | "csv"): Promise<{ blob: Blob; name: string }> => {
    const name = figureName(id, sel.lens, rel, kind), st = stampFor(id);
    if (kind === "csv") return { blob: csvBlob(rowsOf(id), viewDatasetKeys), name };
    if (id === "map") {
      // the map box without the panels, the pills and its own buttons — the basemap, the layers and the title, stamped
      if (kind === "svg") throw new Error("the map is WebGL — export it as PNG (the panels export SVG)");
      const el = mapBox.current; if (!el) throw new Error("map: nothing to export");
      return { blob: await canvasBlob(await captureView({ root: el, stamp: st, scale: 2, hide: [".card", ".map-br", ".edge-pills", ".phone-pills", ".sheet", ".welcome"] })), name }; // 2× like the panels (the whole-view share stays at the device ratio)
    }
    const div = plotDivOf(id);
    if (kind === "svg") { if (!div) throw new Error(`${id}: no plot to export as SVG (a card of several plots exports as PNG)`); return { blob: await plotSvg(div, st), name }; }
    if (div && id !== "station") return { blob: await plotPng(div, st), name };
    const el = panelElOf(id); if (!el) throw new Error(`${id}: nothing to export`);
    return { blob: await canvasBlob(await captureView({ root: el, stamp: st })), name }; // the station card: several mini plots -> the DOM capture
  };
  const exportItems = (id: FigureId): MenuItem[] => {
    const go = (kind: "png" | "svg" | "csv") => async () => { try { const f = await figure(id, kind); saveBlob(f.blob, f.name); setStatus(`saved ${f.name}`); trackEvent("export", { panel: id, kind }); } catch (e: any) { setStatus(`export failed: ${e.message}`); } };
    const items: MenuItem[] = [{ label: "PNG", icon: "ui-image", hint: id === "map" ? "the map and its title, 2×, with the selection and release stamped" : "2×, with the selection and release stamped", onSelect: go("png") }];
    if (id !== "station" && id !== "timing" && id !== "map") items.push({ label: "SVG", icon: "ui-code", hint: "vector, for papers", onSelect: go("svg") });
    items.push({ label: "CSV", icon: "ui-data", hint: id === "timing" ? "the timing marks" : id === "map" ? `the ${sel.lens === "cruise" ? "samples on the track" : `${LENS_SHORT[sel.lens].toLowerCase()} summary`} the map draws (the bundle's, too)` : "this panel's table (the bundle's, too)", onSelect: go("csv") });
    return items;
  };
  const viewStamp = (): Stamp => ({ title: legendTitle, release: rel, url: location.href, datasets: viewDatasetKeys });
  const shareImage = async (how: "copy" | "download") => {
    try {
      setStatus("capturing the view…");
      const c = await captureView({ stamp: viewStamp() }); const blob = await canvasBlob(c);
      const st = luminanceStats(c); if (st.nonBg < 0.02) setStatus("capture looks blank — try Download PNG, or a screenshot");
      const name = figureName("view", sel.lens, rel, "png");
      if (how === "copy" && (await copyImage(blob))) setStatus("image copied"); else { saveBlob(blob, name); setStatus(how === "copy" ? "clipboard blocked — downloaded instead" : `saved ${name}`); }
      trackEvent("share", { kind: how === "copy" ? "image" : "png" });
    } catch (e: any) { setStatus(`capture failed: ${e.message}`); }
  };
  (window as any).__figure = async (id: FigureId, kind: "png" | "svg" | "csv") => { const f = await figure(id, kind); const out: any = { name: f.name, bytes: f.blob.size, type: f.blob.type }; if (kind === "png") { Object.assign(out, await blobStats(f.blob)); out.dataUrl = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f.blob); }); } else { const t = await f.blob.text(); out.text = t.slice(0, 300); out.tail = t.slice(-600); out.stamped = /release /.test(t); out.lines = t.split("\n").length; } return out; };
  (window as any).__stampLines = (id: FigureId = "years") => stampLines(stampFor(id)); // verify.mjs: the footer's three lines (WS-A3)
  (window as any).__cite = (kind: "text" | "bibtex" = "text") => (kind === "bibtex" ? citeBibtex(viewDatasetRows, catalog, rel) : citeText(viewDatasetRows, catalog, rel, location.href));
  (window as any).__fontEmbedCss = fontEmbedCss;   // verify.mjs: the v2 capture embeds the brand fonts
  (window as any).__captureView = async () => { const c = await captureView({ stamp: viewStamp() }); return { w: c.width, h: c.height, ...luminanceStats(c), dataUrl: c.toDataURL("image/png") }; };
  const cardOpen: Record<CardId, boolean> = { section: displayLens === "section", cruise: displayLens === "cruise", station: !!stationCard, timing: advanced, layers: layersOpen };
  const maxId: PanelId | null = sel.max && !phone && (sel.max === "select" || sel.max === "depth" || sel.max === "years" || cardOpen[sel.max as CardId]) ? sel.max : null;
  // ── the panels' home geometry: Select top-left, Years along the bottom, Depth on the right, a lens result above the
  // years, the cards beside the Depth panel or its pill. Dragged or resized, a panel keeps its own place per browser.
  const yearsOpen = !folded("years"), depthOpen = !folded("depth"), selectOpen = !folded("select");
  const resultUp = (cardOpen.section && !minCards.section) || (cardOpen.cruise && !minCards.cruise);
  const stationUp = cardOpen.station && !minCards.station;
  const rightBand = depthOpen ? 230 : 48;
  const tallCap = `calc(100% - 62px - ${yearsOpen ? 150 : 0}px)`; // under the map's top-right row, above the Time panel
  const panelBox: Record<PanelId, CardBox> = {
    select: { left: 10, top: 10, width: 320, maxHeight: `calc(100% - 20px - ${yearsOpen ? 150 : 0}px)` },   // never under the Time panel: the body scrolls instead
    years: { left: 10, right: 60, bottom: 10, height: 140 },
    depth: { right: 10, top: 52, width: 210, height: `calc(100% - ${yearsOpen || resultUp ? 212 : 62}px)` },
    section: { left: selectOpen ? 340 : 10, right: 60, bottom: yearsOpen ? 160 : 10, height: "42%" },
    cruise: { left: selectOpen ? 340 : 10, right: 60, bottom: yearsOpen ? 160 : 10, height: "34%" },
    station: { top: 52, right: rightBand, width: 340, maxHeight: tallCap },
    timing: { top: 52, right: rightBand + (stationUp ? 350 : 0), width: 420, maxHeight: tallCap },
    layers: { top: 52, right: rightBand + (stationUp ? 350 : 0), width: 270, maxHeight: tallCap },
  };
  const docks: Record<PanelId, Dock> = { select: "left", depth: "right", years: "bottom", section: "bottom", cruise: "bottom", station: "right", timing: "right", layers: "right" };
  const closeCard: Partial<Record<CardId, () => void>> = { station: () => setSel({ station: null }), timing: () => setAdvanced(false), layers: () => setLayersOpen(false) };
  const isRail = (id: PanelId) => id === "select" || id === "depth" || id === "years";
  const panel = (id: PanelId) => {
    if (phone) return null;
    if (isRail(id) ? folded(id) : !(cardOpen[id as CardId] && !minCards[id as CardId])) return null;
    const tourId = id === "select" ? "rail" : id === "years" ? "years" : id === "depth" ? "depth" : id === "station" ? "station" : id === "layers" ? "layers-card" : undefined;
    return <Panel key={id} id={id} title={titles[id]} icon={icons[id]} boxRef={mapBox} defaults={panelBox[id]} dock={docks[id]} collapsed={false} onCollapse={() => (isRail(id) ? toggleFold(id) : minCard(id as CardId))}
      maximized={maxId === id} onMax={() => toggleMax(id)} onClose={isRail(id) ? undefined : closeCard[id as CardId]} actions={actions(id)} exportable={id === "select" || id === "layers" ? undefined : exportItems(id)}
      raised={topCard === id} onTouch={() => setTopCard(id)} autoHeight={id === "select" || id === "station" || id === "timing" || id === "layers"} minWidth={id === "select" ? 260 : 180} minHeight={id === "select" ? 200 : 100} data-tour={tourId}>{body(id)}</Panel>;
  };
  // a collapsed panel is a pill on the edge nearest its dock, labelled with its state
  const cardPill = (c: CardId): EdgePill => ({ id: c, icon: icons[c], label: c === "station" ? stationCard!.grid_key : c === "timing" ? "SQL & timing" : titleText[c], onRestore: () => openCard(c), onClose: closeCard[c] });
  const minimized = (cs: CardId[]) => cs.filter((c) => cardOpen[c] && minCards[c]).map(cardPill);
  // the Depth pill's three states: quiet (no depth axis for this pick), available (the band, a sparkline of the profile,
  // one pulse the moment it arrives) and brushed (the band is the filter; × resets it)
  const depthPill: EdgePill = { id: "depth", icon: "ui-tune", muted: !!sliceKey && !depthAvail, on: depthAvail, pulse: depthPulse, "data-tour": "depth", title: depthAvail ? "open the water column — drag a band to slice the map to those depths" : sliceKey ? "no depth axis for this pick — its net tows are depth-integrated" : "the water column",
    label: depthAvail ? <><b>Depth {sel.depth[0]}–{sel.depth[1]} m</b>{!depthSet && <span className="hint"> · drag to brush</span>}</> : sliceKey ? <>Depth<span className="hint"> · no depth axis</span></> : "Depth",
    extra: depthAvail ? <><VSpark rows={depthRows} band={sel.depth} />{depthSet && <button type="button" className="edge-x" aria-label="reset the depth band" title="reset the depth band" onClick={() => setSel({ depth: [0, 500] })}><Icon name="ui-close" /></button>}</> : undefined,
    onRestore: () => toggleFold("depth") };
  const leftPills: EdgePill[] = folded("select") ? [{ id: "select", icon: "ui-tune", "data-tour": "rail", title: "open the Controls panel", label: <><b>Controls</b><Icon name={LENS_ICON[sel.lens]} /><Icon name={sel.realm === "bio" ? "realm-bio" : "realm-env"} />{selectSummary}</>, onRestore: () => toggleFold("select") }] : [];
  const rightPills: EdgePill[] = [...(folded("depth") ? [depthPill] : []), ...minimized(["station", "timing", "layers"])];
  const bottomPills: EdgePill[] = [...(folded("years") ? [{ id: "years", icon: "ui-years", "data-tour": "years", title: "open the years", label: <><b>Time</b> {years[0]}–{years[1]}<Sparkline values={yearsSpark} /></>, onRestore: () => toggleFold("years") } as EdgePill] : []), ...minimized(["section", "cruise"])];
  const lensStrip = <div className="lens-strip" data-tour="lens-strip"><LensPicker lens={sel.lens} onLens={onLens} /></div>;
  const closeSheet = () => { const pnl = sheet.panel; if (pnl === "station") setSel({ station: null }); else if (pnl === "timing") setAdvanced(false); else if (pnl === "layers") setLayersOpen(false); else if (pnl === "section" || pnl === "cruise") setMinCards((m) => ({ ...m, [pnl]: true })); setSheet({ panel: "select", detent: "peek" }); };
  // the legend's rows the title sentence carries under it: the boundary layers drawn, an empty result's note, the exclusions
  const legendExtra = <>
    {visibleBoundaries.length > 0 && <div className="legend-layers">
      {visibleBoundaries.map(({ st, d }) => <div key={st.id} className="row">
        {isPalette(st.color)
          ? <span className="pal-strip">{PALETTES[st.color][theme].slice(0, 6).map((c) => <i key={c} style={{ background: c }} />)}</span>
          : <span className="swatch" style={{ background: st.color ? `#${st.color}` : (d.fill_color || d.line_color || "#9aa0a6") }} />}
        <span>{d.name}</span>{isPalette(st.color) && d.names && <span className="hint">by name · {d.names.length}</span>}
      </div>)}
    </div>}
    {emptyResult && <div className="hint warn legend-empty">nothing in the selection{filterWords.length ? ` — the filters (${filterWords.join(" · ")}) leave no observation` : ""}
      {sel.datasets && <> · <button type="button" className="linkish" onClick={() => setSel({ datasets: null })}>all datasets</button></>}</div>}
    {!preSlice && !emptyResult && sel.realm === "bio" && denInfo(sel.den ?? "raw").excluded > 0 && <div className="hint legend-empty">{fmtN(denInfo(sel.den ?? "raw").excluded)} observations excluded by the standardization</div>}
  </>;
  const sentence = !phone && <Sentence sel={sel} setSel={setSel} onLens={onLens} organismItems={organismItems} organismGroups={organismGroups} variableItems={variableItems} variableGroups={variableGroups}
    sectionCruiseItems={sectionCruiseItems} cruiseItems={cruiseItems} lines={lines} layerNames={layerNames} regionName={regionName} stages={stages} denRows={(d) => denInfo(d).rows} defaultDen={(s) => defaultDen(picker, s)}
    years={years} yearMax={yearMax} hasDepthAxis={depthAvail} hasClim={hasClim(catalog)} climWindow={climWindow} datasetsInSlice={datasetsInSlice} dsOn={dsOn} toggleDataset={toggleDataset} dsColor={dsColor} short={short}
    subject={subject} unit={preSlice ? "root samples" : (legendUnit ?? unitLabel)} domain={[(legendUnit === "year" ? fmtYear : fmt)(legendDomain[0]), (legendUnit === "year" ? fmtYear : fmt)(legendDomain[1])]} bar={rampCss(rampId)} count={inView} status={status} ready={!!sliceKey} seaFloor={seaFloorOn}
    native={native} phone={phone} loading={status} open={sentenceOpen} onToggle={toggleSentence} extra={legendExtra}
    band={{ left: selectOpen ? 340 : 48, right: Math.max(displayLens === "section" && sel.realm === "env" ? 200 : 160, rightBand + (stationUp ? 350 : 0) + (cardOpen.timing && !minCards.timing ? 430 : cardOpen.layers && !minCards.layers ? 280 : 0)) }} />;

  return (
    <div className="app">
      <header className="cc-header">
        <a className="cc-home" href="https://calcofi.io" aria-label="CalCOFI.io home">
          {/* v2: the horizontal lockup at the app scale's 28 px, the bare mark under 480 px — four <img>s and a media query
              (style.css), not <picture>: html-to-image's clone loses the image inside a <picture>, and the feedback capture
              is set from this header; v1: the 32 px mark (src/brand.ts) */}
          {BRAND === "v2" ? <>
            <img className="cc-logo-dark cc-logo-lockup" src={LOGO.dark} alt="CalCOFI" height={LOGO.height} />
            <img className="cc-logo-light cc-logo-lockup" src={LOGO.light} alt="CalCOFI" height={LOGO.height} />
            <img className="cc-logo-dark cc-logo-mark" src={LOGO.markDark} alt="CalCOFI" height={LOGO.height} loading="lazy" />
            <img className="cc-logo-light cc-logo-mark" src={LOGO.markLight} alt="CalCOFI" height={LOGO.height} loading="lazy" />
          </> : <>
            <img className="cc-logo-dark" src={LOGO.dark} alt="CalCOFI" width="32" height="32" />
            <img className="cc-logo-light" src={LOGO.light} alt="CalCOFI" width="32" height="32" />
          </>}
        </a>
        <a className="cc-title" href="./">{BRAND === "v1" && <span className="cc-title-org">CalCOFI </span>}Explorer<small><Icon name={LENS_ICON[sel.lens]} /> {LENS_SHORT[sel.lens]}</small></a>
        <span className="cc-spacer" />
        {/* the release chip sits at the right with the tools; Help gathers the tour, the welcome, About, the sources and the keyboard */}
        {/* one release picker: the word links to the schema and release notes, the bold value is a select of the releases (reloads) */}
        <span className="cc-release cc-release-pick" data-tour="release" title="CalCOFI integrated database release — every value shown comes from this frozen release">
          <a className="cc-release-word" href={`https://calcofi.io/db-schema/#erd?v=${rel}`} title="schema and release notes">release</a>
          {versions.length > 1
            ? <><select className="cc-versions" value={version ?? ""} aria-label="release" onChange={(e) => { setSel({ release: e.target.value }); location.search = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), release: e.target.value }).toString(); }} title="switch release (reloads)">
                {versions.map((v) => <option key={v} value={v}>{v}</option>)}</select><Icon name="ui-down" className="car" size="0.9em" /></>
            : <b>{rel}</b>}
        </span>
        <Menu className="cc-help hdr" icon="ui-help" label={<span className="label">Help</span>} title="the tour · start here · about · data sources · keyboard" align="right" data-tour="help" items={[
          { label: "Take the tour", icon: "ui-play", hint: "twelve steps; ? replays it", onSelect: tour },
          { label: "Start here", icon: "ui-home", hint: "the welcome: two doors and four questions", onSelect: () => openModal("welcome") },
          { label: "About", icon: "ui-about", hint: "what this is, the release, the datasets, credits", onSelect: () => openModal("about") },
          { label: "Data Sources & Attribution", icon: "ui-cite", hint: "citations, licences, DOIs, contacts", onSelect: openSources },
          { label: "Register a product", icon: "ui-product", hint: "tell us what you built with these data", onSelect: () => openModal("product") },
          { label: "Keyboard", icon: "ui-keyboard", hint: "? tour · Esc closes · ↑ ↓ Enter in the lists · drag to brush", onSelect: () => openModal("about", "keyboard") },
          { label: "Send feedback", icon: "ui-feedback", hint: "this view's URL, a screenshot you can mark up, your note — to the team", onSelect: () => openModal("feedback") }]} />
        <button className="cc-theme-toggle" type="button" aria-label="Toggle dark / light theme" title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
          {/* the sun while dark, the moon-in-sun while light — what a click switches to (theme.css shows one per theme) */}
          <svg className="cc-theme-icon cc-icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_SUN} /></svg>
          <svg className="cc-theme-icon cc-icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_MOON} /></svg>
        </button>
      </header>
      <div className="main">
        <div className="panel mapwrap" ref={mapBox} data-tour="map">
          {view3dOn
            ? <Curtain3D cells={sectionCells} clim={climCells} anom={sel.anom && !!climCells} theme={theme} line={sel.line} grid={grid} exag={sel.exag ?? 60} onExag={(v) => setSel({ exag: v })} unit={unitLabel} />
            : <MapView layers={layers} theme={theme} bathy={bathyFromSel(sel)} boundaries={boundaries} view={sel.map ?? MAP_HOME} onView={(v) => setSel({ map: v })} onOverlay={(o) => { overlayRef.current = o; }} getTooltip={getTooltip} onClick={onClick} onFirstFrame={() => timing.add("first_paint", performance.now() - window.__t0, "basemap + grid dots")} />}
          {/* the map's own row, top right: zoom · layers · its ⬇ (· 3-D in the Sections lens); Depth and the cards start under it */}
          <div className="map-tr">
            <span className="map-zoom" role="group" aria-label="zoom">
              <IconButton icon="ui-plus" label="Zoom in" className="map-zoom-btn" onClick={() => (window as any).__map?.zoomIn()} />
              <IconButton icon="ui-minus" label="Zoom out" className="map-zoom-btn" onClick={() => (window as any).__map?.zoomOut()} />
            </span>
            <IconButton icon="ui-map-layers" label="Map layers — the sea floor" className="map-layers-btn" data-tour="layers"
              onClick={() => { if (layersOpen) setLayersOpen(false); else { setLayersOpen(true); setTopCard("layers"); if (phone) setSheet({ panel: "layers", detent: "half" }); } }} />
            <Menu className="export-menu map-export" icon="ui-download" label="" title="export the map: PNG (the map and its title, stamped) · CSV (the table it draws) — WebGL has no SVG" align="right" data-tour="map-export" items={exportItems("map")} />
            {displayLens === "section" && sel.realm === "env" && !phone &&
              <button type="button" className="map-3d-btn" title="the section as a 3-D curtain over the sea floor (D28)"
                onClick={() => setSel({ view3d: !sel.view3d })}>{sel.view3d ? "2D" : "3D"}</button>}
          </div>
          {sentence}
          {phone && <div className="map-tl">
            <div className="legend" data-tour="legend">
              <div className="ttl">{legendTitle}</div>
              <div className="bar" style={{ background: rampCss(rampId) }} />
              <div className="ticks"><span>{fmt(domain[0])}</span><span>5–95 %</span><span>{fmt(domain[1])}</span></div>
              <div className="hint">{status}{sliceKey ? ` · ${fmtN(inView)} observations` : ""}</div>
              {legendExtra}
            </div>
          </div>}
          {(["select", "years", "depth", "section", "cruise", "station", "timing", "layers"] as PanelId[]).map(panel)}
          {!phone && <><EdgePills side="left" pills={leftPills} /><EdgePills side="right" pills={rightPills} /><EdgePills side="bottom" pills={bottomPills} /></>}
          {phone && <>
            <div className="phone-pills" style={{ bottom: SHEET_PEEK + 8 }}>
              <button type="button" className={`pill${sliceKey && !depthRows.length ? " muted" : ""}`} onClick={() => setSheet({ panel: "depth", detent: "half" })} data-tour="depth"><Icon name="ui-tune" />{depthSummary}</button>
              <button type="button" className="pill" onClick={() => setSheet({ panel: "years", detent: "half" })} data-tour="years"><Icon name="ui-years" />Time {years[0]}–{years[1]}<Sparkline values={yearsSpark} width={40} height={10} /></button>
              <button type="button" className="pill map-layers-pill" data-tour="layers" onClick={() => { setLayersOpen(true); setSheet({ panel: "layers", detent: "half" }); }}><Icon name="ui-map-layers" />Layers</button>
              {(["section", "cruise", "station", "timing", "layers"] as CardId[]).filter((c) => cardOpen[c] && sheet.panel !== c).map((c) => <button key={c} type="button" className="pill" onClick={() => openCard(c)}><Icon name={icons[c]} />{c === "station" ? stationCard!.grid_key : c === "timing" ? "SQL & timing" : titleText[c]}</button>)}
            </div>
            <Sheet detent={sheet.detent} onDetent={(d) => setSheet((s) => ({ ...s, detent: d }))} title={sheet.panel === "select" ? undefined : titles[sheet.panel]} onClose={sheet.panel === "select" ? undefined : closeSheet} exportable={sheet.panel === "select" || sheet.panel === "layers" ? undefined : exportItems(sheet.panel)} data-tour="sheet"
              peek={sheet.panel === "select" ? <>
                <div className="sheet-summary" onClick={() => setSheet((s) => ({ ...s, detent: s.detent === "peek" ? "half" : "peek" }))}><Icon name={LENS_ICON[sel.lens]} /><Icon name={sel.realm === "bio" ? "realm-bio" : "realm-env"} /><span>{selectSummary}</span></div>
                {lensStrip}</> : sheet.panel === "years" ? actions("years") : null}>
              {sheet.panel === "select" ? selectBody : <div className={`panel-body panel-body-${sheet.panel}`}>{body(sheet.panel, true)}</div>}
            </Sheet>
          </>}
          {modal === "welcome" && <Welcome release={rel} yearMax={yearMax} nOrganisms={organismItems.length} nVariables={variableItems.length} onStart={startExploring} onTour={tour} onDoor={door} onQuestion={question} onCite={openSources} onClose={closeModal} />}
        </div>
        {maxId && <MaxPanel id={maxId} title={titles[maxId]} icon={icons[maxId]} onRestore={() => setSel({ max: null })} actions={actions(maxId)} exportable={maxId === "select" ? undefined : exportItems(maxId)}>{body(maxId, true)}</MaxPanel>}
      </div>
      {modal === "about" && <About release={rel} nTables={catalog?.tables.length} datasets={datasets} cov={cov} short={short} onClose={closeModal} onTour={tour} onFeedback={() => openModal("feedback")} onSources={openSources} providerTable={providerTable} at={aboutAt} />}
      {modal === "sources" && <SourcesModal release={rel} catalog={catalog} datasets={datasets} cov={cov} inView={viewDatasetKeys} providerTable={providerTable} short={short}
        onClose={closeModal} onRegister={() => openModal("product")} onCite={() => copyCite("text")} />}
      {(modal === "feedback" || modal === "product") && <FeedbackDialog kind={modal === "product" ? "product" : "feedback"} datasets={viewDatasetKeys} url={location.href} release={rel} onClose={closeModal} capture={() => captureView({ stamp: viewStamp() })} />}
    </div>
  );
}
