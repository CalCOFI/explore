// the composed basemap (plan 2026-08-31, D21 · D22 · D26 · D27): CARTO's style ⊕ the GEBCO sea floor as ONE style
// object, applied with setStyle(..., { diff: true }) — so a theme flip or a symbology change is a paint/source diff
// and the layers can never be dropped the way addLayer-after-load ones are. The first style the map loads carries
// NO DEM source (first_paint must not wait for terrain tiles); MapView applies the composed style right after `load`.
// Values (igor · ramp ends on the shallow colour, transparent at exactly 0 m · contour alpha 0.15 dark / 0.30 light ·
// relief opacity 0.7 dark / 1 light) are the Phase-0 spike's measured picks (workflows plan § Measured).
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { BATHY_PARTS, type BathyPart, type LayerStyle } from "./state";

maplibregl.addProtocol("pmtiles", new Protocol().tile as any); // once, at module load (range requests against GCS)

export const BATHY_URL: string = import.meta.env.VITE_BATHY_URL ?? "https://storage.googleapis.com/calcofi-db/bathymetry/";
export const GEBCO_ATTRIBUTION = "GEBCO Compilation Group (2025) GEBCO 2025 Grid";

export interface BathyState { parts: BathyPart[]; opacity: number | null; land: boolean; baseLabels: boolean; baseLabelOpacity: number | null } // parts [] = off · opacity null = the theme default · land = the OSM mask (D47) · baseLabels = CARTO's text, at baseLabelOpacity
export const bathyOn = (b: BathyState) => b.parts.length > 0;
export const bathyDefaultOpacity = (theme: "dark" | "light") => (theme === "dark" ? 0.7 : 1);
export const bathyFromSel = (s: { bathy: BathyPart[] | null; bathyo: number | null; land: boolean; baseLabels: boolean; basemapo: number | null }): BathyState =>
  ({ parts: s.bathy ?? [...BATHY_PARTS], opacity: s.bathyo, land: s.land, baseLabels: s.baseLabels, baseLabelOpacity: s.basemapo });

// ── CARTO's own text, toned down (Ben, 2026-09-09: "the place labels are too visually dominant") ─────────────────
// Dark Matter sets its city names near white (rgba 211,228,236 · 233,239,246) in Montserrat Medium at 12–14 px with a
// 1 px black halo — the highest contrast on the map, above the data. Every CARTO symbol layer gets one mid grey at a
// theme opacity (the slider), Regular weight, a thinner halo and 1 px less; the isobath labels and the registry's
// label layers are added afterwards and keep their own look.
export const baseLabelDefaultOpacity = (theme: "dark" | "light") => (theme === "dark" ? 0.6 : 0.7);
const BASE_TEXT = {
  dark: { color: "rgb(214,220,226)", halo: "rgba(14,14,14,0.75)" },
  light: { color: "rgb(74,84,92)", halo: "rgba(250,250,248,0.75)" },
};
/** islands (Ben, 2026-09-09: "surprised to not see any island labels"): CARTO's tiles carry `place` features of class
 *  `island` from z8 (the Channel Islands at rank 2–3, Anacapa and Santa Barbara Island at rank 5) but neither of its
 *  styles has a rule for the class. Two symbol layers — the large islands from z8, the minor ones from z10 — inserted
 *  under `place_town`, so towns and cities (placed first, from the top of the stack) win a collision. Authored in the
 *  toned look (Regular, one grey) so toneBaseLabels() and `basemap=nolabels` treat them like the rest. */
function addIslandLabels(style: any, theme: "dark" | "light") {
  const src = style.layers.find((l: any) => l.id === "place_town")?.source ?? "carto";
  const t = BASE_TEXT[theme];
  const mk = (id: string, minzoom: number, filter: any, sizes: [number, number][]) => ({
    id, type: "symbol", source: src, "source-layer": "place", minzoom, filter,
    layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Montserrat Regular", "Open Sans Regular"],
              "text-size": { stops: sizes }, "text-letter-spacing": 0.06, "text-max-width": 7, "text-padding": 4, "symbol-sort-key": ["get", "rank"] },
    paint: { "text-color": t.color, "text-halo-color": t.halo, "text-halo-width": 1 } });
  const at = style.layers.findIndex((l: any) => l.id === "place_town");
  style.layers.splice(at < 0 ? style.layers.length : at, 0,
    mk("place_island", 8, ["all", ["==", "class", "island"], ["<=", "rank", 3]], [[8, 11], [10, 12], [13, 14]]),
    mk("place_island_minor", 10, ["all", ["==", "class", "island"], [">=", "rank", 4]], [[10, 10], [13, 12]]));
}

function toneBaseLabels(style: any, theme: "dark" | "light", opacity: number) {
  const t = BASE_TEXT[theme];
  const smaller = (s: any): any => typeof s === "number" ? Math.max(9, s - 1) : s && Array.isArray(s.stops) ? { ...s, stops: s.stops.map(([z, v]: [number, number]) => [z, Math.max(9, v - 1)]) } : s;
  for (const l of style.layers) {
    if (l.type !== "symbol") continue;
    l.paint = { ...(l.paint ?? {}), "text-color": t.color, "text-opacity": opacity, "icon-opacity": opacity, "text-halo-color": t.halo, "text-halo-width": 0.9 };
    l.layout = { ...(l.layout ?? {}) };
    if (Array.isArray(l.layout["text-font"])) l.layout["text-font"] = l.layout["text-font"].map((f: string) => String(f).replace(/ (Medium|SemiBold|Bold)( Italic)?$/, " Regular$2"));
    if (l.layout["text-size"] != null) l.layout["text-size"] = smaller(l.layout["text-size"]);
  }
}

// ── the land mask (plan 2026-09-09, D47 · D48 · D49 · D53) ────────────────────
// CARTO paints land as `background` and the sea as the `water` fill, with landcover, parks, landuse, waterways and the
// county / state lines UNDER that fill and roads, buildings, country lines and labels over it. Nothing above the sea
// floor could hide a 390 m GEBCO cell straddling the coast, and the Contours surface clipped itself on its own 10 km
// cells. So the ocean stack now sits at the BOTTOM of the style — `water`, the sea floor, the boundaries under the Data
// row, the data (deck, beforeId = LAND_LAYER) — then the OSM land polygons in the background colour, a copy of `water`
// without the ocean (lakes and rivers sit inside the land polygons), and every CARTO land layer where it always was.
export const LAND_ID = "osm_land";     // the registry row; the archive is `${base}osm_land.pmtiles` whether or not a release's sidecar lists it
export const LAND_LAYER = "land";      // the mask's MapLibre id — the data layer's beforeId while the mask is on
const LAND_ATTRIBUTION = "© OpenStreetMap contributors";
// CARTO's park layers hold marine polygons (Channel Islands NP's 1 nmi ring, the Baja *Islas del Pacífico* biosphere
// reserve, state marine reserves tagged nature_reserve — measured 2026-09-09); above the mask they would tint the ocean,
// so they sink under `water`: hidden at sea as today, under the mask on land (a faint green lost on light). Empty = lift.
const SINK_UNDER_WATER = ["park_national_park", "park_nature_reserve"];

// ── CARTO base styles, fetched once per theme (MapView still BOOTS from the plain URL for first paint) ──
export const CARTO_URL = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};
const cache: Partial<Record<"dark" | "light", any>> = {};
export async function baseStyle(theme: "dark" | "light"): Promise<any> {
  if (!cache[theme]) cache[theme] = await (await fetch(CARTO_URL[theme])).json();
  return cache[theme];
}
export const warmBaseStyles = () => { baseStyle("dark").catch(() => {}); baseStyle("light").catch(() => {}); };

// ── the sea-floor look, per theme ─────────────────────────────────────────────
// depth colour: each ramp fades to TRANSPARENT at exactly 0 m (land is clamped to 0 in the tiles — a stop above 0
// paints every land pixel). On dark the ramp ends ON the shallow colour (CARTO's #2C353C water is DARKER than the
// shallows, so ending on it drew a dark rim along every shelf < 50 m); on light ending on CARTO's water is right.
export const BATHY_RAMP: Record<"dark" | "light", (number | string)[]> = {
  dark: [-6500, "#03070f", -4500, "#060d19", -3000, "#0b1a2e", -2000, "#11284a", -1000, "#183760",
         -500, "#20466e", -200, "#27536f", -100, "#2a5a6f", -50, "#2b5b68", 0, "rgba(43,91,104,0)"],
  light: [-6500, "#2a527a", -4500, "#35638f", -3000, "#4a7aa6", -2000, "#6392ba", -1000, "#7ea8c9",
          -500, "#98bad5", -200, "#adc8dc", -100, "#bcd1df", -50, "#c8d6dd", -1, "#d4dadc", 0, "rgba(212,218,220,0)"],
};
// shaded relief: igor keeps flat ground (the abyssal plain, land) untouched — multidirectional washes it with
// ambient light, +20 luminance over the whole basemap (spike). Exaggeration rides the opacity slider.
const SHADE = {
  dark: { "hillshade-shadow-color": "rgba(0,0,0,0.55)", "hillshade-highlight-color": "rgba(170,200,230,0.35)", "hillshade-accent-color": "rgba(0,0,0,0.2)" },
  light: { "hillshade-shadow-color": "rgba(40,60,80,0.45)", "hillshade-highlight-color": "rgba(255,255,255,0.6)", "hillshade-accent-color": "rgba(40,60,80,0.15)" },
};
const CONTOUR = {
  dark: { rgb: "150,190,220", alpha: 0.15, text: "rgba(170,200,230,0.8)", halo: "rgba(0,0,0,0.6)" },  // 0.3 shouted under igor (Ben)
  light: { rgb: "40,80,120", alpha: 0.3, text: "rgba(40,80,120,0.85)", halo: "rgba(255,255,255,0.7)" },
};

/** CARTO's base ⊕ the sea-floor sources and layers, inserted right after `water` (under every label and boundary).
 *  `withDem: false` returns the plain base — the style the map boots with, and the `bathy=off` style. With the mask on
 *  (D47) `water` and the sea floor sit at the bottom of the style and the mask over the data; see composeBoundaries. */
export function composeStyle(base: any, theme: "dark" | "light", b: BathyState, withDem: boolean, bounds?: BoundaryState): any {
  const style = structuredClone(base);
  if (!withDem) return style;
  const landOn = b.land && !!bounds; // the mask's archive lives beside the boundary archives: it needs the sidecar's base URL
  if (landOn) sinkOcean(style);
  // `basemap=nolabels` (Ben, 2026-09-09): every text layer of CARTO's own — place names, road names, points of interest,
  // water names — hidden, for a data-centric view. Visibility, not removal, so the theme diff stays a handful of ops;
  // the sea floor's isobath labels and the registry's label layers are added below and are not touched.
  addIslandLabels(style, theme); // before the toning / hiding: an island name is a basemap label like any other
  if (!b.baseLabels) { for (const l of style.layers) if (l.type === "symbol") l.layout = { ...(l.layout ?? {}), visibility: "none" }; }
  else toneBaseLabels(style, theme, b.baseLabelOpacity ?? baseLabelDefaultOpacity(theme));
  if (bathyOn(b)) {
    const has = (x: BathyPart) => b.parts.includes(x);
    const o = b.opacity ?? bathyDefaultOpacity(theme);
    const k = Math.min(1.4, o / bathyDefaultOpacity(theme)); // one slider scales relief, shading and contours together
    const dem = (file: string) => ({ type: "raster-dem", url: `pmtiles://${BATHY_URL}${file}`, tileSize: 512,
      encoding: "custom", redFactor: 65536, greenFactor: 256, blueFactor: 1, baseShift: 10000, attribution: GEBCO_ATTRIBUTION });
    // two archives on purpose: MapLibre never fetches a parent tile as a fallback, so one sparse archive
    // leaves the far field blank at z6+ (spike). The far tier draws under the core everywhere.
    style.sources["gebco-far"] = dem("gebco_2025_calcofi_terrain_far.pmtiles");
    style.sources["gebco"] = dem("gebco_2025_calcofi_terrain.pmtiles");
    const add: any[] = [];
    for (const src of ["gebco-far", "gebco"]) {
      if (has("depth")) add.push({ id: `${src}-relief`, type: "color-relief", source: src,
        paint: { "color-relief-opacity": o, "color-relief-color": ["interpolate", ["linear"], ["elevation"], ...BATHY_RAMP[theme]] } });
      if (has("relief")) add.push({ id: `${src}-shade`, type: "hillshade", source: src,
        paint: { "hillshade-method": "igor", "hillshade-exaggeration": Math.min(1, 0.5 * k), ...SHADE[theme] } });
    }
    if (has("contours")) {
      const c = CONTOUR[theme];
      style.sources["gebco-contours"] = { type: "vector", url: `pmtiles://${BATHY_URL}gebco_2025_calcofi_contours.pmtiles`, attribution: GEBCO_ATTRIBUTION };
      add.push({ id: "gebco-contour", type: "line", source: "gebco-contours", "source-layer": "contours",
        paint: { "line-color": `rgba(${c.rgb},${Math.min(1, c.alpha * k).toFixed(3)})`,
                 "line-width": ["match", ["get", "level"], 3, 1.2, 2, 0.9, 0.5] } });
      add.push({ id: "gebco-contour-label", type: "symbol", source: "gebco-contours", "source-layer": "contours",
        minzoom: 8, filter: [">=", ["get", "level"], 2],
        layout: { "symbol-placement": "line", "text-field": ["concat", ["to-string", ["get", "ele"]], " m"],
                  "text-size": 10, "text-font": ["Montserrat Regular", "Open Sans Regular"], "symbol-spacing": 400 },
        paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 1 } });
    }
    const at = style.layers.findIndex((l: any) => l.id === "water") + 1; // right after CARTO's water fill
    style.layers.splice(at > 0 ? at : 0, 0, ...add);
  }
  if (bounds) composeBoundaries(style, theme, bounds, landOn);
  return style;
}

/** D47: the ocean stack goes to the bottom of CARTO's style — `water` (the "no data" sea) moves to right after
 *  `background`, so the sea floor, the data and the land mask draw over it and UNDER every land layer CARTO paints
 *  (landcover, landuse, waterway, county and state lines, roads, buildings, country lines, labels). `park_*` sink
 *  under water too (D49). Idempotent on the plain CARTO style; a base already sunk is left alone. */
function sinkOcean(style: any) {
  const take = (id: string) => { const i = style.layers.findIndex((l: any) => l.id === id); return i < 0 ? null : style.layers.splice(i, 1)[0]; };
  const water = take("water"); const parks = SINK_UNDER_WATER.map(take).filter(Boolean);
  const bg = style.layers.findIndex((l: any) => l.type === "background");
  style.layers.splice(bg + 1, 0, ...parks, ...(water ? [water] : []));
}

// ── the boundary layers (plan 2026-08-31, D23 · D24): the release sidecar's registry, drawn from the
// existing PMTiles at gs://calcofi-files-public/_spatial/ and styled by the URL's `layers=` entries ──
export interface SpatialLayerDef {
  id: string; group: string; name: string; source: string; geom: "polygon" | "line" | "point" | "label" | "raster";
  role?: "boundary" | "reference" | null;          // D52: a reference layer (the mask, the gazetteer labels, Esri's raster) — not a region
  source_type?: "pmtiles" | "raster" | null; source_url?: string | null; // raster: an XYZ template instead of an archive
  filter: any | null; line_color: string | null; fill_color: string | null;
  line_width: number | null; fill_opacity: number | null; default_visible: boolean;
  name_field: string | null; description: string | null; attribution: string | null;
  n_features: number; bbox: number[] | null; names: string[] | null; n_memberships: number;
}
export interface SpatialLayers { version: string; pmtiles_base: string; built: string | null; layers: SpatialLayerDef[] }
export interface BoundaryState { base: string; defs: SpatialLayerDef[]; styles: LayerStyle[]; regionOutline: string | null }
export const spatialBaseUrl = (sidecarBase: string): string => import.meta.env.VITE_SPATIAL_URL ?? sidecarBase;

// three categorical palettes for "by name" (D24) — the dataviz six-checks validator passed all three on BOTH map
// surfaces (#d4dadc light · #2C353C dark, 2026-08-31): pal2/pal3 are rotations of pal1's validated ordering, which
// preserves its adjacency set (the one new pair, red↔blue, passes). Same 8 hues, stepped per theme.
export const PALETTES: Record<"pal1" | "pal2" | "pal3", Record<"dark" | "light", string[]>> = {
  pal1: { light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
          dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] },
  pal2: { light: ["#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#2a78d6", "#eb6834"],
          dark: ["#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767", "#3987e5", "#d95926"] },
  pal3: { light: ["#4a3aa7", "#e34948", "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
          dark: ["#9085e9", "#e66767", "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"] },
};
export const isPalette = (c: string | null): c is "pal1" | "pal2" | "pal3" => !!c && /^pal[123]$/.test(c);

/** the layers a link without `layers=` shows (Ben, 2026-09-09): the registry's default-visible REFERENCE layers (the
 *  undersea feature names), drawn ABOVE the data — a `data` entry closes the list — so a label is never under a hexagon.
 *  The boundary rows' `default_visible` belongs to db-viz-hex, which offers the whole registry as checkboxes; the
 *  Explorer starts with the reference layers only. The mask is a checkbox, never a row. */
export function defaultLayers(defs: SpatialLayerDef[]): LayerStyle[] {
  const on = defs.filter((d) => d.default_visible && d.role === "reference" && d.id !== LAND_ID)
    .map((d): LayerStyle => ({ id: d.id, color: null, fillOpacity: null, lineWidth: null }));
  return on.length ? [...on, { id: "data", color: null, fillOpacity: null, lineWidth: null }] : [];
}
/** the list the map draws: the URL's, else the defaults */
export const effectiveLayers = (layers: LayerStyle[] | null, defs: SpatialLayerDef[]): LayerStyle[] => layers ?? defaultLayers(defs);
/** two lists that would draw the same map (ids in order, every override null on both sides) */
export const sameLayers = (a: LayerStyle[], b: LayerStyle[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id && (x.color ?? null) === (b[i].color ?? null) &&
    (x.fillOpacity ?? null) === (b[i].fillOpacity ?? null) && (x.lineWidth ?? null) === (b[i].lineWidth ?? null));

/** the layer's colour: one colour (URL hex > registry), or the by-name palette assigned to the sidecar's sorted
 *  names — a layer with `names: null` (> 200 of them) hashes `id` instead, so it is still distinguishable */
export function boundaryColor(d: SpatialLayerDef, st: LayerStyle, theme: "dark" | "light"): any {
  if (isPalette(st.color)) {
    const pal = PALETTES[st.color][theme];
    if (d.names?.length) {
      const m: any[] = ["match", ["get", "name"]];
      d.names.forEach((n, i) => m.push(n, pal[i % pal.length]));
      m.push(pal[pal.length - 1]);
      return m;
    }
    const m: any[] = ["match", ["%", ["get", "id"], pal.length]];
    pal.forEach((c, i) => m.push(i, c));
    m.push(pal[0]);
    return m;
  }
  return st.color ? `#${st.color}` : (d.fill_color || d.line_color || "#9aa0a6");
}

/** every MapLibre id a visible entry may own (fill + line, line, circle, the label symbols, a raster); callers keep
 *  the ones the style has */
export const boundaryLayerIds = (styles: LayerStyle[]): string[] =>
  styles.filter((s) => s.id !== "data").flatMap((s) => [`sp-${s.id}-fill`, `sp-${s.id}-line`, `sp-${s.id}-circle`,
    `sp-${s.id}-symbol-1`, `sp-${s.id}-symbol-2`, `sp-${s.id}-symbol-3`, `sp-${s.id}-symbol-line`, `sp-${s.id}-raster`]);

// the gazetteer labels (D50): italic like CARTO's own water names, halo in the theme's ground; rank 1 (escarpments,
// fracture zones, ridges …) letter-spaced capitals from z4, rank 2 (basins, banks, canyons, seamounts) from z6, rank 3
// (knolls, hills, valleys) from z8 — the archive carries `rank` and `label` ("Cortes Bank"), the style gates the zoom.
// Toned down 2026-09-09 (Ben): 12/10/9 px, a theme opacity the row's own slider overrides (`layers=gebco_gazetteer::0.4`).
const LABEL = {
  dark: { text: "rgb(178,204,230)", halo: "rgba(10,16,24,0.8)", opacity: 0.65 },
  light: { text: "#4a6577", halo: "rgba(250,250,248,0.8)", opacity: 0.7 },
};
export const labelDefaultOpacity = (theme: "dark" | "light") => LABEL[theme].opacity;
const LABEL_RANKS: [number, number, number][] = [[1, 4, 12], [2, 6, 10], [3, 8, 9]]; // rank · minzoom · text size at z8
function labelLayers(st: LayerStyle, theme: "dark" | "light", common: any, d: SpatialLayerDef): any[] {
  const c = LABEL[theme];
  const color = st.color && !isPalette(st.color) ? `#${st.color}` : c.text;
  const font = ["Montserrat Medium Italic", "Open Sans Italic"]; // CARTO's glyph set (the base style's `glyphs`)
  const size = (base: number) => ["interpolate", ["linear"], ["zoom"], 4, base - 2, 8, base, 12, base + 3];
  const paint = { "text-color": color, "text-opacity": st.fillOpacity ?? d.fill_opacity ?? c.opacity, "text-halo-color": c.halo, "text-halo-width": 1 };
  const { filter: _f, ...src } = common; // the registry filter (legacy syntax) cannot combine with these expressions; a label row carries none
  const pts = LABEL_RANKS.map(([r, mz, sz]) => ({ id: `${common.__id}-symbol-${r}`, type: "symbol", ...src, minzoom: mz,
    filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "rank"], r]],
    layout: { "text-field": ["get", "label"], "text-font": font, "text-size": size(sz), "text-max-width": 8, "text-padding": 6,
              "symbol-sort-key": r, "text-letter-spacing": r === 1 ? 0.1 : 0.03, "text-transform": r === 1 ? "uppercase" : "none" },
    paint }));
  const line = { id: `${common.__id}-symbol-line`, type: "symbol", ...src, minzoom: 4,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "symbol-placement": "line", "text-field": ["get", "label"], "text-font": font, "text-size": size(10),
              "text-letter-spacing": 0.08, "symbol-spacing": 700, "text-max-angle": 30 },
    paint };
  return [...pts, line].map(({ __id, ...l }: any) => l);
}

/** the MapLibre layers one visible entry owns, its source added to the style as a side effect */
function entryLayers(style: any, d: SpatialLayerDef, st: LayerStyle, theme: "dark" | "light", base: string, b: BoundaryState): any[] {
  const srcId = `sp-${d.source}`;
  const attribution = d.attribution ? { attribution: d.attribution } : {};
  if (d.geom === "raster" || d.source_type === "raster") {
    if (!d.source_url) return [];
    style.sources[srcId] ??= { type: "raster", tiles: [d.source_url], tileSize: 256, ...attribution };
    return [{ id: `sp-${st.id}-raster`, type: "raster", source: srcId, paint: { "raster-opacity": st.fillOpacity ?? d.fill_opacity ?? 1 } }];
  }
  style.sources[srcId] ??= { type: "vector", url: `pmtiles://${base}${d.source}.pmtiles`, ...attribution };
  const common: any = { __id: `sp-${st.id}`, source: srcId, "source-layer": d.source, ...(d.filter ? { filter: d.filter } : {}) };
  if (d.geom === "label") return labelLayers(st, theme, common, d);
  delete common.__id;
  const color = boundaryColor(d, st, theme);
  const width = st.lineWidth ?? d.line_width ?? 1;
  const fillOp = st.fillOpacity ?? d.fill_opacity ?? 0.2;
  // the Regions lens draws this same layer itself (deck, exact spatial_key membership): the background copy
  // goes outline-only while it is the lens's layer — never a double fill (D25)
  const outline = b.regionOutline != null && b.regionOutline === d.name;
  if (d.geom === "polygon") return [
    { id: `sp-${st.id}-fill`, type: "fill", ...common, paint: { "fill-color": color, "fill-opacity": outline ? 0 : fillOp } },
    { id: `sp-${st.id}-line`, type: "line", ...common, paint: { "line-color": color, "line-width": width } }];
  if (d.geom === "line") return [{ id: `sp-${st.id}-line`, type: "line", ...common, paint: { "line-color": color, "line-width": width } }];
  return [{ id: `sp-${st.id}-circle`, type: "circle", ...common, paint: { "circle-color": color, "circle-radius": Math.max(2, width * 2), "circle-opacity": 0.85, "circle-stroke-width": 0 } }];
}

/** the mask (D47): the OSM land polygons in the theme's background colour, then CARTO's water without the ocean so
 *  lakes, rivers and ponds — inside the land polygons — come back over it */
function landLayers(style: any, base: string): any[] {
  const bg = style.layers.find((l: any) => l.type === "background")?.paint?.["background-color"] ?? "#fafaf8";
  style.sources["osm-land"] = { type: "vector", url: `pmtiles://${base}${LAND_ID}.pmtiles`, attribution: LAND_ATTRIBUTION };
  const out: any[] = [{ id: LAND_LAYER, type: "fill", source: "osm-land", "source-layer": LAND_ID, paint: { "fill-color": bg, "fill-antialias": true } }];
  const water = style.layers.find((l: any) => l.id === "water");
  if (water) out.push({ ...structuredClone(water), id: "water-inland", filter: ["all", ["==", "$type", "Polygon"], ["!=", "class", "ocean"]] });
  return out;
}

/** insert the visible entries into a composed style: the URL's entry order is the DRAW order, first on top, so each
 *  block is inserted REVERSED (MapLibre draws later layers on top). The `data` pseudo-entry splits the list (D36):
 *  entries after it draw UNDER the data, right over the sea floor; entries before it draw over the data. With the
 *  mask on (D47/D53) the mask goes between the two blocks — the data (beforeId = LAND_LAYER) lands just under it,
 *  everything from the Data row down is clipped to the ocean, and the block above it draws where boundaries always
 *  did: over CARTO's land layers, under its roads and labels (before `water_shadow`). Mask off = today's stack. */
function composeBoundaries(style: any, theme: "dark" | "light", b: BoundaryState, landOn: boolean) {
  const byId = new Map(b.defs.map((d) => [d.id, d]));
  const real = (ls: LayerStyle[]) => ls.filter((s) => byId.has(s.id) && s.id !== LAND_ID); // D26: unknown slugs (an older link after a rename) draw nothing; the mask is never a row
  const dataAt = b.styles.findIndex((s) => s.id === "data"); // absent = the data on top of every boundary
  const above = real(dataAt < 0 ? [] : b.styles.slice(0, dataAt));
  const below = real(dataAt < 0 ? b.styles : b.styles.slice(dataAt + 1));
  const base = spatialBaseUrl(b.base);
  const mk = (st: LayerStyle) => entryLayers(style, byId.get(st.id)!, st, theme, base, b);
  const under = [...below].reverse().flatMap(mk);
  const mask = landOn ? landLayers(style, base) : [];
  const over = [...above].reverse().flatMap(mk);
  if (!under.length && !mask.length && !over.length) return;
  // the underwater block and the mask right after the sea floor (after the last gebco layer, else after CARTO's water)
  const ids = style.layers.map((l: any) => l.id);
  let at = -1;
  for (let i = ids.length - 1; i >= 0; i--) if (/^gebco/.test(ids[i])) { at = i + 1; break; }
  if (at < 0) at = ids.indexOf("water") + 1;
  if (at < 0) at = 0;
  style.layers.splice(at, 0, ...under, ...mask);
  let at2 = landOn ? style.layers.findIndex((l: any) => l.id === "water_shadow") : -1;
  if (at2 < 0) at2 = at + under.length + mask.length;
  style.layers.splice(at2, 0, ...over);
}
