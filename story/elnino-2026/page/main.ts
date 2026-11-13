// The 2026 warm water off Southern California in 30 seconds, from CalCOFI's November cruises.
//
// ONE CLOCK: every pixel is a pure function of t (seconds, 0 … 30). The page plays live (requestAnimationFrame sets t)
// and can be stepped (`?t=12.5`, or window.__story.setT(t) from capture.mjs), so a capture is deterministic.
//
// What it draws is the Explorer's own: the ramps (src/ramps.ts: cmocean thermal and balance), the interpolator and its
// isolines (src/contour.ts + contour.worker.ts: the thin-plate spline of the Contours lens, blank beyond 60 km of a
// station, land clipped), the sea floor (the GEBCO terrain tiles of src/basemap.ts) and the 3-D section recipe of
// src/curtain.tsx. The numbers are the release's (page/data/*.json, written by ../build_data.sh from the analysis
// database): the 0–10 m bin of each CTD cast, and the `climatology` table's November rows as the normal. Every number a
// caption shows is read from page/data/facts.json or cruises.json: none is typed here.
import { Deck, MapView, COORDINATE_SYSTEM, WebMercatorViewport, SimpleMeshLayer, ScatterplotLayer, PathLayer, TextLayer, BitmapLayer, GeoJsonLayer } from "deck.gl";
import { rampColors, rampCss } from "../../../src/ramps";
import { computeSurface, landMask, isolines, joinSegments, labelPoints, thinLabels, surfaceImage, cellToLonLat, type SurfaceGrid } from "../../../src/contour";
import { loadMosaic, mosaicBounds, flatBathy, floorMesh, type FloorMesh } from "./terrain";
import cruisesJson from "./data/cruises.json";
import stationsJson from "./data/stations.json";
import normalJson from "./data/normal.json";
import stripJson from "./data/strip.json";
import sectionJson from "./data/section.json";
import factsJson from "./data/facts.json";
import releaseJson from "./data/release.json";

// ── the data ─────────────────────────────────────────────────────────────────────────────────────────────────────
interface Cruise { cruise_key: string; year: number; date_min: string; date_max: string; ship: string; data_stage: string; role: string;
  n_stations: number; n_anom: number; mean_anom: number; n_anom_fp: number; mean_anom_fp: number }
interface Sta { cruise_key: string; site_key: string; line: number; station: number; lon: number; lat: number; t: number; temp: number; clim: number | null; anom: number | null }
interface Normal { site_key: string; line: number; station: number; lon: number; lat: number; clim: number; n_cruises: number }
interface StripCruise { cruise_key: string; year: number; month: number; date_median: string; november: boolean }
interface Sec { site_key: string; station: number; lon: number; lat: number; depth_bin: number; temp: number; clim: number | null; anom: number | null }
interface Facts { max_anom: number; max_anom_station: number; max_anom_bin: number; record_from: number; record_to: number; layer_temp: number; layer_depth: number;
  coast_n: number; coast_min: number; coast_max: number; offshore_n: number; offshore_min: number; offshore_max: number }

const cruises = cruisesJson as Cruise[], normal = normalJson as Normal[], strip = stripJson as StripCruise[], section = sectionJson as Sec[];
const facts = (factsJson as Facts[])[0];
const RELEASE = (releaseJson as { release: string }).release;
const byCruise = new Map<string, Sta[]>();
for (const s of stationsJson as Sta[]) (byCruise.get(s.cruise_key) ?? byCruise.set(s.cruise_key, []).get(s.cruise_key)!).push(s);
const stationsOf = (c: Cruise) => byCruise.get(c.cruise_key)!;
const baseline = cruises.filter((c) => c.role === "baseline"), first = cruises.find((c) => c.role === "first")!, series = cruises.filter((c) => c.role === "series");
const last = series[series.length - 1];
const normalBySite = new Map(normal.map((n) => [n.site_key, n]));

// ── the frame, the clock, the beats ──────────────────────────────────────────────────────────────────────────────
const W = 1920, H = 1080, DURATION = 30, FPS = 30;
const B1 = 0, B2 = 5.2, B3 = 8.2, B4 = 11.0, B5 = 15.0, B6 = 17.0, B7 = 24.0;
const B1_FIRST = 1.2, B1_STEP = (B2 - B1_FIRST) / (baseline.length - 1);   // the first cruise holds 1.2 s, the others 0.5 s
const B6_STEP = 0.55;                                                      // the last cruise then holds to B7
const beat6Start = (i: number) => B6 + i * B6_STEP;
/** beat 1: which baseline cruise is showing, and how far through its slot */
function beat1(t: number): { k: number; p: number } {
  if (t < B1_FIRST) return { k: 0, p: t / B1_FIRST };
  const k = Math.min(baseline.length - 1, 1 + Math.floor((t - B1_FIRST) / B1_STEP));
  return { k, p: (t - B1_FIRST - (k - 1) * B1_STEP) / B1_STEP };
}
const beat6 = (t: number) => Math.min(series.length - 1, Math.max(0, Math.floor((t - B6) / B6_STEP)));

/** the two scales of the whole film: never rescaled, so a redder frame is a warmer ocean */
const TEMP: [number, number] = [11, 26], ANOM: [number, number] = [-13, 13];
const MASK_KM = 60, EDGE = 5;
const SECTION_LINE = 93.3, SECTION_DEPTH = 200, EXAG = 300;   // the section's vertical exaggeration, the sea floor's too

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
type RGB = [number, number, number];
type RGBA = [number, number, number, number];
/** the interpolation of src/map.tsx colorScale(), over a ramp of src/ramps.ts */
function scale(domain: [number, number], rampId: string): (v: number) => RGB {
  const [lo, hi] = domain, R = rampColors(rampId);
  return (v) => {
    const x = clamp01((v - lo) / (hi - lo)) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x)), f = x - i;
    return [lerp(R[i][0], R[i + 1][0], f), lerp(R[i][1], R[i + 1][1], f), lerp(R[i][2], R[i + 1][2], f)];
  };
}
const tempColor = scale(TEMP, "thermal"), anomColor = scale(ANOM, "balance");
const INK: RGB = [233, 237, 243], MUTED: RGB = [159, 176, 200], NAVY: RGB = [8, 18, 32];
const rgba = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], Math.round(255 * clamp01(a))];
const css = (c: RGB) => `rgb(${c.map(Math.round).join(",")})`;
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;

// ── the section's stations, and metres from its middle ───────────────────────────────────────────────────────────
const secStations = [...new Map(section.map((s) => [s.station, s])).values()].sort((a, b) => a.station - b.station);
/** the section as its face is seen in beat 7 (from the south-east): offshore on the left, the coast on the right */
const faceStations = secStations.slice().reverse();
const lon0 = secStations.reduce((a, s) => a + s.lon, 0) / secStations.length, lat0 = secStations.reduce((a, s) => a + s.lat, 0) / secStations.length;
const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
const off = (lon: number, lat: number): [number, number] => [(lon - lon0) * kx, (lat - lat0) * ky];
const stationAt = (n: number) => secStations.find((s) => s.station === n) ?? secStations[1];

// ── the cameras ──────────────────────────────────────────────────────────────────────────────────────────────────
interface Cam { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number }
const q = new URLSearchParams(location.search);
// bird's-eye: the standard pattern in the frame's right two thirds, clear of the column and the strip
const fit = new WebMercatorViewport({ width: W, height: H }).fitBounds([[-124.75, 29.45], [-116.85, 35.45]], { padding: { left: 720, right: 20, top: 16, bottom: 250 } });
const CAM2D: Cam = { longitude: fit.longitude, latitude: fit.latitude, zoom: fit.zoom, pitch: 0, bearing: 0 };
// oblique: the section's face from its south side, the coast on the right as on the map, close and low enough that the
// warm core at the inshore end is the largest thing in the frame while all seven stations stay in it. (Turned further
// toward the west the inshore end would be nearer still, but San Diego's own coast then stands in front of it.)
// Stated as zoom, pitch, bearing and WHERE ON SCREEN the section's middle sits; the centre follows
// (`?cam3=zoom,pitch,bearing,x,y` to try another).
const camQ = q.get("cam3")?.split(",").map(Number);
const CAM3D_SPEC = camQ?.length === 5 ? { zoom: camQ[0], pitch: camQ[1], bearing: camQ[2], at: [camQ[3], camQ[4]] } : { zoom: 8.84, pitch: 66, bearing: -32, at: [1270, 452] };
const viewport = (c: Cam) => new WebMercatorViewport({ width: W, height: H, ...c });
const PIVOT: [number, number] = [lon0, lat0];
/** the camera with this zoom, pitch and bearing that puts the section's middle at a pixel */
function camWithPivotAt(zoom: number, pitch: number, bearing: number, px: number[]): Cam {
  const c = viewport({ longitude: PIVOT[0], latitude: PIVOT[1], zoom, pitch, bearing }).panByPosition(PIVOT, px);
  return { longitude: c.longitude as number, latitude: c.latitude as number, zoom, pitch, bearing };
}
const CAM3D: Cam = camWithPivotAt(CAM3D_SPEC.zoom, CAM3D_SPEC.pitch, CAM3D_SPEC.bearing, CAM3D_SPEC.at);
// the move between them carries the section's middle along a straight line on screen while zoom, pitch and bearing ease,
// so the section never leaves the frame (interpolating the centre itself let the zoom outrun it: the line ran off the
// right edge half-way)
const P2D = viewport(CAM2D).project(PIVOT), P3D = CAM3D_SPEC.at;
function camAt(t: number): Cam {
  const e = ease(ramp(t, B7 + 0.2, B7 + 2.7));
  if (e <= 0) return CAM2D;
  if (e >= 1) return CAM3D;
  return camWithPivotAt(lerp(CAM2D.zoom, CAM3D.zoom, e), lerp(CAM2D.pitch, CAM3D.pitch, e), lerp(CAM2D.bearing, CAM3D.bearing, e), [lerp(P2D[0], P3D[0], e), lerp(P2D[1], P3D[1], e)]);
}
const PX_PER_DEG = (512 * 2 ** CAM2D.zoom) / 360;   // bird's-eye pixels per degree of longitude
/** a lon/lat moved by screen pixels under the bird's-eye camera (the ring of beat 2) */
const nudge = (lon: number, lat: number, dx: number, dy: number): [number, number] => [lon + dx / PX_PER_DEG, lat - (dy * Math.cos((lat * Math.PI) / 180)) / PX_PER_DEG];

// ── the surfaces: the Contours lens's spline, once per map ───────────────────────────────────────────────────────
type Bounds = [number, number, number, number];
interface Surf { canvas: HTMLCanvasElement; bounds: Bounds; coarse?: { canvas: HTMLCanvasElement; bounds: Bounds };
  lines: { path: [number, number][]; level: number }[]; labels: { position: [number, number]; text: string; angle: number }[]; n: number;
  grid: SurfaceGrid; behind?: HTMLCanvasElement; front?: HTMLCanvasElement }
const surfs = new Map<string, Surf>();
async function buildSurf(key: string, pts: { lon: number; lat: number; z: number }[], kind: "temp" | "anom", withCoarse: boolean) {
  const color = kind === "temp" ? tempColor : anomColor;
  const paint = (x: number): RGBA => [...color(x), 255];
  const one = async (cellDeg: number) => {
    const s = await computeSurface(pts, "tps", { cellDeg, maskKm: MASK_KM });
    const land = await landMask(s.grid);
    for (let o = 0; o < s.values.length; o++) if (land[o]) s.values[o] = NaN;
    // the app blanks a surface beyond 60 km of a station and fades its last 15 km (contour.ts EDGE_KM). The offshore
    // stations are 74 km apart, so the middle of four is 52 km from each: inside the surface, but inside that fade
    // too. The 60 km rule stays; the fade is the last EDGE km (surfaceImage() reads (maskKm − dist) / 15).
    for (let o = 0; o < s.dist.length; o++) s.dist[o] = MASK_KM - ((MASK_KM - s.dist[o]) * 15) / EDGE;
    return s;
  };
  const s = await one(0.04), g = s.grid;
  const levels = kind === "temp" ? Array.from({ length: 15 }, (_, i) => 12 + i) : Array.from({ length: 25 }, (_, i) => i - 12).filter((v) => v !== 0);
  const lines: Surf["lines"] = [], labels: (Surf["labels"][number] & { x: number; y: number })[] = [];
  for (const iso of isolines(s.values, g.nx, g.ny, levels)) {
    const polys = joinSegments(iso.segs).filter((p) => p.length > 10);
    for (const p of polys) lines.push({ level: iso.level, path: p.map(([x, y]) => cellToLonLat(g, x, y)) });   // isolines run through cell CENTRES
    const text = kind === "temp" ? `${iso.level}°` : signed(iso.level, 0);
    if (kind === "anom" || iso.level % 2 === 0)
      for (const p of labelPoints(polys, 80)) { const position = cellToLonLat(g, p.x, p.y); labels.push({ position, text, angle: p.angle, x: position[0] * PX_PER_DEG, y: position[1] * PX_PER_DEG * 1.19 }); }
  }
  const surf: Surf = { canvas: surfaceImage(s.values, g.nx, g.ny, paint, 255, s.dist, MASK_KM), bounds: [g.lon0, g.latS, g.lon1, g.latN], lines, n: pts.length, grid: g,
    labels: thinLabels(labels, 190) };
  if (withCoarse) {   // the same spline on a coarse regular grid, drawn as its cells: "interpolated to the grid" made visible
    const c = await one(0.28);
    surf.coarse = { canvas: surfaceImage(c.values, c.grid.nx, c.grid.ny, paint, 255, c.dist, MASK_KM), bounds: [c.grid.lon0, c.grid.latS, c.grid.lon1, c.grid.latN] };
  }
  surfs.set(key, surf);
}

/** the block diagram of beat 7: the surface map split along the section's line into the part BEHIND the section (kept, as
 *  the sea surface the section hangs from) and the part in FRONT of it (which leaves, so the section's face is seen).
 *  Cut on a canvas four times the grid, along the stations' own polyline, so the edge is a line and not a staircase. */
function splitAlongLine(f: Surf) {
  const g = f.grid, K = 4, R = Math.PI / 180, merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * R) / 2));
  const px = (lon: number, lat: number): [number, number] => [((lon - g.lon0) / g.cellDeg) * K, ((merc(g.latN) - merc(lat)) / (g.cellDeg * R)) * K];
  const P = secStations.map((s) => px(s.lon, s.lat)), n = P.length, FAR = 6000;
  const ext = (a: [number, number], b: [number, number]): [number, number] => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); return [a[0] + ((a[0] - b[0]) / d) * FAR, a[1] + ((a[1] - b[1]) / d) * FAR]; };
  const line = [ext(P[0], P[1]), ...P, ext(P[n - 1], P[n - 2])];
  const mk = (north: boolean) => {
    const cv = document.createElement("canvas"); cv.width = g.nx * K; cv.height = g.ny * K;
    const ctx = cv.getContext("2d")!;
    ctx.beginPath(); line.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    const y = north ? -FAR : FAR + cv.height;   // the other lines are north of 93.3 (up the canvas): that side is "behind"
    ctx.lineTo(line[line.length - 1][0], y); ctx.lineTo(line[0][0], y); ctx.closePath(); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(f.canvas, 0, 0, cv.width, cv.height);
    return cv;
  };
  f.behind = mk(true); f.front = mk(false);
}

// ── the section's texture: stations across, depth down, the departure from the November normal ───────────────────
/** the curtain image for line 93.3, as its face is seen: bilinear between stations and between the 10 m bins that were
 *  measured, never below a cast's deepest bin except toward a deeper neighbour (the sea floor mesh covers what lies
 *  under the shelf). Isolines every 4 °C; the 4 and the 8 carry their value, the 12 is marked by the record's own label. */
function sectionTexture(): HTMLCanvasElement {
  const N = faceStations.length, GX = 40, nx = (N - 1) * GX + 1, ny = SECTION_DEPTH / 2 + 1;   // 2 m rows
  const col = faceStations.map((st) => section.filter((c) => c.station === st.station && c.anom != null).sort((a, b) => a.depth_bin - b.depth_bin));
  const at = (i: number, depth: number): number | null => {   // station i at a depth: linear between bin centres
    const c = col[i]; if (!c.length) return null;
    const zc = (k: number) => c[k].depth_bin + 5;
    if (depth <= zc(0)) return c[0].anom!;
    if (depth > c[c.length - 1].depth_bin + 10) return null;
    for (let k = 1; k < c.length; k++) if (depth <= zc(k)) return lerp(c[k - 1].anom!, c[k].anom!, (depth - zc(k - 1)) / (zc(k) - zc(k - 1)));
    return c[c.length - 1].anom!;
  };
  const v = new Float32Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) for (let x = 0; x < nx; x++) {
    const i = Math.min(N - 2, Math.floor(x / GX)), f = (x - i * GX) / GX, a = at(i, j * 2), b = at(i + 1, j * 2);
    v[j * nx + x] = a != null && b != null ? lerp(a, b, f) : a != null ? (f <= 0.5 ? a : NaN) : b != null ? (f >= 0.5 ? b : NaN) : NaN;
  }
  const small = document.createElement("canvas"); small.width = nx; small.height = ny;
  const sc = small.getContext("2d")!, img = sc.createImageData(nx, ny);
  for (let o = 0; o < nx * ny; o++) if (Number.isFinite(v[o])) { const c = anomColor(v[o]); img.data[o * 4] = c[0]; img.data[o * 4 + 1] = c[1]; img.data[o * 4 + 2] = c[2]; img.data[o * 4 + 3] = 255; }
  sc.putImageData(img, 0, 0);
  const K = 6, cv = document.createElement("canvas"); cv.width = nx * K; cv.height = ny * K;
  const ctx = cv.getContext("2d")!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(small, 0, 0, cv.width, cv.height);
  ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.font = `700 60px "Source Sans 3", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const iso of isolines(v, nx, ny, [4, 8, 12])) {
    const polys = joinSegments(iso.segs).filter((p) => p.length > 8);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    for (const p of polys) { ctx.beginPath(); p.forEach(([x, y], k) => (k ? ctx.lineTo((x + 0.5) * K, (y + 0.5) * K) : ctx.moveTo((x + 0.5) * K, (y + 0.5) * K))); ctx.stroke(); }
    const longest = polys.sort((a, b) => b.length - a.length)[0];
    if (longest && iso.level < 12) {
      const [x, y] = longest[Math.floor(longest.length * 0.42)];
      const tx = (x + 0.5) * K, ty = (y + 0.5) * K, text = `+${iso.level}`, w = ctx.measureText(text).width + 26;
      ctx.fillStyle = css(anomColor(iso.level)); ctx.fillRect(tx - w / 2, ty - 36, w, 72);
      ctx.fillStyle = "#fff"; ctx.fillText(text, tx, ty + 3);
    }
  }
  return cv;
}

// ── the scene ────────────────────────────────────────────────────────────────────────────────────────────────────
const el = document.getElementById("map")!;
const deck = new Deck({
  parent: el as HTMLDivElement, width: W, height: H, useDevicePixels: 1,
  views: new MapView({ repeat: false, controller: false }),
  viewState: { ...CAM2D, maxPitch: 85 },
  deviceProps: { type: "webgl", webgl: { preserveDrawingBuffer: true } },
  layers: [],
} as any);

const FONT = `"Source Sans 3", system-ui, sans-serif`;
const TEXT = { fontFamily: FONT, fontWeight: 700, fontSettings: { sdf: true, fontSize: 72, buffer: 10, radius: 14 }, outlineWidth: 3, outlineColor: [8, 18, 32, 255] as RGBA, sizeUnits: "pixels" as const, characterSet: "auto" as const };
const SECTION_PLACE = "San Diego";
const PLACES = [
  { name: "Los Angeles", lon: -118.24, lat: 34.05 }, { name: "San Diego", lon: -117.16, lat: 32.72 },
  { name: "Santa Barbara", lon: -119.7, lat: 34.42 }, { name: "Ensenada", lon: -116.6, lat: 31.86 },
];
// everything that lies ON the sea surface is drawn in order, never depth-tested: two coplanar quads under a tilted camera
// fight, and a billboard label standing on the land's plane was cut in half by it
const FLAT = { parameters: { depthWriteEnabled: false, depthCompare: "always" } as any };
const M3D = { coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0] as [number, number, number] };

let land: any = null, bathy: { canvas: HTMLCanvasElement; bounds: Bounds } | null = null;
let floor: FloorMesh | null = null, curtainTex: HTMLCanvasElement | null = null;

/** the ship's track through a cruise's stations, drawn to a fraction p of its length; returns the path and how many
 *  stations it has reached (fractional: the next one is on its way) */
function trackTo(st: Sta[], p: number): { path: [number, number][]; reached: number } {
  const f = clamp01(p) * (st.length - 1), k = Math.floor(f), g = f - k;
  const path = st.slice(0, k + 1).map((s) => [s.lon, s.lat] as [number, number]);
  if (k < st.length - 1 && g > 0) path.push([lerp(st[k].lon, st[k + 1].lon, g), lerp(st[k].lat, st[k + 1].lat, g)]);
  return { path, reached: f };
}

interface Dot { lon: number; lat: number; r: number; fill: RGBA; line: RGBA }
const noValue = (a: number) => ({ fill: rgba(NAVY, 0.0), line: rgba(MUTED, 0.9 * a) });   // sampled, no normal there: a ring, never a colour
interface Shown { key: string; opacity: number; coarse?: number; lines?: number; split?: number }

function layersAt(t: number) {
  const L: any[] = [];
  const in7 = t >= B7, u7 = t - B7;
  const flat = 1 - ease(ramp(u7, 0.3, 1.6));           // the bird's-eye layers leave as the camera tilts
  const dots: Dot[] = [], shown: Shown[] = [];
  let track: { path: [number, number][]; opacity: number } | null = null, ship: [number, number] | null = null;

  // ── the 3-D stage, under everything flat ──
  if (in7 && floor) {
    L.push(new SimpleMeshLayer({ id: "floor3d", ...M3D, data: [0], getPosition: () => [0, 0, 0],
      mesh: { attributes: { positions: { value: floor.positions, size: 3 }, texCoords: { value: floor.texCoords, size: 2 }, normals: { value: floor.normals, size: 3 } }, indices: { value: floor.indices, size: 1 } } as any,
      texture: floor.texture, getColor: [255, 255, 255, 255], material: { ambient: 0.55, diffuse: 0.5, shininess: 4, specularColor: [10, 14, 20] } }));
    const d = ease(ramp(u7, 1.4, 2.9)), N = faceStations.length;
    if (d > 0 && curtainTex) {
      const pos = new Float32Array(N * 2 * 3), tex = new Float32Array(N * 2 * 2), idx = new Uint32Array((N - 1) * 6);
      faceStations.forEach((s, i) => {
        const [x, y] = off(s.lon, s.lat), uu = i / (N - 1);
        pos.set([x, y, 0], i * 3); tex.set([uu, 0], i * 2);
        pos.set([x, y, -SECTION_DEPTH * EXAG * d], (N + i) * 3); tex.set([uu, d], (N + i) * 2);
      });
      let k = 0; for (let i = 0; i < N - 1; i++) { const a = i, b = i + 1, c = N + i, e = N + i + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = e; }
      L.push(new SimpleMeshLayer({ id: "curtain", ...M3D, data: [0], getPosition: () => [0, 0, 0],
        mesh: { attributes: { positions: { value: pos, size: 3 }, texCoords: { value: tex, size: 2 } }, indices: { value: idx, size: 1 } } as any,
        texture: curtainTex, getColor: [255, 255, 255, 255], material: false, parameters: { cullMode: "none" } as any }));
      const top = faceStations.map((s) => [...off(s.lon, s.lat), 0] as [number, number, number]);
      const frame = [...top, ...top.slice().reverse().map(([x, y]) => [x, y, -SECTION_DEPTH * EXAG * d] as [number, number, number]), top[0]];
      L.push(new PathLayer({ id: "curtain-frame", ...M3D, data: [frame], getPath: (p: any) => p, widthUnits: "pixels", getWidth: 3, getColor: [255, 255, 255, 190] }));
      // depth marks just inside the offshore edge (outside it they ran into the column's words), a tick on the edge for each
      const edge = faceStations[0], [ex, ey] = off(edge.lon, edge.lat), next = faceStations[1], [nx2, ny2] = off(next.lon, next.lat);
      const marks = [50, 100, 150].filter((z) => z <= SECTION_DEPTH * d - 8), tk = 0.035;
      L.push(new PathLayer({ id: "curtain-ticks", ...M3D, ...FLAT, data: marks, getPath: (z: number) => [[ex, ey, -z * EXAG], [ex + (nx2 - ex) * tk, ey + (ny2 - ey) * tk, -z * EXAG]], widthUnits: "pixels", getWidth: 3, getColor: [255, 255, 255, 230] }));
      L.push(new TextLayer({ id: "curtain-depths", ...M3D, ...TEXT, ...FLAT, data: marks,
        getPosition: (z: number) => [ex + (nx2 - ex) * tk, ey + (ny2 - ey) * tk, -z * EXAG], getText: (z: number) => `${z} m`, getSize: 38, getColor: rgba(INK, 1), getTextAnchor: "start", getAlignmentBaseline: "center", getPixelOffset: [10, 0] }));
    }
  }

  // ── the sea floor from above ──
  if (bathy && flat > 0) L.push(new BitmapLayer({ id: "bathy", ...FLAT, image: bathy.canvas, bounds: bathy.bounds, opacity: flat }));

  // ── which surface, which dots, which track: the beats ──
  if (t < B2) {                                                        // 1 · the baseline's November cruises, one after another
    const { k, p } = beat1(t), st = stationsOf(baseline[k]);
    const tr = trackTo(st, k === 0 ? ramp(p, 0.06, 0.7) : ramp(p, 0.04, 0.72));
    track = { path: tr.path, opacity: 1 }; ship = tr.path[tr.path.length - 1];
    // the first cruise is on screen from the first frame (its track then draws through it); the others arrive with the ship
    st.forEach((s, i) => { const a = k === 0 ? 1 : ramp(tr.reached, i - 0.4, i + 0.1); if (a > 0) dots.push({ lon: s.lon, lat: s.lat, r: 13 * (0.6 + 0.4 * a), fill: rgba(tempColor(s.temp), a), line: rgba(NAVY, 0.9 * a) }); });
  } else if (t < B3) {                                                 // 2 · all of them together → the average at each station
    const u = t - B2, conv = ease(ramp(u, 1.1, 2.0)), ring = 16 * (1 - conv), a = ramp(u, 0, 0.3);
    baseline.forEach((c, k) => {
      const ang = (2 * Math.PI * k) / baseline.length - Math.PI / 2;
      for (const s of stationsOf(c)) {
        const n = normalBySite.get(s.site_key), keep = n ? 1 - ramp(conv, 0.75, 1) : 1 - ramp(conv, 0, 0.6);
        if (keep <= 0) continue;
        const [lon, lat] = nudge(n?.lon ?? s.lon, n?.lat ?? s.lat, Math.cos(ang) * ring, Math.sin(ang) * ring);
        dots.push({ lon, lat, r: lerp(6, 4, conv), fill: rgba(tempColor(s.temp), a * keep), line: rgba(NAVY, 0.7 * a * keep) });
      }
    });
    const grow = ease(ramp(u, 1.5, 2.2));
    if (grow > 0) for (const n of normal) dots.push({ lon: n.lon, lat: n.lat, r: 13 * grow, fill: rgba(tempColor(n.clim), grow), line: rgba(NAVY, 0.9 * grow) });
  } else if (t < B4) {                                                 // 3 · the averages, interpolated to the regular grid
    const u = t - B3, fine = ease(ramp(u, 1.35, 2.0));
    shown.push({ key: "normal", opacity: fine, coarse: ease(ramp(u, 0.1, 0.8)) * (1 - fine), lines: ramp(u, 1.7, 2.2) });
    const r = lerp(13, 6.5, ease(ramp(u, 0.2, 1.1)));
    for (const n of normal) dots.push({ lon: n.lon, lat: n.lat, r, fill: rgba(tempColor(n.clim), 1), line: rgba(NAVY, 0.9) });
  } else if (t < B5) {                                                 // 4 · the next year: its track, its samples, its grid
    const u = t - B4, out = 1 - ramp(u, 0, 0.45), st = stationsOf(first);
    if (out > 0) { shown.push({ key: "normal", opacity: out, lines: out }); for (const n of normal) dots.push({ lon: n.lon, lat: n.lat, r: 6.5, fill: rgba(tempColor(n.clim), out), line: rgba(NAVY, 0.9 * out) }); }
    const tr = trackTo(st, ramp(u, 0.5, 2.2)), fine = ease(ramp(u, 2.95, 3.5));
    if (u >= 0.5) { track = { path: tr.path, opacity: 1 - ramp(u, 2.4, 3.2) * 0.75 }; if (u < 2.3) ship = tr.path[tr.path.length - 1]; }
    shown.push({ key: "first-temp", opacity: fine, coarse: ease(ramp(u, 2.3, 2.9)) * (1 - fine), lines: ramp(u, 3.2, 3.7) });
    const r = lerp(13, 6.5, ease(ramp(u, 2.4, 3.2)));
    st.forEach((s, i) => { const a = u < 0.5 ? 0 : ramp(tr.reached, i - 0.4, i + 0.1); if (a > 0) dots.push({ lon: s.lon, lat: s.lat, r: r * (0.6 + 0.4 * a), fill: rgba(tempColor(s.temp), a), line: rgba(NAVY, 0.9 * a) }); });
  } else if (t < B6) {                                                 // 5 · that year's departure from the normal
    const u = t - B5, x = ease(ramp(u, 0.25, 1.05));
    shown.push({ key: "first-temp", opacity: 1 - x, lines: 1 - x }, { key: "first-anom", opacity: x, lines: x });
    for (const s of stationsOf(first)) {
      if (s.anom == null) { dots.push({ lon: s.lon, lat: s.lat, r: 6.5, fill: rgba(tempColor(s.temp), 1 - x), line: x < 0.5 ? rgba(NAVY, 0.9) : rgba(MUTED, 0.9) }); continue; }
      const a = tempColor(s.temp), b = anomColor(s.anom);
      dots.push({ lon: s.lon, lat: s.lat, r: 6.5, fill: rgba([lerp(a[0], b[0], x), lerp(a[1], b[1], x), lerp(a[2], b[2], x)], 1), line: rgba(NAVY, 0.9) });
    }
  } else {                                                             // 6 · each November since; 7 · the last one, under the surface
    const i = beat6(t), x = ramp(t - beat6Start(i), 0, 0.18);
    const cur = series[i], prev = i ? `anom-${series[i - 1].cruise_key}` : "first-anom";
    if (x < 1) shown.push({ key: prev, opacity: 1 - x, lines: 1 - x });
    shown.push(in7 ? { key: `anom-${cur.cruise_key}`, opacity: 1, lines: flat, split: 1 - flat } : { key: `anom-${cur.cruise_key}`, opacity: x, lines: x });
    for (const s of stationsOf(cur)) {
      const onLine = in7 && s.line === SECTION_LINE, a = in7 ? (onLine ? 1 : lerp(1, 0.35, 1 - flat)) : 1;
      const style = s.anom == null ? noValue(a) : { fill: rgba(anomColor(s.anom), a), line: rgba(onLine ? INK : NAVY, 0.9 * a) };
      dots.push({ lon: s.lon, lat: s.lat, r: onLine ? lerp(6.5, 9, 1 - flat) : 6.5, ...style });
    }
  }

  // ── the surfaces (each its own layer: only its opacity changes from frame to frame) ──
  for (const s of shown) {
    const f = surfs.get(s.key); if (!f) continue;
    if (s.coarse && f.coarse && s.coarse > 0.003) L.push(new BitmapLayer({ id: `coarse-${s.key}`, ...FLAT, image: f.coarse.canvas, bounds: f.coarse.bounds, opacity: s.coarse,
      textureParameters: { minFilter: "nearest", magFilter: "nearest" } as any }));
    if (s.split != null && f.behind && f.front) {   // beat 7: the half behind the section stays as the sea surface, the half in front leaves
      L.push(new BitmapLayer({ id: `behind-${s.key}`, ...FLAT, image: f.behind, bounds: f.bounds, opacity: s.opacity }));
      if (s.split < 0.997) L.push(new BitmapLayer({ id: `front-${s.key}`, ...FLAT, image: f.front, bounds: f.bounds, opacity: s.opacity * (1 - s.split) }));
    } else if (s.opacity > 0.003) L.push(new BitmapLayer({ id: `surf-${s.key}`, ...FLAT, image: f.canvas, bounds: f.bounds, opacity: s.opacity }));
  }
  // ── the land, over the surfaces and the sea floor ──
  if (land) L.push(new GeoJsonLayer({ id: "land", data: land, stroked: true, filled: true, getFillColor: [36, 50, 74, 255], getLineColor: [159, 176, 200, 210], lineWidthUnits: "pixels", getLineWidth: 2 }));
  // ── the isolines: every degree, the even ones heavier, their values large enough for a phone ──
  for (const s of shown) {
    const f = surfs.get(s.key), a = s.lines ?? 0; if (!f || a <= 0.003) continue;
    const anom = s.key.includes("anom");
    L.push(new PathLayer({ id: `iso-${s.key}`, ...FLAT, data: f.lines, getPath: (d: any) => d.path, widthUnits: "pixels", opacity: a,
      getWidth: (d: any) => (d.level % 2 === 0 ? 4 : 2.2),
      getColor: (d: any) => (anom ? (d.level > 0 ? [112, 10, 30, 255] : [20, 48, 122, 255]) : [8, 18, 32, 205]) as RGBA, jointRounded: true, capRounded: true }));
    L.push(new TextLayer({ id: `isolab-${s.key}`, ...TEXT, ...FLAT, data: f.labels, getPosition: (d: any) => d.position, getText: (d: any) => d.text, getSize: 40,   // upright: a value turned along a steep isoline did not read
      getColor: [255, 255, 255, 255], opacity: a, getTextAnchor: "middle", getAlignmentBaseline: "center" }));
  }
  // ── the grid itself, faintly: every station that has a November normal ──
  const gridA = (t < B2 ? 0.55 : t < B3 ? 0.55 * (1 - ramp(t - B2, 1.5, 2.2)) : 0) + (t >= B4 && t < B5 ? 0.45 * ramp(t - B4, 0, 0.5) * (1 - ramp(t - B4, 2.4, 3.2)) : 0);
  if (gridA > 0.01) L.push(new ScatterplotLayer({ id: "grid", ...FLAT, data: normal, getPosition: (n: Normal) => [n.lon, n.lat], radiusUnits: "pixels", getRadius: 3.2, getFillColor: rgba(MUTED, 1), opacity: gridA }));
  // the places: four names from above; under the tilted camera only the one the section belongs to, larger
  const placeProps = { ...FLAT, getPosition: (p: any) => [p.lon, p.lat] as [number, number] };
  const others = in7 ? PLACES.filter((p) => p.name !== SECTION_PLACE) : PLACES, othersA = in7 ? flat : 1;
  if (othersA > 0.01) {
    L.push(new ScatterplotLayer({ id: "places-dot", ...placeProps, data: others, radiusUnits: "pixels", getRadius: 4.5, getFillColor: rgba(INK, 0.9), opacity: othersA, billboard: true }));
    L.push(new TextLayer({ id: "places", ...TEXT, ...placeProps, fontWeight: 600, data: others, getText: (p: any) => p.name, getSize: 32, getColor: rgba(INK, 0.95), opacity: othersA,
      getTextAnchor: "start", getAlignmentBaseline: "center", getPixelOffset: [13, 0] }));
  }
  if (in7) {
    const sd = PLACES.filter((p) => p.name === SECTION_PLACE);
    L.push(new ScatterplotLayer({ id: "place-dot-3d", ...placeProps, data: sd, radiusUnits: "pixels", getRadius: 6, getFillColor: rgba(INK, 0.95), billboard: true }));
    L.push(new TextLayer({ id: "place-3d", ...TEXT, ...placeProps, data: sd, getText: (p: any) => p.name, getSize: lerp(32, 46, 1 - flat), getColor: rgba(INK, 1),
      getTextAnchor: "middle", getAlignmentBaseline: "top", getPixelOffset: [0, 16] }));
  }
  if (track && track.path.length > 1) L.push(new PathLayer({ id: "track", ...FLAT, data: [track], getPath: (d: any) => d.path, widthUnits: "pixels", getWidth: 3, getColor: rgba(INK, 0.85), opacity: track.opacity, jointRounded: true, capRounded: true }));
  if (in7) L.push(new PathLayer({ id: "line-3d", ...FLAT, data: [secStations.map((s) => [s.lon, s.lat])], getPath: (d: any) => d, widthUnits: "pixels", getWidth: 3, getColor: rgba(INK, 0.9 * ease(ramp(u7, 0.6, 1.6))) }));
  L.push(new ScatterplotLayer({ id: "dots", ...FLAT, data: dots, getPosition: (d: Dot) => [d.lon, d.lat], radiusUnits: "pixels", getRadius: (d: Dot) => d.r, getFillColor: (d: Dot) => d.fill,
    stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.6, getLineColor: (d: Dot) => d.line, billboard: true }));
  if (ship) L.push(new ScatterplotLayer({ id: "ship", ...FLAT, data: [ship], getPosition: (d: any) => d, radiusUnits: "pixels", getRadius: 7, getFillColor: [255, 255, 255, 255], stroked: true, lineWidthUnits: "pixels", getLineWidth: 5, getLineColor: [255, 255, 255, 90] }));
  return L;
}

// ── the words, the legends, the strip (DOM over the canvas) ──────────────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;
function legend(id: string, rampId: string, domain: [number, number], ticks: number[], fmt: (v: number) => string, unit: string) {
  const root = $(id); (root.querySelector(".legend-bar") as HTMLElement).style.background = rampCss(rampId);
  const tk = root.querySelector(".legend-ticks")!;
  tk.innerHTML = ticks.map((v) => `<span style="left:${((v - domain[0]) / (domain[1] - domain[0])) * 100}%">${fmt(v)}</span>`).join("") + `<span class="unit" style="left:100%;margin-left:14px">${unit}</span>`;
}
legend("legend-temp", "thermal", TEMP, [12, 16, 20, 24], (v) => String(v), "°C");
legend("legend-anom", "balance", ANOM, [-12, -6, 0, 6, 12], (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0"), "°C");
$("credit").innerHTML = `<b>CalCOFI</b> · calcofi.io<br>CTD casts · release ${RELEASE}`;

// the strip: which cruise, out of all of them. Every November cruise is a dot on the years' line (the other months' CTD
// cruises a faint texture behind it), the one on screen is the yellow one with its year under it, and each cruise the
// film has played since the baseline keeps a bar: its mean surface departure over the stations the 2026 cruise occupied
// (cruises.json mean_anom_fp: the same stations every year).
const SX0 = 120, SX1 = 1800, SY = 140, Y0 = 1993, Y1 = 2027.3, BAR = 22, BAR_W = 34;
const decYear = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return y + (m - 1) / 12 + (dd - 1) / 365; };
const sx = (yr: number) => SX0 + ((yr - Y0) / (Y1 - Y0)) * (SX1 - SX0);
const stripX = new Map(strip.map((c) => [c.cruise_key, sx(decYear(c.date_median))]));
const NOV = strip.filter((c) => c.november);
const novYears = new Set(NOV.map((c) => c.year));
/** the years since the baseline with no November cruise: read off the data, never listed */
const MISSING = Array.from({ length: last.year - first.year }, (_, i) => first.year + i).filter((y) => !novYears.has(y));
const NOV_X = sx(2014.87) - sx(2014);   // where in a year's slot a November cruise falls
const NOTE_X = MISSING.length ? sx((MISSING[0] + MISSING[MISSING.length - 1]) / 2) + NOV_X : -1e6, NOTE_HALF = 140;   // the empty slots' label: its middle and half its width
function stripSvg(t: number): string {
  const s: string[] = [], inBase = t >= B2 && t < B4;
  s.push(`<rect x="${sx(1993)}" y="${SY - 58}" width="${sx(2014) - sx(1993)}" height="74" rx="8" fill="rgba(159,176,200,${inBase ? 0.34 : 0.13})"/>`);
  s.push(`<text x="${sx(1993) + 18}" y="${SY - 20}" font-size="36" font-weight="600" style="fill:rgba(233,237,243,${inBase ? 1 : 0.78})">the normal: 1993–2013</text>`);
  s.push(`<line x1="${SX0 - 24}" y1="${SY}" x2="${SX1 + 24}" y2="${SY}" stroke="rgba(159,176,200,0.65)" stroke-width="2.5"/>`);
  for (const c of strip) if (!c.november) { const x = stripX.get(c.cruise_key)!; s.push(`<line x1="${x}" y1="${SY - 5}" x2="${x}" y2="${SY + 5}" stroke="rgba(159,176,200,0.28)" stroke-width="2"/>`); }
  // which cruise is showing, and which have played
  let cur: Cruise | null = null; const played: Cruise[] = [];
  if (t < B2) cur = baseline[beat1(t).k];
  if (t >= B4 && t < B6) cur = first;
  if (t >= B5) played.push(first);
  if (t >= B6) { const i = beat6(t); cur = series[i]; played.push(...series.slice(0, i + 1)); }
  for (const c of played) {
    const x = stripX.get(c.cruise_key)!, grow = c === first ? ease(ramp(t - B5, 0.4, 1.1)) : ease(ramp(t - beat6Start(series.indexOf(c)), 0, 0.2));
    const h = c.mean_anom_fp * BAR * grow, on = c === cur, lx = Math.min(x, SX1 - 60);
    // the value over the bar on screen: above its bar, above a neighbouring empty slot, and above the slots' own label
    const ly = Math.min(SY - h, SY - 32) - 16 - (t >= B6 && lx + 95 > NOTE_X - NOTE_HALF && lx - 95 < NOTE_X + NOTE_HALF ? 34 : 0);
    s.push(`<rect x="${x - BAR_W / 2}" y="${h >= 0 ? SY - h : SY}" width="${BAR_W}" height="${Math.max(2, Math.abs(h))}" fill="${css(anomColor(c.mean_anom_fp))}" stroke="${on ? "#ffcd00" : "rgba(233,237,243,0.85)"}" stroke-width="${on ? 4 : 1.5}"/>`);
    if (on) s.push(`<text x="${lx}" y="${ly}" font-size="46" font-weight="700" text-anchor="middle" style="fill:#ffffff" paint-order="stroke" stroke="#0f1a2e" stroke-width="8">${signed(c.mean_anom_fp)} °C</text>`);
  }
  if (t >= B5) s.push(`<text x="${sx(2014) - 70}" y="${SY - 72}" font-size="32" text-anchor="end" opacity="${ramp(t - B5, 0.4, 1.1)}">bars: surface, at 2026's stations</text>`);
  // the years with no November cruise: two empty slots
  if (t >= B6) {
    for (const y of MISSING) s.push(`<rect x="${sx(y) + NOV_X - BAR_W / 2}" y="${SY - 30}" width="${BAR_W}" height="30" fill="none" stroke="rgba(159,176,200,0.95)" stroke-width="2.5" stroke-dasharray="7 5"/>`);
    if (MISSING.length) s.push(`<text x="${NOTE_X}" y="${SY - 42}" font-size="30" text-anchor="middle">no November cruise</text>`);
  }
  for (const c of NOV) {
    const x = stripX.get(c.cruise_key)!, on = c.cruise_key === cur?.cruise_key, lit = inBase && c.year <= 2013;
    s.push(`<circle cx="${x}" cy="${SY}" r="${on ? 14 : 8}" fill="${on ? "#ffcd00" : lit ? "#ffffff" : "rgba(233,237,243,0.8)"}" stroke="#0f1a2e" stroke-width="2.5"/>`);
    if (on) s.push(`<path d="M${x - 16} ${SY + 34} L${x + 16} ${SY + 34} L${x} ${SY + 16} Z" fill="#ffcd00"/>`);
  }
  // few, large year labels; the current cruise's own year in yellow (a decade label beside it steps aside)
  for (const y of [2000, 2010, 2020]) if (!cur || Math.abs(cur.year - y) > 2) s.push(`<text x="${sx(y) + NOV_X}" y="${SY + 92}" font-size="46" text-anchor="middle">${y}</text>`);
  if (cur) s.push(`<text x="${Math.min(stripX.get(cur.cruise_key)!, SX1 - 30)}" y="${SY + 92}" font-size="50" font-weight="700" text-anchor="middle" style="fill:#ffcd00">${cur.year}</text>`);
  return s.join("");
}

interface Words { kicker: string; year: string; range?: boolean; pill?: boolean; caption: string; caption2?: string }
const titleCase = (s: string) => s.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());
function wordsAt(t: number): Words {
  const stations = (c: Cruise) => `${c.n_stations} stations`;
  if (t < B2) { const c = baseline[beat1(t).k]; return { kicker: "November", year: String(c.year), caption: "Every fall, a ship measures the ocean off California", caption2: `${titleCase(c.ship)} · ${stations(c)}` }; }
  if (t < B3) return { kicker: "November", year: "1993–2013", range: true, caption: "All of them together: the normal", caption2: `Normal = the 1993–2013 average for November (${baseline.length} cruises)` };
  if (t < B4) return { kicker: "November", year: "1993–2013", range: true, caption: "The normal, mapped between the stations", caption2: "Normal = the 1993–2013 average for November" };
  if (t < B5) return { kicker: "November", year: String(first.year), caption: "The next year: one cruise, its stations, its map", caption2: stations(first) };
  if (t < B6) return { kicker: "November", year: String(first.year), caption: "The same cruise, as its difference from normal", caption2: "Red is warmer than normal, blue is cooler" };
  const c = series[beat6(t)], prelim = c.data_stage !== "final";
  if (t >= B7) return { kicker: "Line 93.3, off San Diego", year: String(c.year), pill: prelim, caption: "" };
  // the last map says what it shows, the surface, in the stations' own numbers (facts.json coast_min / coast_max: the
  // inner Bight's 0–10 m departures; build_data.sql stops the build if the offshore stations reach into that range)
  if (c === last) return { kicker: "November", year: String(c.year), pill: prelim, caption: `At the surface: ${Math.round(facts.coast_min)} to ${Math.round(facts.coast_max)} °C warmer than normal near the coast` };
  return { kicker: "November", year: String(c.year), pill: prelim, caption: "Each November since, against the same normal", caption2: stations(c) };
}
/** the three sentences of beat 7, from facts.json */
const HERO = `${signed(facts.max_anom)} °C`;
const HERO_TEXT = `at ${facts.max_anom_bin}–${facts.max_anom_bin + 10} m depth: the largest departure in CalCOFI's record, ${facts.record_from}–${facts.record_to}`;
const TAG = `${facts.layer_temp} °C water down to ${facts.layer_depth} m`;

let lastWords = "";
function hudAt(t: number, cam: Cam) {
  const w = wordsAt(t), key = JSON.stringify(w);
  if (key !== lastWords) {
    lastWords = key;
    $("kicker").textContent = w.kicker; $("year").textContent = w.year; $("year").classList.toggle("range", !!w.range);
    $("caption").textContent = w.caption; $("caption2").textContent = w.caption2 ?? "";
  }
  $("pill").style.opacity = w.pill ? "1" : "0";
  const anomLegend = t < B5 ? 0 : ease(ramp(t - B5, 0.25, 1.05));
  $("legend-temp").style.opacity = String(1 - anomLegend); $("legend-anom").style.opacity = String(anomLegend);
  $("strip").innerHTML = stripSvg(t);
  const n7 = ease(ramp(t - B7, 0.2, 2.7));   // the column's scrim narrows as the section comes up beside the words
  $("scrim").style.background = `linear-gradient(90deg, rgba(15,26,46,0.94) 0, rgba(15,26,46,${lerp(0.86, 0.92, n7)}) ${lerp(520, 560, n7)}px, rgba(15,26,46,0) ${lerp(900, 700, n7)}px)`;
  // beat 7: the number and what it is; the tag on the warm layer; the ring on the record's own cell
  const u = t - B7, big = ease(ramp(u, 3.0, 3.6)), tagA = ease(ramp(u, 2.5, 3.1));
  $("callout").style.opacity = String(big);
  $("callout-big").textContent = HERO; $("callout-text").textContent = HERO_TEXT;
  const tag = $("tag"), leader = $("leader"); tag.style.opacity = String(tagA);
  if (tagA > 0 || big > 0) {
    const vp = viewport(cam), a = stationAt(28), b = stationAt(facts.max_anom_station);
    const [x, y] = vp.project([(a.lon + b.lon) / 2, (a.lat + b.lat) / 2, -22 * EXAG]);                      // in the warm layer, between the two core stations
    const [rx, ry] = vp.project([b.lon, b.lat, -(facts.max_anom_bin + 5) * EXAG]);                        // the record's cell: its station, the middle of its bin
    tag.textContent = TAG;
    const tw = tag.offsetWidth, th = tag.offsetHeight, tx = Math.min(W - tw - 36, Math.max(760, x - tw * 0.5)), ty = y - 268;
    tag.style.transform = `translate(${tx}px, ${ty}px)`;
    leader.innerHTML =
      `<line x1="${Math.min(tx + tw - 50, Math.max(tx + 50, x))}" y1="${ty + th}" x2="${x}" y2="${y}" stroke="rgba(233,237,243,${0.95 * tagA})" stroke-width="3.5"/><circle cx="${x}" cy="${y}" r="8" fill="rgba(233,237,243,${tagA})"/>` +
      `<circle cx="${rx}" cy="${ry}" r="21" fill="none" stroke="rgba(15,26,46,${0.9 * big})" stroke-width="10"/><circle cx="${rx}" cy="${ry}" r="21" fill="none" stroke="rgba(255,255,255,${big})" stroke-width="5"/>` +
      `<text x="${rx}" y="${ry + 80}" font-size="48" font-weight="700" text-anchor="middle" style="fill:rgba(255,255,255,${big})" paint-order="stroke" stroke="rgba(15,26,46,${0.95 * big})" stroke-width="11" stroke-linejoin="round">${HERO}</text>`;
  } else leader.innerHTML = "";
}

// ── the clock ────────────────────────────────────────────────────────────────────────────────────────────────────
let ready = false;
function setFrame(t: number) {
  const tt = Math.min(DURATION - 1e-6, Math.max(0, t)), cam = camAt(tt);
  deck.setProps({ viewState: { ...cam, maxPitch: 85 }, layers: ready ? layersAt(tt) : [] });
  if (ready) hudAt(tt, cam);
}
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
async function settle() { for (let i = 0; i < 3; i++) await raf(); }

/** what a capture must be able to trust, checked once the page is ready (capture.mjs prints it and stops on a failure):
 *  the section's seven stations stay inside the frame, clear of the column and the strip, at every frame of the move */
function selfCheck() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = Math.round(B7 * FPS); k < DURATION * FPS; k++) {
    const vp = viewport(camAt(k / FPS));
    for (const s of secStations) for (const z of [0, -SECTION_DEPTH * EXAG]) { const [x, y] = vp.project([s.lon, s.lat, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const box = [x0, y0, x1, y1].map(Math.round), ok = x0 >= 620 && x1 <= W - 20 && y0 >= 60 && y1 <= 800;   // right of the column's words, above the strip
  return { sectionBox: box, sectionInFrame: ok, missingYears: MISSING, hero: HERO, heroText: HERO_TEXT, tag: TAG, lastCaption: wordsAt(B7 - 0.1).caption };
}

async function boot() {
  await Promise.all([document.fonts.load(`600 100px "Teko"`), document.fonts.load(`600 40px "Source Sans 3"`), document.fonts.load(`700 40px "Source Sans 3"`), document.fonts.load(`400 40px "Source Sans 3"`)]);
  await document.fonts.ready;
  const pts = (st: Sta[], f: (s: Sta) => number | null) => st.filter((s) => f(s) != null).map((s) => ({ lon: s.lon, lat: s.lat, z: f(s)! }));
  const a = secStations[0], b = secStations[secStations.length - 1];
  await Promise.all([
    buildSurf("normal", normal.map((n) => ({ lon: n.lon, lat: n.lat, z: n.clim })), "temp", true),
    buildSurf("first-temp", pts(stationsOf(first), (s) => s.temp), "temp", true),
    buildSurf("first-anom", pts(stationsOf(first), (s) => s.anom), "anom", false),
    ...series.map((c) => buildSurf(`anom-${c.cruise_key}`, pts(stationsOf(c), (s) => s.anom), "anom", false)),
    fetch(`${import.meta.env.BASE_URL}land.geojson`).then((r) => r.json()).then((g) => { land = g; }),
    loadMosaic(-131.7, 28.3, -115.7, 36.1, 7).then((m) => {
      bathy = { canvas: flatBathy(m), bounds: mosaicBounds(m) };
      floor = floorMesh(m, { lon0, lat0, exag: EXAG, zFloor: -(SECTION_DEPTH * 1.3 + 40), a: [a.lon, a.lat], b: [b.lon, b.lat], nearKm: 3, blendKm: 16 });
      story.terrain = { tiles: m.tiles, missing: m.missing, W: m.W, H: m.H, vertices: floor.vertices };
    }),
  ]);
  curtainTex = sectionTexture();
  splitAlongLine(surfs.get(`anom-${last.cruise_key}`)!);
  ready = true; $("loading").style.display = "none";
  story.surfaces = [...surfs.entries()].map(([k, s]) => ({ key: k, n: s.n, lines: s.lines.length, labels: s.labels.length }));
  story.check = selfCheck();
}

const story: any = ((window as any).__story = {
  duration: DURATION, fps: FPS, width: W, height: H, beats: { B1, B2, B3, B4, B5, B6, B7 },
  ready: null as Promise<void> | null,
  /** set the clock and resolve once that frame is on screen (capture.mjs steps this) */
  setT: async (t: number) => { setFrame(t); await settle(); },
});
story.ready = boot().then(async () => {
  if (q.has("t")) { await story.setT(Number(q.get("t"))); return; }
  // live: scale the stage to the window and run the clock; space pauses, ← → step a second
  const fitStage = () => { const k = Math.min(innerWidth / W, innerHeight / H); $("stage").style.transform = `scale(${k})`; };
  fitStage(); addEventListener("resize", fitStage);
  let t0 = performance.now(), paused = false, tp = 0;
  addEventListener("keydown", (e) => {
    if (e.key === " ") { paused = !paused; t0 = performance.now() - tp * 1000; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { tp = (tp + (e.key === "ArrowRight" ? 1 : -1) + DURATION) % DURATION; t0 = performance.now() - tp * 1000; setFrame(tp); }
  });
  const loop = () => { if (!paused) { tp = ((performance.now() - t0) / 1000) % DURATION; setFrame(tp); } requestAnimationFrame(loop); };
  loop();
});
