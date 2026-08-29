// MapLibre (keyless CARTO style, swapped on cc:theme) + deck.gl MapboxOverlay. the station dots are the
// morph carrier: 218 grid cells in a fixed order, so deck.gl attribute transitions interpolate per station.
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, GeoJsonLayer, PathLayer } from "@deck.gl/layers";
import { H3HexagonLayer, TripsLayer } from "@deck.gl/geo-layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { latLngToCell, cellToLatLng } from "h3-js";
import type { Lens, Stat } from "./state";

export const STYLE = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

// ── colour ────────────────────────────────────────────────────────────────────
const VIRIDIS: [number, number, number][] = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
];
export const NODATA: [number, number, number, number] = [140, 140, 140, 70];
export function colorScale(domain: [number, number], alpha = 220) {
  const [lo, hi] = domain;
  return (v: number | null | undefined): [number, number, number, number] => {
    if (v == null || !Number.isFinite(v)) return NODATA;
    const t = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
    const x = t * (VIRIDIS.length - 1), i = Math.min(VIRIDIS.length - 2, Math.floor(x)), f = x - i;
    const a = VIRIDIS[i], b = VIRIDIS[i + 1];
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
export const viridisCss = `linear-gradient(90deg, ${VIRIDIS.map((c) => `rgb(${c.join(",")})`).join(",")})`;

// ── layer inputs ──────────────────────────────────────────────────────────────
export interface GridCell { grid_key: string; line: number; station: number; home: [number, number] }
export interface StatRow { n: number; n_samples?: number; mean: number | null; med: number | null; [k: string]: any }
export interface LayerInputs {
  lens: Lens;
  res: number;
  stat: Stat;
  grid: GridCell[];
  station: Map<string, StatRow>;
  hex: (StatRow & { hex: string })[];
  region: { features: any[]; stats: Map<string, StatRow & { spatial_name: string }>; stationTo: Map<string, string>; centroid: Map<string, [number, number]>; selected: string | null };
  cruise: { track: { path: [number, number][]; ts: number[] } | null; samples: (StatRow & { latitude: number; longitude: number; grid_key: string })[]; time: number };
  section: { line: number; cruiseStations: Set<string> };
  duration: number;
  domain: [number, number];
  selectedStation?: string | null;
}

function statOf(r: StatRow | undefined, stat: Stat): number | null {
  if (!r) return null;
  return stat === "n" ? r.n : (r[stat] as number | null);
}

export function buildLayers(inp: LayerInputs): Layer[] {
  const { lens, stat, duration } = inp;
  const color = colorScale(inp.domain);
  const trans = (enterTransparent = false) => ({
    getPosition: { duration, easing: (t: number) => 1 - Math.pow(1 - t, 3) },
    getFillColor: enterTransparent ? { duration, enter: () => [0, 0, 0, 0] } : duration,
    getRadius: duration,
    getLineColor: duration,
  });
  const layers: Layer[] = [];

  // hex membership of every station at this res (the dots' target when lens = hex)
  const hexStat = new Map(inp.hex.map((h) => [h.hex, h]));
  const dotTarget = (c: GridCell): [number, number] => {
    if (lens === "hex") {
      const cell = latLngToCell(c.home[1], c.home[0], inp.res);
      const [lat, lng] = cellToLatLng(cell);
      return [lng, lat];
    }
    if (lens === "region") {
      const sk = inp.region.stationTo.get(c.grid_key);
      const ctr = sk ? inp.region.centroid.get(sk) : null;
      return ctr ?? c.home;
    }
    return c.home;
  };
  const dotColor = (c: GridCell): [number, number, number, number] => {
    if (lens === "station") return color(statOf(inp.station.get(c.grid_key), stat));
    if (lens === "hex") {
      const cell = latLngToCell(c.home[1], c.home[0], inp.res);
      const col = color(statOf(hexStat.get(cell), stat));
      return [col[0], col[1], col[2], 160];
    }
    if (lens === "region") {
      const sk = inp.region.stationTo.get(c.grid_key);
      if (!sk) return [140, 140, 140, 40];
      const col = color(statOf(inp.region.stats.get(sk), stat));
      return [col[0], col[1], col[2], 180];
    }
    if (lens === "cruise") {
      return inp.section.cruiseStations.has(c.grid_key) ? [230, 230, 230, 120] : [140, 140, 140, 35];
    }
    // section: the line's stations highlight, the rest dim
    return c.line === inp.section.line ? [255, 214, 10, 230] : [140, 140, 140, 35];
  };
  const dotRadius = (c: GridCell): number => {
    if (lens === "station") {
      const r = inp.station.get(c.grid_key);
      return r ? 3 + Math.min(7, Math.sqrt(r.n) / 4) : 2;
    }
    if (lens === "section") return c.line === inp.section.line ? 6 : 2;
    if (lens === "cruise") return inp.section.cruiseStations.has(c.grid_key) ? 4 : 2;
    return 3;
  };

  // regions: polygons under the dots
  if (lens === "region") {
    layers.push(new GeoJsonLayer({
      id: "regions",
      data: inp.region.features,
      filled: true, stroked: true, pickable: true,
      lineWidthMinPixels: 1,
      getLineColor: (f: any) => (f.properties.spatial_key === inp.region.selected ? [255, 214, 10, 255] : [200, 200, 200, 120]),
      getLineWidth: (f: any) => (f.properties.spatial_key === inp.region.selected ? 3 : 1),
      getFillColor: (f: any) => {
        const s = inp.region.stats.get(f.properties.spatial_key);
        if (!s) return [0, 0, 0, 0]; // unsampled: outline + "no data", never zero
        const c = color(statOf(s, stat)); return [c[0], c[1], c[2], 150];
      },
      updateTriggers: { getFillColor: [stat, inp.domain, inp.region.stats], getLineColor: [inp.region.selected], getLineWidth: [inp.region.selected] },
      transitions: { getFillColor: { duration, enter: () => [0, 0, 0, 0] } },
    }));
  }

  // hexagons cross-fade in under the travelling dots
  if (lens === "hex") {
    layers.push(new H3HexagonLayer({
      id: "hexes",
      data: inp.hex,
      getHexagon: (d: any) => d.hex,
      filled: true, stroked: false, extruded: false, pickable: true,
      highPrecision: "auto",
      getFillColor: (d: any) => { const c = color(statOf(d, stat)); return [c[0], c[1], c[2], 170]; },
      updateTriggers: { getFillColor: [stat, inp.domain] },
      transitions: { getFillColor: { duration, enter: () => [0, 0, 0, 0] } },
    }));
  }

  // section: the line drawn through its stations
  if (lens === "section") {
    const pts = inp.grid.filter((c) => c.line === inp.section.line).sort((a, b) => a.station - b.station).map((c) => c.home);
    if (pts.length > 1) layers.push(new PathLayer({
      id: "section-line", data: [{ path: pts }], getPath: (d: any) => d.path,
      getColor: [255, 214, 10, 200], widthMinPixels: 2, widthUnits: "pixels", getWidth: 2,
    }));
  }

  // the cruise track (full, faint) + the ship playing it + sampled values
  if (lens === "cruise" && inp.cruise.track) {
    const tr = inp.cruise.track;
    layers.push(new PathLayer({
      id: "track-all", data: [tr], getPath: (d: any) => d.path, getColor: [160, 160, 160, 90], widthMinPixels: 1,
    }));
    layers.push(new TripsLayer({
      id: "track-trip", data: [tr], getPath: (d: any) => d.path, getTimestamps: (d: any) => d.ts,
      getColor: [77, 171, 247, 255], widthMinPixels: 3, trailLength: 180, currentTime: inp.cruise.time, fadeTrail: true,
    }));
    layers.push(new ScatterplotLayer({
      id: "cruise-samples", data: inp.cruise.samples, pickable: true,
      getPosition: (d: any) => [d.longitude, d.latitude], radiusUnits: "pixels",
      getRadius: (d: any) => 3 + Math.min(6, Math.sqrt(d.n)), getFillColor: (d: any) => color(statOf(d, stat)),
      stroked: true, getLineColor: [0, 0, 0, 120], lineWidthMinPixels: 0.5,
      updateTriggers: { getFillColor: [stat, inp.domain] },
      transitions: { getFillColor: { duration, enter: () => [0, 0, 0, 0] }, getRadius: duration },
    }));
  }

  layers.push(new ScatterplotLayer({
    id: "stations",
    data: inp.grid,
    pickable: lens === "station" || lens === "section",
    radiusUnits: "pixels",
    getPosition: dotTarget,
    getFillColor: dotColor,
    getRadius: dotRadius,
    stroked: true, lineWidthMinPixels: 0.5,
    getLineColor: (c: GridCell) => (c.grid_key === inp.selectedStation ? [255, 214, 10, 255] : [0, 0, 0, 90]),
    getLineWidth: (c: GridCell) => (c.grid_key === inp.selectedStation ? 3 : 1), lineWidthUnits: "pixels",
    updateTriggers: { getPosition: [lens, inp.res, inp.region.stationTo], getFillColor: [lens, inp.res, stat, inp.domain, inp.station, inp.hex, inp.region.stats, inp.section], getRadius: [lens, inp.station, inp.section], getLineColor: [inp.selectedStation], getLineWidth: [inp.selectedStation] },
    transitions: trans(),
  }));
  return layers;
}

// ── the map component ─────────────────────────────────────────────────────────
export function MapView(props: {
  layers: Layer[]; theme: "dark" | "light";
  view: [number, number, number];                    // the opening extent: lon · lat · zoom (the URL's `map=`, else the home view)
  onView?: (v: [number, number, number]) => void;    // every settled pan / zoom, so the URL — and a shared link — carries the extent
  getTooltip: (info: PickingInfo) => any; onClick?: (info: PickingInfo) => void; onFirstFrame?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const overlay = useRef<MapboxOverlay>();
  const cb = useRef(props);
  cb.current = props;
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!, style: STYLE[props.theme],
      center: [props.view[0], props.view[1]], zoom: props.view[2], attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // the whole-view figure (capture.ts) reads the canvas; deck.gl 9 preserves its own by default
    });
    m.on("moveend", () => { const c = m.getCenter(); cb.current.onView?.([c.lng, c.lat, m.getZoom()]); });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    // compact attribution starts collapsed to its (i); MapLibre opens it on load, so close it after the style lands
    m.once("load", () => el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const o = new MapboxOverlay({
      interleaved: false, layers: props.layers,
      getTooltip: (i) => cb.current.getTooltip(i),
      onClick: (i) => cb.current.onClick?.(i),
    });
    m.addControl(o);
    map.current = m; overlay.current = o;
    (window as any).__map = m; (window as any).__overlay = o; // spike: reachable from the console
    m.on("error", (e: any) => console.error("maplibre error", e?.error ?? e));
    m.once("load", () => requestAnimationFrame(() => cb.current.onFirstFrame?.()));
    return () => { m.remove(); };
  }, []);
  useEffect(() => { overlay.current?.setProps({ layers: props.layers }); }, [props.layers]);
  useEffect(() => { map.current?.setStyle(STYLE[props.theme]); }, [props.theme]);
  // a view set from outside (the home button) flies the map there; the map's own moves come back through onView and match already
  useEffect(() => {
    const m = map.current; if (!m) return;
    const c = m.getCenter(), [lng, lat, z] = props.view;
    if (Math.abs(c.lng - lng) > 1e-4 || Math.abs(c.lat - lat) > 1e-4 || Math.abs(m.getZoom() - z) > 0.01) m.easeTo({ center: [lng, lat], zoom: z, duration: 500 });
  }, [props.view]);
  return <div ref={el} className="map" />;
}
