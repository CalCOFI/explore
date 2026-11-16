// MapLibre (keyless CARTO style, swapped on cc:theme) + deck.gl MapboxOverlay. the station dots are the
// morph carrier: the release grid cells (218; 225 since v2026.10.04) in a fixed order, so deck.gl attribute transitions interpolate per station.
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, GeoJsonLayer, PathLayer, BitmapLayer, TextLayer } from "@deck.gl/layers";
import { H3HexagonLayer, TripsLayer } from "@deck.gl/geo-layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { latLngToCell, cellToLatLng, getHexagonEdgeLengthAvg, UNITS } from "h3-js";
import { MAP_HOME, type Lens, type Stat } from "./state";
import type { LineThread } from "./gridkey";
import type { EffortPath } from "./effort";
import { baseStyle, composeStyle, warmBaseStyles, type BathyState, type BoundaryState } from "./basemap";
import { rampColors, rampCss } from "./ramps";

export const STYLE = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

// ── colour ────────────────────────────────────────────────────────────────────
// the ramp is view state (`ramp=`; src/ramps.ts): viridis unless the URL or the variable's cmocean convention says otherwise
export const NODATA: [number, number, number, number] = [140, 140, 140, 70];
export function colorScale(domain: [number, number], alpha = 220, ramp: string | null = null) {
  const [lo, hi] = domain, R = rampColors(ramp);
  return (v: number | null | undefined): [number, number, number, number] => {
    if (v == null || !Number.isFinite(v)) return NODATA;
    const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
    const x = t * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x)), f = x - i;
    const a = R[i], b = R[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, alpha];
  };
}
export function quantileDomain(vals: number[], stat: Stat): [number, number] {
  const v = vals.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  // densities and counts are heavy-tailed: colour on a 5–95 % window (n on 0–95 %)
  return stat === "n" ? [0, q(0.95)] : [q(0.05), q(0.95)];
}
export const viridisCss = rampCss("viridis");
// the Effort layer's colour (an amber that reads over the sea floor, a surface and either basemap)
export const EFFORT_RGB: [number, number, number, number] = [255, 167, 38, 230];

// ── layer inputs ──────────────────────────────────────────────────────────────
export interface GridCell { grid_key: string; line: number; station: number; home: [number, number]; pattern?: string } // pattern: standard | extended | historical (the Area filter, explore#20)
export interface StatRow { n: number; n_samples?: number; mean: number | null; med: number | null; [k: string]: any }
export interface LayerInputs {
  lens: Lens;
  res: number;
  stat: Stat;
  grid: GridCell[];
  station: Map<string, StatRow>;
  hex: (StatRow & { hex: string })[];
  hexSel?: string | null;
  hexHover?: string | null;   // the hexagon under the pointer: outlined while hovered (Betty 2026-11-11)
  region: { features: any[]; stats: Map<string, StatRow & { spatial_name: string }>; stationTo: Map<string, string>; centroid: Map<string, [number, number]>; selected: string | null };
  cruise: { track: { path: [number, number][]; ts: number[] } | null; samples: (StatRow & { latitude: number; longitude: number; grid_key: string })[]; time: number };
  section: { line: number; cruiseStations: Set<string> };
  contour: { image: HTMLCanvasElement; bounds: [number, number, number, number]; lines: { path: [number, number][]; level: number; color: [number, number, number, number] }[]; labels: { position: [number, number]; text: string; angle: number }[] | null; casts: { longitude: number; latitude: number; n: number }[] | null; inputs: boolean } | null; // the interpolated surface (lens = contour); inputs = draw the fitted points at all (D43); casts = the inputs at the site grain
  duration: number;
  domain: [number, number];
  ramp: string | null;        // the colour ramp id (ramps.ts); null = viridis
  dataOn: boolean;            // the Layers card's "Data" switch (`data=off`): every deck data layer off, the basemap and boundaries stay
  dataOpacity: number;        // the data layer's opacity 0–1 (`datao=`)
  lines?: LineThread[] | null; // the Lines layer (`lines=on`): each line threaded through its stations, named at both ends; drawn even with Data off
  obs?: { rows: { longitude: number; latitude: number; n: number }[]; color: string } | null; // the Observations layer (`obs=`): every site, drawn even with Data off
  effort?: EffortPath[] | null; // the Effort layer (`effort=on`): sample_track paths, on-effort segments and sight lines; drawn even with Data off, under the Observations
  beforeId?: string;          // D36: the MapLibre layer the data layer draws UNDER (the boundary above it in the Layers card); undefined = on top
  selectedStation?: string | null;
  area?: any[] | null;
  dark?: boolean;             // the app theme: the region edges are white on the dark map, navy on the light one
  areaPick?: any[] | null;    // Where › Regions from: every region of the picked layer, clickable to tick / untick (properties.__on = ticked)        // the Area filter's outline (explore#20): a box or a region's polygons, drawn over the data
  highlight?: [number, number][] | null; // a cruise hovered in a cruise list: its stations ringed in yellow, over everything
}

function statOf(r: StatRow | undefined, stat: Stat): number | null {
  if (!r) return null;
  return stat === "n" ? r.n : (r[stat] as number | null);
}

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const luminance = (h: string) => { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };


// the cruise playback: how many sampled stations the ship has reached, and where it is on its track
let reachedCache: { src: any; k: number; done: any[]; next: any[] } | null = null;
function countReached(smp: any[], now: number): number { let n = 0; while (n < smp.length && smp[n]._t <= now) n++; return n; }
function shipAt(tr: { path: [number, number][]; ts: number[] }, now: number): [number, number] | null {
  const n = tr.path.length; if (!n) return null;
  if (now <= tr.ts[0]) return tr.path[0];
  if (now >= tr.ts[n - 1]) return tr.path[n - 1];
  let i = 1; while (i < n - 1 && tr.ts[i] < now) i++;
  const t0 = tr.ts[i - 1], t1 = tr.ts[i], f = t1 > t0 ? (now - t0) / (t1 - t0) : 0;
  return [tr.path[i - 1][0] + (tr.path[i][0] - tr.path[i - 1][0]) * f, tr.path[i - 1][1] + (tr.path[i][1] - tr.path[i - 1][1]) * f];
}

export function buildLayers(inp: LayerInputs): Layer[] {
  const { lens, stat, duration } = inp;
  const color = colorScale(inp.domain, 220, inp.ramp);
  const opacity = inp.dataOpacity;
  // the Observations layer (Erin, 2026-10-05: the casts as dots over the sea floor, with no temperature): every site in the
  // selection at its own position, independent of the Data row, always on top of the data and the boundaries
  const obs: Layer[] = inp.obs && inp.obs.rows.length ? [new ScatterplotLayer({
    id: "obs", data: inp.obs.rows, radiusUnits: "pixels", getRadius: 2, getPosition: (d: any) => [d.longitude, d.latitude],
    getFillColor: [...hexRgb(inp.obs.color), 220] as [number, number, number, number], stroked: true, lineWidthUnits: "pixels", getLineWidth: 0.5,
    getLineColor: luminance(inp.obs.color) < 0.5 ? [255, 255, 255, 140] : [0, 0, 0, 140], pickable: false,
    updateTriggers: { getFillColor: [inp.obs.color], getLineColor: [inp.obs.color] },
  })] : [];
  // the Lines layer (Erin, 2026-10-02: "stations (and lines, if possible)"): a hairline through each line's stations and its
  // name at both ends, independent of the Data row, above the data and under the Observations. White on a dark halo, the
  // contour labels' style, so it reads over the sea floor, a surface or the basemap in either theme
  const lines: Layer[] = inp.lines?.length ? [
    new PathLayer({ id: "lines-halo", data: inp.lines, getPath: (d: any) => d.path, getColor: [20, 20, 30, 70], widthUnits: "pixels", getWidth: 3, widthMinPixels: 3, pickable: false }),
    new PathLayer({ id: "lines", data: inp.lines, getPath: (d: any) => d.path, getColor: [255, 255, 255, 150], widthUnits: "pixels", getWidth: 1, widthMinPixels: 1, pickable: false }),
    new TextLayer({
      id: "line-labels", data: inp.lines.flatMap((t) => t.labels), getPosition: (d: any) => d.position, getText: (d: any) => d.text,
      getSize: 12, getColor: [255, 255, 255, 240], fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", fontWeight: 600, // a system face: a web font not yet loaded leaves deck's atlas empty
      fontSettings: { sdf: true, fontSize: 48, buffer: 6, radius: 8 }, outlineWidth: 3, outlineColor: [20, 20, 30, 220],
      getTextAnchor: "middle", getAlignmentBaseline: "center", billboard: true, pickable: false,
    }),
  ] : [];
  // the Effort layer: where the observers looked (sample_track, calcofi4db 4.35.0+), whatever the taxon. The on-effort segments
  // in one solid colour on a dark halo, the sight lines from the ship to each sighted animal thinner and fainter (no dash: that
  // needs @deck.gl/extensions); over the data and the Lines, under the Observations so a sighting's dot sits on its line
  const segs = inp.effort?.filter((p) => p.track_type !== "sight_line") ?? [], sights = inp.effort?.filter((p) => p.track_type === "sight_line") ?? [];
  const effort: Layer[] = inp.effort?.length ? [
    new PathLayer({ id: "effort-halo", data: segs, getPath: (d: any) => d.path, getColor: [20, 20, 30, 90], widthUnits: "pixels", getWidth: 4, pickable: false }),
    new PathLayer({ id: "effort", data: segs, getPath: (d: any) => d.path, getColor: EFFORT_RGB, widthUnits: "pixels", getWidth: 2, pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 200] }),
    new PathLayer({ id: "effort-sight", data: sights, getPath: (d: any) => d.path, getColor: [...EFFORT_RGB.slice(0, 3), 150] as [number, number, number, number], widthUnits: "pixels", getWidth: 1, pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 200] }),
  ] : [];
  if (!inp.dataOn) return [...lines, ...effort, ...obs];
  // D37 (2026-09-07): the dots TRAVEL only between Stations and Hexagons — the one morph that explains something (pooling);
  // every other lens change is a short cross-fade in place, so nothing flies to a centroid or flickers through a 700 ms tween
  const travel = lens === "station" || lens === "hex";
  const fade = travel ? duration : Math.min(duration, 250);
  const trans = (enterTransparent = false) => ({
    getPosition: { duration: travel ? duration : 0, easing: (t: number) => 1 - Math.pow(1 - t, 3) },
    getFillColor: enterTransparent ? { duration: fade, enter: () => [0, 0, 0, 0] } : fade,
    getRadius: fade,
    getLineColor: fade,
  });
  const layers: Layer[] = [];
  // Where › Regions from (Betty 2026-11-10): the picked layer's regions, faintly filled UNDER the data so a click on open
  // water inside one ticks or unticks it; a click on a station still opens the station
  const darkMap = !!inp.dark;
  // a region that is not in (no data, or unticked): white edge + faint white fill on the dark map, navy edge + faint navy fill on the light one
  const areaEdge: [number, number, number, number] = darkMap ? [235, 242, 250, 220] : [25, 50, 85, 200];
  const areaFill: [number, number, number, number] = darkMap ? [255, 255, 255, 28] : [25, 50, 85, 22];
  if (inp.areaPick?.length) layers.push(new GeoJsonLayer({
    id: "area-pick", data: { type: "FeatureCollection", features: inp.areaPick } as any, filled: true, stroked: true, pickable: true,
    // with data and in: yellow fill (edged by area-outline); with data, unticked: faint white; no data: empty, a thin grey edge
    getFillColor: (f: any) => (f.properties.__has && f.properties.__on ? [255, 214, 10, 70] : areaFill),
    // the edge of a region that is not in: dark navy on the light basemap, near-white on the dark one, so it reads on either
    getLineColor: (f: any) => (f.properties.__has && f.properties.__on ? [255, 214, 10, 0] : areaEdge),
    getLineWidth: 1.5, lineWidthUnits: "pixels",
    autoHighlight: true, highlightColor: [255, 214, 10, 80],
    updateTriggers: { getFillColor: [inp.areaPick, areaFill.join()], getLineColor: [inp.areaPick, areaEdge.join()] },
  }));

  // hex membership of every station at this res (the dots' target when lens = hex)
  const hexStat = new Map(inp.hex.map((h) => [h.hex, h]));
  const dotTarget = (c: GridCell): [number, number] => {
    if (lens === "hex") {
      const cell = latLngToCell(c.home[1], c.home[0], inp.res);
      const [lat, lng] = cellToLatLng(cell);
      return [lng, lat];
    }
    return c.home; // regions: the dots stay home and take the polygon's colour (they used to fly to its centroid and stack — D37)
  };
  const dotColor = (c: GridCell): [number, number, number, number] => {
    if (lens === "station") { const col = color(statOf(inp.station.get(c.grid_key), stat)); return [col[0], col[1], col[2], col[3] ? 255 : 0]; } // opaque, so the basemap never shows through
    // Ben (2026-09-07): a dot that stays after the morph is a "phantom station" no legend explains. So the dots FADE OUT as
    // they arrive — Stations → Hexagons still travels to the hexagon centre (the pooling, in one move) but lands transparent;
    // Regions and Cruises fade in place (the cruise's own sampled dots are the cruise-samples layer)
    if (lens === "hex") {
      const cell = latLngToCell(c.home[1], c.home[0], inp.res);
      const col = color(statOf(hexStat.get(cell), stat));
      return [col[0], col[1], col[2], 0];
    }
    if (lens === "region" || lens === "cruise") return [140, 140, 140, 0];
    // contour: the surface carries the colour; a dot is an input — white, sized by how much it holds, faint when it holds nothing
    if (lens === "contour") return !inp.contour?.inputs || inp.contour?.casts ? [0, 0, 0, 0] : inp.station.get(c.grid_key) ? [255, 255, 255, 210] : [140, 140, 140, 40];
    // section: the line's stations highlight, the rest fade out
    return c.line === inp.section.line ? [255, 214, 10, 230] : [140, 140, 140, 0];
  };
  const dotRadius = (c: GridCell): number => {
    if (lens === "station") {
      const r = inp.station.get(c.grid_key);
      return r ? 4 + Math.min(7, Math.sqrt(r.n) / 4) : 2.5;
    }
    if (lens === "section") return c.line === inp.section.line ? 6 : 0;
    if (lens === "contour") { if (!inp.contour?.inputs || inp.contour?.casts) return 0; const r = inp.station.get(c.grid_key); return r ? 2 + Math.min(4, Math.sqrt(r.n) / 5) : 1.5; }
    if (lens === "cruise" || lens === "region") return 0;
    return 3; // hex: the dots keep their size while they travel and fade
  };

  // regions: polygons under the dots
  if (lens === "region") {
    // the fill carries the value; a white halo under a dark navy edge carries the shape, so a region reads on blue water
    // whatever its colour and however small; the chosen one takes a gold edge. A region with no data is a light fill.
    const sel = (f: any) => f.properties.spatial_key === inp.region.selected;
    layers.push(new GeoJsonLayer({
      id: "regions", opacity,
      data: inp.region.features,
      filled: true, stroked: false, pickable: true,
      getFillColor: (f: any) => {
        const s = inp.region.stats.get(f.properties.spatial_key);
        if (!s) return [255, 255, 255, 90]; // unsampled: a light fill and the edge, never zero
        const c = color(statOf(s, stat)); return [c[0], c[1], c[2], 175];
      },
      updateTriggers: { getFillColor: [stat, inp.domain, inp.ramp, inp.region.stats] },
      transitions: { getFillColor: { duration, enter: () => [0, 0, 0, 0] } },
    }));
    layers.push(new GeoJsonLayer({
      id: "regions-halo", opacity, data: inp.region.features, filled: false, stroked: true, pickable: false,
      lineWidthUnits: "pixels", getLineColor: [255, 255, 255, 230], getLineWidth: (f: any) => (sel(f) ? 6.5 : 4),
      updateTriggers: { getLineWidth: [inp.region.selected] },
    }));
    layers.push(new GeoJsonLayer({
      id: "regions-edge", opacity, data: inp.region.features, filled: false, stroked: true, pickable: false,
      lineWidthUnits: "pixels", getLineColor: (f: any) => (sel(f) ? [255, 200, 0, 255] : [18, 48, 79, 235]), getLineWidth: (f: any) => (sel(f) ? 3.5 : 1.6),
      updateTriggers: { getLineColor: [inp.region.selected], getLineWidth: [inp.region.selected] },
    }));
  }

  // hexagons cross-fade in under the travelling dots
  if (lens === "hex") {
    const hexEdgeM = (() => { try { return getHexagonEdgeLengthAvg(inp.res, UNITS.m); } catch { return 1400; } })();
    layers.push(new H3HexagonLayer({
      id: "hexes", opacity,
      data: inp.hex,
      getHexagon: (d: any) => d.hex,
      filled: true, stroked: true, extruded: false, pickable: true,
      highPrecision: "auto",
      // a crisp pale outline and a firmer fill, so each hexagon stands off the sea-floor shading instead of melting into it.
      // The outline is a share of the hexagon's own size (metres), at most 1 px: zoomed in it is the 1 px edge, zoomed out
      // it thins away with the hexagon (Betty 2026-11-11: small hexagons read as white dots from afar — all outline)
      lineWidthUnits: "meters", lineWidthMinPixels: 0, lineWidthMaxPixels: 1, getLineWidth: hexEdgeM * 0.08, getLineColor: [255, 255, 255, 190],
      getFillColor: (d: any) => { const c = color(statOf(d, stat)); return [c[0], c[1], c[2], 225]; },
      updateTriggers: { getFillColor: [stat, inp.domain, inp.ramp], getLineWidth: [inp.res] },
      transitions: { getFillColor: { duration, enter: () => [0, 0, 0, 0] } },
    }));
    // the hexagon under the pointer and the picked one keep a firm edge at any zoom (pixels), drawn over the rest
    const marked = inp.hex.filter((d: any) => d.hex === inp.hexSel || d.hex === inp.hexHover);
    if (marked.length) layers.push(new H3HexagonLayer({
      id: "hexes-mark", opacity, data: marked, getHexagon: (d: any) => d.hex,
      filled: false, stroked: true, extruded: false, pickable: false, highPrecision: "auto",
      lineWidthUnits: "pixels", getLineWidth: (d: any) => (d.hex === inp.hexSel ? 4 : 3),
      getLineColor: (d: any) => (d.hex === inp.hexSel ? [255, 214, 10, 255] : [255, 255, 255, 255]),
      updateTriggers: { getLineWidth: [inp.hexSel], getLineColor: [inp.hexSel] },
    }));
  }

  // the contoured surface: one bitmap stretched between its Mercator-regular bounds, isolines over it, the input dots on top
  if (lens === "contour" && inp.contour) {
    layers.push(new BitmapLayer({
      id: "surface", image: inp.contour.image, bounds: inp.contour.bounds, opacity: 0.88 * opacity, pickable: true,
    }));
    // the isolines take a darkened version of the ramp colour at their level, so they stand out of the surface without
    // fighting it (Ben, 2026-09-07); the labels are white on a dark halo — the one thing on the map that is white text
    layers.push(new PathLayer({
      id: "isolines", opacity, data: inp.contour.lines, getPath: (d: any) => d.path, getColor: (d: any) => d.color,
      widthMinPixels: 1.2, widthUnits: "pixels", getWidth: 1.2, capRounded: true, jointRounded: true,
      updateTriggers: { getColor: [inp.ramp, inp.domain] },
    }));
    // contour labels (D44): the level along each isoline, rotated to follow it, a halo so it reads on any colour
    if (inp.contour.labels) layers.push(new TextLayer({
      id: "isolabels", opacity, data: inp.contour.labels, getPosition: (d: any) => d.position, getText: (d: any) => d.text, getAngle: (d: any) => d.angle,
      getSize: 12, getColor: [255, 255, 255, 245], // deck's default font: any custom fontFamily left the atlas empty here (boxes, no glyphs)
      fontSettings: { sdf: true, fontSize: 48, buffer: 6, radius: 8 }, outlineWidth: 3, outlineColor: [20, 20, 30, 230],
      getTextAnchor: "middle", getAlignmentBaseline: "center", billboard: true, pickable: false,
    }));
    // the site grain: every input at its own position, a pinprick each — where the surface has evidence
    if (inp.contour.inputs && inp.contour.casts) layers.push(new ScatterplotLayer({
      id: "casts", opacity, data: inp.contour.casts, radiusUnits: "pixels", getRadius: 1.4, getPosition: (d: any) => [d.longitude, d.latitude],
      getFillColor: [255, 255, 255, 150], stroked: false, pickable: false,
    }));
  }

  // section: the line drawn through its stations
  if (lens === "section") {
    const pts = inp.grid.filter((c) => c.line === inp.section.line).sort((a, b) => a.station - b.station).map((c) => c.home);
    if (pts.length > 1) layers.push(new PathLayer({
      id: "section-line", opacity, data: [{ path: pts }], getPath: (d: any) => d.path,
      getColor: [255, 214, 10, 200], widthMinPixels: 2, widthUnits: "pixels", getWidth: 2,
    }));
  }

  // the cruise track (full, faint) + the ship playing it + sampled values
  // the ship leaves a short bright trail and a white marker; each sampled station sits as a dim dot until the ship reaches it,
  // then fades in as its value colour (the samples arrive sorted by their time on the ship's clock, so "reached" is a prefix)
  if (lens === "cruise" && inp.cruise.track) {
    const tr = inp.cruise.track, now = inp.cruise.time;
    layers.push(new PathLayer({
      id: "track-all", opacity, data: [tr], getPath: (d: any) => d.path, getColor: [232, 241, 250, 120], widthMinPixels: 1.5,
    }));
    layers.push(new TripsLayer({
      id: "track-trip", opacity, data: [tr], getPath: (d: any) => d.path, getTimestamps: (d: any) => d.ts,
      getColor: [255, 214, 10, 255], widthMinPixels: 4, trailLength: 120, currentTime: now, fadeTrail: true, capRounded: true, jointRounded: true,
    }));
    const smp = inp.cruise.samples as any[];
    if (reachedCache?.src !== smp || reachedCache.k !== countReached(smp, now)) {
      const k = countReached(smp, now);
      reachedCache = { src: smp, k, done: smp.slice(0, k), next: smp.slice(k) };
    }
    layers.push(new ScatterplotLayer({
      id: "cruise-samples-next", opacity, data: reachedCache.next, pickable: true,
      getPosition: (d: any) => [d.longitude, d.latitude], radiusUnits: "pixels", getRadius: 4,
      getFillColor: [125, 147, 168, 200], stroked: true, getLineColor: [14, 42, 68, 160], lineWidthMinPixels: 1,
    }));
    layers.push(new ScatterplotLayer({
      id: "cruise-samples", opacity, data: reachedCache.done, pickable: true,
      getPosition: (d: any) => [d.longitude, d.latitude], radiusUnits: "pixels",
      getRadius: (d: any) => 3 + Math.min(6, Math.sqrt(d.n)), getFillColor: (d: any) => color(statOf(d, stat)),
      stroked: true, getLineColor: [0, 0, 0, 120], lineWidthMinPixels: 0.5,
      updateTriggers: { getFillColor: [stat, inp.domain, inp.ramp] },
      transitions: { getFillColor: { duration: 500, enter: () => [0, 0, 0, 0] }, getRadius: { duration: 500, enter: () => [0] } },
    }));
    const pos = shipAt(tr, now);
    if (pos) layers.push(new ScatterplotLayer({
      id: "cruise-ship", opacity, data: [pos], getPosition: (d: any) => d, radiusUnits: "pixels", getRadius: 6.5,
      getFillColor: [255, 255, 255, 255], stroked: true, getLineColor: [14, 42, 68, 255], lineWidthMinPixels: 2,
    }));
  }

  layers.push(new ScatterplotLayer({
    id: "stations", opacity,
    data: inp.grid,
    pickable: lens === "station" || lens === "section" || (lens === "contour" && !!inp.contour?.inputs && !inp.contour?.casts),
    radiusUnits: "pixels",
    getPosition: dotTarget,
    getFillColor: dotColor,
    getRadius: dotRadius,
    stroked: lens === "station" || lens === "section" || (lens === "contour" && !!inp.contour?.inputs && !inp.contour?.casts), lineWidthMinPixels: 0.5,
    getLineColor: (c: GridCell) => (c.grid_key === inp.selectedStation ? [255, 214, 10, 255] : [255, 255, 255, 120]), // a faint white ring lifts every dot off the blue sea floor
    getLineWidth: (c: GridCell) => (c.grid_key === inp.selectedStation ? 3 : 1), lineWidthUnits: "pixels",
    updateTriggers: { getPosition: [lens, inp.res, inp.region.stationTo], getFillColor: [lens, inp.res, stat, inp.domain, inp.ramp, inp.station, inp.hex, inp.region.stats, inp.section, inp.contour?.inputs, !!inp.contour?.casts], getRadius: [lens, inp.station, inp.section, inp.contour?.inputs, !!inp.contour?.casts], getLineColor: [inp.selectedStation], getLineWidth: [inp.selectedStation] },
    transitions: trans(),
  }));
  // the Area filter's edge (explore#20): what is outside it is not in any statistic, so the line says where the data stop
  if (inp.area?.length) layers.push(new GeoJsonLayer({
    id: "area-outline", data: { type: "FeatureCollection", features: inp.area } as any, stroked: true, filled: false,
    getLineColor: [255, 214, 10, 230], getLineWidth: 2, lineWidthUnits: "pixels", pickable: false,
  }));
  // a cruise hovered in a cruise list: its stations ringed in yellow (lon, lat), so you can see where it went before picking it
  const hl: Layer[] = inp.highlight?.length ? [new ScatterplotLayer({
    id: "cruise-highlight", data: inp.highlight, getPosition: (d: [number, number]) => d, getRadius: 11, radiusUnits: "pixels",
    stroked: true, filled: false, getLineColor: [255, 214, 10, 255], getLineWidth: 2.5, lineWidthUnits: "pixels", pickable: false,
  })] : [];
  // interleaved (D36): deck draws inside MapLibre's own layer stack; beforeId puts the whole data layer under one boundary
  return [...(inp.beforeId ? layers.map((l) => l.clone({ beforeId: inp.beforeId } as any)) : layers), ...lines, ...effort, ...obs, ...hl];
}

// ── home sits in the middle of the free map ──────────────────────────────────
// The map fills the window and the panels float over it (the Find data panel on the left, the title card on top, the View
// rail on the right, the Time panel below), so the container's own middle is partly hidden. Home is placed in the middle of
// what the panels leave free, as if every panel were open. A view the person set (a link's `map=`, a pan) is exact: no shift.
const isHomeView = (v: [number, number, number]) => Math.abs(v[0] - MAP_HOME[0]) < 1e-6 && Math.abs(v[1] - MAP_HOME[1]) < 1e-6 && Math.abs(v[2] - MAP_HOME[2]) < 1e-6;
function homeOffset(m: maplibregl.Map): [number, number] {
  const c = m.getContainer(), W = c.clientWidth, H = c.clientHeight;
  if (W < 900) return [0, 0]; // a phone: the panels are sheets, not a frame
  const left = Math.min(540, W * 0.4), right = 150, top = 140, bottom = Math.round(H * 0.34);
  return [(left - right) / 2, (top - bottom) / 2];
}

/** padding that keeps a fitted extent inside the free map, clear of the panels */
function fitPadding(m: maplibregl.Map) {
  const c = m.getContainer(), W = c.clientWidth, H = c.clientHeight;
  if (W < 900) return { left: 30, right: 30, top: 80, bottom: Math.round(H * 0.3) };
  return { left: Math.min(540, W * 0.4) + 24, right: 150, top: 150, bottom: Math.round(H * 0.34) + 10 };
}

// ── the map component ─────────────────────────────────────────────────────────
export function MapView(props: {
  layers: Layer[]; theme: "dark" | "light";
  bathy: BathyState;                                 // the sea floor (D21/D26): composed INTO the style, never addLayer'd
  boundaries: BoundaryState;                         // the visible boundary layers, URL order = draw order (D23–D26)
  view: [number, number, number];                    // the opening extent: lon · lat · zoom (the URL's `map=`, else the home view)
  onView?: (v: [number, number, number]) => void;
  fit?: { key: string; bbox: [number, number, number, number] } | null;   // the thing of interest: when `key` changes the map flies to frame `bbox` (zooming in or out as needed), clear of the panels    // every settled pan / zoom, so the URL — and a shared link — carries the extent
  onOverlay?: (o: MapboxOverlay) => void;            // the deck overlay, for the cruise playback to drive without a React render per frame (D37)
  getTooltip: (info: PickingInfo) => any; onClick?: (info: PickingInfo) => void; onFirstFrame?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const overlay = useRef<MapboxOverlay>();
  const homing = useRef(false), homeCam = useRef<[number, number] | null>(null);
  const goHome = (m: maplibregl.Map, duration: number) => { homing.current = true; m.easeTo({ center: [MAP_HOME[0], MAP_HOME[1]], zoom: MAP_HOME[2], offset: homeOffset(m), duration }); };
  const cb = useRef(props);
  cb.current = props;
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!, style: STYLE[props.theme],
      center: [props.view[0], props.view[1]], zoom: props.view[2], attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // the whole-view figure (capture.ts) reads the canvas; deck.gl 9 preserves its own by default
    });
    m.on("moveend", (e: any) => {
      const c = m.getCenter();
      // the move home ended: remember where it landed, and report the canonical home so a link stays clean (no `map=`)
      if (homing.current && !e.originalEvent) { homing.current = false; homeCam.current = [c.lng, c.lat]; cb.current.onView?.([MAP_HOME[0], MAP_HOME[1], MAP_HOME[2]]); return; }
      homing.current = false; homeCam.current = null;
      cb.current.onView?.([c.lng, c.lat, m.getZoom()]);
    });
    if (isHomeView(props.view)) goHome(m, 0);
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    // compact attribution starts collapsed to its (i); MapLibre opens it on load, so close it after the style lands
    m.once("load", () => el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    // no NavigationControl: the app draws +/− itself in the map's top-right row (zoom · layers · export), so the order and the style are its own
    // interleaved (D36, 2026-09-07): deck renders into MapLibre's context as custom layers, so a deck layer can carry a
    // beforeId and sit UNDER a boundary layer; deck re-resolves its layers on every styledata (the composed style's
    // setStyle(diff) on a theme / sea-floor change), and getCanvas() is the map's — one canvas for capture.ts
    const o = new MapboxOverlay({ interleaved: true, layers: props.layers });
    m.addControl(o);
    // interleaved deck forwards no mouse events (its overlaid mode did), so the map's own drive picking: a hover picks
    // the deck object under the pointer (else the boundary, through getTooltip's MapLibre fallback) into one tooltip
    // element, a click picks and reports. The tooltip keeps deck's class so the styles and verify.mjs read it.
    const tip = document.createElement("div"); tip.className = "deck-tooltip"; tip.style.display = "none";
    // placed over the map canvas, never in the page flow under it (Betty 2026-11-11: the hover card never showed)
    Object.assign(tip.style, { position: "absolute", zIndex: "20", pointerEvents: "none", maxWidth: "340px" });
    el.current!.prepend(tip); // first in the container, so the app's tooltip is the one a querySelector(".deck-tooltip") finds
    const pick = (x: number, y: number): PickingInfo => (o.pickObject({ x, y, radius: 4 }) ?? ({ x, y, object: null, layer: null, index: -1, picked: false } as unknown as PickingInfo));
    m.on("mousemove", (e) => {
      const t = cb.current.getTooltip(pick(e.point.x, e.point.y));
      if (t && (t.text ?? t.html)) { if (t.html) tip.innerHTML = t.html; else tip.textContent = t.text; tip.style.display = "block"; tip.style.left = `${e.point.x + 12}px`; tip.style.top = `${e.point.y + 12}px`; }
      else tip.style.display = "none";
    });
    m.on("mouseout", () => { tip.style.display = "none"; cb.current.getTooltip({ object: null } as unknown as PickingInfo); });
    m.on("click", (e) => { const i = o.pickObject({ x: e.point.x, y: e.point.y, radius: 4 }); if (i) cb.current.onClick?.(i); });
    map.current = m; overlay.current = o; props.onOverlay?.(o);
    (window as any).__map = m; (window as any).__overlay = o; // spike: reachable from the console
    // a registry archive that is unreachable (the gazetteer tiles before they are published: 403/404) is a warning, once
    // per source — the layer stays empty, the map and every other layer carry on
    const warned = new Set<string>();
    m.on("error", (e: any) => {
      const sid = String(e?.sourceId ?? "");
      if (sid.startsWith("sp-")) { if (!warned.has(sid)) { warned.add(sid); console.warn(`layer source ${sid} unavailable:`, e?.error?.message ?? e?.error ?? e); } return; }
      console.error("maplibre error", e?.error ?? e);
    });
    m.once("load", () => requestAnimationFrame(() => cb.current.onFirstFrame?.()));
    // D22: the map BOOTS from CARTO's plain style URL (first_paint owes the DEM nothing); the composed style —
    // CARTO ⊕ sea floor, one object — lands as a diff right after load, and again on every theme / bathy change.
    warmBaseStyles();
    m.once("load", () => { loaded.current = true; applyStyle(); });
    return () => { m.remove(); };
  }, []);
  const loaded = useRef(false);
  const styleSeq = useRef(0);
  const applyStyle = async () => {
    const m = map.current; if (!m || !loaded.current) return;
    const seq = ++styleSeq.current;
    const s = composeStyle(await baseStyle(cb.current.theme), cb.current.theme, cb.current.bathy, true, cb.current.boundaries);
    if (seq !== styleSeq.current || !map.current) return; // a newer theme/bathy superseded this compose mid-fetch
    m.setStyle(s, { diff: true }); // diff keeps it a handful of ops; a failed diff rebuilds from this same object — the layers survive either way
    m.once("idle", applyLayers);   // D36: a beforeId that names a boundary layer becomes valid only once this style has landed
  };
  // D36: deck's interleaved groups are inserted with map.addLayer(group, beforeId), which throws — and drops the whole data
  // layer — when the named layer is not in the style yet (the composed style lands after load, and again on every theme /
  // sea-floor change). So a beforeId is passed only while its layer exists; the data layer draws on top until then
  const applyLayers = () => {
    const m = map.current, o = overlay.current; if (!m || !o) return;
    const ls = cb.current.layers.map((l: any) => (l.props?.beforeId && !m.getLayer(l.props.beforeId) ? l.clone({ beforeId: undefined }) : l));
    o.setProps({ layers: ls });
  };
  useEffect(() => { applyLayers(); }, [props.layers]);
  const boundsKey = props.boundaries.styles.map((s) => [s.id, s.color, s.fillOpacity, s.lineWidth].join("~")).join(",") +
    `|${props.boundaries.regionOutline}|${props.boundaries.defs.length}`;
  useEffect(() => { applyStyle(); }, [props.theme, props.bathy.parts.join(","), props.bathy.opacity, props.bathy.land, props.bathy.baseLabels, props.bathy.baseLabelOpacity, boundsKey]);
  // a view set from outside (the home button) flies the map there; the map's own moves come back through onView and match already
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (isHomeView(props.view)) {
      if (homing.current) return; // a move home is already under way
      const h = homeCam.current, c0 = m.getCenter();
      if (h && Math.abs(c0.lng - h[0]) < 1e-3 && Math.abs(c0.lat - h[1]) < 1e-3 && Math.abs(m.getZoom() - MAP_HOME[2]) < 0.01) return; // already home
      goHome(m, 500); return;
    }
    const c = m.getCenter(), [lng, lat, z] = props.view;
    if (Math.abs(c.lng - lng) > 1e-4 || Math.abs(c.lat - lat) > 1e-4 || Math.abs(m.getZoom() - z) > 0.01) m.easeTo({ center: [lng, lat], zoom: z, duration: 500 });
  }, [props.view]);
  // the thing of interest (a layer's regions, a cruise, a line, an area) always lands in view: fly to frame it, zoom in or out as needed.
  // Ordinary changes (stat, years…) keep the same key, so they do not move the map; a link's own `map=` is left alone on first load.
  const fitKey = useRef<string | null>(null), userView = useRef(!isHomeView(props.view));
  useEffect(() => {
    const m = map.current, f = props.fit; if (!m || !f) return;
    if (fitKey.current === f.key) return;
    const first = fitKey.current == null; fitKey.current = f.key;
    if (first && userView.current) return;
    const [w, s0, e0, n] = f.bbox; if (![w, s0, e0, n].every(Number.isFinite)) return;
    const pad = fitPadding(m), c = m.getContainer();
    const tooSmall = c.clientWidth - pad.left - pad.right < 220 || c.clientHeight - pad.top - pad.bottom < 160;
    homing.current = false;
    m.fitBounds([[w, s0], [e0, n]], { padding: tooSmall ? 40 : pad, maxZoom: 9.5, duration: 700 });
  }, [props.fit?.key]);
  return <div ref={el} className="map" />;
}
