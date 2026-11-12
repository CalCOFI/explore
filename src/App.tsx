// the shell: brand header, controls (lens · picker · years · stat), map + legend + status, depth strip,
// year strip, section / cruise / station panels, timing panel. every view is a pure function of the
// release slice + the URL. data comes from the release catalog (release.ts), never a hand-built path.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PickingInfo } from "@deck.gl/core";
import { engine, timing, hexExpr, datasetFilterSql, type Mark, type Row } from "./engine";
import { UNIFIED, members, setUnified, unifiedDefs } from "./variables";
import { castVariables, derivedFamily, derivedTip, grainCount, grainWord, variableGrain, DERIVED_FAMILY, type CastCensusRow, type RegistryRow, type VarGrain } from "./castgrain";
import { qualOkSQL } from "./qual";
import { lineThreads, nearestSectionLine, resolveStation, sectionLines, type CrosswalkRow } from "./gridkey";
import { effortPaths as toEffortPaths, effortSummary, type EffortPath, type EffortRow } from "./effort";
import { lit, render, CRUISE_MONTH_SQL, cruiseSrcSql, cruiseFilterSql, djfSql, type Params } from "./sqltpl";
import { buildLayers, MapView, quantileDomain, colorScale, type GridCell, type StatRow, type LayerInputs } from "./map";
import { computeSurface, surfaceImage, isolines, niceLevels, joinSegments, labelPoints, thinLabels, cellToLonLat, cellValue, landMask, MASK_KM, type Surface as SurfaceResult } from "./contour";
import { LensPicker } from "./lenspicker";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import { drawsAnomaly, lensRamp, rampCss, seriesRamp } from "./ramps";
import { DepthStrip, YearStrip, SectionPlot, DepthTimePlot, CruiseSeries, StationCard, MONTH_LOD_YEARS, type DepthRow, type YearRow, type CruiseSeason, type SectionCell, type CruiseRow, type GanttRow, type StripMode } from "./charts";
import { resolveVersion, fetchCatalog, fetchVersions, sources, sidecarUrl, earlySidecar, type Catalog } from "./release";
import { buildBundle, buildObservationsCsv, countZeroRows, saveBlob, copyAs } from "./bundle";
import { StatPick, ViewAs, ViewMenu, WhereControl, LineStation, LayerSelect, DownloadBar, DepthPill, WhatPicker } from "./leanpanel";
import { Icon } from "./icons";
import { cellToLatLng } from "h3-js";
import { Picker, type PickerItem, type GroupOpt } from "./picker";
import { Menu, Group, NumInput, YearRange, YearSlider } from "./ui";
import { ordered, yearComplete } from "./ranges";
import { parseGridKey } from "./gridkey";
import { lineKeys, lineItemsOf, linesArea, polyFeature, simplifyPath, parseArea, areaSql, areaToUrl, areaWord, boxFeature, featuresBbox, pickedArea, regionOutline, regionsOfFeature, resolveArea, PATTERN_WORD, type Area } from "./area";
import { RegionPicker } from "./regionpicker";
import { Panel, EdgePills, MaxPanel, Sheet, Sparkline, VSpark, SHEET_PEEK, type CardId, type CardBox, type Detent, type Dock, type EdgePill } from "./panels";
import { Sentence, type DerivedNote } from "./sentence";
import { LayersCard } from "./layers";
import { Curtain3D, Nav3D, cam3d } from "./curtain";
import { bathyFromSel, bathyOn, boundaryLayerIds, effectiveLayers, isPalette, LAND_LAYER, PALETTES, type BoundaryState, type SpatialLayerDef, type SpatialLayers } from "./basemap";
import spatialFallback from "./spatial_layers.fallback";
import { areaLayerReason, boundaryTooltip, isAreaCandidate, layerLabel, mergeRegistry, shownName, regionLabel, regionStatusMap } from "./spatial_registry";
import type { IconName } from "./icons";
import { Welcome, About, seenWelcome, markWelcome, markCiteAck } from "./help";
import { fromUrl as selFromUrl } from "./state";
import { SourcesLine, SourcesModal } from "./sources";
import { citeBibtex, citeText, datasetPageUrl, dsLongName, dsName, doiUrl } from "./cite";
import { FeedbackDialog } from "./feedback";
import { startTour, type TourActions } from "./tour";
import { IconButton, type MenuItem } from "./ui";
import { figureName, plotPng, plotSvg, csvBlob, copyImage, stampLines, type Stamp } from "./export";
import { captureView, canvasBlob, luminanceStats, blobStats } from "./capture";
import { track as trackEvent } from "./track";
import { BRAND, LOGO, DEFAULT_THEME, fontEmbedCss } from "./brand";
import { categoryRank, categoryIcon, envCategory, DATASET_CATEGORY_FALLBACK } from "./categories";
import { titleCaseCommonName, humanizeCode, fixDisplayName, canonicalBase, repScore, shortName, knownName } from "./names";
import { dtEmpty, type DtRow } from "./depthtime";
import { CLIM_MIN_CRUISES, SEASON_CODE, SEASON_NAME, SEASON_WORD, anomTokens, baselineWord, climBaseSql, cruiseMonth, hasSeasonCols, noBaseline, noBaselineWhy, sectionRange, type ClimBase } from "./anomaly";
import { PREVIEW, PREVIEW_HOME } from "./preview";
import { feedbackEndpoint } from "./feedback";
import { cruiseStage, hasStageCols, stageIndex, stageProbeSql, viewStage, type StageIndex } from "./stage";
import {
  DEFAULTS, DEN_SHORT, fromUrl, toUrl, defaultStage, defaultDen, LENSES, LENS_TITLE, LENS_SHORT, LENS_DESC, LENS_ICON, RES_KM, INTERPS, INTERP_LABEL, INTERP_WORD, INTERP_HOW, SURFACES, SURFACE_LABEL, GRAIN_LABEL, GRAIN_HOW, type Surface, type Grain, ENV_VARS_FALLBACK, VAL_COL, DEN_LABEL, DEN_HOW, SHF_NOTE, STAT_LABEL, YEAR_OPEN, MAP_HOME,
  type Sel, type Lens, type Den, type Stat, type PickerRow, type PanelId,
} from "./state";
type FigureId = PanelId | "map"; // what exports PNG · SVG · CSV from a header: every panel, and the map from its own ⬇
type Tab = "select" | "refine" | "share"; // the Select panel's tabs (the light layout, 2026-09-06)
type ModalId = "welcome" | "about" | "feedback" | "product" | "sources"; // "product" is the feedback dialog's second kind (WS-A3)

const DS_SHORT: Record<string, string> = {
  swfsc_ichthyo: "ichthyo", swfsc_cufes: "CUFES", calcofi_bottle: "bottle", "calcofi_ctd-cast": "CTD", calcofi_dic: "DIC", calcofi_mets: "METS",
  "cce-lter_zoodb": "zoodb", "cce-lter_zooscan": "zooscan", "cce-lter_euphausiids": "euphausiids", calcofi_phytoplankton: "phyto",
  calcofi_phyllosoma: "phyllosoma", "sio_mesopelagic-fish": "mesopelagic", "farallon_bird-mammal": "farallon", "cdfw_dungeness-crab": "dungeness",
  "sio_pic-zooplankton": "PIC", "calcofi_picoplankton": "picoplankton", "calcofi_ctd-derived": "CTD derived",
};
const short = (d: string) => DS_SHORT[d] ?? d;
// which dataset a species opens on when it is in several (Betty 2026-11-10: "the one with most obs may not be most important"
// — Pacific Sardine should open on Ichthyoplankton, not CUFES). CalCOFI's core long-running net-tow series first, in this
// order; then a dataset with standardized counts (per 10 m² / 1000 m³); then the most data.
const DS_PRIMARY = ["swfsc_ichthyo", "cce-lter_euphausiids", "cce-lter_zoodb", "calcofi_phytoplankton", "swfsc_invert", "calcofi_phyllosoma", "cce-lter_zooscan"];
function defaultDataset(rows: PickerRow[]): string {
  const m = new Map<string, { n: number; std: boolean }>();
  for (const r of rows) { const c = m.get(r.dataset_key) ?? { n: 0, std: false }; c.n += r.n; c.std ||= r.n_10m2 > 0 || r.n_1000m3 > 0; m.set(r.dataset_key, c); }
  const rank = (dk: string) => { const i = DS_PRIMARY.indexOf(dk); return i < 0 ? 99 : i; };
  return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || Number(b[1].std) - Number(a[1].std) || b[1].n - a[1].n)[0]?.[0] ?? "";
}
// the dataset line under the species / measurement card (Betty 2026-11-10, option B): a plain name and how the data were
// collected, so "Ichthyoplankton" or "CUFES" explain themselves. From each dataset's description in metadata/dataset.csv;
// a dataset not listed falls back to its release name and no hint.
const DS_PLAIN: Record<string, [string, string]> = {
  swfsc_ichthyo: ["SWFSC Ichthyoplankton", "fish eggs & larvae from net tows"],
  swfsc_cufes: ["CalCOFI CUFES", "fish eggs pumped while the ship moves"],
  swfsc_invert: ["SWFSC Invertebrates", "squid etc. from the ichthyoplankton nets"],
  "calcofi_2022-edna": ["CalCOFI eDNA 2022", "DNA found in water samples"],
  calcofi_bottle: ["CalCOFI Bottle", "water samples at set depths"],
  "calcofi_ctd-cast": ["CalCOFI CTD", "sensor profiles while lowering"],
  "calcofi_ctd-derived": ["CalCOFI CTD derived", "computed from CTD profiles"],
  calcofi_dic: ["CalCOFI DIC", "carbon from bottle samples"],
  calcofi_mets: ["CalCOFI ship sensors", "measured underway"],
  "cce-lter_zoodb": ["CCE-LTER ZooDB", "zooplankton counted by microscope"],
  "cce-lter_zooscan": ["CCE-LTER ZooScan", "zooplankton counted from scanned images"],
  "cce-lter_euphausiids": ["CCE-LTER Krill", "krill from net tows"],
  calcofi_phytoplankton: ["CalCOFI Phytoplankton", "counted by microscope"],
  calcofi_phyllosoma: ["CalCOFI Lobster Larvae", "from net tows"],
};
// brand v1's theme-toggle pair (Material Design Icons brightness-7 / brightness-4, Apache-2.0): the same
// paths theme.js injects elsewhere; rendered here so React owns the nodes and theme.js only sets the title
const ICON_SUN = "M12 8a4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4 4 4 0 0 0-4-4m0 10a6 6 0 0 1-6-6 6 6 0 0 1 6-6 6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z";
const ICON_MOON = "M12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6a6 6 0 0 1 6 6 6 6 0 0 1-6 6m8-9.31V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12z";
const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const fmtN = (v: number) => v.toLocaleString();
const fmtYear = (v: number) => String(Math.round(v)); // a year reads 1951, not 1,951.27
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
// the query the page OPENED with, before toUrl rewrites it: a dataset page's link is `?datasets=<key>` and nothing else
const BOOT = new URLSearchParams(location.search);
const native = new URLSearchParams(location.search).get("native") === "1"; // D13: the plain <select> fallback, one release
const phoneQuery = matchMedia("(max-width: 899px)");

// registered buffer names: the SQL templates read these (`{{src}}` etc.), never a URL
const REG = { obs_bio: "obs_bio.parquet", sample_root: "sample_root.parquet", sample_spatial: "sample_spatial.parquet", taxon: "taxon.parquet", measurement_type: "measurement_type.parquet", dataset: "dataset.parquet", cruise: "cruise.parquet", provider: "provider.parquet", sample_measurement: "sample_measurement.parquet", grid_crosswalk: "grid_crosswalk.parquet", sample_track: "sample_track.parquet" } as const;
const envReg = (v: string) => `obs_env_${v}.parquet`;
// does the release hold a per-bin object (an obs_env partition) for any member type of this variable? The per-bin path
// when it does; a variable with none is per-cast only if the registry says so (castgrain.ts variableGrain())
// (a catalog with no obs_env table — a release before the browser objects — has none: an empty map, never a throw in render)
const binParts = (cat: Catalog | null): Map<string, string> => (cat?.tables.some((t) => t.name === "obs_env") ? sources(cat, "obs_env").partitions : new Map());
const hasBinObject = (cat: Catalog | null, key: string) => { const parts = binParts(cat); return members(key).some((m) => parts.has(m)); };
const hasCastTable = (cat: Catalog | null) => !!cat?.tables.some((t) => t.name === "sample_measurement");
// root_hex7: the cast's H3 cell, when the release's sample_root carries one (hex7 on sample / sample_root since
// v2026.10.04); NULL before it, and the Hexagons lens then says why it does not draw a per-cast variable
const castTokens = (rootHex7 = false) => ({ sm_src: q(REG.sample_measurement), root_src: q(REG.sample_root), mt_src: q(REG.measurement_type), root_hex7: rootHex7 ? "r.hex7" : "NULL::UBIGINT" });
// the release's `climatology` table, one hive object per measurement type like obs_env (calcofi4db::build_climatology())
const climReg = (v: string) => `climatology_${v}.parquet`;
const hasClim = (cat: Catalog | null) => !!cat?.tables.some((t) => t.name === "climatology");
// the release's `sample_track` (calcofi4db 4.35.0+: survey effort as paths); a release without it has no Effort layer, never a throw
const hasTrack = (cat: Catalog | null) => !!cat?.tables.some((t) => t.name === "sample_track");
const ZEROS_TIP = `Datasets such as ichthyo record a tow only when it caught the taxon, so a mean over their records alone is a mean over positive tows — biased high, and a surveyed year with no catch looks like a year with no survey.
By default every tow such a dataset sampled counts as 0 for this taxon (a "zero-filled tow": obs_id NULL in the export; never counted as an observation).
positive-only turns that off: mean, median and se run over the tows with a catch, as the raw records do. Datasets that record their own zeros (CUFES, ZooScan, ZooDB, phyllosoma) read the same either way.`;
// an env variable's source: the union of its member objects, each stamped with its measurement_type (the hive key)
const envSrc = (key: string) => `(${members(key).map((m) => `SELECT *, '${m}' AS measurement_type FROM '${envReg(m)}'`).join(" UNION ALL ")})`;
// the variable's member types that have a baseline object (a type with no cell >= CLIM_MIN_CRUISES cruises has no partition)
const climMembers = (cat: Catalog, key: string) => { const parts = sources(cat, "climatology").partitions; return members(key).filter((m) => parts.has(m)); };
const climSrc = (ms: string[]) => `(${ms.map((m) => `SELECT *, '${m}' AS measurement_type FROM '${climReg(m)}'`).join(" UNION ALL ")})`;
const q = (name: string) => `'${name}'`;
// the layers people reach for first sit at the top of their group (Betty 2026-11-10): MPAs, then Sanctuaries; Wind Energy Areas in theirs
const POPULAR = [/marine protected area/i, /national marine sanctuar/i, /wind energy area/i];
const popRank = (n: string) => { const t = `${n} ${shownName(n)}`, i = POPULAR.findIndex((re) => re.test(t)); return i < 0 ? POPULAR.length : i; };
// "How these are calculated": only the arithmetic, under each choice (the short description is already beside its name)
const DEN_FORMULA: Record<Den, string> = { per_10m2: "= count × standard haul factor ÷ proportion sorted (CalCOFI's larvae per 10 m²)", per_1000m3: "= count ÷ proportion sorted ÷ volume strained × 1000", raw: "" };
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** a colour window symmetric about 0 (the larger of the two 5–95 % ends), for a diverging anomaly ramp */
const symDomain = (d: [number, number]): [number, number] => { const a = Math.max(Math.abs(d[0]), Math.abs(d[1])) || 1e-9; return [-a, a]; };
// the Time strip's season bin (explore#21): the season's midpoint as a fractional year of its season_year (1 = DJF sits at
// .125 of the year its January–February fall in; a December cruise with them), beside the month bins' convention
const SEASON_BIN = "season_year::INTEGER + (quarter - 0.5) / 4.0";

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

/** the status line in plain words: no "engine warming…" jargon, just that something is loading */
// an error in plain words (Betty 2026-11-11: "error: Catalog Error: Table with name slice does not exist!" is not for
// readers): what happened and what to do; the engine's own message stays in the console and the toast's tooltip
const isErrStatus = (st: string) => /^error\b|\bfailed\b/i.test(st);
const plainStatus = (st: string): string =>
  isErrStatus(st) ? "Something went wrong loading this view. Reload the page to try again."
  : /^(engine warming|building slice|fetching)/.test(st) ? "Loading data…" : /climatology/.test(st) ? "Calculating anomalies…" : st;

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
  useEffect(() => { gridRef.current = grid; }, [grid]);
  const [spatial, setSpatial] = useState<any[]>([]);
  const [spatialLayers, setSpatialLayers] = useState<SpatialLayers>(spatialFallback as unknown as SpatialLayers);
  // D36: `layers=` may carry a `data` entry — the data layer's place in the draw order (top-first); absent = on top.
  // deck draws under the boundary immediately above it: that entry's first MapLibre layer (fill before line).
  // With the land mask on (D47/D53) the composed style puts the mask exactly there, so the data draws under the mask
  // — whatever the row — and everything from the Data row down is clipped to the ocean.
  const layersEff = useMemo(() => effectiveLayers(sel.layers, spatialLayers.layers), [sel.layers, spatialLayers]); // null = the registry's defaults
  const dataBeforeId = useMemo(() => {
    if (sel.land) return LAND_LAYER;
    const ls = layersEff; const i = ls.findIndex((l) => l.id === "data"); if (i <= 0) return undefined;
    const above = ls[i - 1]; const d = spatialLayers.layers.find((x) => x.id === above.id); if (!d) return undefined;
    return d.geom === "polygon" ? `sp-${above.id}-fill` : d.geom === "line" ? `sp-${above.id}-line` : d.geom === "label" ? `sp-${above.id}-symbol-1` : d.geom === "raster" ? `sp-${above.id}-raster` : `sp-${above.id}-circle`;
  }, [layersEff, sel.land, spatialLayers]);
  const [taxa, setTaxa] = useState<Row[]>([]);
  // the release's measurement_type registry: labels and units for every variable, and — for the per-cast grain —
  // which types are per-sample and how a derived one is computed (castgrain.ts reads grain / derivation / category)
  const [mt, setMt] = useState<Map<string, RegistryRow>>(new Map());
  const registryP = useRef<Promise<Map<string, RegistryRow>> | null>(null);
  // what sample_measurement holds per dataset × type (sql/cast_census.sql, then cast_list.sql once sample_root is in)
  const [castCensus, setCastCensus] = useState<CastCensusRow[]>([]);
  // the release's sample_root carries hex7 (v2026.10.04+): a per-cast variable then draws in Hexagons too
  const [castHex, setCastHex] = useState<boolean | null>(null);
  // does this release's cruise table carry the median cast month (month_median / date_median / season_year, v2026.11+)?
  // a column probe on the registered object, once; the slices join it where it does and the lens templates key on it
  const cruiseMedianRef = useRef<Promise<boolean> | null>(null);
  const [cruiseMedian, setCruiseMedian] = useState<boolean | null>(null);
  const probeCruiseMedian = () => (cruiseMedianRef.current ??= ensure(REG.cruise)
    .then(() => engine.exec(`SELECT count(*) AS n FROM (DESCRIBE SELECT * FROM ${q(REG.cruise)}) WHERE column_name = 'month_median'`, "probe:cruise.month_median"))
    .then((r) => { const ok = Number(r[0]?.n) > 0; setCruiseMedian(ok); return ok; })
    .catch((e) => { console.warn("cruise probe:", e.message); setCruiseMedian(false); return false; }));
  // the data stage of each cruise's samples (stage.ts): the preliminary mark beside a cruise. Read from the release's
  // `sample_root`, and only where it carries data_stage (calcofi4db 4.37.0+): a column probe on the registered object, once,
  // then sql/cruise_stage.sql. On a release without the column (every one to v2026.11.09) the probe says no, nothing is read
  // and no view wears a mark. It reads only a sample_root the session already holds — the object is never fetched for
  // this — and nothing the app draws waits on it: any error leaves the index empty, silently.
  const [stageIdx, setStageIdx] = useState<StageIndex | null>(null);
  const stageRef = useRef<Promise<StageIndex> | null>(null);
  const loadStages = (root: Promise<void>): Promise<StageIndex> => root
    .then(() => engine.exec(stageProbeSql(q(REG.sample_root)), "probe:sample_root.data_stage"))
    .then((r) => (hasStageCols(r) ? engine.query("cruise_stage", { src: q(REG.sample_root) }).then(stageIndex) : new Map()))
    .catch(() => new Map());
  // the cruise table's own month / season / season year, for cruise_seasons.sql and cruise_ref.sql (sqltpl.ts cs_* tokens)
  const cruiseTokens = (median: boolean | null): Params => median ? { cs_month: "month_median", cs_year: "season_year", cs_quarter: djfSql("month_median") } : {};
  // does this release's obs_bio carry sample_key (the net)? sql/slice_bio.sql then zero-fills per net, else per visit
  const bioNetRef = useRef<Promise<boolean> | null>(null);
  const [bioNet, setBioNet] = useState(false);
  const probeBioNet = () => (bioNetRef.current ??= engine.exec(`SELECT count(*) AS n FROM (DESCRIBE SELECT * FROM ${q(REG.obs_bio)}) WHERE column_name = 'sample_key'`, "probe:obs_bio.sample_key")
    .then((r) => { const ok = Number(r[0]?.n) > 0; setBioNet(ok); return ok; })
    .catch((e) => { console.warn("obs_bio probe:", e.message); return false; }));
  const rootHex7Ref = useRef<Promise<boolean> | null>(null);
  // a `?station=` link resolved against this release's grid (gridkey.ts resolveStation): what the card says about it
  const [stationNote, setStationNote] = useState<{ key: string; note: string; warn: boolean } | null>(null);
  const [lineNote, setLineNote] = useState<string | null>(null); // a `?line=` with no section, and where it went instead
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
  // "N observations in view" under every filter (sql/count.sql), keyed by the slice it was counted on; the picker's
  // whole-pick total stands in only until the first count of a new pick lands
  const [viewCount, setViewCount] = useState<{ slice: string | null; n: number; n_samples: number; n_found: number } | null>(null);
  const [climCells, setClimCells] = useState<SectionCell[] | null>(null);
  const [climWindow, setClimWindow] = useState<[number, number] | null>(null);   // the table's clim_yr_min–clim_yr_max
  // the release's climatology carries the SEASONAL baseline (season_* columns, calcofi4db 4.24.0+): a column probe on the
  // first baseline object fetched; null until probed. Without it the month / season toggle is disabled and says why.
  const [climSeason, setClimSeason] = useState<boolean | null>(null);
  const climSeasonRef = useRef<Promise<boolean> | null>(null);
  // a map lens drawing an anomaly: the observations in view, and how many of them had a baseline (sql/anom_share.sql)
  const [anomShare, setAnomShare] = useState<{ n: number; n_base: number } | null>(null);
  // the slice × baseline slice_anom was built for (sql/anom_slice.sql), and the build itself: the map lenses and the depth ×
  // time card share one table, so a build in flight is awaited by the other, never started twice
  const anomBuild = useRef<{ key: string; p: Promise<void> } | null>(null);
  // the depth × time anomaly card (explore#28, sql/anom_depth_time.sql): its cells (null while they load) and its baseline share
  const [dtRows, setDtRows] = useState<DtRow[] | null>(null);
  const [dtShare, setDtShare] = useState<{ n: number; n_base: number } | null>(null);
  const [sectionCruises, setSectionCruises] = useState<Row[]>([]);
  const [depthRows, setDepthRows] = useState<DepthRow[]>([]);
  const [yearRows, setYearRows] = useState<YearRow[]>([]);
  const [surf, setSurf] = useState<SurfaceResult | null>(null); // the contour lens's interpolated surface (contour.worker.ts)
  const surfGen = useRef(0);
  const [castRows, setCastRows] = useState<Row[]>([]);          // the site grain: one row per site (contour_cast.sql)
  const [effortPaths, setEffortPaths] = useState<EffortPath[]>([]);    // the Effort layer (`effort=on`): sql/effort_track.sql → src/effort.ts
  const [land, setLand] = useState<{ key: string; mask: Uint8Array } | null>(null); // the land clip for the surface's grid (Natural Earth land, D42)
  const overlayRef = useRef<MapboxOverlay | null>(null);        // the deck overlay, driven directly by the cruise playback (D37)
  const [lastSql, setLastSql] = useState("");
  const [bundling, setBundling] = useState<string | null>(null);
  const [ylog, setYlog] = useState(false);
  const [monthRows, setMonthRows] = useState<YearRow[] | null>(null);
  const [needMonths, setNeedMonths] = useState(false);
  const [ganttRows, setGanttRows] = useState<CruiseRow[]>([]);
  // hovering a cruise in any cruise list rings its stations on the map (the slice's own positions for that cruise)
  const gridRef = useRef<GridCell[]>([]);
  const [hoverCruise, setHoverCruise] = useState<{ key: string; pts: [number, number][] } | null>(null);
  const hoverKey = useRef<string | null>(null);
  const onCruiseHover = (k: string | null) => {
    hoverKey.current = k;
    if (!k) { setHoverCruise(null); return; }
    // one ring per station the cruise worked (the grid cell's home); a sample off the grid gets a ring at its 0.1° spot, so a
    // continuous underway series reads as a light track, not a solid band
    engine.exec(`SELECT grid_key, round(any_value(longitude), 1) AS x, round(any_value(latitude), 1) AS y FROM slice WHERE cruise_key = ${lit(k)} AND longitude IS NOT NULL AND latitude IS NOT NULL GROUP BY grid_key, round(longitude, 1), round(latitude, 1)`, "cruise_hover")
      .then((r) => {
        if (hoverKey.current !== k) return;
        const home = new Map(gridRef.current.map((g) => [g.grid_key, g.home] as const)), seen = new Set<string>(), pts: [number, number][] = [];
        for (const p of r) { const h = p.grid_key ? home.get(p.grid_key) : undefined; const xy: [number, number] = h ?? [Number(p.x), Number(p.y)]; const id = h ? p.grid_key : `${xy[0]},${xy[1]}`; if (!seen.has(id)) { seen.add(id); pts.push(xy); } }
        setHoverCruise({ key: k, pts });
      }).catch(() => {});
  };
  const [cruiseRef, setCruiseRef] = useState<Map<string, { ship: string; nodc: string; month: number | null }> | null>(null);
  // a cruise's month: the cruise table's median cast month where the release carries it (cruise_ref.sql), the key's MM otherwise
  const cruiseMonthOf = (k: string | null | undefined): number | null => (k ? cruiseRef?.get(k)?.month ?? null : null) ?? cruiseMonth(k);
  const [seasonEdit, setSeasonEdit] = useState(false);
  // advanced: the timing marks + the last SQL, behind a gear (off by default; ?timing=1 opens it)
  const [advanced, setAdvanced] = useState<boolean>(() => new URLSearchParams(location.search).get("timing") === "1");
  // the lean layout (src/leanpanel.tsx): ?ui=lean turns it on and the browser remembers it, ?ui=classic turns it off again
  // the lean layout is the default; ?ui=classic returns to the old panel (and is remembered), ?ui=lean clears that
  const [lean] = useState<boolean>(() => {
    try {
      const u = new URLSearchParams(location.search).get("ui");
      if (u === "classic") localStorage.setItem("explore.ui", "classic"); else if (u === "lean") localStorage.removeItem("explore.ui");
      return localStorage.getItem("explore.ui") !== "classic";
    } catch { return new URLSearchParams(location.search).get("ui") !== "classic"; }
  });
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
  const [dsOpen, setDsOpen] = useState(false); // the panel's "N others" dataset list
  useEffect(() => { setDsOpen(false); }, [sel.realm, sel.taxon, sel.var]); // a new pick starts with the list closed
  const [pickerSignal, setPickerSignal] = useState(0); // a welcome door opens the organism / variable picker
  // lean: the What picker replaces the panel body while it is open — and it is open whenever the app opens, because choosing
  // a species or a measurement is the first thing anyone does; the map behind already shows the current one
  const [whatOpen, setWhatOpen] = useState<boolean>(() => lean && !phoneQuery.matches);
  const [var2Open, setVar2Open] = useState(false); // the "Add a variable" picker (water measurements only)
  useEffect(() => { if (pickerSignal) setWhatOpen(true); }, [pickerSignal]);
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
  // the registry, once: the boot starts it, and the slice effect awaits it for a variable with no per-bin object
  // (it may run before the boot reaches its own call). A release older than a column reads it as null.
  const loadRegistry = () => (registryP.current ??= ensure(REG.measurement_type)
    .then(() => engine.exec(`SELECT * FROM ${q(REG.measurement_type)}`, "measurement_type"))
    .then((rows) => {
      const m = new Map<string, RegistryRow>(rows.map((r) => [String(r.measurement_type), { measurement_type: String(r.measurement_type), description: r.description ?? null, units: r.units ?? null, derivation: r.derivation ?? null, grain: r.grain ?? null, category: r.category ?? null }]));
      setMt(m); return m;
    }));

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
        grid_key: f.properties.grid_key, line: f.properties.line, station: f.properties.station, home: [f.properties.lon_ctr, f.properties.lat_ctr], pattern: f.properties.pattern ?? undefined,
      })).sort((a: GridCell, b: GridCell) => a.line - b.line || a.station - b.station);
      setGrid(cells); setCov(cv);
      // a saved `?station=` link names a cell of the grid it was made on. v2026.10.04 redrew the grid (one cell per
      // official station; a kept key may name a different polygon), so resolve it through the release's grid_crosswalk:
      // the new cell holding the largest share of the old one, and the card says so — never a silent different area
      const bootStation = BOOT.get("station");
      if (bootStation) {
        const keys = new Set(cells.map((c) => c.grid_key));
        const xw: Promise<CrosswalkRow[] | null> = cat.tables.some((x) => x.name === "grid_crosswalk")
          ? ensure(REG.grid_crosswalk).then(() => engine.exec(`SELECT prev_grid_key, grid_key, prev_frac FROM ${q(REG.grid_crosswalk)} WHERE prev_grid_key = ${lit(bootStation)}`, "grid_crosswalk"))
            .then((r) => r.map((x) => ({ prev_grid_key: String(x.prev_grid_key), grid_key: String(x.grid_key), prev_frac: Number(x.prev_frac) })))
            .catch((e) => { console.warn("grid_crosswalk:", e.message); return null; })
          : Promise.resolve(null);
        xw.then((rows) => {
          const r = resolveStation(bootStation, keys, rows, v);
          if (r.kind === "same") return;
          setStationNote({ key: r.key, note: r.note, warn: r.kind !== "redrawn" });
          if (r.kind === "moved") setSelRaw((s) => (s.station === bootStation ? { ...s, station: r.key } : s));
          timing.add("station:resolve", 0, `${bootStation} → ${r.kind}${r.kind === "moved" ? ` ${r.key}` : ""}`);
        });
      }
      // a `?line=` with no section to draw (a one-station line, or a line not in this grid) goes to the nearest one, and says so
      const secLines = sectionLines(cells);
      const bootLine = BOOT.get("line");
      if (bootLine != null && secLines.length && !secLines.includes(Number(bootLine))) {
        const to = nearestSectionLine(Number(bootLine), secLines);
        if (to != null) { setSelRaw((s) => ({ ...s, line: to, cruise: null })); setLineNote(`line ${bootLine} has no section in ${v}'s grid (fewer than two stations) — showing line ${to}`); }
      }
      // the release's cross-dataset crosswalk (measurement_type.variable) supersedes src/variables.ts once it is there
      const byVar = new Map<string, Set<string>>();
      for (const x of cv.variables) if (x.realm === "env" && x.variable) (byVar.get(x.variable) ?? byVar.set(x.variable, new Set()).get(x.variable)!).add(x.measurement_type);
      const defs = [...byVar.entries()].filter(([, m]) => m.size > 1).map(([key, m]) => ({ key, label: UNIFIED.find((u) => u.key === key)?.label ?? key, members: [...m].sort() }));
      if (defs.length) { setUnified(defs); timing.add("variables:release", 0, `${defs.length} unified variables from coverage.json`); }
      // a dataset deep link (`?datasets=<key>` with no organism or variable named) opens on what THAT dataset holds — its
      // most-observed variable, or its most-observed taxon — never on the default sardine, which the dataset may not have
      // (calcofi.io/datasets/sio_mesopelagic-fish → Explorer landed on sardine and dropped the filter; Ben, 2026-09-07)
      const bootDs = BOOT.get("datasets")?.split(",").filter(Boolean) ?? [];
      if (bootDs.length && !BOOT.has("taxon") && !BOOT.has("var")) {
        const inDs = (k: string) => bootDs.includes(k);
        const envVars = (cv.variables ?? []).filter((x) => x.realm === "env" && inDs(x.dataset_key)); // coverage lists the bio count types too
        // the dataset's headline variable: a unified one (temperature, salinity, oxygen …) before a bare type, never a
        // depth / pressure / flag / id column — calcofi_bottle's most-observed type is "reported depth from pressure"
        const bookkeeping = /depth|pressure|_qual|flag|_cnt|_id$|time|lat|lon|bottle|cast/i;
        const isUnified = (mt: string) => unifiedDefs().some((d) => d.members.includes(mt));
        const envVar = envVars.slice().sort((a, b) => (Number(isUnified(b.measurement_type)) - Number(isUnified(a.measurement_type))) || (Number(bookkeeping.test(a.measurement_type)) - Number(bookkeeping.test(b.measurement_type))) || b.n_obs - a.n_obs)[0];
        const envN = envVars.reduce((a, x) => a + x.n_obs, 0);
        const unid = (t: any) => /unidentif|unid\b|unknown|indeterm/i.test(`${t.scientific_name ?? ""} ${t.common_name ?? ""}`); // ichthyo's most-observed "taxon" is unidentified eggs
        const taxa = (cv.taxa ?? []).map((t) => ({ t, n: (t.datasets ?? []).filter((d) => inDs(d.dataset_key)).reduce((a, d) => a + d.n_obs, 0) })).filter((x) => x.n > 0).sort((a, b) => (Number(unid(a.t)) - Number(unid(b.t))) || b.n - a.n);
        const bioN = taxa.reduce((a, x) => a + x.n, 0);
        const varKey = envVar ? (unifiedDefs().find((d) => d.members.includes(envVar.measurement_type))?.key ?? envVar.measurement_type) : null; // the picker's key: the unified variable when the type belongs to one
        if (envVar && envN >= bioN) setSelRaw((s) => ({ ...s, realm: "env", var: varKey!, cruise: null, datasets: bootDs }));
        else if (taxa.length) setSelRaw((s) => ({ ...s, realm: "bio", taxon: taxa[0].t.taxon_key, stage: null, den: null, cruise: null, datasets: bootDs }));
      }
      timing.add("fetch:sidecars", performance.now() - t, `${cells.length} cells · coverage ${cv.datasets.length} datasets`);
      // the engine + the objects every lens needs, in parallel with the paint
      setStatus("engine warming…");
      ensure(REG.obs_bio); ensure(REG.taxon); ensure(REG.measurement_type); ensure(REG.sample_spatial); ensure(REG.dataset);
      // after setUnified(), so the members are the release's; a per-cast variable has no obs_env object to warm (the slice effect fetches its own)
      if (sel.realm === "env") { const parts = binParts(cat); for (const m of members(sel.var)) if (parts.has(m)) ensure(envReg(m)); }
      Promise.all([ensure(REG.obs_bio), ensure(REG.taxon)])
        .then(() => engine.query("taxa", { src: q(REG.obs_bio), taxon_src: q(REG.taxon) })).then((r) => setTaxa(r));
      loadRegistry().catch((e) => console.warn("measurement_type registry:", e.message));
      ensure(REG.dataset).then(async () => setDatasets(await engine.exec(`SELECT * FROM ${q(REG.dataset)}`, "dataset")));
      // the curating organizations (metadata/provider.csv) when the release ships them: `provider_short` is the
      // label the Sources line and the Sources modal want. No table -> cite.ts's PROVIDER_SHORT map, as before.
      if (cat.tables.some((t) => t.name === "provider"))
        ensure(REG.provider).then(() => engine.exec(`SELECT * FROM ${q(REG.provider)}`, "provider"))
          .then((rows) => setProviderTable(new Map(rows.map((r) => [String(r.provider), String(r.provider_short ?? r.provider_name ?? r.provider)]))))
          .catch((e) => console.warn("provider table:", e.message));
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, []);

  useEffect(() => { toUrl(sel); }, [sel]);
  // the header's height as --cc-header-h: a dialog's backdrop starts below the header, so a tall dialog never slides under it
  useEffect(() => {
    const h = document.querySelector(".cc-header"); if (!h) return;
    const set = () => document.documentElement.style.setProperty("--cc-header-h", `${Math.ceil(h.getBoundingClientRect().bottom)}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(h); window.addEventListener("resize", set);
    return () => { ro.disconnect(); window.removeEventListener("resize", set); };
  }, []);

  // the per-station card's detail is its own sidecar, fetched on the first station selection
  useEffect(() => {
    if (!sel.station || !version || covStations) return;
    fetch(sidecarUrl(version, "coverage_stations.json")).then((r) => r.json()).then(setCovStations).catch(console.error);
  }, [sel.station, version]);
  useEffect(() => {
    if (!version) return;
    fetch(sidecarUrl(version, "spatial_layers.json")).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      // the reference layers (role = reference, plan 2026-09-09 D52) are artefacts outside releases, like the sea floor:
      // a release whose sidecar predates them takes them from the bundled snapshot, so the mask and the labels do not
      // wait for the next release
      // and the same snapshot owns the gazetteer-backed rows (own source_url): they replace a sidecar row of the same id
      // that has none (boem_wind_planning), so an old link's slug draws the gazetteer tiles (mergeRegistry)
      .then((j: SpatialLayers) => setSpatialLayers(mergeRegistry(j, spatialFallback as unknown as SpatialLayers)))
      .catch(() => console.log("spatial_layers.json: not in this release — using the bundled registry"));
  }, [version]);
  const area = useMemo(() => parseArea(sel.area), [sel.area]); // the Area filter (src/area.ts, explore#20)
  const [areaRegionMode, setAreaRegionMode] = useState(false);
  const [regAll, setRegAll] = useState(false);
  // the polygon layers are heavy (all layers, simplified): the Regions lens and a region Area need them
  useEffect(() => {
    if ((sel.lens !== "region" && area?.kind !== "region" && !areaRegionMode) || !version || spatial.length) return; // the Area filter outlines its regions too, and the region modal opens on them
    const t = performance.now();
    fetch(sidecarUrl(version, "spatial.geojson")).then((r) => r.json()).then((gj) => { setSpatial(gj.features); timing.add("fetch:spatial.geojson", performance.now() - t, `${gj.features.length} polygons`); }).catch(console.error);
  }, [sel.lens, version, area?.kind, areaRegionMode]);

  // ── the slice: one taxon or one variable, materialized in the worker ───────
  useEffect(() => {
    if (!catalog) return;
    const key = sel.realm === "bio" ? `bio:${sel.taxon}` : `env:${sel.var}`;
    if (key === sliceKey) return;
    const g = ++gen.current;
    (async () => {
      // the grain of an env variable: per-bin when the release holds an obs_env object for it (the path every release
      // took before the per-cast grain); else per-cast when the registry says the type is per-sample — one value per
      // cast, read from sample_measurement ⋈ sample_root (sql/slice_cast.sql, plan 2026-10-02 D2). Anything else is
      // not a variable of this release, and the status says so.
      let grain: VarGrain = "bin";
      if (sel.realm === "env" && !hasBinObject(catalog, sel.var)) {
        const vg = hasCastTable(catalog) ? variableGrain(sel.var, false, await loadRegistry()) : null;
        if (g !== gen.current) return;
        if (!vg) throw new Error(`${sel.var} is not a variable of release ${catalog.version}`);
        grain = vg;
      }
      const files = sel.realm === "bio" ? [REG.obs_bio] : grain === "cast" ? [REG.sample_measurement, REG.sample_root, REG.measurement_type] : members(sel.var).map(envReg);
      setPicker([]); // the old realm's rows must never render under the new one (stale keyed DOM)
      setStatus(`fetching ${files.join(", ")}…`);
      await Promise.all(files.map((f) => ensure(f)));
      if (g !== gen.current) return;
      // does this release's sample_root carry the cast's H3 cell? (a column probe on the registered object, once)
      const hex7 = grain === "cast" ? (rootHex7Ref.current ??= engine.exec(`SELECT count(*) AS n FROM (DESCRIBE SELECT * FROM ${q(REG.sample_root)}) WHERE column_name = 'hex7'`, "probe:sample_root.hex7").then((r) => Number(r[0]?.n) > 0)) : null;
      const rootHex7 = hex7 ? await hex7 : false;
      if (grain === "cast") setCastHex(rootHex7);
      // the cruise table joins every slice for the cruise's median month and season (v2026.11+); absent, the key rule
      const cruiseSrc: Params = (await probeCruiseMedian()) ? { cruise_src: cruiseSrcSql(q(REG.cruise)) } : {};
      if (g !== gen.current) return;
      setStatus("building slice…");
      const t = performance.now();
      const netKey = sel.realm === "bio" && (await probeBioNet()) ? "sample_key" : "root_id";
      if (g !== gen.current) return;
      await (sel.realm === "bio" ? engine.query("slice_bio", { src: q(REG.obs_bio), taxon: sel.taxon, net_key: netKey, ...cruiseSrc })
        : grain === "cast" ? engine.query("slice_cast", { ...castTokens(rootHex7), ...cruiseSrc, type: sel.var, qual_ok: qualOkSQL("sm") })
        : engine.query("slice_env", { src: envSrc(sel.var), ...cruiseSrc }));
      const rows = (await engine.query("picker", {})) as PickerRow[];
      if (g !== gen.current) return;
      timing.add(`slice:${key}`, performance.now() - t, `${grainCount(grain, rows.reduce((a, r) => a + r.n, 0))}${grain === "cast" ? " (sample_measurement ⋈ sample_root)" : ""}`);
      setPicker(rows);
      // sample_root is in now: the census gains the years and how many values a root sample places (cast_list.sql)
      if (grain === "cast") engine.query("cast_list", castTokens(rootHex7)).then((r) => setCastCensus(r as CastCensusRow[])).catch((e) => console.warn("cast_list:", e.message));
      // the dataset filter is set against THIS slice's pills: a dataset the new slice does not have (ichthyo carried from
      // Biology into a temperature view, whose datasets are bottle and CTD) would filter everything out — prune it, and
      // drop it when nothing is left or everything is
      const present = new Set(rows.map((r) => r.dataset_key));
      const prune = (ds: string[] | null) => { if (!ds) return null; const kept = ds.filter((d) => present.has(d)); return kept.length && kept.length < present.size ? kept : null; };
      if (sel.realm === "bio") {
        // the stage and denominator default from the datasets IN VIEW: a dataset link to CUFES (eggs, no effort) must not
        // inherit ichthyo's larva · per 10 m² and open on 0 observations (Ben, 2026-09-07)
        // no dataset chosen yet: open on the program's main dataset for this pick (defaultDataset), and its biggest stage
        const ds0 = sel.datasets?.filter((d) => present.has(d)).length ? sel.datasets.filter((d) => present.has(d)) : [defaultDataset(rows)];
        const inView = rows.filter((r) => ds0.includes(r.dataset_key));
        const base = inView.length ? inView : rows;
        const stages = new Set(base.map((r) => r.life_stage));
        const stage = sel.stage != null && stages.has(sel.stage) ? sel.stage : defaultStage(base);
        const den = sel.den ?? defaultDen(base, stage);
        setSelRaw((s) => ({ ...s, stage, den, datasets: ds0.length < present.size ? ds0 : prune(s.datasets) }));
      } else setSelRaw((s) => { const d = prune(s.datasets); return d === s.datasets ? s : { ...s, datasets: d }; });
      setSliceKey(key);
    })().catch((e) => { console.error(e); setStatus(`error: ${e.message}`); });
  }, [catalog, sel.realm, sel.taxon, sel.var]);

  // ── the per-cast grain (castgrain.ts): which env variables are one value per cast, from the registry ─────────────
  // the census of sample_measurement is fetched once the first lens has answered (2.6 MB, off the cold-start path) —
  // it is what lists the per-cast variables in the picker; a per-cast `var=` in the URL fetches it with its slice
  useEffect(() => {
    if (!lensReady || !hasCastTable(catalog) || castCensus.length) return;
    ensure(REG.sample_measurement).then(() => engine.query("cast_census", { sm_src: q(REG.sample_measurement) }))
      .then((r) => setCastCensus((cur) => (cur.length ? cur : (r as CastCensusRow[])))) // cast_list.sql's richer rows win if they landed first
      .catch((e) => console.warn("cast_census:", e.message));
  }, [lensReady, catalog]);
  const castVars = useMemo(() => castVariables(mt, castCensus), [mt, castCensus]);
  const varGrain: VarGrain | null = useMemo(() => (sel.realm === "env" && catalog ? variableGrain(sel.var, hasBinObject(catalog, sel.var), mt) : null), [sel.realm, sel.var, catalog, mt]);
  const isCast = varGrain === "cast";
  // ── the anomaly (anomaly.ts): the variable's member types with a baseline object in this release. A release before the
  // per-cast cells (v2026.10.08 and older) has none for a per-cast type, so its anomaly is unavailable and says why
  const climMs = useMemo(() => (sel.realm === "env" && catalog && hasClim(catalog) ? climMembers(catalog, sel.var) : []), [catalog, sel.realm, sel.var]);
  const anomAvail = climMs.length > 0;
  const anomWhyNot = !hasClim(catalog) ? "this release carries no climatology table (releases from v2026.09 do)"
    : isCast ? "no baseline for this per-cast variable in this release: the per-cast climatology cells arrive with calcofi4db 4.24.0 (the release after v2026.10.08)"
    : `this release's climatology holds no baseline for this variable (no cell reached ${CLIM_MIN_CRUISES} cruises in 1993–2013)`;
  const anomOn = sel.anom && anomAvail;
  // the baseline in force: the season only when the release carries it (a `base=season` link on an older release draws the month)
  const climBase: ClimBase = sel.base === "season" && climSeason ? "season" : "month";
  const seasonWhyNot = climSeason === false ? "this release's climatology has no seasonal baseline (season_* columns arrive with calcofi4db 4.24.0, the release after v2026.10.08)" : null;
  // a map lens summarizing departures (sql/anom_slice.sql): Hexagons or Contours, an env variable, a statistic of the value
  const anomMap = anomOn && sel.realm === "env" && (sel.lens === "hex" || sel.lens === "contour") && sel.stat !== "n";
  // the depth × time anomaly card (explore#28): open (`show=depthtime`), and something to draw — a per-bin env variable whose
  // types have a baseline in this release. It always draws the anomaly, whatever the lens and the `anom=` checkbox.
  const dtOpen = !sel.hide.includes("depthtime");
  const dtWant = dtOpen && sel.realm === "env" && !isCast && anomAvail;
  useEffect(() => {
    // probe the climatology's columns once per release, when an anomaly is first asked for (one ~0.2 MB object)
    if (!(anomOn || dtWant) || climSeason != null || !climMs.length) return;
    const m = climMs[0];
    (climSeasonRef.current ??= ensure(climReg(m))
      .then(() => engine.exec(`SELECT column_name FROM (DESCRIBE SELECT * FROM ${q(climReg(m))})`, "probe:climatology.season"))
      .then((r) => hasSeasonCols(r.map((x) => String(x.column_name)))))
      .then(setClimSeason).catch((e) => { console.warn("climatology probe:", e.message); setClimSeason(false); });
  }, [anomOn, dtWant, climMs, climSeason]);
  // slice_anom — every observation minus the baseline of its own cell, before any aggregation (sql/anom_slice.sql) — built
  // once per slice × baseline for whichever asks first (Hexagons, Contours, the depth × time card); an observation with no
  // baseline keeps anom NULL and drops out of every statistic
  const anomSlice = (sk: string, base: ClimBase): Promise<void> => {
    const k = `${sk}|${base}`;
    if (anomBuild.current?.key === k) return anomBuild.current.p;
    const ms = climMs, grain = isCast ? "cast" as const : "bin" as const;
    setStatus("subtracting the climatology…");
    const p = (async () => {
      await Promise.all(ms.map((m) => ensure(climReg(m))));
      const t2 = performance.now();
      await engine.query("anom_slice", anomTokens(climSrc(ms), base, grain));
      timing.add(`anom_slice:${base}`, performance.now() - t2, `${sk} − ${ms.join(" + ")}`);
      setStatus((st) => (st === "subtracting the climatology…" ? "ready" : st)); // the card alone asked: nothing else clears it
    })();
    anomBuild.current = { key: k, p };
    p.catch(() => { if (anomBuild.current?.p === p) anomBuild.current = null; }); // a failed build is retried by the next ask
    return p;
  };
  // the registry's word on the selected variable, for the one thing its name cannot say (ramps.ts RampHint)
  const rampHint = useMemo(() => (isCast ? { grain: "cast" as const, units: mt.get(sel.var)?.units ?? null } : null), [isCast, mt, sel.var]);
  (window as any).__cast = { grain: varGrain, vars: castVars, census: castCensus, hex: castHex }; // scripts/smoke_release.mjs reads the registry-keyed list (and whether sample_root carries hex7) from here

  // ── lens queries ───────────────────────────────────────────────────────────
  const val = sel.realm === "bio" ? VAL_COL[sel.den ?? "raw"] : "value";
  // the release's last year (coverage.json) closes an open-ended year range; never a constant
  const yearMax = useMemo(() => Math.max(2023, ...(cov?.variables ?? []).map((v) => v.year_max ?? 0)), [cov]);
  const years: [number, number] = [sel.years[0], sel.years[1] === YEAR_OPEN ? yearMax : sel.years[1]];
  // a typed or stepped year window (explore#26/#27): ending on the latest year keeps the open end, so the link
  // still reads "through the latest" when the next release adds a year; month edges from a brush do not survive it
  const setYearWindow = (y: [number, number]) => setSel({ years: [y[0], y[1] >= yearMax ? YEAR_OPEN : y[1]], months: null });
  // the Area filter (src/area.ts, explore#20): the predicate every lens template reads as {{area_filter}}. A region needs
  // sample_spatial registered first, and a station pattern needs the grid, so a link that names an area waits
  // (areaPending) rather than draw the whole ocean for a moment
  const gridKeys = useMemo(() => {
    if (!grid.length) return null;
    const m = new Map<string, string[]>();
    for (const g of grid) if (g.pattern) (m.get(g.pattern) ?? m.set(g.pattern, []).get(g.pattern)!).push(g.grid_key);
    return m;
  }, [grid]);
  const allKeys = useMemo(() => (grid.length ? grid.map((g) => g.grid_key) : null), [grid]);
  // the lines of the grid, for the Line / Station box (a datalist) and for saying when a typed station is not on its line
  const lineList = useMemo(() => { const set = new Set<number>(); for (const k of allKeys ?? []) { const g = parseGridKey(k); if (g) set.add(g.line); } return [...set].sort((a, b) => a - b); }, [allKeys]);
  // the region lists of the Area picker (sql/area_regions.sql), fetched the first time the picker or a region link asks
  // for them: per layer its regions with samples, and the layer's own distinct count ("all regions (n samples)")
  const [areaRegions, setAreaRegions] = useState<Map<string, { name: string; n: number }[]> | null>(null);
  const [areaTotals, setAreaTotals] = useState<Map<string, number>>(new Map());
  const [areaLayerPick, setAreaLayerPick] = useState<string | null>(null);
  const [regionModal, setRegionModal] = useState<string | null>(null); // the layer the region modal is open on
  const [regionModalFor, setRegionModalFor] = useState<"where" | "lens">("where"); // who opened it: Where › Regions from, or the Regions view
  // the layers' region lists load in the background once the first map is up (Betty 2026-11-10: the region map took a few
  // seconds to open — it waited for this query on the first click)
  const [regionsWarm, setRegionsWarm] = useState(false);
  useEffect(() => { if (regionsWarm || !sliceKey) return; const t = setTimeout(() => setRegionsWarm(true), 1500); return () => clearTimeout(t); }, [sliceKey, regionsWarm]);
  const wantRegions = areaRegionMode || area?.kind === "region" || regionsWarm;
  useEffect(() => {
    if (!wantRegions || areaRegions || !catalog) return;
    ensure(REG.sample_spatial).then(() => engine.query("area_regions", { spatial_src: q(REG.sample_spatial) })).then((r) => {
      const m = new Map<string, { name: string; n: number }[]>(), tot = new Map<string, number>();
      for (const x of r) {
        if (Number(x.whole)) { tot.set(x.layer, Number(x.n)); continue; }
        (m.get(x.layer) ?? m.set(x.layer, []).get(x.layer)!).push({ name: x.spatial_name, n: Number(x.n) });
      }
      setAreaTotals(tot); setAreaRegions(m);
    }).catch(console.error);
  }, [wantRegions, areaRegions, catalog]);
  // an old single-region link whose name this release spells longer (explore#34: "Channel Islands" -> the gazetteer's
  // two sections) is widened to that set and the link rewritten; a single name waits for the list, so it never draws
  // an empty map first
  const areaResolved = useMemo(() => (area?.kind === "region" && areaRegions ? resolveArea(area, (areaRegions.get(area.layer) ?? []).map((r) => r.name)) : area), [area, areaRegions]);
  useEffect(() => { if (areaResolved && areaResolved !== area) setSel({ area: areaToUrl(areaResolved) }); }, [areaResolved]);
  const areaWaits = area?.kind === "region" && area.names?.length === 1 && (!areaRegions || areaResolved !== area);
  const [areaFilter, setAreaFilter] = useState<{ key: string; sql: string } | null>(null);
  useEffect(() => {
    if (!sel.area || areaWaits) return;
    const sql = areaSql(area, { gridKeys, allKeys, spatialSrc: q(REG.sample_spatial) });
    if (sql == null || (area?.kind === "region" && !catalog)) return;
    let live = true;
    (area?.kind === "region" ? ensure(REG.sample_spatial) : Promise.resolve()).then(() => { if (live) setAreaFilter({ key: sel.area!, sql }); }).catch(console.error);
    return () => { live = false; };
  }, [sel.area, area, gridKeys, allKeys, catalog, areaWaits]);
  const areaClause = !sel.area || !area ? "TRUE" : areaFilter?.key === sel.area ? areaFilter.sql : null;
  const areaPending = areaClause == null;
  const freezeView = () => {
    const b = (window as any).__map?.getBounds?.(); if (!b) return;
    setAreaRegionMode(false); setSel({ area: areaToUrl({ kind: "box", bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] }) });
  };
  // Draw an area: press and drag a freehand loop on the map (an overlay above the canvas, so the map never pans); release closes it.
  // Draw a box: press at one corner and drag to the other. Either way the map never pans while drawing.
  const [drawing, setDrawing] = useState<false | "poly" | "box">(false);
  // a click on a hexagon opens its card (numbers, then "Show only this hexagon"); it does not filter by itself
  const [hexHover, setHexHover] = useState<string | null>(null);
  const hexHoverRef = useRef<string | null>(null);
  const [hexCard, setHexCard] = useState<{ cell: string; x: number; y: number; ll?: [number, number] } | null>(null);
  const [regionCard, setRegionCard] = useState<{ key: string; x: number; y: number; ll?: [number, number] } | null>(null);
  useEffect(() => { if (!regionCard) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setRegionCard(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [regionCard]);
  useEffect(() => { setRegionCard(null); }, [sel.lens, sel.layer]);
  useEffect(() => { if (!hexCard) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setHexCard(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [hexCard]);
  useEffect(() => { setHexCard(null); }, [sel.lens, sel.res, sel.var, sel.taxon]);
  // the popups follow the map: while one is open, every map move re-renders it (one frame at a time)
  const [, setCamTick] = useState(0);
  useEffect(() => {
    const m = (window as any).__map; if (!m?.on || !(hexCard || regionCard)) return;
    let raf = 0; const h = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setCamTick((n) => n + 1); }); };
    m.on("move", h); return () => { m.off("move", h); if (raf) cancelAnimationFrame(raf); };
  }, [!!hexCard, !!regionCard]);
  useEffect(() => {
    if (!drawing) return;
    const m = (window as any).__map; const host: HTMLElement | undefined = m?.getContainer?.(); if (!m || !host) { setDrawing(false); return; }
    const NS = "http://www.w3.org/2000/svg";
    const ov = document.createElement("div"); ov.className = "draw-overlay";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "draw-svg");
    const shape = document.createElementNS(NS, "polygon"); shape.setAttribute("class", "draw-shape"); svg.appendChild(shape); ov.appendChild(svg);
    const hint = document.createElement("div"); hint.className = "draw-hint"; hint.textContent = drawing === "box" ? "Press at one corner and drag to the other · Esc to cancel" : "Press and draw around the area · Esc to cancel"; ov.appendChild(hint);
    host.appendChild(ov);
    let path: [number, number][] | null = null;
    const pt = (e: PointerEvent): [number, number] => { const r = ov.getBoundingClientRect(); return [Math.min(Math.max(e.clientX - r.left, 0), r.width), Math.min(Math.max(e.clientY - r.top, 0), r.height)]; };
    const corners = (a: [number, number], b: [number, number]): [number, number][] => [a, [b[0], a[1]], b, [a[0], b[1]]];
    const paint = () => shape.setAttribute("points", (drawing === "box" && path && path.length > 1 ? corners(path[0], path[path.length - 1]) : path ?? []).map((q) => q.join(",")).join(" "));
    const down = (e: PointerEvent) => { path = [pt(e)]; hint.style.display = "none"; ov.setPointerCapture(e.pointerId); paint(); };
    const move = (e: PointerEvent) => { if (!path) return; const q = pt(e), l = path[path.length - 1];
      if (drawing === "box") { path = [path[0], q]; paint(); return; }
      if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 3) { path.push(q); paint(); } };
    const up = () => {
      if (!path) return; const raw = path; path = null;
      const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]);
      if (drawing === "box") {
        if (raw.length < 2 || Math.max(...xs) - Math.min(...xs) < 10 || Math.max(...ys) - Math.min(...ys) < 10) { paint(); hint.style.display = ""; return; } // a click, not a box
        const a = m.unproject([Math.min(...xs), Math.max(...ys)]), b = m.unproject([Math.max(...xs), Math.min(...ys)]), r3 = (v: number) => Math.round(v * 1000) / 1000;
        setAreaRegionMode(false); setSel({ area: areaToUrl({ kind: "box", bbox: [r3(a.lng), r3(a.lat), r3(b.lng), r3(b.lat)] }) }); setDrawing(false); return;
      }
      if (raw.length < 4 || Math.max(...xs) - Math.min(...xs) < 10 || Math.max(...ys) - Math.min(...ys) < 10) { paint(); hint.style.display = ""; return; } // a click, not a loop
      let eps = 2.5, pts = simplifyPath(raw, eps);
      while (pts.length > 60) { eps *= 1.5; pts = simplifyPath(raw, eps); }
      if (pts.length < 3) { paint(); hint.style.display = ""; return; }
      const ll = pts.map((q) => { const g = m.unproject(q); return [Math.round(g.lng * 1000) / 1000, Math.round(g.lat * 1000) / 1000] as [number, number]; });
      setAreaRegionMode(false); setSel({ area: areaToUrl({ kind: "poly", pts: ll }) }); setDrawing(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawing(false); };
    ov.addEventListener("pointerdown", down); ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); window.addEventListener("keydown", key);
    return () => { ov.removeEventListener("pointerdown", down); ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); window.removeEventListener("keydown", key); ov.remove(); };
  }, [drawing]);
  const params = useMemo(() => ({
    val, y0: years[0], y1: years[1], ym0: years[0] * 100 + (sel.months?.[0] ?? 1), ym1: years[1] * 100 + (sel.months?.[1] ?? 12),
    quarter_filter: sel.q?.length && sel.q.length < 4 ? `quarter IN (${sel.q.join(", ")})` : "TRUE", bin: "year",
    d0: sel.depth[0], d1: sel.depth[1], stage: sel.realm === "bio" ? sel.stage : null,
    dataset_filter: datasetFilterSql(sel.datasets), zeros: sel.realm !== "bio" || sel.zeros, area_filter: areaClause ?? "TRUE", cruise_filter: cruiseFilterSql(sel.cruises),
  }), [val, years[0], years[1], sel.months, sel.q, sel.depth, sel.stage, sel.realm, sel.datasets, sel.zeros, areaClause, sel.cruises]);

  // ── "Add a variable" (Ben's #3, Betty 2026-11-11): a second water variable in its own table (slice2), averaged into the
  // same hexagons as the map under the same When / Where / depth filters — so a sardine tow and a CTD cast are never paired
  // one by one; the hexagon is the match. Per-cast variables are not offered yet (slice_cast builds `slice` only)
  const [slice2Key, setSlice2Key] = useState<string | null>(null);
  const [var2Err, setVar2Err] = useState<string | null>(null);
  useEffect(() => {
    if (!catalog || !sel.var2) return;
    const key2 = `env:${sel.var2}`;
    if (key2 === slice2Key) return;
    let live = true; setVar2Err(null);
    (async () => {
      if (!hasBinObject(catalog, sel.var2!)) throw new Error("this measurement is one value per cast, which cannot be compared yet");
      await Promise.all(members(sel.var2!).map((m) => ensure(envReg(m))));
      const cruiseSrc: Params = (await probeCruiseMedian()) ? { cruise_src: cruiseSrcSql(q(REG.cruise)) } : {};
      const sql = render("slice_env", { src: envSrc(sel.var2!), ...cruiseSrc }).replace("CREATE OR REPLACE TABLE slice AS", "CREATE OR REPLACE TABLE slice2 AS");
      await engine.exec(sql, "slice2");
      if (live) setSlice2Key(key2);
    })().catch((e) => { console.error(e); if (live) setVar2Err(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, sel.var2]);
  // the second variable's filter: the map's own When / Where / depth / cruise, without the first pick's stage, units, dataset or zeros
  const where2 = useMemo(() => { const t = render("count", { ...params, val: "value", stage: null, dataset_filter: "TRUE", zeros: true }); return t.slice(t.indexOf("WHERE") + 5).trim(); }, [params]);
  const var2Ready = !!sel.var2 && slice2Key === `env:${sel.var2}`;
  const [hex2Rows, setHex2Rows] = useState<Row[]>([]);
  useEffect(() => {
    if (!var2Ready) { setHex2Rows([]); return; }
    let live = true;
    engine.exec(`SELECT ${hexExpr(sel.res)} AS hex, avg(value) AS mean, median(value) AS med, count(obs_id) AS n FROM slice2 WHERE hex7 IS NOT NULL AND ${where2} GROUP BY 1`, "hex2")
      .then((r) => { if (live) setHex2Rows(r); }).catch((e) => { console.error(e); if (live) setVar2Err(e.message); });
    return () => { live = false; };
  }, [var2Ready, sel.res, where2]);
  const hex2Map = useMemo(() => new Map(hex2Rows.map((r) => [String(r.hex), r])), [hex2Rows]);
  const [var2Ds, setVar2Ds] = useState<string[]>([]);
  useEffect(() => {
    if (!var2Ready) { setVar2Ds([]); return; }
    let live = true;
    engine.exec(`SELECT DISTINCT dataset_key FROM slice2 WHERE ${where2}`, "slice2_datasets").then((r) => { if (live) setVar2Ds(r.map((x) => String(x.dataset_key))); }).catch(console.error);
    return () => { live = false; };
  }, [var2Ready, where2]);
  // option C (Betty 2026-11-11): one map, a switch on top colours the same hexagons by the first pick or the added variable.
  // Only the colours change: the hexagons, filters, counts, cards and downloads stay the first pick's (with the added columns)
  const [colorBy2, setColorBy2] = useState(false);
  useEffect(() => { if (!sel.var2 || sel.lens !== "hex") setColorBy2(false); }, [sel.var2, sel.lens]);
  const dsOn = (dk: string) => !sel.datasets || sel.datasets.includes(dk);
  // one dataset at a time, for species and measurements alike (Betty 2026-11-10): datasets are never pooled, so a click
  // SWITCHES to that dataset rather than adding it to a mix
  const toggleDataset = (dk: string) => setSel({ datasets: [dk] });

  // the slice on hand is the one for the CURRENT pick. While a new measurement or species is still being fetched, sliceKey is the
  // old pick's: the lens must not run (it would filter the old data by the new pick's dataset and report "nothing in the selection").
  const wantKey = sel.realm === "bio" ? `bio:${sel.taxon}` : `env:${sel.var}`;
  const sliceCurrent = !!sliceKey && sliceKey === wantKey;
  // Where › Regions from (Betty 2026-11-10): how many SAMPLES each region of the picked layer holds under every filter in
  // force except the area itself, so the list says which regions have data before any is ticked. Samples, not records
  // (Betty 2026-11-11): for a zero-filled taxon a lease whose tows all caught none counted 0, so it was drawn and listed as
  // "no data" while its tows (zeros) were in the mean and its hexagons on the map. `rows` keeps every polygon of a name
  const whereLayer = sel.lens !== "region" && area?.kind === "region" ? area.layer : null;
  const [whereRegs, setWhereRegs] = useState<{ key: string; n: Map<string, number>; rows: Map<string, Row[]> } | null>(null);
  const whereRegKey = whereLayer && sliceKey ? JSON.stringify([whereLayer, sliceKey, { ...params, area_filter: "TRUE" }]) : null;
  useEffect(() => {
    if (!whereRegKey || !whereLayer || !sliceCurrent) return;
    let live = true;
    (async () => {
      await ensure(REG.sample_spatial);
      const rr = await engine.query("region", { ...params, area_filter: "TRUE", layer: whereLayer, spatial_src: q(REG.sample_spatial) });
      if (!live) return;
      const m = new Map<string, number>(), rows = new Map<string, Row[]>();
      for (const r of rr) {
        const nm = String(r.spatial_name);
        m.set(nm, (m.get(nm) ?? 0) + Number(r.n_samples ?? r.n));
        rows.set(nm, [...(rows.get(nm) ?? []), r]);
      }
      setWhereRegs({ key: whereRegKey, n: m, rows });
    })().catch(() => { if (live) setWhereRegs(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whereRegKey, sliceCurrent]);
  // the same ticks as the list, for the map: a region is on when picked, or — nothing narrowed — when it has data
  const whereOn = (nm: string) => {
    if (area?.kind !== "region") return false;
    if (area.names != null) return area.names.includes(nm);
    const c = whereRegs && whereRegs.key === whereRegKey ? whereRegs.n : null;
    return c ? (c.get(nm) ?? 0) > 0 : true;
  };
  const [wrMore, setWrMore] = useState(false);   // the region list: every region with data, not just the first 6
  const [wrEmpty, setWrEmpty] = useState(false); // … and the ones with no data
  useEffect(() => {
    if (!sliceKey || !sliceCurrent || areaPending || (sel.realm === "bio" && !sel.den)) return;
    const g = gen.current;
    const lg = ++lensGen.current;
    const stale = () => g !== gen.current || lg !== lensGen.current;
    const lens = sel.lens;
    (async () => {
      const t = performance.now();
      // a map lens drawing an anomaly summarizes slice_anom — every observation minus the baseline of its own cell, before
      // any aggregation (sql/anom_slice.sql) — built once per slice x baseline; an observation with no baseline drops out
      let mp = { ...params, tbl: "slice" };
      if (anomMap) {
        await anomSlice(sliceKey, climBase);
        if (stale()) return;
        mp = { ...params, tbl: "slice_anom", val: "anom" };
        const sh = (await engine.query("anom_share", params))[0];
        if (stale()) return;
        setAnomShare({ n: Number(sh?.n ?? 0), n_base: Number(sh?.n_base ?? 0) });
      } else setAnomShare(null);
      const need_station = !opened.current || lens === "station" || lens === "contour"; // the contour lens interpolates the station summary
      if (need_station) { const r = await engine.query("station", lens === "contour" ? mp : params); if (stale()) return; setStationRows(r); }
      if (lens === "hex") { const r = await engine.query("hex", { ...mp, hex: hexExpr(sel.res), ...(area?.kind === "hex" ? { area_filter: "TRUE" } : {}) }); if (stale()) return; setHexRows(r); }
      // the sites: the Contours inputs at the site grain (the anomaly when one is drawn), and the Observations layer in any lens (`obs=`)
      const siteInputs = lens === "contour" && sel.grain === "site" && sel.interp !== "tps";
      if (siteInputs || sel.obs) { const r = await engine.query("contour_cast", siteInputs ? mp : params); if (stale()) return; setCastRows(r); }
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
            // the chosen baseline's columns, only the cells that HAVE a mean under it (anomaly.ts climBaseSql())
            cl = await engine.query("section_clim", { ...params, line: sel.line, clim_src: climBaseSql(climSrc(cms), climBase) });
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
      const ct = (await engine.query("count", params))[0];
      if (stale()) return;
      setDepthRows(dr); setYearRows(yr); setViewCount({ slice: sliceKey, n: Number(ct?.n ?? 0), n_samples: Number(ct?.n_samples ?? 0), n_found: Number(ct?.n_found ?? ct?.n ?? 0) });
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
  }, [sliceKey, sliceCurrent, sel.lens, sel.res, sel.layer, sel.line, sel.cruise, sel.grain, sel.interp === "tps", !!sel.obs, params, anomMap, climBase]);

  // the Effort layer (`effort=on`): sample_track for the selected datasets in the time window, for the shown cruise in the cruise
  // lens (sql/effort_track.sql). Its own effect on its own parameters, never the taxon, the variable or the depth band: effort
  // is where the observers looked, whatever they saw. A release with no sample_track has no layer (the row is disabled)
  const effortAvail = hasTrack(catalog);
  const effortCruise = sel.lens === "cruise" ? sel.cruise : null;
  useEffect(() => {
    if (!sel.effort || !effortAvail || areaPending || (sel.lens === "cruise" && !effortCruise)) { setEffortPaths([]); return; }
    let live = true;
    const ep = { track_src: q(REG.sample_track), root_src: q(REG.sample_root), ym0: params.ym0, ym1: params.ym1, quarter_filter: params.quarter_filter, dataset_filter: params.dataset_filter, area_filter: params.area_filter, cruise: effortCruise };
    // the path's month is the cruise's median cast month where the release's cruise table carries it, as the slice's
    Promise.all([ensure(REG.sample_track), ensure(REG.sample_root), probeCruiseMedian()])
      .then(([, , median]) => engine.query("effort_track", median ? { ...ep, cruise_src: cruiseSrcSql(q(REG.cruise)) } : ep))
      .then((r) => { if (live) setEffortPaths(toEffortPaths(r as unknown as EffortRow[])); })
      .catch((e) => { console.warn("sample_track:", e.message); if (live) setEffortPaths([]); });
    return () => { live = false; };
  }, [sel.effort, effortAvail, areaPending, sel.lens, effortCruise, params.ym0, params.ym1, params.quarter_filter, params.dataset_filter, params.area_filter]);
  const effortSum = useMemo(() => effortSummary(effortPaths), [effortPaths]);

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
  const showInputs = sel.inputs ?? fitGrain === "station"; // D43: the inputs are a layer of their own — on for the station dots, off for thousands of sites
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
  // each sampled station's place on the ship's clock (0–1000): the track vertex nearest it, so the map can light a station as the ship reaches it
  const cruiseSamplesT = useMemo(() => {
    if (!track || !track.path.length) return cruiseSamples;
    const out = cruiseSamples.map((r: any) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < track.path.length; i++) { const dx = track.path[i][0] - r.longitude, dy = track.path[i][1] - r.latitude, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
      return { ...r, _t: track.ts[best] ?? 0 };
    });
    return out.sort((a: any, b: any) => a._t - b._t);
  }, [cruiseSamples, track]);
  const cruiseStations = useMemo(() => new Set<string>(cruiseSamples.map((r) => r.grid_key).filter(Boolean)), [cruiseSamples]);
  const preSlice = !lensReady;
  const showV2 = colorBy2 && displayLens === "hex" && var2Ready && hex2Rows.length > 0 && !(sel.anom && sel.realm === "env");
  const hexShown = showV2 ? hex2Rows : hexRows;
  // each variable's own colour window, for the hover card's bars (where a value sits on its own scale)
  const dom1 = useMemo(() => quantileDomain(hexRows.map(statOf), stat), [hexRows, stat]);
  const dom2 = useMemo(() => quantileDomain(hex2Rows.map((r: any) => Number(r.mean)), "mean"), [hex2Rows]);
  const lensRows = displayLens === "hex" ? hexShown : displayLens === "region" ? regionRows : displayLens === "cruise" ? cruiseSamples : stationRows;
  const emptyResult = lensReady && sliceKey != null && sliceCurrent && !lensRows.length && viewCount?.slice === sliceKey && !status.endsWith("…"); // the selection answers with nothing (a filter that excludes every dataset, a season no cruise sampled)
  // Stations draws only observations that sit on a named station; samples taken off the grid are real data the Hot spots view shows
  // a popup's own colour: where the cell's value sits on the map's ramp, so the card visibly belongs to the cell it describes
  const cardColour = (v: number | null | undefined): string => {
    if (v == null || !Number.isFinite(v)) return "var(--muted)";
    const c = colorScale(domain, 255, rampId)(v) as number[];
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const offGridOnly = emptyResult && sel.lens === "station" && (viewCount?.n ?? 0) > 0;
  // the map draws a difference from the normal (Hexagons, or a signed Contours surface) — ramps.ts drawsAnomaly()
  const mapAnomDrawn = anomMap && drawsAnomaly({ ...sel, anom: anomOn, stat }) && (displayLens === "hex" || displayLens === "contour");
  const domain = useMemo(() => {
    const rows = preSlice && displayLens === "station" ? [...covStation.values()] : lensRows;
    const d = quantileDomain(rows.map(preSlice && displayLens === "station" ? (r) => r.n : statOf), preSlice ? "n" : stat);
    // a departure colours on a window symmetric about 0, so the diverging ramp's midpoint is "the normal"
    return mapAnomDrawn && !preSlice ? symDomain(d) : d;
  }, [displayLens, lensRows, covStation, stat, preSlice, mapAnomDrawn]);

  // what the contour lens draws: the chosen surface coloured on its own 5–95 % window (the statistic itself shares the
  // station dots' window, so the two lenses agree), pretty isolines, and the legend's unit. Shared by the map, the
  // contour surface, the section heatmap and the section's 3-D curtain — one ramp id, one rule (ramps.ts lensRamp()).
  const rampId = lensRamp({ ...sel, anom: anomOn, stat }, rampHint);
  // the year strip's cruise-calendar cells never draw an anomaly (ramps.ts seriesRamp())
  const seriesRampId = seriesRamp(sel, rampHint);
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
  // the Sections lens: the range the section draws, never the map's station rows (explore#12 — those are not
  // refreshed in this lens, so the legend kept the first pick's numbers under every variable's unit)
  // (under the baseline in force: keyed on the month, a seasonal anomaly's range was another season's, or none)
  const sectionAnom = sel.anom && sel.realm === "env" && !!climCells;
  const sectionDomain = useMemo(() => displayLens === "section" ? sectionRange(sectionCells, climCells, sectionAnom, climBase) : null, [displayLens, sectionCells, climCells, sectionAnom, climBase]);
  // rows, but no baseline for the cruise's month (or season): the section says so instead of drawing (anomaly.ts)
  const sectionNoBase = useMemo(() => sectionAnom && noBaseline(sectionCells, climCells, climBase), [sectionCells, climCells, sectionAnom, climBase]);
  // a section that draws nothing has no range: the legend says so, never the station summary's last one (this lens does
  // not refresh it, and colours nothing on the map by it)
  const sectionBlank = displayLens === "section" && !sectionDomain;
  const legendDomain: [number, number] = useMemo(() => {
    if (sectionDomain) return sectionDomain;
    if (displayLens !== "contour" || sel.surface === "value" || !surfVals) return domain;
    const v: number[] = []; for (let i = 0; i < surfVals.length; i++) if (Number.isFinite(surfVals[i])) v.push(surfVals[i]);
    const d = quantileDomain(v, sel.surface === "n" || sel.surface === "se" || sel.surface === "spread" ? "n" : "mean");
    return mapAnomDrawn ? symDomain(d) : d;
  }, [displayLens, sel.surface, surfVals, domain, sectionDomain, mapAnomDrawn]);
  const contourInputs = useMemo(() => {
    if (displayLens !== "contour" || !surf || !surfVals) return null;
    const g = surf.grid, image = surfaceImage(surfVals, g.nx, g.ny, colorScale(legendDomain, 255, rampId), 235, surf.dist, MASK_KM);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < surfVals.length; i++) { const x = surfVals[i]; if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }
    const iso = isolines(surfVals, g.nx, g.ny, niceLevels(lo, hi, 8));
    // each level's line in a darkened ramp colour (55 % of the value colour), so the lines read against the surface
    const lineColor = colorScale(legendDomain, 255, rampId);
    const dark = (c: [number, number, number, number]): [number, number, number, number] => [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 210];
    const lines = iso.flatMap((l) => { const c = dark(lineColor(l.level)); return l.segs.map((s) => ({ path: [cellToLonLat(g, s[0], s[1]), cellToLonLat(g, s[2], s[3])], level: l.level, color: c })); });
    // D44: labels by screen space — one per ~260 px of line, none on a line under 130 px, none within 70 px of another —
    // so the density follows the zoom (recomputed when the map settles); years read as integers
    const zoom = sel.map?.[2] ?? MAP_HOME[2], cellPx = (512 * 2 ** zoom * g.cellDeg) / 360;
    const every = 260 / cellPx, minDist = 70 / cellPx;
    const fmtLevel = (v: number) => (sel.surface === "y0" || sel.surface === "y1" ? String(Math.round(v)) : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));
    const labels = sel.labels
      ? thinLabels(iso.flatMap((l) => labelPoints(joinSegments(l.segs), every).map((p) => ({ ...p, text: fmtLevel(l.level) }))), minDist).map((p) => ({ position: cellToLonLat(g, p.x, p.y), text: p.text, angle: p.angle }))
      : null;
    return { image, bounds: [g.lon0, g.latS, g.lon1, g.latN] as [number, number, number, number], lines, labels, casts: surf.fit.nmax > 0 ? (castRows as any[]) : null, inputs: showInputs };
  }, [displayLens, surf, surfVals, legendDomain, rampId, castRows, showInputs, sel.labels, sel.surface, sel.map?.[2]]);

  const areaPick = useMemo(() => whereLayer && area?.kind === "region"
    ? spatial.filter((f: any) => f.properties.layer === whereLayer).map((f: any) => ({ ...f, properties: { ...f.properties, ...(() => { const ns = regionsOfFeature(f.properties.name, (areaRegions?.get(whereLayer) ?? []).map((r) => r.name)); const c = whereRegs && whereRegs.key === whereRegKey ? whereRegs.n : null; return { __on: ns.some(whereOn), __has: c ? ns.some((n) => (c.get(n) ?? 0) > 0) : true }; })() } }))
    : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [whereLayer, area, spatial, whereRegs, whereRegKey, areaRegions]);
  const areaOutline = useMemo(() => area?.kind === "box" ? [boxFeature(area.bbox)] : area?.kind === "poly" ? [polyFeature(area.pts)] : area?.kind === "region" ? (areaPick ? areaPick.filter((f: any) => f.properties.__on && f.properties.__has) : regionOutline(area, spatial)) : null, [area, spatial, areaPick]); // every chosen region's edge
  // the thing of interest — a layer's regions, a cruise's track, a line, an area — and where to frame it: the map flies there
  // (zooming in or out as needed) when the pick changes, so the data is never off-screen. Keys leave out stat / years / depth.
  const mapFit = useMemo((): { key: string; bbox: [number, number, number, number] } | null => {
    const pad = (b: [number, number, number, number] | null, k: string) => b ? { key: k, bbox: b } : null;
    if (sel.lens === "region") {
      const withData = layerFeatures.filter((f) => regionStats.has(f.properties.spatial_key));
      const b = featuresBbox(withData.length ? withData : layerFeatures);
      return pad(b, `region|${sel.layer}|${withData.length ? "data" : "none"}`);
    }
    if (sel.lens === "cruise") {
      if (!track || !track.path.length) return null;
      let w = Infinity, s0 = Infinity, e0 = -Infinity, n = -Infinity;
      for (const [x, y] of track.path) { if (!Number.isFinite(x) || !Number.isFinite(y)) continue; const x2 = x > 0 ? x - 360 : x; w = Math.min(w, x2); e0 = Math.max(e0, x2); s0 = Math.min(s0, y); n = Math.max(n, y); }
      return w <= e0 ? { key: `cruise|${sel.cruise}`, bbox: [w, s0, e0, n] } : null;
    }
    if (sel.lens === "section") {
      const pts = grid.filter((c) => c.line === sel.line).map((c) => c.home);
      if (!pts.length) return null;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { key: `section|${sel.line}`, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    }
    if (areaOutline && areaOutline.length) return pad(featuresBbox(areaOutline as any), `area|${sel.area}`);
    return null;
  }, [sel.lens, sel.layer, sel.cruise, sel.line, sel.area, layerFeatures, regionStats, track, grid, areaOutline]);
  const lineThreadsAll = useMemo(() => lineThreads(grid), [grid]); // the Lines layer (`lines=on`)
  const layerInputs = useMemo((): LayerInputs => ({
    lens: displayLens, res: sel.res, stat: preSlice ? "n" : stat, grid, station: stationMap, hex: hexShown as any,
    hexSel: hexCard?.cell ?? (area?.kind === "hex" ? area.cell : null), hexHover, region: { features: layerFeatures, stats: regionStats, stationTo: regionStation, centroid: centroids, selected: sel.region },
    cruise: { track, samples: cruiseSamplesT as any, time: reducedMotion ? 1250 : timeRef.current },
    section: { line: sel.line, cruiseStations },
    contour: contourInputs,
    duration, domain, ramp: rampId, dataOn: sel.data, dataOpacity: sel.datao ?? 1, obs: sel.obs ? { rows: castRows as any[], color: sel.obs } : null, lines: sel.lines ? lineThreadsAll : null, effort: sel.effort ? effortPaths : null, beforeId: dataBeforeId, selectedStation: sel.station, area: areaOutline, areaPick, dark: theme === "dark", highlight: hoverCruise?.pts ?? null,
  }), [displayLens, sel.res, stat, preSlice, grid, stationMap, hexShown, layerFeatures, regionStats, regionStation, centroids, sel.region, track, cruiseSamples, sel.line, cruiseStations, domain, sel.station, contourInputs, rampId, sel.data, sel.datao, sel.obs, castRows, sel.lines, lineThreadsAll, sel.effort, effortPaths, dataBeforeId, areaOutline, areaPick, theme, hexCard?.cell, hexHover, area, hoverCruise]);
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
  // the datasets that hold THIS pick (a species: at the chosen life stage), most data first
  const dsChoices = useMemo(() => {
    const m = new Map<string, number>();
    const std = new Set<string>(); // species: datasets with standardized counts (per 10 m² / per 1000 m³) at this stage
    for (const r of picker) if (sel.realm === "env" || (r.life_stage ?? null) === (sel.stage ?? null)) { m.set(r.dataset_key, (m.get(r.dataset_key) ?? 0) + r.n); if (r.n_10m2 > 0 || r.n_1000m3 > 0) std.add(r.dataset_key); }
    // the default is the first: standardized before raw-only (sardine eggs open on the net tows, per 10 m², not CUFES's
    // raw pump counts — Betty 2026-11-10), then the most data
    const rank = (dk: string) => { const i = DS_PRIMARY.indexOf(dk); return i < 0 ? 99 : i; };
    return [...m.entries()].sort((a, b) => (sel.realm === "bio" ? rank(a[0]) - rank(b[0]) || Number(std.has(b[0])) - Number(std.has(a[0])) : 0) || b[1] - a[1]);
  }, [picker, sel.realm, sel.stage]);
  // never pool: when more than one dataset holds the pick, show one — the one already chosen if it applies, else the one
  // with the most data. The others are listed under it to switch to.
  useEffect(() => {
    if (sliceKey !== (sel.realm === "bio" ? `bio:${sel.taxon}` : `env:${sel.var}`) || !dsChoices.length) return;
    const keys = dsChoices.map(([dk]) => dk);
    if (keys.length === 1) { if (sel.datasets && !sel.datasets.includes(keys[0])) setSel({ datasets: null }); return; }
    if (sel.datasets?.length === 1 && keys.includes(sel.datasets[0])) return;
    setSel({ datasets: [sel.datasets?.find((d) => keys.includes(d)) ?? keys[0]] });
  }, [sliceKey, dsChoices, sel.datasets, sel.realm, sel.taxon, sel.var]);
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
  // the dataset shown cannot express the current standardization (CUFES eggs carry no tow effort, so "per 10 m²" leaves
  // nothing): switch to one it has, rather than an empty map that blames the filters (Betty 2026-11-10)
  // and on a switch of dataset the standardization goes to that dataset's best (back to per 10 m² from CUFES's raw count)
  const denDsRef = useRef<string | null>(null);
  useEffect(() => {
    if (sel.realm !== "bio" || !sel.den || !sel.datasets || sliceKey !== `bio:${sel.taxon}` || !stageRows.length) return;
    const dsKey = `${sel.taxon}|${sel.datasets.join(",")}`, switched = denDsRef.current != null && denDsRef.current !== dsKey;
    denDsRef.current = dsKey;
    if (!switched && denInfo(sel.den).rows > 0) return;
    const d = defaultDen(stageRows, sel.stage ?? null);
    if (d && d !== sel.den) setSel({ den: d });
  }, [sliceKey, sel.realm, sel.taxon, sel.den, sel.datasets, sel.stage, picker]);
  const pickTotal = stageRows.reduce((a, r) => a + (sel.realm === "env" ? r.n : sel.den === "per_10m2" ? r.n_10m2 : sel.den === "per_1000m3" ? r.n_1000m3 : r.n), 0);
  // "N observations in view" counts what the map summarizes under every filter (sql/count.sql); the Sections and
  // Cruises lenses draw a subset (one line, one cruise), so there it is what they draw
  const sumN = (r: { n?: number }[]) => r.reduce((a, x) => a + Number(x.n ?? 0), 0);
  const inView = displayLens === "section" && sectionCells.length ? sumN(sectionCells)
    : displayLens === "cruise" && sel.cruise && cruiseSamples.length ? sumN(cruiseSamples)
    : viewCount && viewCount.slice === sliceKey ? viewCount.n : pickTotal;
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
  // the preliminary mark (stage.ts): the view's one cruise, when a dataset in view is not final on it; the hover names the
  // release's own value and the dataset that carries it
  const viewStg = useMemo(() => viewStage({ lens: sel.lens, realm: sel.realm, cruise: sel.cruise }, viewDatasetKeys, stageIdx), [sel.lens, sel.realm, sel.cruise, viewDatasetKeys, stageIdx]);
  const prelimRow = (ck: string): Partial<PickerItem> => (cruiseStage(stageIdx, ck, viewDatasetKeys) ? { badge: "preliminary", badgeWarn: true } : {});
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
    // a dataset-local class with no name in the source (a bare code such as "218"): "Class 218", listed after the named ones
    const code = local ? t.taxon_key.replace(/^[^:]+:/, "") : "";
    const unnamed = !t.common_name && !t.scientific_name && /^[\d.\-]+$/.test(code);
    return { unnamed, key: t.taxon_key, label: unnamed ? `Class ${code}` : titleCaseCommonName(t.common_name) ?? t.scientific_name ?? (local ? humanizeCode(code) : t.taxon_key), sub: t.common_name ? t.scientific_name : unnamed ? "no name in the source" : undefined, subItalic: !!t.common_name, n: t.n, year: t.y1, year0: t.y0,
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
    const groupVariants = (vs: { key: string; datasets: string[] }[]) => {
      const g = new Map<string, { key: string; datasets: string[] }>();
      for (const v of vs) { const id = [...v.datasets].sort().join("|"), cur = g.get(id); if (!cur || repScore(v.key, mt.get(v.key)?.description) < repScore(cur.key, mt.get(cur.key)?.description)) g.set(id, { key: v.key, datasets: v.datasets }); }
      return [...g.values()];
    };
    const inUnified = new Set(defs.flatMap((v) => v.members));
    // a variable a derived dataset publishes wears the family (the picker's Derived (hydrographic) group), a `derived`
    // badge and, on hover, the registry's own definition — per-bin (spice, the averaged sigma-theta) and per-cast alike
    const derived = (key: string, label: string, units: string | null | undefined, ds: string[], grain: VarGrain) => {
      const family = derivedFamily(ds);
      return family ? { family, badge: "derived", tip: derivedTip({ label, units: units ?? null, derivation: mt.get(key)?.derivation ?? null }, grain, dsRow(ds[0])?.dataset_name_short) } : {};
    };
    const item = (key: string, label: string, units: string | undefined, c: { n: number; y0: number; y1: number; ds: Map<string, number>; cat: string | null }, search = ""): PickerItem => {
      const ds = [...c.ds.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      // the registry's category (coverage.json, since calcofi4db 3.25.0) wins; the keyword rule is the stopgap for a release without it
      return { key, label, sub: units, desc: mt.get(key)?.description ?? undefined, n: c.n, year: c.y1 || null, year0: c.y0 < 9999 ? c.y0 : null, datasets: ds, dsN: Object.fromEntries(c.ds), groups: { category: c.cat ?? envCategory(key, label), dataset: ds[0] ?? "—" }, search: `${key} ${search}`, ...derived(key, label, units, ds, "bin") };
    };
    // a unified variable (bottle + CTD headline types, comparable) is one row; every other type is its own
    const uni = defs.map((v) => { const c = { n: 0, y0: 9999, y1: 0, ds: new Map<string, number>(), cat: null as string | null }; for (const m of v.members) { const x = byType.get(m); if (x) { c.n += x.n; c.y0 = Math.min(c.y0, x.y0); c.y1 = Math.max(c.y1, x.y1); c.cat = c.cat ?? x.cat; for (const [k, n] of x.ds) c.ds.set(k, (c.ds.get(k) ?? 0) + n); } }
      const lab = v.label !== v.key ? v.label : (mt.get(v.members[0])?.description ?? ENV_VARS_FALLBACK[v.key] ?? v.key);
      const u = lab.match(/\(([^)]+)\)$/)?.[1] ?? mt.get(v.members[0])?.units ?? undefined; return item(v.key, shortName(lab.replace(/\s*\([^)]+\)$/, ""), v.key), u, c, v.members.join(" ")); }).filter((v) => v.n > 0);
    // one row per real measurement (names.ts, the finder's rule): sensor pairs, correction stages, replicates and unit variants
    // of one type fold into one row named from the type's key — "Dissolved Oxygen", not four near-identical descriptions
    const restGroups = new Map<string, [string, typeof byType extends Map<string, infer V> ? V : never][]>();
    for (const e of byType.entries()) { if (inUnified.has(e[0])) continue; const b = canonicalBase(e[0]); (restGroups.get(b) ?? restGroups.set(b, []).get(b)!).push(e); }
    const rest = [...restGroups.values()].map((es) => {
      const sorted = es.slice().sort((a, b) => repScore(a[0], mt.get(a[0])?.description) - repScore(b[0], mt.get(b[0])?.description));
      const [k] = sorted[0];
      const c = { n: 0, y0: 9999, y1: 0, ds: new Map<string, number>(), cat: null as string | null };
      for (const [, x] of es) { c.n += x.n; c.y0 = Math.min(c.y0, x.y0); c.y1 = Math.max(c.y1, x.y1); c.cat = c.cat ?? x.cat; for (const [d, n] of x.ds) c.ds.set(d, (c.ds.get(d) ?? 0) + n); }
      const m = mt.get(k);
      const it = item(k, knownName(k) ?? (m?.description ? shortName(m.description, k) : fixDisplayName(k)), m?.units ?? undefined, c, es.map(([x]) => x).join(" ")); // named from the registry's plain description (key-derived names read as code: "Ctdtemp Its90")
      // by dataset: the keys of one row, one entry per distinct set of datasets (a sensor pair inside one dataset is one entry)
      const variants = groupVariants(es.map(([x, v]) => ({ key: x, datasets: [...v.ds.keys()] })));
      return es.length > 1 ? { ...it, alt: es.map(([x]) => x).filter((x) => x !== k), variants } : it;
    });
    // the per-cast variables: coverage.json lists per-observation types only, so these come from the registry and the
    // release's own sample_measurement (castgrain.ts castVariables()). The count is casts; the unit line says so.
    const cast = castVars.filter((v) => !byType.has(v.key)).map((v): PickerItem => ({
      key: v.key, label: shortName(v.label, v.key), desc: v.label, sub: `${v.units ? `${v.units} · ` : ""}per cast`, n: v.n, year: v.y1, year0: v.y0, datasets: v.datasets,
      groups: { category: v.category ?? envCategory(v.key, v.label), dataset: v.datasets[0] ?? "—" }, search: `${v.key} derived per cast`,
      ...derived(v.key, v.label, v.units, v.datasets, "cast") }));
    // two rows that read the same in one category are one measurement (a unified type and a lone sensor type can land on the
    // same name): fold them, keep the bigger as the row and the other's keys as `alt`
    const all = [...uni, ...rest, ...cast].sort((a, b) => b.n - a.n), seen = new Map<string, PickerItem>(), out: PickerItem[] = [];
    for (const it of all) {
      const id = `${it.groups?.category ?? ""}|${it.label.toLowerCase()}`, hit = seen.get(id);
      if (!hit || it.badge !== hit.badge) { seen.set(id, it); out.push(it); continue; }
      hit.alt = [...new Set([...(hit.alt ?? []), it.key, ...(it.alt ?? [])])];
      hit.variants = groupVariants([...(hit.variants ?? [{ key: hit.key, datasets: hit.datasets ?? [] }]), ...(it.variants ?? [{ key: it.key, datasets: it.datasets ?? [] }])]);
      hit.n += it.n; hit.datasets = [...new Set([...(hit.datasets ?? []), ...(it.datasets ?? [])])];
      if (it.dsN) { const m = { ...(hit.dsN ?? {}) }; for (const [d, n] of Object.entries(it.dsN)) m[d] = (m[d] ?? 0) + n; hit.dsN = m; }
      if (it.year && (!hit.year || it.year > hit.year)) hit.year = it.year;
      if (it.year0 && (!hit.year0 || it.year0 < hit.year0)) hit.year0 = it.year0;
    }
    return out;
  }, [cov, mt, catalog, castVars, datasets]);
  const variableGroups = useMemo<GroupOpt[]>(() => [
    { key: "category", label: "category", icon: (c) => (c === DERIVED_FAMILY ? "ui-line" : categoryIcon(c)), rank: categoryRank },
    { key: "dataset", label: "dataset", short: short }], []);
  // the lean panel's one picker: species and measurements in one list (the keys never collide: taxon keys are "worms:…"/"itis:…"/dataset codes)
  const whatItems = useMemo<PickerItem[]>(() => [...organismItems, ...variableItems], [organismItems, variableItems]);
  const whatIsOrganism = useMemo(() => new Set(organismItems.map((i) => i.key)), [organismItems]);
  const dayOf = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  // every cruise list leads with the cruise ID (2019-07-33RL), with its month, ship ("Jul 2019 · Reuben Lasker"), days and
  // stations under it; 1907, 201907, the month and the ship all search
  const dayRange = (t0: number, t1: number) => { const a = dayOf(t0), b = dayOf(t1); if (a === b) return a; const [ma] = a.split(" "), [mb, db] = b.split(" "); return ma === mb ? `${a}–${db}` : `${a} – ${b}`; };
  const cruiseItemOf = (key: string, o: { t0?: number | null; t1?: number | null; n_sta?: number | null; n?: number | null; extra?: string }): PickerItem => {
    const y = key.slice(0, 4), mm = key.slice(5, 7), mon = MONTHS3[Number(mm) - 1];
    const shipRaw = cruiseRef?.get(key)?.ship, ship = shipRaw ? shipRaw.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : null;
    const sta = o.n_sta != null ? `${o.n_sta} station${Number(o.n_sta) === 1 ? "" : "s"}` : null;
    // the cruise ID leads (Betty 2026-11-10); its month, ship, days and stations sit under it
    return { key, label: key, right: ship ?? undefined, sub: [o.t0 && o.t1 ? dayRange(o.t0, o.t1) : (mon ? `${mon} ${y}` : null), sta, o.extra].filter(Boolean).join(" · "),
      n: Number(o.n ?? 0), year: +y, search: `${key} ${y}${mm} ${y.slice(2)}${mm} ${y}-${mm}` };
  };
  // (a preliminary cruise wears its mark in every list: main #52, stage.ts)
  const cruiseItems = useMemo<PickerItem[]>(() => cruiseRows.map((c) => ({ ...cruiseItemOf(c.cruise_key, c), ...prelimRow(c.cruise_key) })), [cruiseRows, cruiseRef, stageIdx, viewDatasetKeys]);
  const sectionCruiseItems = useMemo<PickerItem[]>(() => sectionCruises.map((c) => ({ ...cruiseItemOf(c.cruise_key, { n_sta: c.n_sta, extra: `${fmtN(c.n)} observations` }), n: c.n_sta, year: c.year, ...prelimRow(c.cruise_key) })), [sectionCruises, cruiseRef, stageIdx, viewDatasetKeys]);
  const envVar = variableItems.find((v) => v.key === sel.var || v.alt?.includes(sel.var));
  // what the app says about a derived variable, in the title sentence and under the picker: the registry's description
  // and derivation, the grain, and the page of the dataset that publishes it (its methods) — nothing written here
  const derivedNote = useMemo((): DerivedNote | null => {
    if (sel.realm !== "env" || !envVar?.family || !varGrain) return null;
    const dk = envVar.datasets?.find((d) => derivedFamily([d])) ?? envVar.datasets?.[0] ?? "";
    const r = mt.get(sel.var);
    return { word: varGrain === "cast" ? `derived, ${grainWord("cast")}` : "derived", tip: envVar.tip ?? "", label: `${envVar.label}${r?.units ? ` (${r.units})` : ""}`, grain: grainWord(varGrain),
      how: r?.derivation ?? null, datasetName: dsRow(dk)?.dataset_name_short ?? short(dk), datasetUrl: datasetPageUrl(dk) };
  }, [sel.realm, sel.var, envVar, varGrain, mt, datasets]);
  // what a count counts: a per-cast variable has one value per cast
  const countWord = isCast ? "casts" : "observations";
  // the grey count line of a hover or card (Betty 2026-11-11: "1 observation · 1960–2012" under a mean of 2 tows did not add
  // up). For bio with zero-filled tows (slice_bio.sql) the mean, median and years run over every sample, so say how many,
  // and in how many the taxon was found (n_found: SAMPLES with a record — not n, the records: a tow can hold two records,
  // and "80 samples · found in 31" over 30 such tows read wrong). One phrase, both numbers (Betty 2026-11-11: "2 samples ·
  // found in 1" was unclear): "found in 1 of 2 samples". Positive-only bio: "found in 30 samples" (every one, by
  // construction). Env: its observations (casts for a per-cast variable), which the statistics do run over
  // keep a control where it is on screen while the Find-data panel re-lays out around it (Betty 2026-11-11: Count zeros
  // made the panel jump — the region list above it goes back to "counting…" and the counts change size while the new
  // numbers load, and the panel has scroll anchoring off). For a few seconds, every frame, scroll the panel by however
  // far the control moved; a wheel, touch or key from the person ends it at once
  const holdInPlace = (el: HTMLElement, sel2: string, ms = 2500) => {
    const box = el.closest(".lean-steps") as HTMLElement | null; if (!box) return;
    const y0 = el.getBoundingClientRect().top, t0 = performance.now();
    let stop = false;
    const end = () => { stop = true; box.removeEventListener("wheel", end); box.removeEventListener("touchstart", end); window.removeEventListener("keydown", end); };
    box.addEventListener("wheel", end, { passive: true }); box.addEventListener("touchstart", end, { passive: true }); window.addEventListener("keydown", end);
    const tick = () => {
      if (stop) return;
      const cur = el.isConnected ? el : box.querySelector<HTMLElement>(sel2);
      if (cur) { const d = cur.getBoundingClientRect().top - y0; if (Math.abs(d) > 0.5) box.scrollTop += d; }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else end();
    };
    requestAnimationFrame(tick);
  };
  const countText = (r: any): string => {
    const n = Number(r?.n ?? 0);
    if (sel.realm === "bio") {
      const t = Number(r?.n_samples ?? n), word = t === 1 ? "sample" : "samples";
      const f = Number(r?.n_found ?? n);
      return !sel.zeros ? `found in ${fmtN(t)} ${word}` : `found in ${fmtN(f)} of ${fmtN(t)} ${word}`;
    }
    return isCast ? grainCount("cast", n) : `${fmtN(n)} ${n === 1 ? "observation" : "observations"}`;
  };
  // the title's count, in the same words as the hovers (Betty 2026-11-11: "mean … · 31 observations" read as a mean of 31
  // values, while the mean of a zero-filled taxon runs over every sample in view): a map lens on the count query says
  // "found in 30 of 1,204 samples"; Sections / Cruises (one line, one cruise) and a second variable keep their plain count
  const countLabel = sel.realm === "bio" && !showV2 && displayLens !== "section" && !(displayLens === "cruise" && sel.cruise && cruiseSamples.length)
    && viewCount && viewCount.slice === sliceKey ? countText(viewCount) : null;
  const yearsSet = sel.years[0] !== 1949 || sel.years[1] !== YEAR_OPEN || !!sel.months;
  const depthSet = sel.depth[0] !== 0 || sel.depth[1] !== 500;
  const copyLink = async () => { try { await navigator.clipboard.writeText(location.href); setStatus("link copied"); } catch { setStatus("clipboard blocked"); } };

  // ── panels: folds + maximize in the URL; card minimize, geometry and the phone sheet in memory ────
  const [minCards, setMinCards] = useState<Record<CardId, boolean>>({ section: false, cruise: false, station: false, timing: false, layers: false });
  const [layersOpen, setLayersOpen] = useState(false);
  // the boundary registry: the release's spatial_layers.json sidecar, the bundled snapshot as the fallback (D23)
  const [topCard, setTopCard] = useState<PanelId | null>(null);
  const [dockTab, setDockTab] = useState<PanelId>("years");
  const dockSeen = useRef<PanelId[]>([]);
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
  // a plain class on <body> while the Start-here card is open — the CSS blurs the map and panels from it (no :has())
  useEffect(() => { document.body.classList.toggle("welcome-open", modal === "welcome"); return () => document.body.classList.remove("welcome-open"); }, [modal]);
  const [aboutAt, setAboutAt] = useState<string | null>(null); // Help ▾ → Keyboard opens About on that section
  const openModal = (m: ModalId, at: string | null = null) => {
    // a private preview never files a public issue: feedback posts to the preview service (feedback.tsx, when the
    // build has its endpoint) and a product registration goes to the preview's landing page
    if (PREVIEW && (m === "product" || (m === "feedback" && !feedbackEndpoint()))) { location.assign(PREVIEW_HOME); return; }
    setSel({ modal: m === "sources" ? "sources" : null }); setAboutAt(at); setModal(m);
  };
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
  const tourSnap = useRef<{ lens: Lens; hide: PanelId[]; sheet: typeof sheet; what: boolean } | null>(null);
  const whatRef = useRef(whatOpen); whatRef.current = whatOpen;
  const selRef = useRef(sel); selRef.current = sel;
  const sheetRef = useRef(sheet); sheetRef.current = sheet;
  const tourActions: TourActions = {
    phone, reducedMotion,
    getLens: () => selRef.current.lens, setLens: (l) => onLens(l),
    isFolded: (id) => selRef.current.hide.includes(id), unfold: (id) => { if (id === "select") setSentenceOpen(false); setSelRaw((s) => ({ ...s, hide: s.hide.filter((h) => h !== id) })); },
    sheet: (panel, detent) => setSheet({ panel, detent }),
    openWhat: (b) => setWhatOpen(b),
    viewMenu: (b) => window.dispatchEvent(new CustomEvent("cc-viewmenu", { detail: b })),
    statPick: (b) => window.dispatchEvent(new CustomEvent("cc-statpick", { detail: b })),
    snapshot: () => { tourSnap.current = { lens: selRef.current.lens, hide: selRef.current.hide, sheet: sheetRef.current, what: whatRef.current }; },
    restore: () => { const t = tourSnap.current; if (!t) return; setSelRaw((s) => ({ ...s, lens: t.lens, hide: t.hide })); if (phone) setSheet(t.sheet); setWhatOpen(t.what); tourSnap.current = null; },
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
    engine.query("years", { ...params, bin: `year::INTEGER + (COALESCE(${CRUISE_MONTH_SQL}, month(datetime)) - 0.5) / 12.0` }).then((r) => { if (live) setMonthRows(r as YearRow[]); }).catch(console.error); // the cruise's month (slice column)
    return () => { live = false; };
  }, [needMonths, sliceKey, params]);
  // explore#21: mean ± se by season (four points a year, one per quarterly cruise) — the mode's default; `tbin=year` keeps
  // one a year. explore#23: the release's cruise seasons, so a season with no point says whether any cruise sailed
  const [seasonRows, setSeasonRows] = useState<YearRow[] | null>(null);
  const [cruiseSeasons, setCruiseSeasons] = useState<CruiseSeason[] | null>(null);
  const bySeason = seriesMode === "mean" && sel.tbin === "season";
  useEffect(() => {
    if (!bySeason || !sliceKey || areaPending) { setSeasonRows(null); return; }
    let live = true;
    engine.query("years", { ...params, bin: SEASON_BIN }).then((r) => { if (live) setSeasonRows(r as YearRow[]); }).catch(console.error);
    return () => { live = false; };
  }, [bySeason, sliceKey, params, areaPending]);
  // the depth × time anomaly card (explore#28): cruise season × 10 m bin over slice_anom, under every filter in force (the
  // lens params: years, months, season, depth band, datasets, Area). A `base=season` link waits for the column probe, so it
  // never draws the monthly anomaly first and then the seasonal one
  useEffect(() => {
    if (!dtWant || !sliceKey || areaPending || (sel.base === "season" && climSeason == null)) { setDtRows(null); setDtShare(null); return; }
    let live = true;
    setDtRows(null);
    (async () => {
      await anomSlice(sliceKey, climBase);
      if (!live) return;
      const [rows, sh] = await Promise.all([engine.query("anom_depth_time", params), engine.query("anom_share", params)]);
      if (!live) return;
      setDtRows(rows as DtRow[]); setDtShare({ n: Number(sh[0]?.n ?? 0), n_base: Number(sh[0]?.n_base ?? 0) });
    })().catch((e) => { console.error(e); if (live) { setDtRows([]); setStatus(`depth × time: ${e.message}`); } });
    return () => { live = false; };
  }, [dtWant, sliceKey, areaPending, params, climBase, sel.base, climSeason]);
  useEffect(() => {
    if (!bySeason || cruiseSeasons || !catalog) return;
    probeCruiseMedian().then((m) => engine.query("cruise_seasons", { src: q(REG.cruise), ...cruiseTokens(m) })).then((r) => setCruiseSeasons(r as CruiseSeason[])).catch(console.error);
  }, [bySeason, cruiseSeasons, catalog]);
  useEffect(() => {
    if (seriesMode !== "cruises" || !sliceKey) return;
    let live = true;
    engine.query("cruise", params).then((r) => { if (live) setGanttRows(r as CruiseRow[]); }).catch(console.error);
    if (!cruiseRef) probeCruiseMedian().then((m) => engine.query("cruise_ref", { src: q(REG.cruise), ...cruiseTokens(m) })).then((r) => { if (live) setCruiseRef(new Map(r.map((c) => [c.cruise_key, { ship: c.ship_name ?? c.ship_nodc ?? "", nodc: c.ship_nodc ?? "", month: c.month == null ? null : Number(c.month) }]))); }).catch(console.error);
    return () => { live = false; };
  }, [seriesMode, sliceKey, params]);
  // the preliminary mark: once a lens that shows one cruise has drawn, and once the session holds sample_root (the Cruises
  // lens loads it for the track; a per-cast variable and the Effort layer do too), probe it and read the stages — once
  useEffect(() => {
    if (!lensReady || stageIdx || stageRef.current || (sel.lens !== "section" && sel.lens !== "cruise")) return;
    const root = loads.current.get(REG.sample_root);
    if (root) (stageRef.current = loadStages(root)).then(setStageIdx);
  }, [lensReady, sel.lens, displayLens, status, stageIdx]);
  // the Sections lens names the cruise's month in its caption: load the cruise reference for it too
  useEffect(() => {
    if (sel.lens !== "section" || cruiseRef || !catalog) return;
    let live = true;
    probeCruiseMedian().then((m) => engine.query("cruise_ref", { src: q(REG.cruise), ...cruiseTokens(m) })).then((r) => { if (live) setCruiseRef(new Map(r.map((c) => [c.cruise_key, { ship: c.ship_name ?? c.ship_nodc ?? "", nodc: c.ship_nodc ?? "", month: c.month == null ? null : Number(c.month) }]))); }).catch(console.error);
    return () => { live = false; };
  }, [sel.lens, cruiseRef, catalog]);
  const gantt = useMemo(() => {
    if (seriesMode !== "cruises") return null;
    const rows = (sel.lens === "cruise" && cruiseRows.length ? cruiseRows : ganttRows).filter((c) => c.t0 && c.t1);
    // the ship from the cruise reference (title case), for the hover; a key with no reference row shows its NODC code
    const shipOf = (k: string) => { const ref = cruiseRef?.get(k); const nodc = k.split("-")[2] ?? k; return ref?.ship ? ref.ship.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : nodc; };
    const gr: GanttRow[] = rows.map((c) => ({ ...c, ship: shipOf(c.cruise_key) }));
    return { rows: gr, selected: sel.cruise, onPick: (k: string) => setSel({ cruise: k }) };
  }, [seriesMode, cruiseRows, ganttRows, cruiseRef, sel.lens, sel.cruise]);
  // with no year filter the boxes read the span the picked data actually covers, not the whole 1949+ record
  const dataYears = useMemo<[number, number] | null>(() => { const ys = yearRows.filter((r) => (r.n ?? 0) > 0).map((r) => r.year); return ys.length ? [Math.min(...ys), Math.max(...ys)] : null; }, [yearRows]);
  const yearsShown: [number, number] = !yearsSet && dataYears ? dataYears : years;
  const yearsSpark = useMemo(() => { const m = new Map(yearRows.map((r) => [r.year, r.n])); const out: number[] = []; for (let y = 1949; y <= yearMax; y++) out.push(m.get(y) ?? 0); return out; }, [yearRows, yearMax]);
  const nFilled = useMemo(() => picker.filter((r) => r.life_stage === sel.stage && dsOn(r.dataset_key)).reduce((a, r) => a + (r.n_filled ?? 0), 0), [picker, sel.stage, sel.datasets]);
  const zerosNote = sel.realm === "bio" && !sel.zeros ? " · positive tows only" : "";
  const legendUnit = sel.lens === "contour" && sel.surface === "n" ? "observations" : sel.lens === "contour" && (sel.surface === "y0" || sel.surface === "y1") ? "year" : undefined as string | undefined; // filled below once unitLabel exists
  const unitLabel = sel.realm === "bio" ? (sel.den === "raw" ? "count" : sel.den === "per_10m2" ? "per 10 m²" : "per 1000 m³") : (picker[0]?.units ?? sel.var);
  const taxonRow = taxa.find((t) => t.taxon_key === sel.taxon);
  const legendTitle = preSlice ? "root samples · all datasets (coverage.json, before the engine is warm)" : sel.realm === "bio"
    ? `${STAT_LABEL[stat]} · ${taxonRow?.common_name ?? taxonRow?.scientific_name ?? sel.taxon} · ${sel.stage ?? "all life stages"} · ${unitLabel}${zerosNote}`
    // a per-cast variable has no depth clause: its unit line already reads "m · per cast"
    : `${STAT_LABEL[stat]} · ${envVar ? `${envVar.label}${envVar.sub ? ` (${envVar.sub})` : ""}` : sel.var}${isCast ? "" : ` · ${sel.depth[0]}–${sel.depth[1]} m`}`;
  // the lines a section can be drawn along: two stations or more (gridkey.ts). The SCCOOS inshore stations sit each on a
  // "line" of its own (93.4, 86.8 …): a station on the map and in the card, never a one-column section
  const lines = useMemo(() => sectionLines(grid), [grid]);
  const ownLine = (l: number) => grid.length > 0 && !lines.includes(l);
  const OWN_LINE = "on a line of its own — no section";
  const stationCard = useMemo(() => {
    if (!sel.station) return null;
    const detail = covStations?.stations.find((s) => s.grid_key === sel.station);
    const summary = cov?.stations.find((s) => s.grid_key === sel.station);
    const cell = grid.find((c) => c.grid_key === sel.station);
    return { grid_key: sel.station, cell, summary, detail };
  }, [sel.station, cov, covStations, grid]);

  const onLens = (l: Lens) => { lensClickAt.current = performance.now(); setSel({ lens: l }); };
  // Share › Copy code and the bundle hand over the depth × time card's statements while it is open (src/reproduce.ts)
  const dtRepro = dtWant ? { base: climBase, clim: climMs } : null;
  // the region columns of the downloads: the Where regions, else the Regions view's layer (Betty 2026-11-10)
  const var2Cols = var2Ready && sel.lens === "hex" ? { key: sel.var2!, hex: hexExpr(sel.res), km: RES_KM[sel.res].replace(/[~ km]/g, ""), where: where2 } : null;
  const regionCols = area?.kind === "region" ? { layer: area.layer, names: area.names, src: q(REG.sample_spatial) }
    : sel.lens === "region" && sel.layer ? { layer: sel.layer, names: null, src: q(REG.sample_spatial) } : null;
  const download = async () => {
    if (!catalog || !version || bundling) return;
    try {
      const lensTemplate = sel.lens === "hex" ? "hex" : sel.lens === "region" ? "region" : sel.lens === "cruise" ? "cruise" : sel.lens === "section" ? (sel.realm === "env" ? "section" : "section_bio") : "station";
      const lensParams: Record<string, any> = sel.lens === "hex" ? { hex: hexExpr(sel.res) } : sel.lens === "region" ? { layer: sel.layer } : sel.lens === "section" ? { line: sel.line, cruise: sel.cruise } : {};
      const summary = sel.lens === "hex" ? hexRows : sel.lens === "region" ? regionRows : sel.lens === "cruise" ? cruiseRows : sel.lens === "section" ? sectionCells : stationRows;
      const { blob, name } = await buildBundle({
        sel, version, catalog, params, lensParams, lensTemplate, grain: varGrain, rootHex7: !!castHex, cruiseMedian: !!cruiseMedian, bioNet, depthTime: dtRepro, summary: summary as Row[], summaryKey: sel.lens, grid, regionFeatures: layerFeatures,
        datasets, regionCols, var2Cols, unit: unitLabel, envFile: sel.realm === "env" ? envReg(sel.var) : null, bioSrcName: REG.obs_bio, hexRes: sel.res, onStatus: setBundling,
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
    const text = copyAs(kind, { sel, catalog, version, params, lensParams: lensPar(), lensTemplate: lensTpl(), grain: varGrain, rootHex7: !!castHex, cruiseMedian: !!cruiseMedian, bioNet, depthTime: dtRepro });
    try { await navigator.clipboard.writeText(text); setStatus(`copied ${kind.toUpperCase()} (${text.length.toLocaleString()} chars)`); } catch { setStatus("clipboard blocked"); }
    (window as any).__lastCopy = text;
  };
  // the lean layout's one big button: every observation behind the view, filters applied, as a single CSV (the zip package stays in the ▾)
  const [csvZeros, setCsvZeros] = useState(true);   // the CSV keeps the zero-filled tows unless unticked; follows Count zeros
  useEffect(() => { setCsvZeros(true); }, [sel.zeros, sel.taxon, sel.realm]);
  const downloadCsv = async () => {
    if (!catalog || !version || bundling) return;
    setBundling("preparing CSV…");
    try {
      const { blob, name, n } = await buildObservationsCsv({ sel, version, catalog, params, lensParams: lensPar(), lensTemplate: lensTpl(), grain: varGrain, rootHex7: !!castHex, cruiseMedian: !!cruiseMedian, bioNet, depthTime: dtRepro }, { zeros: csvZeros, regionCols, var2Cols });
      saveBlob(blob, name); setStatus(`saved ${name} · ${fmtN(n)} rows`); trackEvent("export", { panel: "select", kind: "observations-csv" });
    } catch (e: any) { console.error(e); setStatus(`CSV error: ${e.message}`); }
    setBundling(null);
  };
  // with the zero-filled tows ticked, the CSV has more rows than the count above it: say how many of them are tows with no catch
  const [zeroRows, setZeroRows] = useState<{ key: string; rows: number; zeros: number } | null>(null);
  const zeroKey = `${sliceKey}|${sel.lens}|${sel.line}|${sel.cruise}`;
  useEffect(() => {
    if (!(sel.realm === "bio" && sel.zeros && csvZeros && nFilled > 0 && sliceKey && sliceCurrent && catalog && version && !areaPending)) return;
    let live = true;
    countZeroRows({ sel, version, catalog, params, lensParams: lensPar(), lensTemplate: lensTpl(), grain: varGrain, rootHex7: !!castHex, cruiseMedian: !!cruiseMedian, bioNet, depthTime: dtRepro })
      .then((r) => { if (live) setZeroRows({ key: zeroKey, ...r }); }).catch(() => { if (live) setZeroRows(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zeroKey, sliceCurrent, csvZeros, sel.zeros, sel.realm, nFilled > 0, version, areaPending]);
  // the hexagon under the pointer, outlined on the map (set from the hover, only when it changes)
  const getTooltip = (info: PickingInfo) => {
    const o: any = info.object;
    const hv = info.layer?.id === "hexes" && o?.hex ? String(o.hex) : null;
    if (hv !== hexHoverRef.current) { hexHoverRef.current = hv; setHexHover(hv); }
    if (!o) {
      // no deck object under the pointer: a visible boundary may be (MapLibre picking, D25)
      const m = (window as any).__map;
      if (m && visibleBoundaries.length && info.x != null && info.y != null) {
        const ids = boundaryLayerIds(layersEff).filter((l) => m.getLayer(l));
        const fs = ids.length ? m.queryRenderedFeatures([info.x, info.y], { layers: ids }) : [];
        if (fs.length) {
          const d = spatialLayers.layers.find((dd) => String(fs[0].layer.id).startsWith(`sp-${dd.id}-`));
          return { text: boundaryTooltip(fs[0].properties, d) };
        }
      }
      return null;
    }
    const id = info.layer?.id;
    if (id === "area-pick") {
      // hover shows the region's data, like a station's (Betty 2026-11-11: "just on hover", no click card): its name, its
      // value, then one grey line of count and years. One polygon may stand for several regions (a sanctuary's sections):
      // its count is theirs together, and a value only when it is one region's
      const nm = String(o.properties.name);
      const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      const counts = whereRegs && whereRegs.key === whereRegKey ? whereRegs : null;
      const gs = counts ? regionsOfFeature(nm, (whereLayer ? areaRegions?.get(whereLayer) ?? [] : []).map((r) => r.name)).flatMap((n) => counts.rows.get(n) ?? []) as any[] : [];
      const g: any = gs.length ? { ...gs.slice().sort((x, y) => Number(y.n_samples) - Number(x.n_samples))[0], n: gs.reduce((k, x) => k + Number(x.n), 0), n_samples: gs.reduce((k, x) => k + Number(x.n_samples ?? 0), 0), n_found: gs.reduce((k, x) => k + Number(x.n_found ?? x.n ?? 0), 0), y0: Math.min(...gs.map((x) => x.y0 == null ? Infinity : Number(x.y0))), y1: Math.max(...gs.map((x) => x.y1 == null ? -Infinity : Number(x.y1))) } : null;
      const when = g?.y0 == null ? "" : g.y0 === g.y1 ? ` · ${g.y0}` : ` · ${g.y0}–${g.y1}`;
      // one map shape over several data regions (a sanctuary's sections; Betty 2026-11-11): the mean pools them, weighted by
      // the rows each one averaged (n_rows, sql/region.sql); a median does not pool, so it shows for one region only
      const rowsN = gs.reduce((k, x) => k + Number(x.n_rows ?? 0), 0);
      const pooled = gs.length > 1 && stat === "mean" && rowsN > 0 ? gs.reduce((k, x) => k + Number(x.mean ?? 0) * Number(x.n_rows ?? 0), 0) / rowsN : null;
      const v = gs.length === 1 && g ? statOf(g) : pooled;
      const val = g && v != null && !preSlice && stat !== "n"
        ? `<div class="tl-v"><b>${esc(fmt(v))}</b><small>${esc([unitLabel, String(STAT_LABEL[stat]).toLowerCase()].filter(Boolean).join(" · "))}</small></div>` : "";
      const body = !counts ? `<div class="tl-n">counting…</div>`
        : !g ? `<div class="tl-n">no ${esc(countWord)} in this selection</div>`
        : `${val}<div class="tl-n">${esc(countText(g))}${when}</div>`;
      return { html: `<div class="tl"><div class="tl-id">${esc(nm)}</div>${body}</div>` };
    }
    if (id === "stations") {
      // option B (Betty 2026-11-11): a short white card — the station by line and station, its value, one grey line
      const st: any = stationMap.get(o.grid_key);
      const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      const name = `Line ${o.line} · Station ${o.station}${ownLine(o.line) ? ` · ${OWN_LINE}` : ""}`;
      const when = st?.y0 == null ? "" : st.y0 === st.y1 ? ` · ${st.y0}` : ` · ${st.y0}–${st.y1}`;
      const n = Number(st?.n ?? 0);
      const body = !st ? `<div class="tl-n">no ${esc(countWord)} in this selection</div>`
        : preSlice ? `<div class="tl-n">${fmtN(n)} root samples, all datasets</div>`
        : `<div class="tl-v"><b>${esc(fmt(statOf(st)))}</b><small>${esc(unitLabel)} · ${esc(String(STAT_LABEL[stat]).toLowerCase())}</small></div><div class="tl-n">${esc(countText(st))}${when}</div>`;
      return { html: `<div class="tl"><div class="tl-id">${esc(name)}</div>${body}</div>` };
    }
    if (id === "surface") { const px = (info as any).bitmap?.pixel; const v = px && surf && surfVals ? cellValue(surfVals, surf.grid, px[0], px[1]) : null; return v == null ? null : { text: `${SURFACE_LABEL[sel.surface]}${mapAnomDrawn ? ` · difference from the cruise-${climBase === "season" ? "season" : "month"} normal` : ""}: ${fmt(v)} ${legendUnit}\n${INTERP_WORD[sel.interp]} over ${surf!.fit.n} stations · leave-one-out RMSE ${fmt(surf!.fit.loo)}` }; }
    if (id === "hexes" && var2Ready) {
      // hover = both variables at once (Betty 2026-11-11), each with a bar for where it sits on its own colour scale
      const h1: any = hexRows.find((r: any) => r.hex === o.hex), g: any = hex2Map.get(String(o.hex));
      const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      const pct = (v: number, d: [number, number]) => Math.round(100 * Math.min(1, Math.max(0, d[1] > d[0] ? (v - d[0]) / (d[1] - d[0]) : 0.5)));
      const row = (name: string, v: number | null, unit: string, _n: number | null, d: [number, number]) => `<div class="tt2-r"><span>${esc(name)}</span><b>${v == null ? "no data" : `${esc(fmt(v))}${unit ? ` <small>${esc(unit)}</small>` : ""}`}</b></div>`
        + `<div class="tt2-bar">${v == null ? "" : `<i style="width:${pct(v, d)}%"></i>`}</div>`;
      const u2 = var2Unit && var2Unit !== var2Label ? var2Unit : "";
      return { html: `<div class="tt2">${row(subject, h1 ? statOf(h1) : null, unitLabel, h1?.n ?? null, dom1)}${row(var2Label, g ? Number(g.mean) : null, u2, g?.n ?? null, dom2)}<div class="tt2-f">bar = position within each map color scale</div></div>` };
    }
    if (id === "hexes") {
      // hover, one variable (option 2): name, value with its unit, where it sits on the colour scale, how much data and when
      const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      const v = statOf(o), d = domain, w = Math.round(100 * Math.min(1, Math.max(0, d[1] > d[0] ? (v - d[0]) / (d[1] - d[0]) : 0.5)));
      const when = o.y0 == null ? "" : o.y0 === o.y1 ? ` · ${o.y0}` : ` · ${o.y0}–${o.y1}`;
      return { html: `<div class="tt2"><div class="tt2-r"><span>${esc(subject)}${mapAnomDrawn ? " <small>difference from normal</small>" : ""}</span><b>${esc(fmt(v))} <small>${esc(unitLabel)}</small></b></div><div class="tt2-bar"><i style="width:${w}%"></i></div><div class="tt2-n">${esc(countText(o))}${when}</div></div>` };
    }
    if (id === "regions") { const s = regionStats.get(o.properties.spatial_key); return { text: `${o.properties.name}\n${s ? `${STAT_LABEL[stat]} ${fmt(statOf(s))} · ${countText(s)} · ${s.y0}–${s.y1}` : "no data"}` }; }
    if (id === "cruise-samples" || id === "cruise-samples-next") return { text: `${o.grid_key ?? "—"} · ${new Date(o.t * 1000).toISOString().slice(0, 10)}\n${STAT_LABEL[stat]} ${fmt(statOf(o))} · ${fmtN(o.n)} observations` };
    if (id === "effort" || id === "effort-sight") return { text: `${o.track_type === "sight_line" ? "line of sight to a sighting" : "on-effort segment"} · ${short(o.dataset_key)}\n${o.t != null ? new Date(o.t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "no time"}${o.length_km != null ? ` · ${fmt(o.length_km, 2)} km` : ""}` };
    return null;
  };
  // a popup stays on the spot it was opened from: its place is kept as a longitude / latitude and re-projected as the map moves
  const clickLL = (info: PickingInfo): [number, number] | undefined => { const ll = (window as any).__map?.unproject?.([info.x ?? 0, info.y ?? 0]); return ll ? [ll.lng, ll.lat] : undefined; };
  const cardXY = (c: { x: number; y: number; ll?: [number, number] }): { x: number; y: number } => {
    const m = (window as any).__map; if (!c.ll || !m?.project) return c;
    const p = m.project(c.ll), r = m.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  };
  const onClick = (info: PickingInfo) => {
    const o: any = info.object; if (!o) return;
    // Stations / Hexagon with Regions from: a region's data shows on hover, so a click opens nothing (Betty 2026-11-11)
    if (info.layer?.id === "area-pick") { if (regionCard) setRegionCard(null); return; }
    // a hexagon has no click card any more (Betty 2026-11-11: "just hover") — hover shows its values; a click on a
    // one-hexagon area still clears it
    if (info.layer?.id === "hexes" && o.hex && area?.kind === "hex" && area.cell === o.hex) { setSel({ area: null }); setHexCard(null); return; }
    if (hexCard) setHexCard(null);
    if (info.layer?.id === "regions") {
      // a click on a region picks it and opens its card (a region with no data says so, with 0); a second click on it clears both
      const key = String(o.properties.spatial_key);
      if (sel.region === key) { setSel({ region: null }); setRegionCard(null); }
      else {
        const r = (window as any).__map?.getContainer?.()?.getBoundingClientRect?.();
        setSel({ region: key }); setRegionCard({ key, x: (r?.left ?? 0) + (info.x ?? 0), y: (r?.top ?? 0) + (info.y ?? 0), ll: clickLL(info) });
      }
    } else if (regionCard) setRegionCard(null);
    // in Sections a click picks the station's line — unless the line has no section (a station on a line of its own),
    // which opens the station's card instead
    if (info.layer?.id === "stations" && sel.lens === "section" && lines.includes(o.line)) { setSel({ line: o.line, cruise: null }); setLineNote(null); }
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
  const subject = sel.realm === "bio" ? (organism?.label ?? taxonRow?.common_name ?? taxonRow?.scientific_name ?? sel.taxon) : (envVar?.label ?? mt.get(sel.var)?.description ?? sel.var); // the registry's words while the picker's list is still on its way
  const selectSummary = sel.realm === "bio" ? `${subject} · ${sel.stage ?? "all life stages"} · ${unitLabel}${zerosNote}` : isCast ? `${subject} · per cast` : `${subject} · ${sel.depth[0]}–${sel.depth[1]} m`;
  const depthSummary = sliceKey && !depthRows.length ? "Depth · no depth axis" : `Depth ${sel.depth[0]}–${sel.depth[1]} m`;
  // the lenses a per-cast variable does not draw in (docs/cast-grain.md): Sections cut depth, and a per-cast value
  // has none; Hexagons pool by the H3 cell, which sample_root carries only since v2026.10.04 (an older release has none)
  const castLensNote = !isCast ? null
    : sel.lens === "section" ? "Sections cut the water column, and a per-cast variable is one value for the whole cast — nothing to draw here. See it at"
    : sel.lens === "hex" && castHex === false ? "Hexagons are not drawn for a per-cast variable in this release (its sample_root carries no H3 cell on a cast). See it at"
    : null;
  // why a pick has no depth axis: a net tow is depth-integrated; a per-cast variable is one value for the whole cast
  // why the Depth panel has no profile, from what the pick IS and what the filters left — never "net tows" for a CTD
  // variable: an env variable per depth bin with nothing under the filters (spice in 2025 Q3) is empty, not depth-integrated
  const noneLeft = !!sliceKey && viewCount?.slice === sliceKey && viewCount.n === 0;
  // when nothing is left, say why, plainly and over the map (Betty 2026-11-10: a small "0 observations" in the title read as
  // nothing at all): whether the filters left tows that caught none, and which single filter, taken off, brings data back
  const [emptyWhy, setEmptyWhy] = useState<{ key: string; zeroTows: number; back: { what: string; n: number; clear: () => void }[] } | null>(null);
  const emptyKey = `${sliceKey}|${JSON.stringify(params)}`;
  useEffect(() => {
    if (!noneLeft || !sliceKey || areaPending) { setEmptyWhy(null); return; }
    let live = true;
    const n = (over: Record<string, any>) => engine.exec(render("count", { ...params, ...over }), "empty_why").then((r) => Number(r[0]?.n ?? 0));
    const tows = sel.realm === "bio" ? engine.exec(`SELECT count(DISTINCT root_id) AS t FROM slice WHERE ${render("count", { ...params, zeros: true }).split("WHERE").slice(1).join("WHERE")}`, "empty_tows").then((r) => Number(r[0]?.t ?? 0)) : Promise.resolve(0);
    const tries: { what: string; over: Record<string, any>; clear: () => void; on: boolean }[] = [
      { what: sel.cruises?.length === 1 ? `cruise ${sel.cruises[0]}` : "the cruises", over: { cruise_filter: "TRUE" }, clear: () => setSel({ cruises: null }), on: !!sel.cruises?.length },
      { what: "the area", over: { area_filter: "TRUE" }, clear: () => { setAreaRegionMode(false); setSel({ area: null }); }, on: !!area },
      { what: "the years", over: { ym0: 194901, ym1: 299912 }, clear: () => setSel({ years: [1949, YEAR_OPEN], months: null }), on: yearsSet },
      { what: "the seasons", over: { quarter_filter: "TRUE" }, clear: () => setSel({ q: null }), on: !!(sel.q?.length && sel.q.length < 4) },
      { what: "the depth band", over: { d0: 0, d1: 99999 }, clear: () => setSel({ depth: [0, 500] }), on: depthSet },
    ].filter((t) => t.on);
    Promise.all([tows, ...tries.map((t) => n(t.over))]).then(([t, ...ns]) => {
      if (!live) return;
      setEmptyWhy({ key: emptyKey, zeroTows: t as number, back: tries.map((tr, i) => ({ what: tr.what, n: ns[i] as number, clear: tr.clear })).filter((b) => b.n > 0) });
    }).catch(() => { if (live) setEmptyWhy(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noneLeft, emptyKey, areaPending]);
  const noDepthWhy = noneLeft ? "nothing in the selection is left under these filters" : isCast ? "it is one value for the whole cast" : sel.realm === "bio" ? "its net tows are depth-integrated" : "its values carry no depth (surface or weather measurements)";
  const seriesToggle = <span className="seg" role="group" aria-label="year strip mode" data-tour="strip-mode"><button className={seriesMode === "n" ? "on" : ""} onClick={() => setSeriesMode("n")}>{countWord}</button><button className={seriesMode === "mean" ? "on" : ""} onClick={() => setSeriesMode("mean")}>mean ± se</button><button className={seriesMode === "cruises" ? "on" : ""} onClick={() => setSeriesMode("cruises")} title="a year × month calendar, one cell per cruise coloured by the summary stat; zoom in for the dates and codes; click a cell to pick the cruise"><Icon name="ui-gantt" />cruises</button></span>;
  const logChip = seriesMode === "mean" ? <button type="button" className={`chip${ylog ? " on" : ""}`} aria-pressed={ylog} title="log scale — the axis keeps the original values; the minor gridlines sit at one even step, so they bunch toward the top. A zero mean sits on the axis floor (log 0 does not exist); the hover always carries the true value" onClick={() => setYlog(!ylog)}>log</button> : null;
  const Q_LABEL = SEASON_WORD; // 1 = DJF … 4 = SON (release v2026.11+: the cruise's season, December with the following winter)
  const seasonLabel = sel.q?.length && sel.q.length < 4 ? sel.q.map((x) => SEASON_NAME[x - 1]).join(" and ") : "all";
  // the filters in force, in words — an empty result's note says them
  const filterItems = [sel.q && seasonLabel, yearsSet && (sel.months ? `${years[0]}-${String(sel.months[0]).padStart(2, "0")} → ${years[1]}-${String(sel.months[1]).padStart(2, "0")}` : `${years[0]}–${years[1]}`), depthSet && `${sel.depth[0]}–${sel.depth[1]} m`, sel.datasets && sel.datasets.map(short).join(", ")].filter(Boolean) as string[];
  const areaPhrase = area ? areaWord(area).replace("the standard station grid", "the standard stations") : "";
  const filterWords = [...filterItems, ...(area ? [areaPhrase] : [])];
  const depthEmpty = noneLeft ? `no observations<br>under these filters${filterWords.length ? ":<br>" + filterWords.join(" · ") : ""}`
    : isCast ? "one value per cast —<br>a per-cast variable has<br>no water-column profile"
    : sel.realm === "bio" ? "depth-integrated net tows —<br>no water-column profile for this selection;<br>the tow span will draw here<br>once the release carries it"
    : "no depth on these values —<br>surface or weather measurements<br>have no water-column profile";
  // the When step's cruise list: the same list as View as › Cruises (dates, stations), for the cruises the current pick has
  // data on under every other filter — the cruise filter itself left out, so picking one never empties the list
  const [cruiseOpts, setCruiseOpts] = useState<CruiseRow[] | null>(null);
  useEffect(() => {
    if (!sliceKey || !sliceCurrent || areaPending) return;
    let live = true; setCruiseOpts(null);
    engine.query("cruise", { ...params, cruise_filter: "TRUE" }).then((r) => { if (live) setCruiseOpts(r as CruiseRow[]); }).catch(console.error);
    // the ship's name for each row, from the cruise reference (loaded once)
    if (!cruiseRef) probeCruiseMedian().then((m) => engine.query("cruise_ref", { src: q(REG.cruise), ...cruiseTokens(m) })).then((r) => { if (live) setCruiseRef(new Map(r.map((c) => [c.cruise_key, { ship: c.ship_name ?? c.ship_nodc ?? "", nodc: c.ship_nodc ?? "", month: c.month == null ? null : Number(c.month) }]))); }).catch(console.error);
    return () => { live = false; };
  }, [sliceKey, sliceCurrent, areaPending, params.ym0, params.ym1, params.quarter_filter, params.d0, params.d1, params.stage, params.dataset_filter, params.zeros, params.area_filter, params.val]);
  const whenCruiseItems = useMemo<PickerItem[]>(() => (cruiseOpts ?? []).filter((c) => !sel.cruises?.includes(c.cruise_key)).map((c) => cruiseItemOf(c.cruise_key, c)), [cruiseOpts, sel.cruises, cruiseRef]);
  const cruiseWord = (k: string) => { const it = (cruiseOpts ?? []).find((c) => c.cruise_key === k); const m = Number(k.slice(5, 7)); return MONTHS3[m - 1] ? `${MONTHS3[m - 1]} ${k.slice(0, 4)}${it ? "" : ""}` : k; };
  const toggleQ = (x: number) => { const cur = sel.q ?? [1, 2, 3, 4]; const next = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x].sort(); setSel({ q: next.length === 0 || next.length === 4 ? null : next }); };
  const datasetsInSlice = useMemo(() => [...new Set(picker.map((r) => r.dataset_key))], [picker]);
  const layerNames = useMemo(() => spatialLayers.layers.filter((d) => d.n_memberships > 0).map((d) => d.name).sort(), [spatialLayers]);
  const layerGroups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of spatialLayers.layers) if (d.n_memberships > 0) { const g = (d.group || "Other").replace(/ & /g, " and "); m.set(g, [...(m.get(g) ?? []), d.name]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([group, names]) => ({ group, names: names.sort() }));
  }, [spatialLayers]);
  const regionName = sel.region ? (layerFeatures.find((f) => f.properties.spatial_key === sel.region)?.properties.name ?? sel.region) : null;
  const stdWord = sel.den ? DEN_LABEL[sel.den] : "…";
  // what the active lens asks for, under its line: the hexagon size, the boundary layer, the line + cruise, the cruise
  // ── the anomaly control (the depth section, Hexagons, Contours): the checkbox, the month / season baseline toggle and —
  // on a map lens — what share of the observations in view had a baseline. Drawn where each lens's options already are.
  const climWord = climWindow ? `${climWindow[0]}–${climWindow[1]}` : "1993–2013";
  const baseHow: Record<ClimBase, string> = {
    month: `the cruise's month: the mean of that month's ${climWord} cruises at the station (≥ ${CLIM_MIN_CRUISES} cruises) — e.g. a July cruise minus the July normal`,
    season: `the cruise's season (Dec–Feb, Mar–May, Jun–Aug, Sep–Nov): the mean of that season's ${climWord} cruises at the station (≥ ${CLIM_MIN_CRUISES} cruises in the season) — e.g. a July cruise minus the Jun–Aug normal; fills a month with too few cruises of its own`,
  };
  const anomNote = anomMap && anomShare
    ? (anomShare.n ? `${Math.round((100 * anomShare.n_base) / anomShare.n)} % of ${fmtN(anomShare.n)} ${countWord} had a ${climBase === "season" ? "cruise-season" : "cruise-month"} normal at their station${isCast ? "" : " and depth"}; the rest are left out, never drawn as 0` : `no ${countWord} in view`)
    : null;
  const baseSeg = <span className="seg" role="group" aria-label="the baseline the anomaly subtracts">
    <button type="button" className={climBase === "month" ? "on" : ""} title={baseHow.month} onClick={() => setSel({ base: "month" })}>month</button>
    <button type="button" className={climBase === "season" ? "on" : ""} disabled={climSeason !== true} title={seasonWhyNot ?? (climSeason == null ? "checking whether this release carries a seasonal baseline…" : baseHow.season)} onClick={() => setSel({ base: "season" })}>season</button>
  </span>;
  const anomControl = sel.realm === "env" && <div className="opt-anom">
    <label className="row" style={{ fontSize: 12 }} title={anomAvail ? `a departure from the release's climatology: ${sel.lens === "section" ? "this station" : "each observation's own station"}, ${baseHow[climBase]}${isCast ? "" : ", this 10 m depth bin"} — the same table ctd-transects subtracts` : anomWhyNot}>
      <input type="checkbox" checked={anomOn} disabled={!anomAvail} onChange={(e) => setSel({ anom: e.target.checked })} /> Difference from the {climWord} normal</label>
    {anomOn && <div className="row"><span className="hint">Normal of the cruise's</span>{baseSeg}</div>}
    {anomOn && sel.lens !== "section" && sel.stat === "n" && <div className="hint">the observation count is not a departure: pick the mean or the median to see the anomaly</div>}
    {anomNote && <div className="hint" data-anom-share>{anomNote}</div>}
  </div>;
  const lensOptions = <>
    {sel.lens === "hex" && (() => {
      const setRes = (r: number) => { if (r !== sel.res) { lensClickAt.current = performance.now(); setSel({ res: r, ...(area?.kind === "hex" ? { area: null } : {}) }); } };
      const SIZE: Record<number, string> = { 3: "60 km", 4: "23 km", 5: "8.5 km", 6: "3.2 km", 7: "1.2 km" };
      // option B (Betty 2026-11-10): a row of hex buttons, each drawn at its relative size — the size is the picture
      const PX: Record<number, number> = { 3: 28, 4: 22, 5: 17, 6: 13, 7: 10 };
      return <div className="opt hexres hexres-b">
        <div className="hr-head"><span className="k">Choose hexagon size</span></div>
        <div className="hr-row" role="radiogroup" aria-label="hexagon size">
          {[7, 6, 5, 4, 3].map((r) => <button key={r} type="button" role="radio" aria-checked={r === sel.res} className={r === sel.res ? "on" : ""}
            title={`about ${SIZE[r]} across one side`} onClick={() => setRes(r)}>
            <svg width={PX[r]} height={PX[r]} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 21.1 6.75v10.5L12 22.5 2.9 17.25V6.75Z" /></svg>
            <span>{r === 3 ? SIZE[r] : SIZE[r].replace(" km", "")}</span>
          </button>)}
        </div>
        <div className="hr-ends"><span>Detailed</span><span>Broad</span></div>
      </div>;
    })()}
    {sel.lens === "hex" && anomControl}
    {sel.lens === "contour" && <div className="opt contour-opt">
      <div className="row"><span className="hint">Method</span><span className="seg">{INTERPS.map((m) => <button key={m} type="button" className={sel.interp === m ? "on" : ""} title={INTERP_HOW[m]} onClick={() => setSel({ interp: m, surface: m === "idw" && sel.surface === "se" ? "value" : sel.surface })}>{INTERP_LABEL[m]}</button>)}</span></div>
      <div className="row grain"><span className="hint">Fitted to</span><span className="seg">{(["site", "station"] as Grain[]).map((g) => <button key={g} type="button" className={fitGrain === g ? "on" : ""} disabled={g === "site" && sel.interp === "tps"} title={GRAIN_HOW[g] + (g === "site" && sel.interp === "tps" ? " — not for the spline" : "")} onClick={() => setSel({ grain: g })}>{GRAIN_LABEL[g]}</button>)}</span></div>
      <label className="row" style={{ fontSize: 12 }} title="the points the surface was fitted to, drawn over it — every site as a pinprick, or the station grid sized by its observations (D43); also a row in the Layers card"><input type="checkbox" checked={showInputs} onChange={(e) => setSel({ inputs: e.target.checked === (fitGrain === "station") ? null : e.target.checked })} /> Show the inputs ({fitGrain === "site" ? `${fmtN(castRows.length)} sites` : `${stationRows.length} stations`})</label>
      <label className="row" style={{ fontSize: 12 }} title="the level written along each isoline, about every 150 km (D44); also a row in the Layers card"><input type="checkbox" checked={sel.labels} onChange={(e) => setSel({ labels: e.target.checked })} /> Contour labels</label>
      {anomControl}
      <label className="f">Surface<select value={sel.surface} onChange={(e) => setSel({ surface: e.target.value as Surface })}>{SURFACES.map((s) => <option key={s} value={s} disabled={s === "se" && sel.interp === "idw"}>{SURFACE_LABEL[s]}{s === "se" && sel.interp === "idw" ? " — not for IDW" : ""}</option>)}</select></label>
      <details className="fit-more"><summary>More details</summary><div className="hint fit">{surf ? <>{fmtN(surf.fit.n)} {surf.fit.nmax ? `sites (${surf.fit.nmax} nearest per cell)` : "stations"} → {fmtN(surf.fit.nCells)} cells of {surf.grid.cellDeg}° · leave-one-out RMSE <b>{fmt(surf.fit.loo)}</b> {legendUnit === "year" ? "years" : legendUnit ?? unitLabel}{surf.fit.vg ? ` · variogram: nugget ${fmt(surf.fit.vg.nugget)} · sill ${fmt(surf.fit.vg.nugget + surf.fit.vg.psill)} · range ${Math.round(surf.fit.vg.range)} km` : ""}{surf.fit.edf != null ? ` · ${surf.fit.edf.toFixed(1)} effective df` : ""}{surf.fit.nLoo && surf.fit.nLoo < surf.fit.n ? ` (LOO on ${surf.fit.nLoo}${surf.fit.nFit && surf.fit.nFit < surf.fit.n ? `, variogram on ${fmtN(surf.fit.nFit)}` : ""})` : ""} · {Math.round(surf.fit.ms)} ms{surf.seMs != null ? ` (+${Math.round(surf.seMs)} ms for the error surface)` : ""}</> : sel.lens === "contour" && lensReady ? "computing the surface…" : "…"} · blank beyond {MASK_KM} km of a point, and over land</div></details>
    </div>}
    {sel.lens === "region" && <div className="opt">
      <div className="f lsel"><span className="lsel-lab">Boundary layer</span>
        {/* the same map browser as Where › Regions from (Betty 2026-11-10) */}
        <button type="button" className="ds-c-sel wr-open" onClick={() => { if (!areaRegions) setAreaRegionMode(true); setRegionModalFor("lens"); setRegionModal(sel.layer); }} title="see each layer's regions on a map and choose">
          <span className="nm">{(() => { const d = spatialLayers.layers.find((x) => x.name === sel.layer); return d ? layerLabel(d) : sel.layer; })()}</span><Icon name="ui-down" size="0.85rem" />
        </button></div>
      <div className="sum-row region-stat"><span>Each region shows the</span><StatPick label="summary statistic" value={stat} options={Object.entries(STAT_LABEL) as [string, string][]} onChange={(k) => setSel({ stat: k as Stat })} /></div>
      {stat === "n" && sel.realm === "bio" && <div className="hint stat-note">Counts samples that caught it; samples with no catch are not counted.</div>}
      <div className="region-list">
        <div className="region-head" aria-hidden="true"><span>Region</span><span>{STAT_LABEL[stat]}</span><span title={countWord}>{countWord === "observations" ? "Obs" : countWord}</span></div>{regionRows.slice().sort((a, b) => b.n - a.n).slice(0, regAll ? undefined : 5).map((r) => <button type="button" key={r.spatial_key} className={`region-row${sel.region === r.spatial_key ? " on" : ""}`} title={`${r.spatial_name} · ${fmt(statOf(r))} · ${fmtN(r.n)} observations`} onClick={() => setSel({ region: sel.region === r.spatial_key ? null : r.spatial_key })}><span className="nm">{String(r.spatial_name).replace(/ National Marine Sanctuary/i, "")}</span><span className="v">{fmt(statOf(r))}</span><span className="n">{fmtN(r.n)}</span></button>)}
        {regionRows.length > 5 && <button type="button" className="linkish region-more" onClick={() => setRegAll((v) => !v)}>{regAll ? "Show fewer" : `Show all ${regionRows.length}`}</button>}</div>
      <div className="hint">{regionRows.length} of {layerFeatures.length} regions {regionRows.length === 1 ? "has" : "have"} data{unitLabel ? ` · ${STAT_LABEL[stat]} in ${unitLabel}` : ""}</div>
    </div>}
    {sel.lens === "section" && <div className="opt">
      <div className="row">
        <label className="f">Line<select value={sel.line} onChange={(e) => { setSel({ line: +e.target.value, cruise: null }); setLineNote(null); }}>{lines.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
        {lineNote && <div className="hint warn" data-line-note>{lineNote}</div>}
        {/* a cruise picks the ENV section: one occupation of the line, depth down the y-axis. A bio section has no
            depth axis (the tows are depth-integrated), so it runs station x year across every cruise — offering a
            cruise there would be a control that changes nothing */}
        {sel.realm === "env"
          ? <Picker id="section-cruise" label="Cruise" hint="(newest first)" value={sel.cruise ?? ""} items={sectionCruiseItems} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "old"]} countLabel="stations" plain="cruises" onHover={onCruiseHover} placeholder="Search year, month or ship" loading={sectionCruises.length ? null : "…"} native={native} sheet={phone} />
          : <span className="hint">All cruises · the tows are depth-integrated, so the y-axis is the year</span>}
      </div>
      {anomControl}
    </div>}
    {sel.lens === "cruise" && <div className="opt">
      <Picker id="cruise" label="Cruise" value={sel.cruise ?? ""} items={cruiseItems} onChange={(k) => setSel({ cruise: k })} sorts={["recent", "old"]} plain="cruises" onHover={onCruiseHover} placeholder="Search year, month or ship" loading={cruiseRows.length ? null : "…"} native={native} sheet={phone} />
      <div className="hint">{track ? `${track.path.length} station visits on the track · ${track.events} sampling events` : "No track"}</div>
    </div>}
  </>;
  // in the lean layout the view's own choice (which cruise, which line, which regions) sits in the panel, not behind "More options"
  const lensAfter = lean && !phone && (sel.lens === "hex" || sel.lens === "contour"), lensOwns = lean && !phone && (sel.lens === "cruise" || sel.lens === "section"), lensInline = lean && !phone && (sel.lens === "cruise" || sel.lens === "section" || sel.lens === "region" || sel.lens === "hex" || sel.lens === "contour");
  const viewBlock = lensInline ? <Group title={sel.lens === "cruise" ? "Choose a cruise" : sel.lens === "section" ? "Pick a line and cruise" : sel.lens === "hex" ? "Hexagon settings" : sel.lens === "contour" ? "Contour settings" : "Compare regions"} icon={LENS_ICON[sel.lens]} className={`viewblock${sel.lens === "cruise" || sel.lens === "section" || sel.lens === "region" ? " step" : " no-title"}`}>{lensOptions}</Group> : null;
  const moreSummary = sel.realm === "bio"
    ? `${STAT_LABEL[stat]} · ${stdWord} · ${sel.zeros ? "zeros counted" : "positive tows only"} · ${datasetsInSlice.length} dataset${datasetsInSlice.length === 1 ? "" : "s"} · sources`
    : `${STAT_LABEL[stat]} · ${datasetsInSlice.map(short).join(" + ") || "…"} · sources`;
  // the desktop lean panel has no "More options": Summary sits under View as, the datasets and the count settings under What
  const desk = lean && !phone;
  const statSelect = <select aria-label="summary statistic" value={stat} onChange={(e) => setSel({ stat: e.target.value as Stat })}>{Object.entries(STAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>;
  const [denHow, setDenHow] = useState(false);
  const denBlock = sel.realm === "bio" && <div className="den open mo-sec">
          <>
          <div className="mo-h"><Icon name="ui-tune" size="0.95rem" />Counts shown as</div>
          <div className="den-list">
            {(["per_10m2", "per_1000m3", "raw"] as Den[]).map((d) => { const i = denInfo(d); return i.rows === 0 ? null : ( // a unit this organism has no values in is not offered
              <label key={d}>
                <input type="radio" name="den" checked={sel.den === d} onChange={() => setSel({ den: d })} />
                <span><b>{DEN_LABEL[d]}</b><span className="hint">{DEN_SHORT[d]}</span>
                  {/* "How these are calculated" opens the arithmetic right under each choice (Betty 2026-11-10: not a second list repeating the names) */}
                  {denHow && <span className="dm-how">{DEN_FORMULA[d] && <span className="f">{DEN_FORMULA[d]}</span>}{(() => {
                    const link = (dk: string) => { const row = dsRow(dk) as any, raw = (row?.link_data_source as string) || (row ? doiUrl(row) : ""); return <a key={dk} href={raw || datasetPageUrl(dk)} target="_blank" rel="noopener" title="this dataset's source and citation">{row ? dsLongName(row) : short(dk)}</a>; };
                    const list = (ks: string[]) => ks.map((k, j) => <span key={k}>{j ? ", " : ""}{link(k)}</span>);
                    const names = i.ok.length > 1 || i.off.length > 0;
                    if (!names && i.excluded <= 0) return null;
                    return <span className="ds">{names && list(i.ok)}{i.off.length > 0 && <> (cannot: {list(i.off)})</>}{i.excluded > 0 && <>{names ? " · " : ""}{fmtN(i.excluded)} observations have no value in this unit, so they are left out</>}</span>;
                  })()}</span>}
                </span>
              </label>); })}
          </div></>
          <button type="button" className="den-how-btn linkish" aria-expanded={denHow} onClick={() => setDenHow(!denHow)}>{denHow ? "▾" : "▸"} How these are calculated</button>
          {denHow && <div className="den-shf">Standard haul factor = 10 × tow depth (m) ÷ volume strained (m³), recorded for each tow.</div>}
          {/* the zeros: a tow a positive-only dataset sampled with no catch counts as 0 (zeros counted) unless it is switched off (zeros=0) */}
          <div className="zeros zeros-row mo-sec">
            <span className="zl">Count zeros</span>
            <span className="info" tabIndex={0} title={ZEROS_TIP}><Icon name="ui-about" size="0.95rem" /></span>
            {desk && <span className="hint zeros-hint in">{sel.zeros ? (nFilled ? `${fmtN(nFilled)} sampled tows with no catch count as 0` : "no zero-filled tows in this slice") : "Only tows with a catch"}</span>}
            <button type="button" role="switch" aria-checked={sel.zeros} className={`tgl${sel.zeros ? " on" : ""}`} onClick={(e) => { holdInPlace(e.currentTarget, ".zeros-row .tgl"); setSel({ zeros: !sel.zeros }); }} title={sel.zeros ? "a sampled tow with no catch counts as 0 — click for the tows with a catch only" : "statistics over the tows with a catch only — click to count sampled tows with no catch as 0"}><i /></button>
          </div>
          {!desk && <div className="hint zeros-hint">{sel.zeros ? (nFilled ? `${fmtN(nFilled)} sampled tows with no catch count as 0` : "no zero-filled tows in this slice") : "Only tows with a catch"}</div>}
        </div>;
  const dsList = (() => {
          // the datasets for this pick, ONE shown at a time (never pooled; Betty 2026-11-10). Two sources of "other datasets":
          // the slice itself (a species, or a unified bottle + CTD variable) — a click filters to that dataset; and a measurement
          // row that folds several measurement keys (Dissolved Oxygen: bottle, CTD, underway … each its own key) — a click
          // switches to that dataset's key, since the slice only holds the key in view
          const envRows = envPills;
          const nameOf = (dk: string) => { const row = dsRow(dk) as any; return row ? dsLongName(row) : short(dk); };
          const shown = dsChoices.find(([dk]) => dsOn(dk))?.[0] ?? dsChoices[0]?.[0];
          if (!shown) return null;
          const item = sel.realm === "env" ? whatItems.find((i) => i.key === sel.var || i.alt?.includes(sel.var)) : undefined;
          type Other = { dk: string; n: number | null; go: () => void; note?: string };
          const others: Other[] = dsChoices.filter(([dk]) => dk !== shown).map(([dk, n]) => ({ dk, n, go: () => toggleDataset(dk) }));
          // a species: a dataset that has it only at OTHER life stages is listed too (Northern Anchovy at "unknown" stage is in
          // one dataset; its eggs and larvae are in others) — the click switches to that dataset at its biggest stage
          if (sel.realm === "bio") {
            const byDs = new Map<string, Map<string | null, number>>();
            for (const r of picker) { const m = byDs.get(r.dataset_key) ?? byDs.set(r.dataset_key, new Map()).get(r.dataset_key)!; m.set(r.life_stage ?? null, (m.get(r.life_stage ?? null) ?? 0) + r.n); }
            for (const [dk, m] of byDs) {
              if (dk === shown || others.some((o) => o.dk === dk)) continue;
              const [st, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
              others.push({ dk, n, note: st ?? "unknown stage", go: () => setSel({ datasets: [dk], stage: st, den: defaultDen(picker.filter((r) => r.dataset_key === dk), st) }) });
            }
          }
          for (const dk of item?.datasets ?? []) {
            if (dk === shown || others.some((o) => o.dk === dk)) continue;
            const v = item!.variants?.find((x) => x.datasets.includes(dk));
            if (v) others.push({ dk, n: item!.dsN?.[dk] ?? null, go: () => pickWhat(v.key, dk) });
          }
          const shownRs = sel.realm === "bio" ? picker.filter((r) => r.dataset_key === shown && (r.life_stage ?? null) === (sel.stage ?? null)) : [];
          const raw = shownRs.length > 0 && shownRs.every((r) => r.effort_class === "raw_count_no_effort");
          const flagged = sel.realm === "env" ? envRows.find(([k]) => k === shown)?.[1].n_flagged ?? 0 : 0;
          const plain = (dk: string) => DS_PLAIN[dk] ?? [(dsRow(dk) as any)?.dataset_name_short ?? short(dk), ""];
          const stagesOf = (dk: string) => { if (sel.realm !== "bio") return ""; const st = [...new Set(picker.filter((r) => r.dataset_key === dk).map((r) => r.life_stage ?? null))];
            const known = st.filter((x): x is string => x != null); return known.length ? known.join(", ") : "unknown"; };
          const totalOf = (dk: string, fallback: number | null) => sel.realm === "bio" ? picker.filter((r) => r.dataset_key === dk).reduce((a, r) => a + r.n, 0) : fallback;
          const opt = (dk: string, n: number | null, go: (() => void) | null) => { const [nm, how] = plain(dk); return { dk, nm, how, long: nameOf(dk), st: stagesOf(dk), tot: totalOf(dk, n), go }; };
          return { shown, raw, flagged, rows: [opt(shown, dsChoices.find(([dk]) => dk === shown)?.[1] ?? 0, null), ...others.map((o) => opt(o.dk, o.n, o.go))] };
        })();
  // the panel's dataset chooser (Betty 2026-11-10, option C): "Choose dataset" + how many hold this pick, a select-style
  // button naming the dataset on the map; opened, one row per dataset — stages, how it was sampled, records — and why
  // datasets are not combined
  const dsBlock = (() => {
          if (!dsList) return null;
          const { rows, raw, flagged } = dsList, cur = rows[0], n = rows.length - 1;
          if (!n && desk) return null;   // one dataset: the Source line in the title already names it
          const stLine = (r: typeof cur) => (r.st && !r.st.includes(",") && r.st !== "unknown" && rows.some((o) => o.st.includes(",")) ? `${r.st} only` : r.st);
          return <div className="ds-f ds-c mo-sec" onKeyDown={(e) => { if (e.key === "Escape") setDsOpen(false); }}>
            <div className="ds-c-h"><span className="k">Choose dataset</span></div>
            <button type="button" className={`ds-c-sel${dsOpen ? " open" : ""}`} aria-haspopup="listbox" aria-expanded={dsOpen} disabled={!n}
              onClick={() => setDsOpen(!dsOpen)} title={`${cur.long}${cur.how ? ` — ${cur.how}` : ""}`}>
              <i className="dot" style={{ background: dsColor(cur.dk) }} /><b className="nm">{cur.nm}{raw ? " ⚠" : ""}</b>
              {n > 0 && <span className="cnt">{n} other{n > 1 ? "s" : ""}</span>}{n > 0 && <Icon name={dsOpen ? "ui-up" : "ui-down"} size="0.85rem" />}
            </button>
            {dsOpen && n > 0 && <div className="ds-c-menu" role="listbox" aria-label="dataset">
              {rows.map((r) => <button type="button" role="option" aria-selected={!r.go} key={r.dk} className={`ds-c-opt${r.go ? "" : " cur"}`}
                onClick={() => { r.go?.(); setDsOpen(false); }} title={r.long}>
                <i className="dot" style={{ background: dsColor(r.dk) }} />
                <span className="tx"><b className="nm">{r.nm}</b>{r.st && <small>{stLine(r)}</small>}{r.how && <small className="how">{r.how}</small>}</span>
                <span className="rt">{r.tot != null && <span className="num">{!r.go && "✓ "}{fmtN(r.tot)}</span>}{r.tot != null && <small>records</small>}
                  {!r.go && flagged ? <small>{fmtN(flagged)} flagged</small> : null}</span>
              </button>)}
              <div className="ds-why">Different gear and units, so shown one at a time.</div>
            </div>}
          </div>;
        })();
  const moreInner = <>
        {!desk && <div className="mo-sec mo-row"><div className="mo-h"><Icon name="ui-bars" size="0.95rem" />Summary</div>{statSelect}</div>}
        {!desk && denBlock}
        {!desk && dsBlock}
        {!desk && <div className="mo-foot"><button type="button" className="linkish" onClick={openSources}><Icon name="ui-cite" size="0.95rem" />Sources and citation</button>
        <span className="hint" title={sel.realm === "env" ? "averaged across datasets that share this variable; never across variables" : sel.den === "raw" ? "raw counts are not comparable across gear or datasets" : "averaged across datasets that share this life stage and standardization; never across them"}>{fmtN(inView)} {countWord} in view</span></div>}
  </>;
  // ① Data → ② View as → More options: the expert controls, one disclosure that remembers its state
  const dataGroup = <>
    <Group title="Data" icon="ui-data" data-tour="data">
      <div className="row"><span className="seg realm" data-tour="realm">
        {/* a realm switch drops the dataset filter: it was set against the other realm's pills (the slice effect prunes it again for a URL) */}
        <button className={sel.realm === "bio" ? "on" : ""} onClick={() => setSel({ realm: "bio", datasets: null })} title="one organism (taxon) at a time — realm bio"><Icon name="realm-bio" />Biology</button>
        <button className={sel.realm === "env" ? "on" : ""} onClick={() => setSel({ realm: "env", cruise: null, datasets: null })} title="one variable (measurement type) at a time — realm env"><Icon name="realm-env" />Environment</button>
      </span></div>
      {sel.realm === "bio" ? <>
        <Picker id="organism" label="organism" hint="(taxon)" value={sel.taxon} items={organismItems} onChange={(k) => setSel({ taxon: k, stage: null, den: null, cruise: null })}
          groups={organismGroups} letters browse placeholder="search species, genus, family…" dsColor={dsColor} dsShort={short} loading={organismItems.length ? null : plainStatus(status)} native={native} sheet={phone} data-tour="picker" openSignal={pickerSignal} />
        <label className="f">life stage
          <select value={sel.stage ?? ""} onChange={(e) => { const st = e.target.value || null; setSel({ stage: st, den: defaultDen(picker, st) }); }}>
            {stages.map(([s, n]) => <option key={s ?? "null"} value={s ?? ""}>{s ?? "(none)"} ({fmtN(n)})</option>)}
          </select></label>
      </> : <>
        <Picker id="variable" label="variable" value={sel.var} items={variableItems} onChange={(k) => setSel({ var: k, cruise: null })}
          groups={variableGroups} defaultGroup="category" browse placeholder="search temperature, nitrate, chlorophyll…" dsColor={dsColor} dsShort={short} loading={variableItems.length ? null : "…"} native={native} sheet={phone} data-tour="picker" openSignal={pickerSignal} />
        {/* a derived variable says so under its name: the grain, its definition on hover (the registry's own words) and the dataset page that holds its methods */}
        {derivedNote && <div className="derived-line" data-derived={varGrain ?? undefined}>
          <i className="badge">derived</i><span>{derivedNote.grain}</span>
          {derivedNote.how && <span className="how" tabIndex={0} title={derivedNote.tip}>how it is computed</span>}
          <a href={derivedNote.datasetUrl} target="_blank" rel="noopener" title={`${derivedNote.datasetName} — the dataset page, with its methods and citation`}>{derivedNote.datasetName} ↗</a>
        </div>}
      </>}
    </Group>
  </>;
  const selectTab = <>
    {dataGroup}
    <Group title="View as" icon="ui-layers" data-tour="lenses">
      <LensPicker lens={sel.lens} onLens={onLens} />
      {lensOptions}
    </Group>
    <section className="group more-group" data-group="more">
      {/* the tour anchors on the one-line toggle: the open body can be taller than a phone's sheet */}
      <button type="button" className="more-toggle" aria-expanded={more} onClick={() => setMore(!more)} title={`${more ? "fold" : "open"} the expert controls — they stay as you leave them`} data-tour="denominator"><Icon name={more ? "ui-down" : "ui-right"} size="0.95rem" /><b>More options</b><span>· {moreSummary}</span></button>
      {more && <div className="more-body">{moreInner}</div>}
    </section>
    <div className="card-foot">{sliceKey ? `${fmtN(inView)} ${countWord} in view` : status} · <button type="button" className="linkish" onClick={openSources}>{viewDatasetKeys.length ? `${viewDatasetKeys.length} source${viewDatasetKeys.length === 1 ? "" : "s"}` : "sources"}</button></div>
  </>;
  // the region choice (layer · region · "choose on map / table…"): the classic Area group and the lean Where control both draw it
  const regionControls = (area?.kind === "region" || (areaRegionMode && !area)) && (() => {
        const defOf = new Map(spatialLayers.layers.map((d) => [d.name, d]));
        const have = [...(areaRegions?.keys() ?? [])];
        // the Layers card's own groups and names, each with its dated status ("BOEM Wind Planning Areas (rescinded
        // 2025-07-30)"); a layer that cannot be picked is listed with the real reason: points and lines enclose no area,
        // and a boundary layer the release has not intersected with its samples is "not in this release's sample index"
        const missing = spatialLayers.layers.filter((d) => isAreaCandidate(d) && !have.includes(d.name)).map((d) => d.name);
        const groups = [...new Set([...have, ...missing].map((n) => defOf.get(n)?.group ?? "Other"))].sort();
        const curLayer = area?.kind === "region" ? area.layer : areaLayerPick ?? have[0] ?? "";
        const names = areaRegions?.get(curLayer) ?? [];
        const rs = regionStatusMap(defOf.get(curLayer));
        const total = areaTotals.get(curLayer);
        // the region select: one name, "all regions", or a set from the modal (shown, not choosable here)
        const regVal = area?.kind !== "region" ? "" : area.names == null ? "__all__" : area.names.length === 1 ? area.names[0] : "__set__";
        return <>
          {/* the layer: the app's own grouped list (LayerSelect), which opens below the box and scrolls, not the browser's
              full-height list that reached for the top of the page */}
          <div className="f lsel"><span className="lsel-lab">layer</span>
            {!areaRegions ? <select disabled><option>loading…</option></select>
              : <LayerSelect value={curLayer} label="boundary layer"
                groups={groups.map((g) => ({ group: g, names: [...have, ...missing].filter((n) => (defOf.get(n)?.group ?? "Other") === g).sort() }))}
                labelOf={(n) => { const d = defOf.get(n); return d ? layerLabel(d) : n; }}
                whyOf={(n) => { const d = defOf.get(n); return d ? areaLayerReason(d, have.includes(n)) : null; }}
                onChange={(v) => { setAreaLayerPick(v); setAreaRegionMode(true); const rr = areaRegions?.get(v); setSel({ area: rr?.length === 1 ? areaToUrl({ kind: "region", layer: v, names: [rr[0].name] }) : null }); }} />}
          </div>
          {/* the region field opens the map / table picker straight away (no list to scroll first): it looks like the other
              boxes and shows what is chosen, but a click, Enter, Space or ↓ opens the modal instead of a native list */}
          <label className="f">region<select value={regVal} disabled={!names.length} title="choose regions on a map or from a table"
            onMouseDown={(e) => { e.preventDefault(); if (names.length) setRegionModal(curLayer); }}
            onKeyDown={(e) => { if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); if (names.length) setRegionModal(curLayer); } }}
            onChange={() => {}}>
            <option value={regVal}>{regVal === "" ? "choose a region…" : regVal === "__all__" ? `all regions${total != null ? ` (${fmtN(total)} samples)` : ""}`
              : regVal === "__set__" && area?.kind === "region" ? `${area.names!.length} regions chosen` : regionLabel(regVal, rs.get(regVal), names.find((r) => r.name === regVal)?.n ?? 0, fmtN)}</option>
          </select></label>
        </>;
  })();
  const depthGroup = <>
    <Group title="Depth band" icon="ui-tune">
      {depthAvail || !sliceKey || noneLeft ? <>
        <div className="row"><NumInput value={sel.depth[0]} min={0} max={sel.depth[1] - 10} step={10} label="top of the depth band (m)" onCommit={(v) => setSel({ depth: [v, sel.depth[1]] })} />–<NumInput value={sel.depth[1]} min={sel.depth[0] + 10} max={6500} step={10} label="bottom of the depth band (m)" onCommit={(v) => setSel({ depth: [sel.depth[0], v] })} /> m<button type="button" className="pill act" disabled={!depthSet} onClick={() => setSel({ depth: [0, 500] })}>0–500 m</button></div>
        <div className="hint">or drag on the Depth panel — <button type="button" className="linkish" onClick={() => { if (phone) setSheet({ panel: "depth", detent: "half" }); else if (folded("depth")) toggleFold("depth"); }}>open it</button></div>
      </> : <div className="hint">this pick has no depth axis — {noDepthWhy}, so the band does not apply</div>}
    </Group>
  </>;
  // ③ Refine: the years, the season, the depth band (only where a pick has a depth axis) and the datasets
  const refineTab = <>
    <Group title="Years" icon="ui-years">
      <div className="row"><YearRange years={yearsShown} first={1949} last={yearMax} onChange={setYearWindow} /><button type="button" className="pill act" disabled={!yearsSet} onClick={() => setSel({ years: [1949, YEAR_OPEN], months: null })}>all years</button></div>
      <div className="hint">or drag on the Years panel{sel.months ? " · month edges from the brush" : ""}</div>
    </Group>
    <Group title="Season" icon="ui-calendar">
      <div className="season-row"><span className="seg">{[1, 2, 3, 4].map((x) => <button key={x} className={!sel.q || sel.q.includes(x) ? "on" : ""} onClick={() => toggleQ(x)} title={`${Q_LABEL[x - 1]} (the cruise's season, by its median cast month)`}>{SEASON_CODE[x - 1]}</button>)}</span><span className="hint">{sel.q ? sel.q.map((x) => Q_LABEL[x - 1]).join(", ") : "every season"}</span></div>
    </Group>
    <Group title="Area" icon="ui-filter" data-tour="area">
      <span className="seg area-seg" role="group" aria-label="area">
        <button type="button" className={!area && !areaRegionMode ? "on" : ""} onClick={() => { setAreaRegionMode(false); setSel({ area: null }); }} title="every sample, wherever it was taken">everywhere</button>
        <button type="button" className={area?.kind === "pattern" ? "on" : ""} onClick={() => { setAreaRegionMode(false); setSel({ area: "std" }); }} title="CalCOFI's core station grid since 1984, lines 76.7–93.3 (66 stations plus the 9 SCCOOS coastal ones): the same footprint on every cruise, so years compare like with like. Winter and spring cruises also go north (lines 60–73.3), and other programs' casts fall off the grid, so both drop out.">standard grid</button>
        <button type="button" className={area?.kind === "box" ? "on" : ""} onClick={freezeView} title="only what the map shows now: the view's lon/lat box, frozen until you change it">map view</button>
        <button type="button" className={area?.kind === "region" || (areaRegionMode && !area) ? "on" : ""} onClick={() => setAreaRegionMode(true)} title="only samples inside regions of a boundary layer — one, all of them or any set (the release's own sample_spatial membership)">region</button>
      </span>
      {area?.kind === "pattern" && <label className="row hint area-ext"><input type="checkbox" checked={area.patterns.includes("extended")} onChange={(e) => setSel({ area: e.target.checked ? "std,ext" : "std" })} /> add the extended lines (60–73.3)</label>}
      {regionControls}
      <div className="hint">{!area ? (areaRegionMode ? "pick a layer and one region, all of them, or any set (on the map or in a table); only the samples inside count" : "every sample, wherever it was taken")
        : area.kind === "pattern" ? `${fmtN(area.patterns.reduce((k, p) => k + (gridKeys?.get(p)?.length ?? 0), 0))} grid stations ${areaWord(area)} — the same footprint every cruise, so the years compare like with like`
        : area.kind === "line" ? `${fmtN(lineKeys(area, allKeys ?? []).length)} grid cells ${areaWord(area)}`
        : area.kind === "box" ? <>{areaWord(area)} · <button type="button" className="linkish" onClick={freezeView}>use the current view</button></>
        : `${areaWord(area)} · exact per sample (the release's sample_spatial)`}{areaPending && sel.area ? " · applying…" : ""}</div>
    </Group>
    {depthGroup}
    <Group title="Datasets" icon="ui-data">
      <div className="pills">{datasetsInSlice.map((dk) => <button key={dk} type="button" className={`pill act${dsOn(dk) ? "" : " off"}`} onClick={() => toggleDataset(dk)} title="show this dataset"><i className="dot" style={{ background: dsColor(dk) }} />{short(dk)}</button>)}{!datasetsInSlice.length && <span className="pill off">{status}</span>}</div>
      <div className="hint">{datasetsInSlice.length > 1 ? "one dataset at a time — click another to switch" : "the only dataset with this pick"}</div>
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
  // ── the lean panel (?ui=lean): What · When · Where, one prominent Download CSV, and everything else behind More options.
  // It reuses the classic panel's own pieces (dataGroup, regionControls, depthGroup, moreInner, lensOptions) so the two
  // layouts cannot disagree; the view (lens) moved to the rail on the map's right edge (src/leanpanel.tsx)
  const stdOn = area?.kind === "pattern";
  const whereKind: "box" | "region" | null = area?.kind === "box" || area?.kind === "poly" ? "box" : area?.kind === "region" || (areaRegionMode && !area) ? "region" : null;
  const clearArea = () => { setDrawing(false); setAreaRegionMode(false); setSel({ area: null }); };
  // Where, layout B (2026-11-10): a named region first (Regions from · Choose regions on the map · what is chosen), then
  // line / station, then Draw an area / Draw a box as plain links. Every way stays in view; blank = the whole survey area.
  // "Regions from" starts empty (a grey example, no default layer); the region list loads the first time it is opened.
  const leanRegion = (() => {
    const defOf = new Map(spatialLayers.layers.map((d) => [d.name, d]));
    const have = areaRegions ? new Set(areaRegions.keys()) : null;
    const layerNames = spatialLayers.layers.filter((d) => isAreaCandidate(d) || have?.has(d.name)).map((d) => d.name);
    // the groups most people reach for first: ocean areas before land and industry
    const ORDER = ["Protected Areas", "Maritime Zones", "Energy & Industry", "Ecological", "Administrative", "Reference"];
    const rank = (g: string) => { const i = ORDER.indexOf(g); return i < 0 ? ORDER.length : i; };
    const groups = [...new Set(layerNames.map((n) => defOf.get(n)?.group ?? "Other"))].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y)).map((g) => ({ group: g, names: layerNames.filter((n) => (defOf.get(n)?.group ?? "Other") === g).sort((x, y) => popRank(x) - popRank(y) || shownName(x).localeCompare(shownName(y))) }));
    const layer = area?.kind === "region" ? area.layer : areaLayerPick ?? "";
    const nRegions = areaRegions?.get(layer)?.length ?? 0;
    // the short name people use, when the layer has one: "All 124 MPAs", "Pick specific MPAs on the map"
    const abbr = /\(([A-Z]{2,}s?)[,)]/.exec(shownName(layer))?.[1] ?? null;
    const chosen = area?.kind !== "region" ? null : area.names == null ? `all regions of ${shownName(area.layer)}`
      : area.names.length <= 3 ? area.names.join(", ") : `${area.names.slice(0, 2).join(", ")} and ${area.names.length - 2} more`;
    return <div className="where-region">
      <div className="f lsel"><span className="lsel-lab wr-lab">Regions from{area?.kind === "region" && <button type="button" className="linkish wr-remove" onClick={() => { setAreaLayerPick(null); setSel({ area: null }); }}>Remove</button>}</span>
        {/* Regions from opens the map browser (Betty 2026-11-10): flip through the layers and see their regions, not just names */}
        <button type="button" className="ds-c-sel wr-open" onClick={() => { if (!areaRegions) setAreaRegionMode(true); setRegionModalFor("where"); setRegionModal(layer || groups[0]?.names[0] || null); }}
          title="see each layer's regions on a map and choose">
          <span className={`nm${layer ? "" : " ph"}`}>{layer ? (defOf.get(layer) ? layerLabel(defOf.get(layer)!) : layer) : "e.g. National Marine Sanctuaries"}</span><Icon name="ui-down" size="0.85rem" />
        </button>
      </div>
      {/* picking a type is enough: every region of it applies at once (edged in yellow on the map). One box says what is in —
          "All 74 MPAs", or the names once narrowed — and opens the map picker; its × clears (Betty 2026-11-10: one element, not
          a "Which" label plus a second line of names) */}
      {area?.kind === "region" && (() => {
        // every region with data is ticked by default (names null = all of them); unticking narrows (Betty 2026-11-10)
        const all = areaRegions?.get(layer) ?? [];
        const counts = whereRegs && whereRegs.key === whereRegKey ? whereRegs.n : null;
        const has = (nm: string) => (counts?.get(nm) ?? 0) > 0;
        const withData = counts ? all.filter((r) => has(r.name)).sort((x, y) => (counts.get(y.name) ?? 0) - (counts.get(x.name) ?? 0)) : [];
        const empty = counts ? all.filter((r) => !has(r.name)) : [];
        const isOn = (nm: string) => area.names == null ? has(nm) : area.names.includes(nm);
        const word = abbr ?? (all.length === 1 ? "region" : "regions");
        const setNames = (nx: Set<string>) => {
          const allData = withData.length > 0 && withData.every((r) => nx.has(r.name)) && [...nx].every((n) => withData.some((r) => r.name === n));
          setSel({ area: areaToUrl({ kind: "region", layer, names: allData ? null : nx.size ? [...nx] : null }) });
        };
        const toggle = (nm: string) => { const nx = new Set(all.map((r) => r.name).filter(isOn)); if (nx.has(nm)) nx.delete(nm); else nx.add(nm); setNames(nx); };
        // the long official names, short: "Channel Islands National Marine Sanctuary - Northern Section" → "Channel Islands - Northern Section"
        const short = (nm: string) => nm.replace(/\s*National Marine Sanctuary/i, "").replace(/\s*Marine Protected Area/i, "").replace(/\s+-\s+/, " – ").trim() || nm;
        const row = (r: { name: string }, none: boolean) => <label key={r.name} className={`wr-row${isOn(r.name) ? " on" : ""}${none ? " none" : ""}`} title={r.name}>
          <input type="checkbox" checked={isOn(r.name)} onChange={() => toggle(r.name)} /><span className="nm">{short(r.name)}</span><span className="n">{none ? "–" : fmtN(counts?.get(r.name) ?? 0)}</span></label>;
        const shown = wrMore ? withData : withData.slice(0, 6);
        return <div className="wr-list">
          <div className="wr-sum"><b>{counts ? `${withData.length} of ${all.length} ${word} ${withData.length === 1 ? "has" : "have"} data` : `${all.length} ${word} · counting…`}</b></div>
          {counts && <div className="wr-table" role="group" aria-label={`regions of ${shownName(layer)}`}>
            {shown.map((r) => row(r, false))}
            {!withData.length && <div className="wr-note">None of them has data for this selection.</div>}
            {withData.length > 6 && <button type="button" className="linkish wr-more" onClick={() => setWrMore(!wrMore)}>{wrMore ? "Show fewer" : `+ ${withData.length - 6} more`}</button>}
            {wrEmpty && empty.map((r) => row(r, true))}
          </div>}
          <div className="wr-foot">
            {counts && empty.length > 0 ? <button type="button" className="linkish" onClick={() => setWrEmpty(!wrEmpty)}>{wrEmpty ? "Hide" : "Show"} {empty.length} with no data</button> : <span />}
            <span className="sp" />
            {area.names != null && <button type="button" className="linkish" onClick={() => setSel({ area: areaToUrl({ kind: "region", layer, names: null }) })}>Select all</button>}
</div>
        </div>;
      })()}
    </div>;
  })();
  const [stnPeek, setStnPeek] = useState<{ k: "all" | "std" | "ext"; el: HTMLElement } | null>(null);
  const [stnAbout, setStnAbout] = useState(false);
  // the frame for the Stations thumbnails: the current grid (75 + northern lines), projected small
  const stnThumb = useMemo(() => {
    const pts = grid.filter((g) => g.home && (g.pattern === "standard" || g.pattern === "extended"));
    if (!pts.length) return null;
    const xs = pts.map((g) => g.home[0]), ys = pts.map((g) => g.home[1]);
    const x0 = Math.min(...xs) - 0.3, x1 = Math.max(...xs) + 0.3, y0 = Math.min(...ys) - 0.3, y1 = Math.max(...ys) + 0.3;
    const W = 44, H = Math.round(W * (y1 - y0) / ((x1 - x0) * Math.cos(((y0 + y1) / 2) * Math.PI / 180)));
    return { pts, W, H, X: (lon: number) => ((lon - x0) / (x1 - x0)) * W, Y: (lat: number) => ((y1 - lat) / (y1 - y0)) * H };
  }, [grid]);
  const drawnWord = area?.kind === "poly" ? "Area drawn on the map" : area?.kind === "box" ? "Box drawn on the map"
    : area?.kind === "pattern" ? (area.patterns.includes("extended") ? "113-station grid" : "75-station grid") : null;
  // "Reset all": every filter and view setting back to its default — Stations, all years, seasons and depths, everywhere, every dataset — keeping only what you chose to look at (the variable) and the map's position
  const resetAll = () => { const d = DEFAULTS; setAreaRegionMode(false); setSel({ cruises: null, lens: d.lens, res: d.res, interp: d.interp, surface: d.surface, grain: d.grain, inputs: d.inputs, labels: d.labels, stage: null, den: null, zeros: d.zeros, years: d.years, months: d.months, q: d.q, yview: d.yview, depth: d.depth, layer: d.layer, region: d.region, line: d.line, cruise: d.cruise, stat: d.stat, anom: d.anom, base: d.base, datasets: d.datasets, area: d.area, station: d.station, view3d: d.view3d, obs: d.obs, strip: d.strip, tbin: d.tbin, effort: d.effort, data: d.data }); };
  const whatSel = whatItems.find((i) => i.key === (sel.realm === "bio" ? sel.taxon : sel.var) || (sel.realm === "env" && i.alt?.includes(sel.var)));
  const pickWhat = (k: string, ds?: string) => { if (whatIsOrganism.has(k)) setSel({ realm: "bio", taxon: k, stage: null, den: null, cruise: null, datasets: ds ? [ds] : null }); else {
    // a measurement made several ways (bottle samples, CTD sensor, underway …) is plotted from ONE dataset at a time, never silently pooled:
    // the dataset button that was clicked, else the dataset with the most data. "All datasets" is a choice (the dataset chips in the title).
    const it = whatItems.find((i) => i.key === k || i.alt?.includes(k)), vr = it?.variants?.find((v) => v.key === k);
    setSel({ realm: "env", var: k, cruise: null, datasets: ds ? [ds] : vr ? vr.datasets : it?.datasets && it.datasets.length > 1 ? [it.datasets[0]] : null });
  }
  setWhatOpen(false); };
  // "Unknown" is not offered beside real stages (Betty 2026-11-10): it shows only when it is what is in view — a dataset
  // that records no stage (eDNA) — and then alone
  const stagesKnown = stages.filter(([st]) => st != null);
  const stagesShown = sel.stage == null ? stages.filter(([st]) => st == null) : stagesKnown.length ? stagesKnown : stages;
  // the life stages of the dataset on the map (Betty 2026-11-10): a stage it lacks is greyed out, with a one-click
  // switch to the dataset that has the most of it — never a silent dataset change
  const shownDk = dsList?.shown ?? null;
  const shownNm = shownDk ? (DS_PLAIN[shownDk]?.[0] ?? short(shownDk)) : "";
  const stageInShown = (st: string | null) => sel.realm !== "bio" || !shownDk
    || picker.some((r) => r.dataset_key === shownDk && (r.life_stage ?? null) === (st ?? null));
  const stageSwitch = (() => {
    if (sel.realm !== "bio" || !shownDk) return null;
    const st = stagesShown.map(([s]) => s).find((s) => !stageInShown(s));
    if (st === undefined) return null;
    const m = new Map<string, number>();
    for (const r of picker) if ((r.life_stage ?? null) === (st ?? null)) m.set(r.dataset_key, (m.get(r.dataset_key) ?? 0) + r.n);
    const dk = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!dk) return null;
    return { label: st ? st[0].toUpperCase() + st.slice(1) : "Unknown", nm: DS_PLAIN[dk]?.[0] ?? short(dk),
      go: () => setSel({ datasets: [dk], stage: st, den: defaultDen(picker.filter((r) => r.dataset_key === dk), st) }) };
  })();
  // depth: the Depth profile row, under step 4 (View as) (Betty 2026-11-10)
  const depthStep = <>
      <DepthPill available={depthAvail && depthRows.filter((r) => Number.isFinite(r.med)).length >= 2} open={!folded("depth")} pulse={depthPulse} band={sel.depth} preview={<VSpark rows={depthRows} band={sel.depth} width={18} height={16} />} onClick={() => { if (phone) setSheet({ panel: "depth", detent: "half" }); else toggleFold("depth"); }}>
        {!phone && !folded("depth") && <div className="depth-edit">
          <div className="row"><NumInput value={sel.depth[0]} min={0} max={sel.depth[1] - 10} step={10} label="top of the depth band (m)" onCommit={(v) => setSel({ depth: [v, sel.depth[1]] })} /><span className="hint">to</span><NumInput value={sel.depth[1]} min={sel.depth[0] + 10} max={6500} step={10} label="bottom of the depth band (m)" onCommit={(v) => setSel({ depth: [sel.depth[0], v] })} /><span className="hint">m</span>{depthSet && <button type="button" className="linkish" onClick={() => setSel({ depth: [0, 500] })}>Reset</button>}</div>
          <div className="hint">Or drag the band on the Depth panel.</div>
        </div>}
      </DepthPill>
  </>;
  const var2Item = sel.var2 ? whatItems.find((i) => i.key === sel.var2 || i.alt?.includes(sel.var2!)) : undefined;
  const var2Label = var2Item?.label ?? sel.var2 ?? "";
  const var2Unit = var2Item?.sub ?? "";
  const var2Block = sel.lens !== "hex" ? null : !sel.var2
    ? <button type="button" className="v2-add" onClick={() => setVar2Open(true)} title="compare with a water measurement, hexagon by hexagon">+ Add a variable</button>
    : (() => {
      return <div className="v2">
        <div className="v2-card"><div className="v2-t"><b>{var2Label}</b>{var2Unit && var2Unit !== var2Label && <small>{var2Unit}</small>}</div>
          <span className="v2-acts"><button type="button" className="linkish" onClick={() => setVar2Open(true)}>Change</button><button type="button" className="linkish" onClick={() => setSel({ var2: null })}>Remove</button></span></div>
        <div className="v2-how">Matched by hexagon ({RES_KM[sel.res]}), same years, seasons, area and depth ({sel.depth[0]}–{sel.depth[1]} m).</div>
        {var2Err ? <div className="v2-err">{var2Err}</div>
          : !var2Ready ? <div className="v2-how">loading {var2Label}…</div>
          : null}
      </div>;
    })();
  const whatGroup = <Group title="What" icon="ui-data" data-tour="data" className="step">
    {/* the species card carries its life stages (Betty 2026-11-10, option D): "Life stage", then every stage in view with its
        count — a round button each, no dropdown; species and stage read as one choice */}
    <div className={`what-box${sel.realm === "bio" && stagesShown.length > 0 ? " staged" : ""}`}>
      <button type="button" className="picker-btn what-card" data-tour="picker" onClick={() => setWhatOpen(true)} title="choose a different species or measurement">
        {whatSel?.datasets?.length ? <span className="dots">{whatSel.datasets.map((dk) => <i key={dk} className="dot" style={{ background: dsColor(dk) }} />)}</span> : null}
        <span className="picker-val">{whatSel?.label ?? (whatItems.length ? (sel.realm === "bio" ? sel.taxon : sel.var) : status)}{(whatSel?.sub || whatSel?.badge) && <small className={whatSel.subItalic ? "i" : ""}>{whatSel.badge && <i className="badge">{whatSel.badge}</i>}{whatSel.sub}</small>}</span>
      </button>
      {sel.realm === "bio" && stagesShown.length > 0 && <div className="what-stages" role="radiogroup" aria-label="life stage">
        <span className="wst-k">Life stage</span>
        {stagesShown.map(([st, n]) => { const off = !stageInShown(st); return <label key={st ?? "null"} className={off ? "off" : ""} title={off ? `Not in ${shownNm}` : undefined}>
          <input type="radio" name="life-stage" disabled={off} checked={(sel.stage ?? null) === (st ?? null)} onChange={() => setSel({ stage: st ?? null, den: defaultDen(picker, st ?? null) })} />
          <span>{st ? st[0].toUpperCase() + st.slice(1) : "Unknown"}</span><span className="wst-n">{fmtN(n)}</span>
        </label>; })}
        {stageSwitch && <div className="wst-sw">{stageSwitch.label} not in {shownNm} · <button type="button" className="linkish" onClick={stageSwitch.go}>Switch to {stageSwitch.nm}</button></div>}
      </div>}
    </div>
    {sel.realm === "bio" ? null
      : derivedNote && <div className="derived-line" data-derived={varGrain ?? undefined}>
        <i className="badge">derived</i><span>{derivedNote.grain}</span>
        {derivedNote.how && <span className="how" tabIndex={0} title={derivedNote.tip}>how it is computed</span>}
        <a href={derivedNote.datasetUrl} target="_blank" rel="noopener" title={`${derivedNote.datasetName} — the dataset page, with its methods and citation`}>{derivedNote.datasetName} ↗</a>
      </div>}
    {desk && dsBlock}
    {var2Block}
  </Group>;
  const leanBody = var2Open ? <div className="lean-steps"><WhatPicker items={whatItems.filter((i) => !whatIsOrganism.has(i.key) && i.key !== sel.var)} isOrganism={() => false} value={sel.var2 ?? ""} onPick={(k) => { setSel({ var2: k }); setVar2Open(false); }} onClose={() => setVar2Open(false)} iconOf={(c) => (c === DERIVED_FAMILY ? "ui-line" : categoryIcon(c))} rank={categoryRank} dsShort={(dk) => (short(dk) !== dk ? short(dk) : dsCategory(dk))} dsName={(dk) => { const d = dsRow(dk); return d ? dsLongName(d) : short(dk); }} loading={whatItems.length ? null : plainStatus(status)} /></div> : whatOpen ? <div className="lean-steps"><WhatPicker items={whatItems} isOrganism={(k) => whatIsOrganism.has(k)} value={sel.realm === "bio" ? sel.taxon : sel.var} onPick={pickWhat} onClose={() => setWhatOpen(false)} iconOf={(c) => (c === DERIVED_FAMILY ? "ui-line" : categoryIcon(c))} rank={categoryRank} dsShort={(dk) => (short(dk) !== dk ? short(dk) : dsCategory(dk))} dsName={(dk) => { const d = dsRow(dk); return d ? dsLongName(d) : short(dk); }} loading={whatItems.length ? null : plainStatus(status)} /></div> : <div className="lean-steps">
    <div className="lean-what">
      {whatGroup}
      {lensAfter && viewBlock}
    </div>
    {lensOwns && viewBlock}
    {!lensOwns && <Group title="When" icon="ui-years" className="step opt when-group">
      {yearsSet && <button type="button" className="linkish ys-reset" onClick={() => setSel({ years: [1949, YEAR_OPEN], months: null })}>Show all years</button>}
      <YearSlider min={dataYears ? dataYears[0] : 1949} max={dataYears ? dataYears[1] : yearMax} value={yearsShown}
        onCommit={(y) => { const lo = dataYears ? dataYears[0] : 1949, hi = dataYears ? dataYears[1] : yearMax; if (y[0] <= lo && y[1] >= hi) setSel({ years: [1949, YEAR_OPEN], months: null }); else setYearWindow(y); }}
        left={<NumInput value={yearsShown[0]} min={1949} max={yearMax} width={58} label="first year" live={(t) => yearComplete(t, 1949, yearMax)} onCommit={(v) => setYearWindow(ordered(v, yearsShown[1]))} />}
        right={<NumInput value={yearsShown[1]} min={1949} max={yearMax} width={58} label="last year" live={(t) => yearComplete(t, 1949, yearMax)} onCommit={(v) => setYearWindow(ordered(yearsShown[0], v))} />} />
      <div className="season-row sr-d"><span className="seg">{[1, 2, 3, 4].map((x) => { const on = !sel.q || sel.q.includes(x); return <button key={x} type="button" className={`sr-${["w", "s", "u", "f"][x - 1]}${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggleQ(x)} title={`${on ? "Click to leave out" : "Click to include"} ${Q_LABEL[x - 1]} (the cruise's season, by its median cast month)`}><span className="sr-bar" /><span className="sr-n">{["Winter", "Spring", "Summer", "Fall"][x - 1]}</span><span className="sr-m">{["Dec–Feb", "Mar–May", "Jun–Aug", "Sep–Nov"][x - 1]}</span></button>; })}</span></div>
      <div className="cruise-pick">
        <Picker id="when-cruise" label="Cruise" value={sel.cruises?.length ? "Add another cruise…" : "Any cruise"} items={whenCruiseItems}
          onChange={(k) => setSel({ cruises: [...(sel.cruises ?? []), k] })} sorts={["recent", "old"]} plain="cruises" onHover={onCruiseHover} placeholder="Search year, month or ship"
          loading={cruiseOpts ? null : "…"} native={native} sheet={phone} />
        {!!sel.cruises?.length && <div className="ls-chips">
          {sel.cruises.map((k) => <span key={k} className="ls-chip" title={k}>{cruiseItemOf(k, {}).label}<button type="button" aria-label={`remove cruise ${k}`} onClick={() => { const n = sel.cruises!.filter((x) => x !== k); setSel({ cruises: n.length ? n : null }); }}>×</button></span>)}
          {sel.cruises.length > 1 && <button type="button" className="linkish" onClick={() => setSel({ cruises: null })}>Clear</button>}
        </div>}
      </div>
    </Group>}
    {lensInline && sel.lens === "region" && viewBlock}
    {!lensOwns && sel.lens !== "region" && <Group title="Where" icon="ui-filter" data-tour="area" className="step opt">
      {leanRegion}
      <LineStation lines={lineList} stationsOf={(ln) => { const set = new Set<number>(); for (const k of allKeys ?? []) { const g = parseGridKey(k); if (g && g.line === ln && g.station != null) set.add(g.station); } return [...set].sort((a, b) => a - b); }} items={lineItemsOf(area)} unmatched={lineItemsOf(area).filter((i) => allKeys && lineKeys(i, allKeys).length === 0)}
        onSet={(items) => { setAreaRegionMode(false); setSel({ area: areaToUrl(linesArea(items)) }); }} onClear={clearArea} />
      <div className="where-stn">
        <div className="ws-lab">Survey area<button type="button" className="va-gd ws-gd" aria-expanded={stnAbout} onClick={() => setStnAbout(!stnAbout)}>{stnAbout ? "Hide details" : "Details"}</button></div>
        {/* "all" is no area filter: every sample, on or off the station grid — in Hexagon it is far more than stations (Betty 2026-11-10) */}
        {([["all", "Full survey", "Historical and current stations: today's grids plus stations no longer sampled, and samples taken off the grid (underway and other programs)."],
           ["std", "CalCOFI 75-station grid", "San Diego to Point Conception, lines 76.7–93.3. CalCOFI's core grid since 1984, the same stations every cruise."],
           ["ext", "CalCOFI 113-station grid", "The 75 plus lines 60–73.3 north to Monterey and San Francisco, added on winter and spring cruises."]] as const).map(([k, name, about]) => {
          const checked = k === "all" ? area?.kind !== "pattern" : area?.kind === "pattern" && (k === "ext") === area.patterns.includes("extended");
          return <label key={k} className="ws-opt" onMouseEnter={(e) => setStnPeek({ k, el: e.currentTarget })} onMouseLeave={() => setStnPeek(null)}>
            <input type="radio" name="stn-pattern" checked={checked} onChange={() => { setAreaRegionMode(false); if (k === "all") { if (area?.kind === "pattern") setSel({ area: null }); } else setSel({ area: k === "std" ? "std" : "std,ext" }); }} />
            <span className="ws-name">{name} <span className="ws-lines">{k === "all" ? "historical and current stations" : k === "std" ? "lines 76.7–93.3" : "lines 60–93.3"}</span>{stnAbout && <span className="ws-about">{about}</span>}</span>
          </label>; })}
        {/* like "How these are calculated": what each pattern covers opens under its name, with CalCOFI's station maps at the end */}
      </div>
      <div className="where-draw">
        <button type="button" className="wd-btn" aria-pressed={drawing === "poly"} onClick={() => { setAreaRegionMode(false); setDrawing(drawing === "poly" ? false : "poly"); }} title="draw any shape on the map, like a lasso: only samples inside it count (Esc cancels)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7 11 3l9 5-2 9-9 3-5-6Z" strokeDasharray="3 2" /><circle cx="4" cy="7" r="1.6" fill="currentColor" /><circle cx="20" cy="8" r="1.6" fill="currentColor" /><circle cx="9" cy="20" r="1.6" fill="currentColor" /></svg>{drawing === "poly" ? "Drawing… (Esc to cancel)" : "Draw an area on the map"}</button>
      </div>
      {(area?.kind === "poly" || area?.kind === "box") && <div className="wr-chosen">{drawnWord} <button type="button" className="linkish" onClick={clearArea}>clear</button></div>}
      {stnPeek && (() => {
        // a small map of the pattern: its stations in yellow, the rest of the grid in grey (the grid's own lon / lat)
        const r = stnPeek.el.getBoundingClientRect(), par = stnPeek.el.closest(".lean-steps")?.getBoundingClientRect();
        const pts = grid.filter((g) => g.home && (stnPeek.k === "all" || g.pattern === "standard" || g.pattern === "extended"));
        if (!pts.length) return null;
        const xs = pts.map((g) => g.home[0]), ys = pts.map((g) => g.home[1]);
        const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5, y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
        const W = 260, H = Math.round(W * (y1 - y0) / ((x1 - x0) * Math.cos(((y0 + y1) / 2) * Math.PI / 180)));
        const X = (lon: number) => ((lon - x0) / (x1 - x0)) * W, Y = (lat: number) => ((y1 - lat) / (y1 - y0)) * H;
        const inPat = (g: GridCell) => stnPeek.k === "all" || g.pattern === "standard" || (stnPeek.k === "ext" && g.pattern === "extended");
        return <div className="stn-peek" aria-hidden="true" style={{ left: (par?.right ?? r.right) + 10, top: Math.max(8, Math.min(r.top - 20, window.innerHeight - H - 60)) }}>
          <div className="sp-t">{stnPeek.k === "all" ? "Full survey" : stnPeek.k === "std" ? "CalCOFI 75-station grid" : "CalCOFI 113-station grid"}</div>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {pts.filter((g) => !inPat(g)).map((g) => <circle key={g.grid_key} cx={X(g.home[0])} cy={Y(g.home[1])} r={2.5} className="off" />)}
            {pts.filter(inPat).map((g) => <circle key={g.grid_key} cx={X(g.home[0])} cy={Y(g.home[1])} r={3.5} className="on" />)}
          </svg>
          <div className="sp-n">{stnPeek.k === "all" ? `${fmtN(pts.length)} stations, current and historical` : stnPeek.k === "std" ? "San Diego to Point Conception" : "San Diego to Monterey and San Francisco"}</div>
        </div>; })()}
      {area?.kind === "hex" && <div className="hex-row"><span><span className="hint">Area</span> <b>One {RES_KM[sel.res]} hexagon</b></span><button type="button" className="linkish" onClick={clearArea} title="show every hexagon again">Clear</button></div>}
    </Group>}
    <ViewAs bio={sel.realm === "bio"} lens={sel.lens} onLens={onLens} nudge={offGridOnly ? "hex" : null} />
    <div className="depth-in-view">{depthStep}</div>
    {desk && sel.lens !== "region" && <div className="sum-row" data-tour="summary"><span>{sel.lens === "station" || sel.lens === "hex" ? `Each ${sel.lens === "station" ? "station" : "hexagon"} shows the` : "Summary:"}</span><StatPick label="summary statistic" value={stat} options={Object.entries(STAT_LABEL) as [string, string][]} onChange={(k) => setSel({ stat: k as Stat })} /></div>}
    {/* "observations" counts records, not the zero-filled tows (Betty 2026-11-11: keep the word, add a note) */}
    {desk && sel.lens !== "region" && stat === "n" && sel.realm === "bio" && <div className="hint stat-note">Counts samples that caught it; samples with no catch are not counted.</div>}
    {desk && denBlock}
    {/* the download's count (Betty 2026-11-11): every sample monitored leads, since a sample with no catch is data too, then
        how it splits ("40 samples" / "17 with a catch · 23 without"); with the no-catch tows left out of the file, the samples
        in it and "positive catches only". No row count: a sample can hold several nets, so rows outnumber samples and read as a mismatch */}
    <DownloadBar count={sliceKey ? (sel.realm === "bio" && countLabel && viewCount
        ? (() => { const all = sel.zeros && csvZeros, k = all ? viewCount.n_samples : viewCount.n_found, w = `${fmtN(k)} ${k === 1 ? "sample" : "samples"}`;
            // one line (Betty 2026-11-11): "40 samples · 17 with a catch · 23 without", or "17 samples · positive catches only"
            // only the samples bold (Betty 2026-11-11); the split after it in the regular weight
            const rest = all ? ` · ${fmtN(viewCount.n_found)} with a catch · ${fmtN(viewCount.n_samples - viewCount.n_found)} without` : " · positive catches only";
            return <>{w}<span style={{ fontWeight: 400 }}>{rest}</span></>; })()
        : countLabel ?? `${fmtN(inView)} ${countWord}`) : isErrStatus(status) ? plainStatus(status) : ""}
      zerosOpt={sel.realm === "bio" && sel.zeros && nFilled > 0 ? { checked: csvZeros, onChange: setCsvZeros } : null} busy={bundling} disabled={!sliceKey || areaPending} onCsv={downloadCsv} onCite={openSources} onLink={() => { copyLink(); trackEvent("share", { kind: "link" }); }}
      onZip={download} onCopy={(k) => copy(k)} />
    {!desk && <section className="group more-group" data-group="more">
      <button type="button" className="more-toggle" aria-expanded={more} onClick={() => setMore(!more)} title={`${more ? "fold" : "open"} the extra controls — they stay as you leave them`} data-tour="denominator"><Icon name={more ? "ui-down" : "ui-right"} size="0.95rem" /><b>More options</b><span>· {STAT_LABEL[stat]}{sel.realm === "bio" && sel.den ? ` · ${({ per_10m2: "per 10 m²", per_1000m3: "per 1000 m³", raw: "raw count" } as Record<string, string>)[sel.den]}` : ""}</span></button>
      {more && <div className="more-body">{!lensInline && lensOptions}{phone && depthGroup}{moreInner}</div>}
    </section>}
  </div>;
  const selectBody = lean ? leanBody : <>
    <div className="tabs" role="tablist" aria-label="Controls">{(["select", "refine", "share"] as Tab[]).map((t, i) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)} title={`step ${i + 1} of 3`}><span className="step" aria-hidden="true">{i + 1}</span><Icon name={t === "select" ? "ui-data" : t === "refine" ? "ui-filter" : "ui-share"} />{t === "select" ? "Select" : t === "refine" ? "Refine" : "Share"}</button>)}</div>
    <div className={`tab-body tab-${tab}`} data-tour={tab === "refine" ? "filters" : undefined}>{tab === "select" ? selectTab : tab === "refine" ? refineTab : shareTab}</div>
  </>;
  const depthBody = (wide: boolean) => <DepthStrip rows={depthRows} band={sel.depth} theme={theme} unit={unitLabel} empty={depthEmpty} onBand={(b) => setSel({ depth: b ?? [0, 500] })} byDataset={wide && depthDs.length ? { rows: depthDs, color: dsColor, short } : null} />;
  const yearsBody = <YearStrip rows={yearRows} monthRows={monthRows} seasonRows={seasonRows} cruiseSeasons={cruiseSeasons} quarters={sel.q} onNeedMonths={setNeedMonths} years={years} months={sel.months} yearMax={yearMax} theme={theme} mode={seriesMode} unit={unitLabel} stat={stat} log={ylog} ramp={seriesRampId} countWord={countWord}
    view={sel.yview} onView={(v) => setSel({ yview: v })} onYears={(y, m) => setSel({ years: y ?? [1949, YEAR_OPEN], months: y ? m ?? null : null })} gantt={gantt} />;
  const sectionNote = `line ${sel.line} · ${sel.realm === "env" ? `depth section · cruise ${sel.cruise ?? "—"}${sel.anom && climCells ? ` · the difference from the ${climWord} ${baselineWord(climBase, cruiseMonthOf(sel.cruise))} normal` : ""}` : "station by year · all cruises · the tows are depth-integrated, so the axis is year"}`; // shown as the dock tab's tooltip, not as a line of its own over the plot
  const sectionBody = <SectionPlot cells={sectionCells} clim={climCells} anom={sectionAnom} base={climBase} yLabel={sel.realm === "env" ? "depth (m)" : "year"} theme={theme} unit={unitLabel} ramp={rampId}
    empty={isCast ? "a section cuts the water column —<br>a per-cast variable is one value for the whole cast"
      : sectionNoBase ? noBaselineWhy(climBase, cruiseMonthOf(sel.cruise), climWord, climSeason === true).replace(" — ", " —<br>") : null}
    title="" />;
  // the depth × time anomaly card (explore#28): why it is empty (an organism, a per-cast variable, no baseline, the filters),
  // the plot, and a note of the baseline and of what a blank cell means
  const dtWhy = dtEmpty({ realm: sel.realm, cast: isCast, anomAvail, anomWhyNot, rows: dtRows, filters: filterWords });
  const dtBaseWord = climBase === "season" ? "season" : "month";
  const dtTitle = `${subject} · difference from the ${climWord} ${climBase === "season" ? "seasonal" : "monthly"} normal${area ? ` · ${areaWord(area)}` : ""}`;
  const dtBody = <div className="dt-body" data-depthtime={dtWhy ? "empty" : dtRows ? dtRows.length : "loading"}>
    <DepthTimePlot rows={dtRows} quarters={sel.q} unit={unitLabel} base={climBase} ramp={sel.ramp} theme={theme} title={dtTitle} empty={dtWhy} />
    {sel.realm === "env" && !isCast && anomAvail && <div className="hint dt-note">
      each cell: the mean over its observations of each one minus the {climWord} normal of its station, 10 m bin and cruise {dtBaseWord} ({climBase === "season" ? "the Dec–Feb … Sep–Nov normals" : "the release's monthly climatology"}) · blank: no observation, or none with a normal — never 0
      {dtShare && dtShare.n > 0 ? ` · ${Math.round((100 * dtShare.n_base) / dtShare.n)} % of ${fmtN(dtShare.n)} observations had one` : ""}
      {filterWords.length ? ` · ${filterWords.join(" · ")}` : ""}
    </div>}
  </div>;
  const cruiseBody = <CruiseSeries rows={cruiseRows} stat={stat} selected={sel.cruise} theme={theme} unit={unitLabel} onPick={(k) => setSel({ cruise: k })} countWord={countWord} />;
  const stationBody = <>
    {stationNote && stationNote.key === sel.station && <div className={`hint${stationNote.warn ? " warn" : ""}`} data-station-note>{stationNote.note}</div>}
    {stationCard && !stationCard.cell && grid.length > 0 && !(stationNote && stationNote.key === sel.station) && <div className="hint warn" data-station-note>{stationCard.grid_key} is not a cell of {version}'s grid</div>}
    <StationCard summary={stationCard?.summary} detail={stationCard?.detail} theme={theme} short={short} yearMax={yearMax} />
  </>;
  // D28 reshaped: the Sections lens (env) as a deck-only curtain scene — desktop only, the phone keeps 2-D
  const view3dOn = sel.view3d && displayLens === "section" && sel.realm === "env" && !phone;
  const layersBody = <LayersCard sel={sel} setSel={setSel} theme={theme} defs={spatialLayers.layers} view3d={view3dOn} rampHint={rampHint} effort={{ avail: hasTrack(catalog), ...effortSum }} />;
  const seaFloorOn = bathyOn(bathyFromSel(sel));
  const visibleBoundaries = layersEff.map((st) => ({ st, d: spatialLayers.layers.find((d) => d.id === st.id) })).filter((x): x is { st: (typeof x)["st"]; d: SpatialLayerDef } => !!x.d);
  // the legend lists the boundaries drawn, not the reference kinds (labels, a raster): a name layer in the legend is overkill (Ben, 2026-09-09)
  const legendBoundaries = visibleBoundaries.filter((x) => x.d.geom !== "label" && x.d.geom !== "raster");
  const boundaries: BoundaryState = { base: spatialLayers.pmtiles_base, defs: spatialLayers.layers, styles: layersEff,
    regionOutline: displayLens === "region" ? sel.layer : null };
  // D28 reshaped: the Sections lens (env) as a deck-only curtain scene — desktop only, the phone keeps 2-D
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
  // the section card says WHICH section it is: env cuts depth on one cruise, bio (depth-integrated tows) cuts years
  // (a preliminary cruise says so beside its key: the card's bar, and the stamp of the figure exported from it)
  const sectionSub = sel.realm === "env" ? `· depth along line ${sel.line}${sel.cruise ? ` · ${sel.cruise}${viewStg ? ` (${viewStg.label})` : ""}` : ""}` : `· by year along line ${sel.line}`;
  const titles: Record<PanelId, ReactNode> = {
    select: lean ? "Find data" : "Controls", depth: "Depth", years: "Time", section: <>Section <span className="plain">{sectionSub}</span></>, cruise: "Cruise series", layers: "Layers",
    station: stationCard ? <>{stationCard.grid_key} {stationCard.cell && <span className="plain">· line {stationCard.cell.line} station {stationCard.cell.station}{ownLine(stationCard.cell.line) ? ` · ${OWN_LINE}` : ""}</span>}</> : "Station",
    timing: <>SQL &amp; timing <span className="plain">· {anyCached ? "warm" : "cold"} · paint {firstPaint ?? "…"} · ready {readyAt ?? "…"} · query {lastQ ? lastQ.ms : "…"} · switch {grain ? grain.ms : "…"} ms</span></>,
    depthtime: <>Anomaly <span className="plain">· depth × cruise season · normal of the cruise's {climBase === "season" ? "season" : "month"}</span></>,
  };
  const titleText: Record<PanelId, string> = { select: lean ? "Find data" : "Controls", depth: "Depth", years: "Time", section: `Section ${sectionSub}`, cruise: "Cruise series", layers: "Layers", station: stationCard ? `${stationCard.grid_key} · line ${stationCard.cell?.line} station ${stationCard.cell?.station}` : "Station", timing: "SQL & timing", depthtime: "Anomaly · depth × time" };
  const icons: Record<PanelId, IconName> = { select: "ui-tune", depth: "ui-tune", years: "ui-years", section: "lens-sections", cruise: "lens-cruises", station: "lens-stations", timing: "ui-sql", layers: "ui-map-layers", depthtime: "ui-calendar" };
  const body = (id: PanelId, wide = false) => id === "select" ? selectBody : id === "depth" ? depthBody(wide) : id === "years" ? yearsBody : id === "section" ? sectionBody : id === "cruise" ? cruiseBody : id === "station" ? stationBody : id === "layers" ? layersBody : id === "depthtime" ? dtBody : timingBody;
  const tbinToggle = seriesMode === "mean" ? <span className="seg" role="group" aria-label="mean ± se by"><button className={sel.tbin === "season" ? "on" : ""} onClick={() => setSel({ tbin: "season" })} title="one point per season (the cruise's: DJF, MAM, JJA, SON): four a year">season</button><button className={sel.tbin === "year" ? "on" : ""} onClick={() => setSel({ tbin: "year" })} title="one point per year">year</button></span> : null;
  const actions = (id: PanelId) => (id === "years" ? <>{sel.yview && <IconButton icon="ui-zoom-out" label="Reset zoom (double-click the strip)" className="sm" onClick={() => setSel({ yview: null })} data-tour="zoom-reset" />}{seriesToggle}{tbinToggle}{logChip}</>
    : id === "select" && lean ? <button type="button" className="hd-reset" onClick={resetAll} title="Back to the defaults: Stations, all years, all seasons, all depths, everywhere, every dataset. Keeps your variable.">Reset all</button>
    : id === "depthtime" && dtWant ? baseSeg : null);
  // ── figures (D19) and the whole-view share (D17): every panel exports PNG · SVG · CSV from its header with the shared footer
  // the stamp's third line is the datasets the figure pools (WS-A3): a figure travels further than any other
  // download and used to leave the app with no way back to whom to cite
  const stampFor = (id: FigureId): Stamp => ({ title: `${id === "map" ? `Map · ${LENS_SHORT[sel.lens]}` : titleText[id]} · ${legendTitle}${id === "map" && seaFloorOn ? " · sea floor: GEBCO 2025" : ""}`, release: rel, url: location.href, datasets: viewDatasetKeys }); // the legend title carries the unit; the stamp credits GEBCO (D27)
  const plotDivOf = (id: PanelId) => document.querySelector<HTMLElement>(`.max-panel.panel-${id} .js-plotly-plot, .sheet .panel-body-${id} .js-plotly-plot, .card-${id} .js-plotly-plot`);
  const panelElOf = (id: PanelId) => document.querySelector<HTMLElement>(`.max-panel.panel-${id}, .sheet .panel-body-${id}, .card-${id}`);
  // the map's table is what it draws: the lens summary per station / hexagon / region, the samples along a cruise track
  const mapRows = (): Row[] => sel.lens === "hex" ? hexRows : sel.lens === "region" ? regionRows : sel.lens === "cruise" ? cruiseSamples : stationRows;
  const rowsOf = (id: FigureId): Row[] => id === "map" ? mapRows() : id === "years" ? (seriesMode === "cruises" && gantt ? gantt.rows : (monthRows ?? (bySeason ? seasonRows : null) ?? yearRows)) : id === "depth" ? (depthDs.length ? depthDs : depthRows)
    : id === "section" ? sectionCells : id === "depthtime" ? (dtRows ?? []) : id === "cruise" ? cruiseRows : id === "timing" ? marks : id === "station" ? (stationCard?.detail?.datasets ?? stationCard?.summary?.datasets ?? []).flatMap((d: any) => (d.years?.length ? d.years.map((y: [number, number]) => ({ grid_key: stationCard!.grid_key, dataset_key: d.dataset_key, year: y[0], n_obs: y[1] })) : [{ grid_key: stationCard!.grid_key, dataset_key: d.dataset_key, n_obs: d.n_obs, year_min: d.year_min, year_max: d.year_max }])) : [];
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
  const maxId: PanelId | null = sel.max && !phone && (sel.max === "select" || sel.max === "depth" || sel.max === "years" || sel.max === "depthtime" || cardOpen[sel.max as CardId]) ? sel.max : null;
  // ── the panels' home geometry: Select top-left, Years along the bottom, Depth on the right, a lens result above the
  // years, the cards beside the Depth panel or its pill. Dragged or resized, a panel keeps its own place per browser.
  // lean: Time, the Section / Cruise result and the Anomaly card share ONE bottom dock with tabs, so none of them opens over another
  const dock = lean && !phone;
  const dockTabs: PanelId[] = !dock ? [] : [!folded("years") && "years", cardOpen.section && !minCards.section ? "section" : cardOpen.cruise && !minCards.cruise ? "cruise" : false, !folded("depthtime") && sel.realm === "env" && "depthtime"].filter(Boolean) as PanelId[];
  const dockKey = dockTabs.join(",");
  useEffect(() => { const prev = dockSeen.current; dockSeen.current = dockTabs; const added = dockTabs.filter((t) => !prev.includes(t)); if (added.length) setDockTab(added[added.length - 1]); }, [dockKey]);
  const dockActive: PanelId | null = dockTabs.includes(dockTab) ? dockTab : dockTabs[0] ?? null;
  const yearsOpen = dock ? dockTabs.length > 0 : !folded("years"), depthOpen = !folded("depth"), selectOpen = !folded("select");
  const resultUp = dock ? false : (cardOpen.section && !minCards.section) || (cardOpen.cruise && !minCards.cruise);
  const stationUp = cardOpen.station && !minCards.station;
  const railW = 0; // the view tabs now sit in the header and the View as row in the panel, so nothing sits on the map's right edge
  const rightBand = (depthOpen ? 230 : 48) + railW;
  const dockTall = Math.max(200, Math.round((typeof innerHeight === "number" ? innerHeight : 800) * 0.27));
  const yearsH = dock ? (dockActive === "years" || !dockActive ? 168 : dockTall) : 150;            // the Time panel: shorter in the lean layout, and it starts right of the Find data panel
  // the Time panel's real height (it can be resized or restored), so what sits above it clears it exactly
  const [yearsPx, setYearsPx] = useState<number | null>(null);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".card-years"); if (!el) { setYearsPx(null); return; }
    const read = () => setYearsPx(Math.round(el.getBoundingClientRect().height)); read();
    const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, [yearsOpen, dockActive, selectOpen]);
  const yearsClear = dock && yearsPx ? yearsPx : yearsH;   // for what sits above the panel
  const tallCap = `calc(100% - 62px - ${yearsOpen ? yearsH + 10 : 0}px)`; // under the map's top-right row, above the Time panel
  // the bottom edge above whatever is docked there: the Time panel, and the section or cruise card over it. The depth × time
  // card opens there, and the bottom pills (its own among them) sit there, so an open Time panel no longer hides them
  const aboveBottom: number | string = resultUp ? `calc(${yearsOpen ? yearsClear + 30 : 20}px + ${cardOpen.section && !minCards.section ? 42 : 34}%)` : yearsOpen ? yearsClear + 20 : 10;
  // lean: the minimised panels park in the bottom-right corner (they sat under the Find-data panel, out of sight), clear of the info button
  const bottomPillsAt: React.CSSProperties | undefined = lean && !phone
    ? { left: "auto", right: 60, bottom: yearsOpen || resultUp ? aboveBottom : 10, justifyContent: "flex-end", maxWidth: "calc(100% - 440px)" }
    : yearsOpen || resultUp ? { bottom: aboveBottom, left: selectOpen ? 340 : 10 } : undefined;
  const panelBox: Record<PanelId, CardBox> = {
    select: lean && !phone && selectOpen ? { left: 10, top: 10, width: 320, height: "calc(100% - 20px)" } : { left: 10, top: 10, width: 320, maxHeight: `calc(100% - 20px - ${yearsOpen && !(lean && !phone) ? 150 : 0}px)` },   // never under the Time panel: the body scrolls instead
    years: { left: lean && !phone && selectOpen ? 340 : 10, right: 60, bottom: 10, height: yearsH },
    depth: { right: 10 + railW, top: 52, width: 210, height: `calc(100% - ${yearsOpen || resultUp ? yearsH + 72 : 62}px)` },
    section: dock ? { left: selectOpen ? 340 : 10, right: 60, bottom: 10, height: dockTall } : { left: selectOpen ? 340 : 10, right: 60, bottom: yearsOpen ? yearsH + 20 : 10, height: "42%" },
    cruise: dock ? { left: selectOpen ? 340 : 10, right: 60, bottom: 10, height: dockTall } : { left: selectOpen ? 340 : 10, right: 60, bottom: yearsOpen ? yearsH + 20 : 10, height: "34%" },
    // the depth × time card sits above the Time panel, clear of the Depth panel; above the section or cruise card when one is up
    depthtime: dock ? { left: selectOpen ? 340 : 10, right: 60, bottom: 10, height: dockTall } : { left: selectOpen ? 340 : 10, right: depthOpen ? 230 : 60, height: resultUp ? "28%" : "38%", bottom: aboveBottom },
    station: { top: 52, right: rightBand, width: 340, maxHeight: tallCap },
    timing: { top: 52, right: rightBand + (stationUp ? 350 : 0), width: 420, maxHeight: tallCap },
    layers: { top: 52, right: rightBand + (stationUp ? 350 : 0) + (view3dOn ? 40 : 0), width: 270, maxHeight: tallCap }, // 3-D: clear of the camera column under the row
  };
  const docks: Record<PanelId, Dock> = { select: "left", depth: "right", years: "bottom", section: "bottom", cruise: "bottom", station: "right", timing: "right", layers: "right", depthtime: "bottom" };
  const closeCard: Partial<Record<CardId, () => void>> = { station: () => setSel({ station: null }), timing: () => setAdvanced(false), layers: () => setLayersOpen(false) };
  const isRail = (id: PanelId) => id === "select" || id === "depth" || id === "years" || id === "depthtime"; // folds in the URL
  const dockLabels: Partial<Record<PanelId, string>> = { years: "Time", section: "Section", cruise: "Cruise series", depthtime: "Anomaly" };
  const dockTitle = <span className="dock-tabs" role="tablist">
    {dockTabs.map((t) => <button key={t} type="button" role="tab" aria-selected={t === dockActive} className={t === dockActive ? "on" : ""} onClick={() => { setDockTab(t); setTopCard(t); }}><Icon name={icons[t]} />{dockLabels[t]}</button>)}
    {dockActive === "section" && <span className="plain" title={sectionNote}>{sectionSub}</span>}
    {dockActive === "depthtime" && <span className="plain">· depth × cruise season</span>}
  </span>;
  const panel = (id: PanelId) => {
    if (phone) return null;
    if (isRail(id) ? folded(id) : !(cardOpen[id as CardId] && !minCards[id as CardId])) return null;
    const inDock = dock && dockTabs.includes(id);
    if (inDock && id !== dockActive) return null;
    const tourId = id === "select" ? "rail" : id === "years" ? "years" : id === "depth" ? "depth" : id === "station" ? "station" : id === "layers" ? "layers-card" : undefined;
    return <Panel key={id} id={id} title={inDock ? dockTitle : titles[id]} icon={icons[id]} boxRef={mapBox} defaults={panelBox[id]} dock={docks[id]} collapsed={false} onCollapse={() => (isRail(id) ? toggleFold(id) : minCard(id as CardId))}
      maximized={maxId === id} onMax={() => toggleMax(id)} onClose={isRail(id) ? undefined : closeCard[id as CardId]} actions={actions(id)} exportable={id === "select" || id === "layers" ? undefined : exportItems(id)}
      raised={topCard === id} onTouch={() => setTopCard(id)} autoHeight={id === "select" || id === "station" || id === "timing" || id === "layers"} minWidth={id === "select" ? 260 : 180} minHeight={id === "select" ? 200 : 100} data-tour={tourId}>{body(id)}</Panel>;
  };
  // a collapsed panel is a pill on the edge nearest its dock, labelled with its state
  const cardPill = (c: CardId): EdgePill => ({ id: c, icon: icons[c], label: c === "station" ? stationCard!.grid_key : c === "timing" ? "SQL & timing" : titleText[c], onRestore: () => openCard(c), onClose: closeCard[c] });
  const minimized = (cs: CardId[]) => cs.filter((c) => cardOpen[c] && minCards[c]).map(cardPill);
  // the Depth pill's three states: quiet (no depth axis for this pick), available (the band, a sparkline of the profile,
  // one pulse the moment it arrives) and brushed (the band is the filter; × resets it)
  const depthPill: EdgePill = { id: "depth", icon: "ui-tune", muted: !!sliceKey && !depthAvail, on: depthAvail, pulse: depthPulse, "data-tour": "depth", title: depthAvail ? "open the water column — drag a band to slice the map to those depths" : sliceKey ? `no depth axis for this pick — ${noDepthWhy}` : "the water column",
    label: depthAvail ? <><b>Depth {sel.depth[0]}–{sel.depth[1]} m</b>{!depthSet && <span className="hint"> · drag to brush</span>}</> : sliceKey ? <>Depth<span className="hint"> · no depth axis</span></> : "Depth",
    extra: depthAvail ? <><VSpark rows={depthRows} band={sel.depth} />{depthSet && <button type="button" className="edge-x" aria-label="reset the depth band" title="reset the depth band" onClick={() => setSel({ depth: [0, 500] })}><Icon name="ui-close" /></button>}</> : undefined,
    onRestore: () => toggleFold("depth") };
  const leftPills: EdgePill[] = folded("select") ? [{ id: "select", icon: "ui-tune", "data-tour": "rail", title: "open the Controls panel", label: <><b>Controls</b><Icon name={LENS_ICON[sel.lens]} /><Icon name={sel.realm === "bio" ? "realm-bio" : "realm-env"} />{selectSummary}</>, onRestore: () => toggleFold("select") }] : [];
  const rightPills: EdgePill[] = [...(folded("depth") && !lean ? [depthPill] : []), ...minimized(["station", "timing", "layers"])];
  // the depth × time anomaly card's pill (explore#28): an Environment pick only (organisms have no normal); muted, with the
  // reason, when the variable has no baseline or no depth axis
  const dtPill: EdgePill = { id: "depthtime", icon: "ui-calendar", muted: !dtWant, "data-tour": "depthtime",
    title: dtWant ? "the difference from the 1993–2013 normal by depth and cruise season, under the current filters" : `no depth × time anomaly for this pick — ${dtEmpty({ realm: sel.realm, cast: isCast, anomAvail, anomWhyNot, rows: null }) ?? ""}`,
    label: <><b>Anomaly</b> depth × time</>, onRestore: () => toggleFold("depthtime") };
  const bottomPills: EdgePill[] = [...(folded("years") ? [{ id: "years", icon: "ui-years", "data-tour": "years", title: "open the years", label: <><b>Time</b> {years[0]}–{years[1]}<Sparkline values={yearsSpark} /></>, onRestore: () => toggleFold("years") } as EdgePill] : []),
    ...(folded("depthtime") && sel.realm === "env" ? [dtPill] : []), ...minimized(["section", "cruise"])];
  const lensStrip = <div className="lens-strip" data-tour="lens-strip"><LensPicker lens={sel.lens} onLens={onLens} /></div>;
  const closeSheet = () => { const pnl = sheet.panel; if (pnl === "depthtime") setSelRaw((s) => (s.hide.includes("depthtime") ? s : { ...s, hide: [...s.hide, "depthtime"] })); if (pnl === "station") setSel({ station: null }); else if (pnl === "timing") setAdvanced(false); else if (pnl === "layers") setLayersOpen(false); else if (pnl === "section" || pnl === "cruise") setMinCards((m) => ({ ...m, [pnl]: true })); setSheet({ panel: "select", detent: "peek" }); };
  // the legend's rows the title sentence carries under it: the boundary layers drawn, an empty result's note, the exclusions
  const legendExtra = <>
    {anomNote && mapAnomDrawn && <div className="hint" data-anom-legend>the difference from each cruise's {climBase === "season" ? "season" : "month"} normal ({climWord}) · {anomNote}</div>}
    {legendBoundaries.length > 0 && <div className="legend-layers">
      {legendBoundaries.map(({ st, d }) => <div key={st.id} className="row">
        {isPalette(st.color)
          ? <span className="pal-strip">{PALETTES[st.color][theme].slice(0, 6).map((c) => <i key={c} style={{ background: c }} />)}</span>
          : <span className="swatch" style={{ background: st.color ? `#${st.color}` : (d.fill_color || d.line_color || "#9aa0a6") }} />}
        <span>{layerLabel(d)}</span>{isPalette(st.color) && d.names && <span className="hint">by name · {d.names.length}</span>}
      </div>)}
    </div>}
    {/* a per-cast variable in a lens that cannot draw it says why, and where to go — it is not "nothing in the selection" */}
    {castLensNote && <div className="hint warn legend-empty" data-cast-note={sel.lens}>{castLensNote} <button type="button" className="linkish" onClick={() => onLens("station")}>Stations</button></div>}
    {offGridOnly && !castLensNote && <div className="hint warn legend-empty">No data collected at stations. <button type="button" className="linkish" onClick={() => onLens("hex")}>See it in the Hexagon view</button></div>}
    {emptyResult && !offGridOnly && !castLensNote && <div className="hint warn legend-empty">No observations.{filterItems.length ? ` The filters for ${filterItems.join(", ")} leave no data${areaPhrase ? ` ${areaPhrase}` : ""}.` : areaPhrase ? ` Nothing ${areaPhrase}.` : ""}</div>}
    {!lean && !preSlice && !emptyResult && sel.realm === "bio" && denInfo(sel.den ?? "raw").excluded > 0 && <div className="hint legend-empty">{fmtN(denInfo(sel.den ?? "raw").excluded)} observations excluded by the standardization</div>}
  </>;
  // the status has its own place over the map (the sentence's legend used to carry it in a tucked-away hint): a pill above the
  // Time panel with a spinner while something is in flight ("engine warming…", "building slice…"), the transient notes
  // ("saved …png", "link copied") for a few seconds, an error until the next change
  const busy = !lensReady || status.endsWith("…");
  useEffect(() => {
    if (status === "ready" || busy || /^error|failed|blank/.test(status)) return;
    const t = setTimeout(() => setStatus("ready"), 5000); return () => clearTimeout(t);
  }, [status, busy]);
  const switching = !!sliceKey && !sliceCurrent;
  const statusToast = (status !== "ready" && status !== "grid (static)") || switching ? <div className={`status-toast${busy || switching ? " busy" : ""}${isErrStatus(status) ? " err" : ""}`} title={isErrStatus(status) ? status : undefined} role="status" aria-live="polite" style={lean && !phone ? { left: `calc(${selectOpen ? 340 : 0}px + (100% - ${selectOpen ? 340 : 0}px) / 2)`, bottom: yearsOpen ? yearsH + 34 : 24 } : undefined}>{(busy || switching) && <span className="spin" />}{switching && status === "ready" ? "Loading data…" : plainStatus(status)}</div> : null;
  const sentence = !phone && <Sentence lean={lean} sel={sel} setSel={setSel} onLens={onLens} cruiseMonthOf={cruiseMonthOf} organismItems={organismItems} organismGroups={organismGroups} variableItems={variableItems} variableGroups={variableGroups}
    sectionCruiseItems={sectionCruiseItems} cruiseItems={cruiseItems} cruiseStage={viewStg ? { label: viewStg.label, title: `the release's data_stage for ${short(viewStg.dataset_key)} on this cruise: ${viewStg.stage}` } : null} lines={lines} layerNames={layerNames} regionName={regionName} areaText={area ? areaWord(area) : null} stages={stages} denRows={(d) => denInfo(d).rows} defaultDen={(s) => defaultDen(picker, s)}
    years={years} yearMax={yearMax} hasDepthAxis={depthAvail || noneLeft} hasClim={hasClim(catalog)} anomAvail={anomAvail} climBase={climBase} seasonOk={climSeason} climWindow={climWindow} datasetsInSlice={datasetsInSlice} onSources={openSources} sources={(showV2 && var2Ds.length ? var2Ds : viewDatasetKeys).map((dk) => { const d = dsRow(dk) as any, raw = (d?.link_data_source as string) || (d ? doiUrl(d) : ""); return { key: dk, name: d ? dsName(d) : short(dk), long: d ? dsLongName(d) : short(dk), url: raw || datasetPageUrl(dk), raw: !!raw }; })} dsOn={dsOn} toggleDataset={toggleDataset} dsColor={dsColor} short={short}
    subject={showV2 ? var2Label : subject} derived={derivedNote} countWord={countWord} unit={preSlice ? "root samples" : showV2 ? (var2Unit && var2Unit !== var2Label ? var2Unit : "") : (legendUnit ?? unitLabel)} domain={sectionBlank ? null : [(legendUnit === "year" ? fmtYear : fmt)(legendDomain[0]), (legendUnit === "year" ? fmtYear : fmt)(legendDomain[1])]} bar={rampCss(rampId)} count={showV2 ? hex2Rows.reduce((k: number, r: any) => k + Number(r.n), 0) : inView} countLabel={countLabel} status={status} ready={sliceCurrent && viewCount?.slice === sliceKey && !status.endsWith("…")} seaFloor={seaFloorOn}
    native={native} phone={phone} loading={plainStatus(status)} busy={busy || switching} open={sentenceOpen} onToggle={toggleSentence} countNote={lean && !preSlice && sel.realm === "bio" && denInfo(sel.den ?? "raw").excluded > 0 ? `${fmtN(denInfo(sel.den ?? "raw").excluded)} more observations are left out by the standardization` : null} extra={legendExtra}
    band={(() => { const left = selectOpen ? 340 : 48; const right = Math.max(displayLens === "section" && sel.realm === "env" ? 200 : 160, rightBand + (stationUp ? 350 : 0) + (cardOpen.timing && !minCards.timing ? 430 : cardOpen.layers && !minCards.layers ? 280 : 0));
      // lean: centred on the MAP (the free area right of the Find-data panel), not on the whole window: the card's right edge keeps
      // clear of the map buttons, and its left edge sits the same distance to the right of the panel. When a right-hand card is open
      // it falls back to the free band so nothing overlaps.
      const extras = stationUp || (cardOpen.timing && !minCards.timing) || (cardOpen.layers && !minCards.layers);
      const r0 = Math.max(150, rightBand);
      return lean ? (extras ? { left, right } : { left: left + r0 - 110, right: r0 }) : { left, right }; })()} />;

  return (
    <div className="app">
      <header className="cc-header">
        <a className="cc-home" href="https://calcofi.io" aria-label="CalCOFI.io home">
          {/* v2: the horizontal lockup at the app scale's 28 px, the bare mark under 480 px — four <img>s and a media query
              (style.css), not <picture>: html-to-image's clone loses the image inside a <picture>, and the feedback capture
              is set from this header; v1: the 32 px mark (src/brand.ts) */}
          {BRAND === "v2" ? <>
            <img className="cc-logo-dark cc-logo-lockup" src={LOGO.dark} alt="CalCOFI.io" height={LOGO.height} />
            <img className="cc-logo-light cc-logo-lockup" src={LOGO.light} alt="CalCOFI.io" height={LOGO.height} />
            <img className="cc-logo-dark cc-logo-mark" src={LOGO.markDark} alt="CalCOFI.io" height={LOGO.height} loading="lazy" />
            <img className="cc-logo-light cc-logo-mark" src={LOGO.markLight} alt="CalCOFI.io" height={LOGO.height} loading="lazy" />
          </> : <>
            <img className="cc-logo-dark" src={LOGO.dark} alt="CalCOFI" width="32" height="32" />
            <img className="cc-logo-light" src={LOGO.light} alt="CalCOFI" width="32" height="32" />
          </>}
        </a>
        <a className="cc-title" href="./">{BRAND === "v1" && <span className="cc-title-org">CalCOFI </span>}Explorer{!(lean && !phone) && <small><Icon name={LENS_ICON[sel.lens]} /> {LENS_SHORT[sel.lens]}</small>}</a>
        {lean && !phone && <ViewMenu bio={sel.realm === "bio"} leftAt={selectOpen ? 340 : 10} lens={sel.lens} onLens={onLens} nudge={offGridOnly ? "hex" : null} />}
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
        <Menu className="cc-help hdr" icon="ui-help" label={<span className="label">Help</span>} title="the tour · the guide · start here · about · data sources · keyboard" align="right" data-tour="help" items={[
          { label: "Take the tour", icon: "ui-play", hint: "twelve steps; ? replays it", onSelect: tour },
          { label: "Explorer guide", icon: "ui-external", hint: "the written tour of this app, at calcofi.io/docs", href: "https://calcofi.io/docs/explore.html" },
          { label: "Start here", icon: "ui-home", hint: "the welcome: two doors and four questions", onSelect: () => openModal("welcome") },
          { label: "About", icon: "ui-about", hint: "what this is, the release, the datasets, credits", onSelect: () => openModal("about") },
          { label: "Data Sources & Attribution", icon: "ui-cite", hint: "citations, licences, DOIs, contacts", onSelect: openSources },
          { label: "Register a product", icon: "ui-product", hint: "tell us what you built with these data", onSelect: () => openModal("product") },
          { label: "Keyboard", icon: "ui-keyboard", hint: "? tour · Esc closes · ↑ ↓ Enter in the lists · drag to brush", onSelect: () => openModal("about", "keyboard") }]} />
        {/* feedback is an icon button beside the theme toggle — the shape calcofi.io and the docs book wear
            (CalCOFI.github.io/_layouts/default.html: .cc-icon-button.cc-feedback immediately left of .cc-theme-toggle),
            not an item buried under Help ▾: one place for it on every product, phone included */}
        <IconButton icon="ui-feedback" label="Send feedback" title="Send feedback — with a screenshot of this view"
          className="cc-feedback hdr" data-tour="feedback" onClick={() => openModal("feedback")} />
        <button className="cc-theme-toggle" type="button" aria-label="Toggle dark / light theme" title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
          {/* the sun while dark, the moon-in-sun while light — what a click switches to (theme.css shows one per theme) */}
          <svg className="cc-theme-icon cc-icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_SUN} /></svg>
          <svg className="cc-theme-icon cc-icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON_MOON} /></svg>
        </button>
      </header>
      <div className="main">
        <div className="panel mapwrap" ref={mapBox} data-tour="map">
          {view3dOn
            ? <Curtain3D cells={sectionCells} clim={climCells} anom={sel.anom && !!climCells} base={climBase} theme={theme} line={sel.line} grid={grid} exag={sel.exag ?? 60} ramp={rampId} cam={sel.cam} onCam={(c) => setSel({ cam: c })} />
            : <MapView layers={layers} theme={theme} bathy={bathyFromSel(sel)} boundaries={boundaries} view={sel.map ?? MAP_HOME} fit={mapFit} onView={(v) => setSel({ map: v })} onOverlay={(o) => { overlayRef.current = o; }} getTooltip={getTooltip} onClick={onClick} onFirstFrame={() => timing.add("first_paint", performance.now() - window.__t0, "basemap + grid dots")} />}
          {sel.lens === "hex" && var2Ready && !(sel.anom && sel.realm === "env") && <div className="v2-switch v2-map" role="radiogroup" aria-label="colour the hexagons by">
            <span className="k">Color by</span>
            <button type="button" role="radio" aria-checked={!colorBy2} className={!colorBy2 ? "on" : ""} onClick={() => setColorBy2(false)}>{subject}</button>
            <button type="button" role="radio" aria-checked={colorBy2} className={colorBy2 ? "on" : ""} onClick={() => setColorBy2(true)}>{var2Label}</button>
          </div>}
          {/* the map's own row, top right: zoom · layers · its ⬇ (· the camera group · 3-D in the Sections lens); Depth and the cards start under it */}
          <div className="map-tr">
            <span className="map-zoom" role="group" aria-label="zoom">
              <IconButton icon="ui-plus" label="Zoom in" className="map-zoom-btn" onClick={() => (view3dOn ? cam3d.zoom(0.5) : (window as any).__map?.zoomIn())} />
              <IconButton icon="ui-minus" label="Zoom out" className="map-zoom-btn" onClick={() => (view3dOn ? cam3d.zoom(-0.5) : (window as any).__map?.zoomOut())} />
            </span>
            <IconButton icon="ui-map-layers" label="Map layers — the sea floor" className="map-layers-btn" data-tour="layers"
              onClick={() => { if (layersOpen) setLayersOpen(false); else { setLayersOpen(true); setTopCard("layers"); if (phone) setSheet({ panel: "layers", detent: "half" }); } }} />
            <Menu className="export-menu map-export" icon="ui-download" label="" title="export the map: PNG (the map and its title, stamped) · CSV (the table it draws) — WebGL has no SVG" align="right" data-tour="map-export" items={lean ? [...exportItems("map"), { label: "Copy SQL", icon: "ui-code", hint: "the query this view ran", onSelect: () => copy("sql") }, { label: "Copy R code", icon: "ui-code", onSelect: () => copy("r") }, { label: "Copy Python code", icon: "ui-code", onSelect: () => copy("py") }] : exportItems("map")} />
            {view3dOn && <Nav3D />}
            {displayLens === "section" && sel.realm === "env" && !phone &&
              <button type="button" className="map-3d-btn" title="the section as a 3-D curtain over the sea floor (D28)"
                onClick={() => setSel({ view3d: !sel.view3d })}>{sel.view3d ? "2D" : "3D"}</button>}
          </div>
          {sentence}
          {!phone && statusToast}
          {!phone && noneLeft && emptyWhy?.key === emptyKey && !status.endsWith("…") && <div className="map-empty" role="status" style={lean ? { left: `calc(${selectOpen ? 340 : 0}px + (100% - ${selectOpen ? 340 : 0}px) / 2)` } : undefined}>
            <b>No {sel.realm === "bio" ? `${subject}${sel.stage ? ` ${sel.stage}` : ""}` : subject} {sel.realm === "bio" ? "caught" : "measured"} under these choices</b>
            {emptyWhy.zeroTows > 0 && <span>{sel.cruises?.length === 1 ? `Cruise ${sel.cruises[0]}` : "The selection"} sampled {fmtN(emptyWhy.zeroTows)} {emptyWhy.zeroTows === 1 ? "tow" : "tows"}, and every one came up empty for it.</span>}
            {emptyWhy.back.length > 0 ? <span>It shows up without {emptyWhy.back.map((b, i) => <span key={b.what}>{i ? (i === emptyWhy.back.length - 1 ? " or " : ", ") : ""}{b.what} (<button type="button" className="linkish" onClick={b.clear}>clear</button>, {fmtN(b.n)} {countWord})</span>)}.</span>
              : <span>Nothing here under any single one of the filters; try widening a few at once.</span>}
          </div>}
          {phone && <div className="map-tl">
            <div className="legend" data-tour="legend">
              <div className="ttl">{legendTitle}</div>
              <div className="bar" style={{ background: rampCss(rampId) }} />
              <div className="ticks"><span>{fmt(domain[0])}</span><span>5–95 %</span><span>{fmt(domain[1])}</span></div>
              <div className="hint">{plainStatus(status)}{sliceKey ? ` · ${fmtN(inView)} ${countWord}` : ""}</div>
              {legendExtra}
            </div>
          </div>}
          {(["select", "years", "depth", "section", "cruise", "depthtime", "station", "timing", "layers"] as PanelId[]).map(panel)}
          {!phone && <><EdgePills side="left" pills={leftPills} /><EdgePills side="right" pills={rightPills} style={railW ? { right: 10 + railW } : undefined} /><EdgePills side="bottom" pills={bottomPills} style={bottomPillsAt} /></>}
          {phone && <>
            <div className="phone-pills" style={{ bottom: SHEET_PEEK + 8 }}>
              <button type="button" className={`pill${sliceKey && !depthRows.length ? " muted" : ""}`} onClick={() => setSheet({ panel: "depth", detent: "half" })} data-tour="depth"><Icon name="ui-tune" />{depthSummary}</button>
              <button type="button" className="pill" onClick={() => setSheet({ panel: "years", detent: "half" })} data-tour="years"><Icon name="ui-years" />Time {years[0]}–{years[1]}<Sparkline values={yearsSpark} width={40} height={10} /></button>
              {sel.realm === "env" && <button type="button" className={`pill${dtWant ? "" : " muted"}`} onClick={() => { setSelRaw((s) => ({ ...s, hide: s.hide.filter((h) => h !== "depthtime") })); setSheet({ panel: "depthtime", detent: "half" }); }}><Icon name="ui-calendar" />Anomaly depth × time</button>}
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
          {modal === "welcome" && <div className="welcome-veil" aria-hidden="true" />}
          {modal === "welcome" && <Welcome release={rel} yearMax={yearMax} nOrganisms={organismItems.length} nVariables={variableItems.length} onStart={startExploring} onTour={tour} onDoor={door} onQuestion={question} onCite={openSources} onClose={closeModal} />}
        </div>
        {maxId && <MaxPanel id={maxId} title={titles[maxId]} icon={icons[maxId]} onRestore={() => setSel({ max: null })} actions={actions(maxId)} exportable={maxId === "select" ? undefined : exportItems(maxId)}>{body(maxId, true)}</MaxPanel>}
      </div>
      {hexCard && (() => {
        // the click card, option 2 (Betty 2026-11-11): dark like the hover card; no "hexagon" or its size — the name, the
        // value on its own colour scale, how much data and when, then what you can do with this spot
        const h: any = hexRows.find((r: any) => r.hex === hexCard.cell), g: any = var2Ready ? hex2Map.get(hexCard.cell) : null;
        if (!h && !g) return null;
        const at = cardXY(hexCard), left = Math.max(8, Math.min(at.x + 14, innerWidth - 286)), top = Math.max(8, Math.min(at.y + 14, innerHeight - 230));
        const pct = (v: number, d: [number, number]) => Math.round(100 * Math.min(1, Math.max(0, d[1] > d[0] ? (v - d[0]) / (d[1] - d[0]) : 0.5)));
        const obs = (n: number) => `${fmtN(n)} ${n === 1 ? "observation" : "observations"}`;
        const yrs = (r: any) => (r?.y0 == null ? "" : r.y0 === r.y1 ? ` · ${r.y0}` : ` · ${r.y0}–${r.y1}`);
        const hasStat = !preSlice && stat !== "n";
        const v1 = h && hasStat ? statOf(h) : null;
        const u2 = var2Unit && var2Unit !== var2Label ? var2Unit : "";
        return <div className="hex-card hc2" style={{ left, top }} role="dialog" aria-label={`${subject} here`}>
          <button type="button" className="hc-x" aria-label="close" onClick={() => setHexCard(null)}>×</button>
          <div className="hc2-t">{subject} · {mapAnomDrawn ? "difference from normal" : String(STAT_LABEL[stat]).toLowerCase()}</div>
          {h ? <>
            {v1 != null && <div className="hc2-big">{fmt(v1)}<small>{unitLabel}</small></div>}
            {v1 != null && <div className="hc2-bar"><i style={{ width: `${pct(v1, dom1)}%` }} /></div>}
            <div className="hc2-s">{countText(h)}{yrs(h)}{hasStat && h.lo != null && !mapAnomDrawn ? ` · range ${fmt(h.lo)}–${fmt(h.hi)}` : ""}</div>
          </> : <div className="hc2-s">no data here</div>}
          {var2Ready && <>
            <div className="hc2-t hc2-t2">{var2Label} · mean</div>
            {g ? <>
              <div className="hc2-big hc2-big2">{fmt(g.mean)}{u2 && <small>{u2}</small>}</div>
              <div className="hc2-bar"><i style={{ width: `${pct(Number(g.mean), dom2)}%` }} /></div>
              <div className="hc2-s">{obs(Number(g.n))}</div>
            </> : <div className="hc2-s">no data here</div>}
          </>}
          <div className="hc2-acts">
            <button type="button" className="linkish" onClick={() => { setHexCard(null); setSel({ area: areaToUrl({ kind: "hex", cell: hexCard.cell }) }); }}>Show only this area</button>
            <button type="button" className="linkish" onClick={() => { const [la, lo] = cellToLatLng(hexCard.cell); const m = (window as any).__map; m?.flyTo({ center: [lo, la], zoom: Math.min(12, (m.getZoom?.() ?? 6) + 2) }); }}>Zoom here</button>
          </div>
        </div>;
      })()}
      {regionCard && sel.lens === "region" && (() => {
        const f = layerFeatures.find((x: any) => String(x.properties.spatial_key) === regionCard.key); if (!f) return null;
        const g: any = regionStats.get(regionCard.key);
        const at = cardXY(regionCard), left = Math.max(8, Math.min(at.x + 14, innerWidth - 286)), top = Math.max(8, Math.min(at.y + 14, innerHeight - 190));
        const hasStat = !!g && !preSlice && stat !== "n", sv = hasStat ? statOf(g) : null;
        const years = g?.y0 == null ? "" : g.y0 === g.y1 ? String(g.y0) : `${g.y0} to ${g.y1}`;
        return <div className="hex-card" style={{ left, top }} role="dialog" aria-label="region details">
          <div className="hc-head"><b>{String(f.properties.name)}</b><button type="button" className="hc-x" aria-label="close" onClick={() => setRegionCard(null)}>×</button></div>
          {hasStat && <div className="hc-big">{fmt(sv)}<small>{[unitLabel, String(STAT_LABEL[stat])].filter(Boolean).join(", ")}</small></div>}
          <div className="hc-sub">{g ? `${countText(g)}${years ? ` · ${years}` : ""}` : "No data for this selection"}</div>
        </div>;
      })()}
      {modal === "about" && <About release={rel} nTables={catalog?.tables.length} datasets={datasets} cov={cov} short={short} onClose={closeModal} onTour={tour} onSources={openSources} providerTable={providerTable} at={aboutAt} />}
      {modal === "sources" && <SourcesModal release={rel} catalog={catalog} datasets={datasets} cov={cov} inView={viewDatasetKeys} providerTable={providerTable} short={short}
        onClose={closeModal} onRegister={() => openModal("product")} onCite={() => copyCite("text")} />}
      {(modal === "feedback" || modal === "product") && <FeedbackDialog kind={modal === "product" ? "product" : "feedback"} datasets={viewDatasetKeys} url={location.href} release={rel} onClose={closeModal} capture={() => captureView({ stamp: viewStamp() })} />}
      {regionModal && !areaRegions && <div className="modal-backdrop"><div className="modal modal-regions browse rp-loading" role="dialog" aria-label="loading regions"><div className="hint">Loading the region layers…</div></div></div>}
      {regionModal && areaRegions && (() => {
        // the region modal (src/regionpicker.tsx): the layer's regions with samples, its polygons, the current pick
        const regs = areaRegions.get(regionModal) ?? [], def = spatialLayers.layers.find((d) => d.name === regionModal);
        const have = new Set(regs.map((r) => r.name));
        const cur = area?.kind === "region" && area.layer === regionModal ? area.names : [];
        const defOfM = new Map(spatialLayers.layers.map((d) => [d.name, d]));
        const ORDER_M = ["Protected Areas", "Maritime Zones", "Energy & Industry", "Ecological", "Administrative", "Reference"];
        const rankM = (g: string) => { const i = ORDER_M.indexOf(g); return i < 0 ? ORDER_M.length : i; };
        const names = spatialLayers.layers.map((d) => d.name).filter((n) => areaRegions.has(n));
        const layerGroups = [...new Set(names.map((n) => defOfM.get(n)?.group ?? "Other"))].sort((x, y) => rankM(x) - rankM(y) || x.localeCompare(y))
          .map((g) => ({ group: g, names: names.filter((n) => (defOfM.get(n)?.group ?? "Other") === g).sort((x, y) => popRank(x) - popRank(y) || shownName(x).localeCompare(shownName(y))) }));
        return <RegionPicker key={regionModal} layers={layerGroups} labelOf={(n) => { const d = defOfM.get(n); return d ? layerLabel(d) : n; }} onLayer={(n) => setRegionModal(n)} layer={regionModal} def={def} regions={regs} status={regionStatusMap(def)} initial={cur} base={spatialLayers.pmtiles_base} theme={theme} fmtN={fmtN}
          bounds={featuresBbox(spatial.filter((f) => f.properties.layer === regionModal && have.has(f.properties.name)))}
          onCancel={() => setRegionModal(null)}
          onApply={(picked) => { setRegionModal(null); if (regionModalFor === "lens") { setSel({ layer: regionModal, region: null }); return; } setAreaLayerPick(regionModal); setSel({ area: areaToUrl(pickedArea(regionModal, picked, regs.map((r) => r.name))) }); }} />;
      })()}
    </div>
  );
}
