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

export interface BathyState { parts: BathyPart[]; opacity: number | null } // parts [] = off · opacity null = the theme default
export const bathyOn = (b: BathyState) => b.parts.length > 0;
export const bathyDefaultOpacity = (theme: "dark" | "light") => (theme === "dark" ? 0.7 : 1);
export const bathyFromSel = (s: { bathy: BathyPart[] | null; bathyo: number | null }): BathyState =>
  ({ parts: s.bathy ?? [...BATHY_PARTS], opacity: s.bathyo });

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
const RAMP: Record<"dark" | "light", (number | string)[]> = {
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
 *  `withDem: false` returns the plain base — the style the map boots with, and the `bathy=off` style. */
export function composeStyle(base: any, theme: "dark" | "light", b: BathyState, withDem: boolean, bounds?: BoundaryState): any {
  const style = structuredClone(base);
  if (!withDem) return style;
  if (!bathyOn(b)) { if (bounds) composeBoundaries(style, theme, bounds); return style; }
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
      paint: { "color-relief-opacity": o, "color-relief-color": ["interpolate", ["linear"], ["elevation"], ...RAMP[theme]] } });
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
  if (bounds) composeBoundaries(style, theme, bounds);
  return style;
}

// ── the boundary layers (plan 2026-08-31, D23 · D24): the release sidecar's registry, drawn from the
// existing PMTiles at gs://calcofi-files-public/_spatial/ and styled by the URL's `layers=` entries ──
export interface SpatialLayerDef {
  id: string; group: string; name: string; source: string; geom: "polygon" | "line" | "point";
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

export const boundaryLayerIds = (styles: LayerStyle[]): string[] =>
  styles.flatMap((s) => [`sp-${s.id}-fill`, `sp-${s.id}-line`, `sp-${s.id}-circle`]);

/** insert the visible boundary layers into a composed style: the URL's entry order is the DRAW order, first on
 *  top, so the list is inserted REVERSED (MapLibre draws later layers on top). Everything lands above the sea
 *  floor and still under CARTO's labels. */
function composeBoundaries(style: any, theme: "dark" | "light", b: BoundaryState) {
  const byId = new Map(b.defs.map((d) => [d.id, d]));
  const entries = b.styles.filter((s) => byId.has(s.id)); // D26: unknown slugs (an older link after a rename) draw nothing
  if (!entries.length) return;
  const base = spatialBaseUrl(b.base);
  const add: any[] = [];
  for (const st of [...entries].reverse()) {
    const d = byId.get(st.id)!;
    const srcId = `sp-${d.source}`;
    style.sources[srcId] ??= { type: "vector", url: `pmtiles://${base}${d.source}.pmtiles`,
      ...(d.attribution ? { attribution: d.attribution } : {}) };
    const color = boundaryColor(d, st, theme);
    const width = st.lineWidth ?? d.line_width ?? 1;
    const fillOp = st.fillOpacity ?? d.fill_opacity ?? 0.2;
    // the Regions lens draws this same layer itself (deck, exact spatial_key membership): the background copy
    // goes outline-only while it is the lens's layer — never a double fill (D25)
    const outline = b.regionOutline != null && b.regionOutline === d.name;
    const common: any = { source: srcId, "source-layer": d.source, ...(d.filter ? { filter: d.filter } : {}) };
    if (d.geom === "polygon") {
      add.push({ id: `sp-${st.id}-fill`, type: "fill", ...common, paint: { "fill-color": color, "fill-opacity": outline ? 0 : fillOp } });
      add.push({ id: `sp-${st.id}-line`, type: "line", ...common, paint: { "line-color": color, "line-width": width } });
    } else if (d.geom === "line") {
      add.push({ id: `sp-${st.id}-line`, type: "line", ...common, paint: { "line-color": color, "line-width": width } });
    } else {
      add.push({ id: `sp-${st.id}-circle`, type: "circle", ...common, paint: { "circle-color": color, "circle-radius": Math.max(2, width * 2), "circle-opacity": 0.85, "circle-stroke-width": 0 } });
    }
  }
  // above the sea floor (after the last gebco layer), else right after CARTO's water
  const ids = style.layers.map((l: any) => l.id);
  let at = -1;
  for (let i = ids.length - 1; i >= 0; i--) if (/^gebco/.test(ids[i])) { at = i + 1; break; }
  if (at < 0) at = ids.indexOf("water") + 1;
  style.layers.splice(at > 0 ? at : 0, 0, ...add);
}
