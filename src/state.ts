// selection model = the URL (plan § Architecture). every lens is a pure function of the slice + this.
import type { IconName } from "./icons";
export type Lens = "station" | "hex" | "contour" | "cruise" | "region" | "section";
export type Interp = "idw" | "ok" | "tps";
export type Surface = "value" | "se" | "n" | "y0" | "y1" | "p05" | "p95" | "spread";
export type Grain = "station" | "site";
export type Realm = "bio" | "env";
export type Den = "per_10m2" | "per_1000m3" | "raw";
export type Stat = "mean" | "med" | "n";

export interface Sel {
  lens: Lens;
  res: number;                 // hex resolution 3..7
  interp: Interp;              // contour lens: the interpolator (`interp=idw|ok|tps`; plan 2026-09-07 D31)
  surface: Surface;            // contour lens: which surface is drawn (`surface=value|se|n|y0|y1|p05|p95|spread`; D32)
  grain: Grain;                // contour lens: the station grid (one cell per grid_key) or every site (casts at their own positions) (`grain=`; D40)
  inputs: boolean | null;      // contour lens: draw the points the surface was fitted to (`inputs=on|off`); null = on for the station grid, off for the sites (D43)
  labels: boolean;             // contour lens: the level labels along the isolines (`labels=off`; on by default — D44)
  realm: Realm;
  taxon: string;               // bio: worms:217452
  var: string;                 // env: temperature | oxygen_ml_l
  stage: string | null;        // bio life stage; null = "let the picker default it" (D8 rule 4)
  den: Den | null;             // bio denominator; null = default per rule 4
  zeros: boolean;              // bio: a tow a positive-only dataset sampled with no catch counts as 0 (default); zeros=0 = positive tows only
  years: [number, number];
  months: [number, number] | null;  // month-level filter (D20): years=2015-04:2016-10; null = whole years
  q: number[] | null;          // season: quarters kept (q=1,2); null = all
  yview: [number, number] | null; // the year strip's zoom window in fractional years (yview=2005-2012); never the filter
  depth: [number, number];     // depth band, m (10 m bins)
  layer: string;               // region lens: one spatial layer (single-select, layers overlap)
  region: string | null;       // selected polygon
  line: number;                // section lens: CalCOFI line
  cruise: string | null;       // cruise + section lens
  stat: Stat;
  anom: boolean;               // section: anomaly vs climatology
  tour: boolean;               // ?tour=off suppresses the opening morph, the welcome card and the tour
  tourOn: boolean;             // ?tour=on forces the welcome card (demos)
  modal: "sources" | null;     // a modal the URL asks for: `?modal=sources` opens Data Sources & Attribution (WS-A3).
                               // Only the sources modal round-trips — welcome/about/feedback are session state, and a
                               // `tour=off` screenshot must show no modal it did not ask for by name.
  release: string | null;      // ?release=vYYYY.MM.DD; null = latest.txt
  station: string | null;      // a selected grid cell (its coverage card)
  datasets: string[] | null;   // dataset filter (pills); null = every dataset in the slice
  theme: "dark" | "light" | null;
  hide: PanelId[];             // folded rails (D11 rule 4: `hide=depth,years`, absent when it is the viewport default)
  max: PanelId | null;         // the maximized panel (`max=section`)
  map: [number, number, number] | null; // the map extent as lon,lat,zoom (`map=-121.5,33.2,5.1`); null = the grid's home view
  bathy: BathyPart[] | null;   // sea floor: null = the default (all three parts on); [] = off; else the subset shown (`bathy=relief,contours`)
  bathyo: number | null;       // sea-floor opacity 0–1 (`bathyo=0.6`); null = the theme default (0.7 dark · 1 light)
  land: boolean;               // `land=off`: the OSM land mask off (D47) — the sea floor and the data spill over the coast as before
  layers: LayerStyle[] | null; // visible boundary layers in DRAW ORDER, first on top (`layers=slug[:colour][:fill_opacity][:line_width],…`); null = the registry's defaults (defaultLayers()), `layers=off` = [] = none
  view3d: boolean;             // `view=3d`: the Sections lens (env) as a deck-only curtain scene (D28 reshaped)
  exag: number | null;         // vertical exaggeration for the 3-D scene, 10–150 (`exag=90`); null = 60
  ramp: string | null;         // the data layer's colour ramp (`ramp=thermal`, `_r` reverses; src/ramps.ts); null = the variable's default
  data: boolean;               // `data=off`: the data layer hidden — the basemap, sea floor and boundaries alone
  datao: number | null;        // the data layer's opacity 0–1 (`datao=0.6`); null = 1
  strip: StripMode | null;     // the years strip's mode (`strip=mean|cruises`); null = observations. A welcome question needs it.
}
export type StripMode = "n" | "mean" | "cruises";
/** one visible boundary layer's style (D24/D26): null field = the registry default */
export interface LayerStyle {
  id: string;                  // the registry dataset_id (unknown slugs are kept in state and ignored by the style — an older link survives a rename)
  color: string | null;        // hex6 (no #) = one colour for fill + line · pal1|pal2|pal3 = the by-name palette
  fillOpacity: number | null;  // 0–1, 2 dp (lines ignore it)
  lineWidth: number | null;    // 0.5–4 px, 0.5 steps (points read it as radius)
}
function parseLayerStyles(v: string | null): LayerStyle[] | null {
  if (v == null) return null;
  if (v === "off") return []; // explicitly none — the default is the registry's default-visible reference layers
  const out: LayerStyle[] = [];
  for (const e of v.split(",")) {
    const [id, c, o, w] = e.split(":");
    if (!id) continue;
    out.push({
      id,
      color: c && (/^[0-9a-fA-F]{6}$/.test(c) || /^pal[123]$/.test(c)) ? c : null,
      fillOpacity: o !== undefined && o !== "" && isFinite(+o) && +o >= 0 && +o <= 1 ? Math.round(+o * 100) / 100 : null,
      lineWidth: w !== undefined && w !== "" && isFinite(+w) && +w >= 0.5 && +w <= 4 ? Math.round(+w * 2) / 2 : null,
    });
  }
  return out.length ? out : null;
}
const fmtLayerStyles = (ls: LayerStyle[]) => ls.map((l) => {
  const f = [l.id, l.color ?? "", l.fillOpacity != null ? String(l.fillOpacity) : "", l.lineWidth != null ? String(l.lineWidth) : ""];
  while (f.length > 1 && f[f.length - 1] === "") f.pop();
  return f.join(":");
}).join(",");
/** the sea floor's parts, in the URL's canonical order (D26) */
export type BathyPart = "relief" | "depth" | "contours";
export const BATHY_PARTS: BathyPart[] = ["relief", "depth", "contours"];
function parseBathyParts(v: string | null): BathyPart[] | null {
  if (v == null) return null;
  if (v === "off") return [];
  const parts = BATHY_PARTS.filter((x) => v.split(",").includes(x));
  return parts.length === 0 || parts.length === BATHY_PARTS.length ? null : parts; // garbage or "all three" = the default
}
/** the map's home view: the CalCOFI grid, lon · lat · zoom */
export const MAP_HOME: [number, number, number] = [-121.5, 33.2, 5.1];
/** the extent rounded the way the URL carries it (4 decimals of a degree ≈ 10 m; zoom to 2) */
export const roundMap = (v: [number, number, number]): [number, number, number] => [+v[0].toFixed(4), +v[1].toFixed(4), +v[2].toFixed(2)];
const sameMap = (a: [number, number, number] | null, b: [number, number, number] | null) => (!a && !b) || (!!a && !!b && roundMap(a).join() === roundMap(b).join());
export type PanelId = "select" | "depth" | "years" | "section" | "cruise" | "station" | "timing" | "layers";
export const PANEL_IDS: PanelId[] = ["select", "depth", "years", "section", "cruise", "station", "timing", "layers"];
/** the folds a visit starts with: Depth is folded to its pill by default and SIGNALS when a pick is sampled at depth —
 *  it never opens itself (2026-09-06). The URL says `show=depth` for a visit that opened it, `hide=…` for the others. */
export const DEFAULT_HIDE: PanelId[] = ["depth"];
/** the folds as the URL carries them: `show=` opens a default fold, `hide=` folds an open one; a `depth=` band with
 *  neither opens the Depth panel, because whoever shared the link had it open to brush it */
export function hideFromUrl(p: URLSearchParams): PanelId[] {
  const ok = (x: string): x is PanelId => (PANEL_IDS as string[]).includes(x);
  const list = (k: string) => (p.get(k) ?? "").split(",").filter(ok);
  if (!p.has("hide") && !p.has("show")) return p.has("depth") ? DEFAULT_HIDE.filter((x) => x !== "depth") : DEFAULT_HIDE;
  const show = new Set(list("show")), hide = new Set(list("hide"));
  return [...new Set([...DEFAULT_HIDE.filter((x) => !show.has(x)), ...hide])];
}

export const LENSES: Lens[] = ["station", "hex", "contour", "cruise", "region", "section"];
export const LENS_TITLE: Record<Lens, string> = {
  station: "Stations — what has been collected where",
  hex: "Hexagons — larval fish and oceanography by area",
  contour: "Contours — a surface interpolated between the stations, with its error",
  cruise: "Cruises — the ship steaming the grid",
  region: "Regions — summaries within management areas",
  section: "Sections — one line of stations: down the water column for a variable, year by year for an organism",
};
export const LENS_SHORT: Record<Lens, string> = {
  station: "Stations", hex: "Hexagons", contour: "Contours", cruise: "Cruises", region: "Regions", section: "Sections",
};
/** one plain line under the active lens (the light layout, 2026-09-06) */
export const LENS_DESC: Record<Lens, string> = {
  station: "what has been collected where — one dot per station, coloured by the summary",
  hex: "pooled into hexagons — smooths the sampling; pick the size",
  contour: "a surface between the stations — pick the method; see its error, its inputs and their years",
  cruise: "one voyage at a time, along its track",
  region: "averaged within a sanctuary, county or basin",
  // both realms in one line: env cuts depth on one cruise, bio has no depth axis (tows are depth-integrated) and cuts years
  section: "one line of stations, offshore on the left — depth on one cruise for a variable, year by year for an organism",
};
/** the statistic as the title sentence says it */
export const STAT_WORD: Record<Stat, string> = { mean: "mean", med: "median", n: "count of observations" };
export const LAYERS = ["Marine Protected Areas", "National Marine Sanctuaries", "CDFW Regions", "CA Counties"];
export const ENV_VARS_FALLBACK: Record<string, string> = { temperature: "Temperature (°C)", oxygen_ml_l: "Oxygen (ml/L)" };
export const VAL_COL: Record<Den, string> = { per_10m2: "density_per_10m2", per_1000m3: "density_per_1000m3", raw: "value" };
export const DEN_LABEL: Record<Den, string> = {
  per_10m2: "per 10 m² of sea surface",
  per_1000m3: "per 1000 m³ strained",
  raw: "raw count",
};
// how each denominator is reached from a tow's own effort (sql/density.sql, the fixture calcofi4r / calcofi4py share).
// The standard haul factor is not a fourth denominator: it is the per-tow multiplier per 10 m² applies.
export const DEN_HOW: Record<Den, string> = {
  per_10m2: "count × standard haul factor ÷ proportion sorted — areal, depth-integrated: oblique and vertical tows (CalCOFI's larvae per 10 m²)",
  per_1000m3: "count ÷ proportion sorted ÷ volume strained × 1000 — volumetric: manta tows and any tow with a flowmeter",
  raw: "as counted — not standardized, so not comparable across gear or datasets",
};
export const SHF_NOTE = "standard haul factor = 10 × tow depth (m) ÷ volume strained (m³): SWFSC's per-tow multiplier, carried per tow in the release (obs_bio.std_haul_factor) and kept in the download bundle's observations";
export const STAT_LABEL: Record<Stat, string> = { mean: "mean", med: "median", n: "observations" }; // "rows" is database-speak (D12)
// H3 mean edge length per resolution (km) — what "hexagon size" shows; `res` stays in the URL (D12)
export const INTERPS: Interp[] = ["idw", "ok", "tps"];
export const INTERP_LABEL: Record<Interp, string> = { idw: "IDW", ok: "kriging", tps: "spline" };
export const INTERP_WORD: Record<Interp, string> = { idw: "inverse-distance weighting", ok: "ordinary kriging", tps: "a thin-plate spline" };
export const INTERP_HOW: Record<Interp, string> = {
  idw: "inverse-distance weighting, power 1.3 — what the superseded Contour Explorer drew (terra::interpIDW); a weighted average, so no error surface",
  ok: "ordinary kriging — an exponential variogram fitted to the stations; the kriging standard deviation is the error surface",
  tps: "a thin-plate spline, mgcv's s(lon, lat) basis, the smoothing chosen by GCV — the GAM that calcofi4r::pts_to_contours_gam() fits; its standard error is the error surface (station grid only)",
};
export const GRAIN_LABEL: Record<Grain, string> = { station: "station grid", site: "every site" };
export const GRAIN_HOW: Record<Grain, string> = {
  station: "one point per grid cell (a nearshore cell holds 2–4 real stations) — the smallest solve, every method",
  site: "one point per site — every cast, tow or site at its own position (to 0.01°), repeat occupations pooled — so the surface sees where the ship actually was; kriging and IDW use the 24 nearest per cell on 0.1° cells (a few seconds)",
};
export const SURFACES: Surface[] = ["value", "se", "n", "y0", "y1", "p05", "p95", "spread"];
export const SURFACE_LABEL: Record<Surface, string> = {
  value: "the statistic", se: "its error (SD of the estimate)", n: "observation density", y0: "first year sampled", y1: "last year sampled",
  p05: "5th percentile", p95: "95th percentile", spread: "spread (95th − 5th)",
};
/** the surface as the title sentence says it, after "showing" */
export const SURFACE_WORD: Record<Surface, string> = {
  value: "", se: "the error of the estimate", n: "how many observations each station holds", y0: "the first year each station was sampled", y1: "the last year each station was sampled",
  p05: "the 5th percentile at each station", p95: "the 95th percentile at each station", spread: "the spread between the 5th and 95th percentiles",
};
export const RES_KM: Record<number, string> = { 3: "~60 km", 4: "~23 km", 5: "~8.5 km", 6: "~3.2 km", 7: "~1.2 km" };
export const LENS_ICON: Record<Lens, IconName> = { station: "lens-stations", hex: "lens-hexagons", contour: "lens-contours", cruise: "lens-cruises", region: "lens-regions", section: "lens-sections" };
export const RELEASE = "v2026.08.25";
export const DEFAULT_TAXON = "worms:217452"; // Pacific sardine
export const YEAR_OPEN = 9999; // "through the latest year in the release" until coverage.json says which

export const DEFAULTS: Sel = {
  lens: "station", res: 5, interp: "ok", surface: "value", grain: "site", inputs: null, labels: true, realm: "bio", taxon: DEFAULT_TAXON, var: "temperature",
  stage: null, den: null, zeros: true, years: [1949, YEAR_OPEN], months: null, q: null, yview: null, depth: [0, 500], layer: LAYERS[1], region: null, // sanctuaries read at the grid's zoom; MPAs are slivers
  line: 90, cruise: null, stat: "mean", anom: false, tour: true, tourOn: false, modal: null, theme: null, release: null, station: null, datasets: null,
  hide: DEFAULT_HIDE, max: null, map: null, bathy: null, bathyo: null, land: true, layers: null, view3d: false, exag: null, strip: null, ramp: null, data: true, datao: null,
};

const num = (v: string | null, d: number) => (v != null && v !== "" && !isNaN(+v) ? +v : d);
const pair = (v: string | null, d: [number, number]): [number, number] => {
  if (!v) return d;
  const m = v.split(/[-–:]/).map(Number);
  return m.length === 2 && m.every((x) => !isNaN(x)) && m[0] !== m[1] ? [Math.min(m[0], m[1]), Math.max(m[0], m[1])] : d;
};

// years=1990-2000 (whole years) or years=2015-04:2016-10 (month-resolved, D20)
function parseYears(v: string | null): { years: [number, number]; months: [number, number] | null } {
  const d = { years: DEFAULTS.years, months: null as [number, number] | null };
  if (!v) return d;
  const m = /^(\d{4})(?:-(\d{1,2}))?[:–](\d{4})(?:-(\d{1,2}))?$/.exec(v);
  if (m) {
    const y0 = +m[1], y1 = +m[3], m0 = m[2] ? Math.min(12, Math.max(1, +m[2])) : 1, m1 = m[4] ? Math.min(12, Math.max(1, +m[4])) : 12;
    const yrs: [number, number] = [Math.min(y0, y1), Math.max(y0, y1)];
    return { years: yrs, months: m0 === 1 && m1 === 12 ? null : [m0, m1] };
  }
  return { years: pair(v, DEFAULTS.years), months: null };
}
// map=lon,lat,zoom — the extent a shared link reopens at; anything malformed or off the globe is the home view
function parseMap(v: string | null): [number, number, number] | null {
  if (!v) return null;
  const m = v.split(",").map(Number);
  if (m.length !== 3 || m.some((x) => !Number.isFinite(x)) || Math.abs(m[0]) > 180 || Math.abs(m[1]) > 90 || m[2] < 0 || m[2] > 24) return null;
  return sameMap(m as [number, number, number], MAP_HOME) ? null : (m as [number, number, number]);
}
const fmtYears = (y: [number, number], m: [number, number] | null) => m ? `${y[0]}-${String(m[0]).padStart(2, "0")}:${y[1]}-${String(m[1]).padStart(2, "0")}` : `${y[0]}-${y[1]}`;

export function fromUrl(): Sel {
  const p = new URLSearchParams(location.search);
  const lens = (LENSES as string[]).includes(p.get("lens") ?? "") ? (p.get("lens") as Lens) : DEFAULTS.lens;
  const v = p.get("var");
  const den = p.get("den");
  const stat = p.get("stat");
  return {
    ...DEFAULTS,
    lens,
    res: Math.min(7, Math.max(3, num(p.get("res"), DEFAULTS.res))),
    interp: (INTERPS as string[]).includes(p.get("interp") ?? "") ? (p.get("interp") as Interp) : DEFAULTS.interp,
    surface: (SURFACES as string[]).includes(p.get("surface") ?? "") ? (p.get("surface") as Surface) : DEFAULTS.surface,
    grain: p.get("grain") === "station" || p.get("grain") === "site" ? (p.get("grain") as Grain) : DEFAULTS.grain,
    inputs: p.get("inputs") === "on" ? true : p.get("inputs") === "off" ? false : null,
    labels: p.get("labels") !== "off",
    realm: v ? "env" : "bio",
    taxon: p.get("taxon") ?? DEFAULTS.taxon,
    var: v ?? DEFAULTS.var,
    stage: p.get("stage"),
    den: den && (den in VAL_COL) ? (den as Den) : null,
    zeros: p.get("zeros") !== "0",
    ...parseYears(p.get("years")),
    q: p.get("q") ? [...new Set(p.get("q")!.split(",").map(Number).filter((x) => x >= 1 && x <= 4))].sort() : null,
    yview: p.get("yview") ? pair(p.get("yview"), [0, 0]) : null,
    depth: pair(p.get("depth"), DEFAULTS.depth),
    layer: LAYERS.includes(p.get("layer") ?? "") ? (p.get("layer") as string) : DEFAULTS.layer,
    region: p.get("region"),
    line: num(p.get("line"), DEFAULTS.line),
    cruise: p.get("cruise"),
    stat: stat && (stat in STAT_LABEL) ? (stat as Stat) : DEFAULTS.stat,
    anom: p.get("anom") === "1",
    tour: p.get("tour") !== "off",
    tourOn: p.get("tour") === "on",
    modal: p.get("modal") === "sources" ? "sources" : null,
    release: p.get("release"),
    station: p.get("station"),
    datasets: p.get("datasets") ? p.get("datasets")!.split(",").filter(Boolean) : null,
    theme: (p.get("theme") as Sel["theme"]) ?? null,
    hide: hideFromUrl(p),
    max: (PANEL_IDS as string[]).includes(p.get("max") ?? "") ? (p.get("max") as PanelId) : null,
    map: parseMap(p.get("map")),
    bathy: parseBathyParts(p.get("bathy")),
    bathyo: (v => v != null && v !== "" && isFinite(+v) && +v >= 0 && +v <= 1 ? Math.round(+v * 100) / 100 : null)(p.get("bathyo")),
    land: p.get("land") !== "off",
    layers: parseLayerStyles(p.get("layers")),
    view3d: p.get("view") === "3d",
    exag: (v => v != null && isFinite(+v) && +v >= 10 && +v <= 150 ? Math.round(+v) : null)(p.get("exag")),
    strip: p.get("strip") === "mean" || p.get("strip") === "cruises" ? (p.get("strip") as StripMode) : null,
    ramp: p.get("ramp") || null,
    data: p.get("data") !== "off",
    datao: (v => v != null && v !== "" && isFinite(+v) && +v >= 0 && +v < 1 ? Math.round(+v * 100) / 100 : null)(p.get("datao")),
  };
}

export function toUrl(s: Sel) {
  const p = new URLSearchParams();
  p.set("lens", s.lens);
  if (s.lens === "hex") p.set("res", String(s.res));
  if (s.lens === "contour") { if (s.interp !== DEFAULTS.interp) p.set("interp", s.interp); if (s.surface !== DEFAULTS.surface) p.set("surface", s.surface); if (s.grain !== DEFAULTS.grain) p.set("grain", s.grain); if (s.inputs != null) p.set("inputs", s.inputs ? "on" : "off"); if (!s.labels) p.set("labels", "off"); }
  if (s.realm === "env") p.set("var", s.var);
  else {
    p.set("taxon", s.taxon);
    if (s.stage) p.set("stage", s.stage);
    if (s.den) p.set("den", s.den);
    if (!s.zeros) p.set("zeros", "0");
  }
  if (s.years[0] !== 1949 || s.years[1] !== YEAR_OPEN || s.months) p.set("years", fmtYears(s.years, s.months));
  if (s.q?.length && s.q.length < 4) p.set("q", s.q.join(","));
  if (s.yview && s.yview[1] > s.yview[0]) p.set("yview", `${+s.yview[0].toFixed(2)}-${+s.yview[1].toFixed(2)}`);
  if (s.depth[0] !== DEFAULTS.depth[0] || s.depth[1] !== DEFAULTS.depth[1]) p.set("depth", `${s.depth[0]}-${s.depth[1]}`);
  if (s.lens === "region") { p.set("layer", s.layer); if (s.region) p.set("region", s.region); }
  if (s.lens === "section") { p.set("line", String(s.line)); if (s.anom) p.set("anom", "1"); }
  if ((s.lens === "section" || s.lens === "cruise") && s.cruise) p.set("cruise", s.cruise);
  if (s.stat !== DEFAULTS.stat) p.set("stat", s.stat);
  if (!s.tour) p.set("tour", "off"); else if (s.tourOn) p.set("tour", "on");
  if (s.modal) p.set("modal", s.modal);
  if (s.release) p.set("release", s.release);
  if (s.station) p.set("station", s.station);
  if (s.datasets?.length) p.set("datasets", s.datasets.join(","));
  if (s.theme) p.set("theme", s.theme);
  const shown = DEFAULT_HIDE.filter((x) => !s.hide.includes(x)), hidden = s.hide.filter((x) => !DEFAULT_HIDE.includes(x));
  if (hidden.length) p.set("hide", hidden.join(","));
  // a `depth=` band alone already means "Depth open"; say `show=depth` only when the band is the default
  if (shown.length && !(shown.length === 1 && shown[0] === "depth" && p.has("depth"))) p.set("show", shown.join(","));
  if (s.max) p.set("max", s.max);
  if (s.map && !sameMap(s.map, MAP_HOME)) p.set("map", roundMap(s.map).join(","));
  if (s.bathy !== null) p.set("bathy", s.bathy.length ? s.bathy.join(",") : "off");
  if (s.bathyo != null) p.set("bathyo", s.bathyo.toFixed(2));
  if (!s.land) p.set("land", "off");
  if (s.layers !== null) p.set("layers", s.layers.length ? fmtLayerStyles(s.layers) : "off");
  if (s.view3d) p.set("view", "3d");
  if (s.exag != null) p.set("exag", String(s.exag));
  if (s.strip) p.set("strip", s.strip);
  if (s.ramp) p.set("ramp", s.ramp);
  if (!s.data) p.set("data", "off");
  if (s.datao != null) p.set("datao", s.datao.toFixed(2));
  const url = `${location.pathname}?${p.toString()}`;
  if (url !== location.pathname + location.search) history.replaceState(null, "", url);
}

// the picker's rule-4 defaults, from picker.sql rows
export interface PickerRow {
  dataset_key: string; life_stage: string | null; effort_class: string; tow_type: string | null; units: string;
  n: number; n_10m2: number; n_1000m3: number; n_flagged: number; n_filled?: number;
}
export function defaultStage(rows: PickerRow[]): string | null {
  // the stage with the most rows carrying effort, tie -> most rows; eggs and larvae are never merged
  const by = new Map<string | null, { eff: number; n: number }>();
  for (const r of rows) {
    const k = r.life_stage;
    const cur = by.get(k) ?? { eff: 0, n: 0 };
    cur.n += r.n; cur.eff += Math.max(r.n_10m2, r.n_1000m3);
    by.set(k, cur);
  }
  let best: string | null = null, bs = { eff: -1, n: -1 };
  for (const [k, v] of by) if (v.eff > bs.eff || (v.eff === bs.eff && v.n > bs.n)) { best = k; bs = v; }
  return best;
}
export function defaultDen(rows: PickerRow[], stage: string | null): Den {
  // the denominator that covers the most datasets WITH effort for this taxon x stage — never largest-n
  const ds10 = new Set<string>(), ds1000 = new Set<string>();
  for (const r of rows) if (r.life_stage === stage) {
    if (r.n_10m2 > 0) ds10.add(r.dataset_key);
    if (r.n_1000m3 > 0) ds1000.add(r.dataset_key);
  }
  if (ds10.size === 0 && ds1000.size === 0) return "raw";
  return ds1000.size > ds10.size ? "per_1000m3" : "per_10m2";
}
