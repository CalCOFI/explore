// the composed basemap (plan 2026-08-31, D21 · D22 · D26 · D27): CARTO's style ⊕ the GEBCO sea floor as ONE style
// object, applied with setStyle(..., { diff: true }) — so a theme flip or a symbology change is a paint/source diff
// and the layers can never be dropped the way addLayer-after-load ones are. The first style the map loads carries
// NO DEM source (first_paint must not wait for terrain tiles); MapView applies the composed style right after `load`.
// Values (igor · ramp ends on the shallow colour, transparent at exactly 0 m · contour alpha 0.15 dark / 0.30 light ·
// relief opacity 0.7 dark / 1 light) are the Phase-0 spike's measured picks (workflows plan § Measured).
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { BATHY_PARTS, type BathyPart } from "./state";

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
export function composeStyle(base: any, theme: "dark" | "light", b: BathyState, withDem: boolean): any {
  const style = structuredClone(base);
  if (!withDem || !bathyOn(b)) return style;
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
  return style;
}
