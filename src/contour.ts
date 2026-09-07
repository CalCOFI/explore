// the Contour lens's client side: hands the station summaries to contour.worker.ts and turns the answer into what
// the map draws — a colour bitmap in Mercator-regular cells, isolines by marching squares, and the cell under the pointer.
export type Method = "idw" | "ok" | "tps";
export interface SurfaceGrid { lon0: number; lon1: number; latS: number; latN: number; nx: number; ny: number; cellDeg: number }
export interface Fit { n: number; nCells: number; loo: number; ms: number; nmax: number; nLoo?: number; nFit?: number; phases?: Record<string, number>; vg?: { nugget: number; psill: number; range: number }; edf?: number }
export interface ContourReq { id: number; lon: Float64Array; lat: Float64Array; z: Float64Array; method: Method; cellDeg: number; maskKm: number; wantSe: boolean; nmax: number }
export type ContourReply =
  | { id: number; kind: "value"; grid: SurfaceGrid; values: Float32Array; dist: Float32Array; fit: Fit; se: Float32Array | null }
  | { id: number; kind: "se"; se: Float32Array | null; ms: number }
  | { id: number; kind: "error"; message: string };
export interface Surface { grid: SurfaceGrid; values: Float32Array; dist: Float32Array; se: Float32Array | null; seMs: number | null; fit: Fit; method: Method }

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (s: Surface) => void; reject: (e: Error) => void; onSe: (se: Float32Array | null, ms: number) => void; method: Method }>();
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./contour.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<ContourReply>) => {
    const r = e.data, p = pending.get(r.id); if (!p) return;
    if (r.kind === "value") { p.resolve({ grid: r.grid, values: r.values, dist: r.dist, se: r.se, seMs: r.se ? 0 : null, fit: r.fit, method: p.method }); if (r.se) pending.delete(r.id); }
    else if (r.kind === "se") { p.onSe(r.se, r.ms); pending.delete(r.id); }
    else { p.reject(new Error(r.message)); pending.delete(r.id); }
  };
  return worker;
}
/** interpolate z at (lon, lat) → resolves with the value surface; the error surface (when the method has one) arrives through onSe */
/** `nmax` > 0 = the local mode (the nmax nearest points per cell; the cast grain); 0 = every point in one system (the station grain) */
export function computeSurface(pts: { lon: number; lat: number; z: number }[], method: Method, opts: { cellDeg?: number; maskKm?: number; wantSe?: boolean; nmax?: number; onSe?: (se: Float32Array | null, ms: number) => void } = {}): Promise<Surface> {
  const id = ++seq;
  const req: ContourReq = { id, lon: Float64Array.from(pts, (p) => p.lon), lat: Float64Array.from(pts, (p) => p.lat), z: Float64Array.from(pts, (p) => p.z), method, cellDeg: opts.cellDeg ?? 0.06, maskKm: opts.maskKm ?? MASK_KM, wantSe: !!opts.wantSe, nmax: opts.nmax ?? 0 };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: (s) => { resolve(s); if (!req.wantSe || s.se) pending.delete(id); }, reject, onSe: opts.onSe ?? (() => {}), method });
    ensureWorker().postMessage(req);
  });
}
/** land, clipped from the surface (Ben, 2026-09-07; D42): Natural Earth 10 m land polygons (public/land.geojson, the
 *  countries unioned and clipped to 170–95° W × 5–55° N, ~270 KB) rasterised onto the grid's own Mercator-regular
 *  cells with a canvas — complete coverage (the GEBCO terrain tiles stop at the CalCOFI crop, which left Arizona and
 *  the Gulf of California coloured), no tile fetch, milliseconds. A display mask like the edge fade: the values, the
 *  CSV and the R / Python parity are untouched (mask a cc_interpolate_rast() with calcofi4r::cc_bathy() in R). The
 *  CARTO basemap has no land layer to draw over the surface (land is its background colour), so order cannot do this. */
let landGeo: Promise<any> | null = null;
export async function landMask(g: SurfaceGrid): Promise<Uint8Array> {
  landGeo ??= fetch(`${import.meta.env.BASE_URL}land.geojson`).then((r) => { if (!r.ok) throw new Error(`land.geojson ${r.status}`); return r.json(); });
  const geo = await landGeo;
  const cv = document.createElement("canvas"); cv.width = g.nx; cv.height = g.ny;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const s = g.cellDeg * R, yN = merc(g.latN);
  const px = (lon: number) => (lon - g.lon0) / g.cellDeg, py = (lat: number) => (yN - merc(lat)) / s;
  ctx.fillStyle = "#000";
  for (const f of geo.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    for (const rings of polys) {
      ctx.beginPath();
      for (const ring of rings) { ring.forEach(([lon, lat]: number[], k: number) => (k ? ctx.lineTo(px(lon), py(lat)) : ctx.moveTo(px(lon), py(lat)))); ctx.closePath(); }
      ctx.fill("evenodd"); // the holes (lakes) stay sea-coloured — they are not sea, but they are not this surface either
    }
  }
  const d = ctx.getImageData(0, 0, g.nx, g.ny).data, out = new Uint8Array(g.nx * g.ny);
  for (let o = 0; o < out.length; o++) if (d[o * 4 + 3] > 127) out[o] = 1;
  return out;
}
/** a surface is blank beyond this distance from any station — the map never extrapolates */
export const MASK_KM = 60;

const R = Math.PI / 180;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * R) / 2));
const imerc = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / R;
/** grid coordinates (fractional cell index, row 0 = north) → lon/lat */
export function cellToLonLat(g: SurfaceGrid, x: number, y: number): [number, number] {
  const s = g.cellDeg * R, yN = merc(g.latN);
  return [g.lon0 + ((x + 0.5) * s) / R, imerc(yN - (y + 0.5) * s)];
}
/** the cell under a bitmap pixel (deck's BitmapLayer picking gives the pixel in the image) */
export function cellValue(surface: Float32Array, g: SurfaceGrid, px: number, py: number): number | null {
  if (px < 0 || py < 0 || px >= g.nx || py >= g.ny) return null;
  const v = surface[py * g.nx + px]; return Number.isFinite(v) ? v : null;
}

/** "pretty" contour levels: a 1·2·5 step giving about n levels across [lo, hi] */
export function niceLevels(lo: number, hi: number, n = 8): number[] {
  if (!(hi > lo)) return [];
  const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  const out: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/** marching squares over the cell centres: line segments per level in grid coordinates; a square with a blank corner is skipped */
export function isolines(v: Float32Array, nx: number, ny: number, levels: number[]): { level: number; segs: [number, number, number, number][] }[] {
  const out = levels.map((level) => ({ level, segs: [] as [number, number, number, number][] }));
  const at = (i: number, j: number) => v[j * nx + i];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    for (let L = 0; L < levels.length; L++) {
      const t = levels[L]; if (t < lo || t >= hi) continue;
      // edge crossings: top (a→b), right (b→c), bottom (d→c), left (a→d)
      const pts: [number, number][] = [];
      if ((a < t) !== (b < t)) pts.push([i + (t - a) / (b - a), j]);
      if ((b < t) !== (c < t)) pts.push([i + 1, j + (t - b) / (c - b)]);
      if ((d < t) !== (c < t)) pts.push([i + (t - d) / (c - d), j + 1]);
      if ((a < t) !== (d < t)) pts.push([i, j + (t - a) / (d - a)]);
      if (pts.length === 2) out[L].segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      else if (pts.length === 4) { // the saddle: split by the centre value
        const ctr = (a + b + c + d) / 4;
        if ((a < t) === (ctr < t)) { out[L].segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]], [pts[2][0], pts[2][1], pts[3][0], pts[3][1]]); }
        else { out[L].segs.push([pts[0][0], pts[0][1], pts[3][0], pts[3][1]], [pts[1][0], pts[1][1], pts[2][0], pts[2][1]]); }
      }
    }
  }
  return out;
}

/** the marching-squares segments of one level chained into polylines (grid coordinates), by shared endpoints */
export function joinSegments(segs: [number, number, number, number][]): [number, number][][] {
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const ends = new Map<string, number[]>(); // endpoint key -> segment indices
  segs.forEach((s, i) => { for (const k of [key(s[0], s[1]), key(s[2], s[3])]) { const a = ends.get(k); if (a) a.push(i); else ends.set(k, [i]); } });
  const used = new Uint8Array(segs.length), out: [number, number][][] = [];
  const grow = (line: [number, number][], atEnd: boolean) => {
    for (;;) {
      const p = atEnd ? line[line.length - 1] : line[0], cands = ends.get(key(p[0], p[1])) ?? [];
      const i = cands.find((c) => !used[c]); if (i == null) return;
      used[i] = 1; const s = segs[i];
      const same = key(s[0], s[1]) === key(p[0], p[1]);
      const q: [number, number] = same ? [s[2], s[3]] : [s[0], s[1]];
      if (atEnd) line.push(q); else line.unshift(q);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    const line: [number, number][] = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]];
    grow(line, true); grow(line, false); out.push(line);
  }
  return out;
}
/** label positions along a level's polylines: one every `every` grid cells of length, none on a line shorter than half that; the
 *  angle follows the line and stays upright (grid coordinates, row 0 = north, so the screen angle is the negative) */
export function labelPoints(lines: [number, number][][], every: number): { x: number; y: number; angle: number }[] {
  const out: { x: number; y: number; angle: number }[] = [];
  for (const line of lines) {
    const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    const L = cum[cum.length - 1]; if (L < every / 2) continue;
    const n = Math.max(1, Math.floor(L / every));
    for (let k = 0; k < n; k++) {
      const t = (L / n) * (k + 0.5); let i = 1; while (i < cum.length - 1 && cum[i] < t) i++;
      const f = (t - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = line[i - 1], b = line[i];
      let angle = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI; // screen angle, y down in the grid
      if (angle > 90) angle -= 180; if (angle < -90) angle += 180;      // upright
      out.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, angle });
    }
  }
  return out;
}
/** the surface fades out over the last EDGE_KM before the mask, so its edge is not a staircase of cells */
export const EDGE_KM = 15;
/** the surface as an RGBA canvas (row 0 = north); blank cells are transparent but borrow a neighbour's colour so linear filtering leaves no dark fringe */
export function surfaceImage(v: Float32Array, nx: number, ny: number, color: (x: number) => [number, number, number, number], alpha = 235, dist?: Float32Array, maskKm = MASK_KM): HTMLCanvasElement {
  const img = new ImageData(nx, ny), d = img.data;
  for (let o = 0; o < nx * ny; o++) { const x = v[o]; if (!Number.isFinite(x)) continue; const c = color(x); const f = dist ? Math.min(1, Math.max(0, (maskKm - dist[o]) / EDGE_KM)) : 1; d[o * 4] = c[0]; d[o * 4 + 1] = c[1]; d[o * 4 + 2] = c[2]; d[o * 4 + 3] = Math.round(alpha * f); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = j * nx + i; if (d[o * 4 + 3]) continue;
    for (const q of [o - 1, o + 1, o - nx, o + nx]) if (q >= 0 && q < nx * ny && d[q * 4 + 3]) { d[o * 4] = d[q * 4]; d[o * 4 + 1] = d[q * 4 + 1]; d[o * 4 + 2] = d[q * 4 + 2]; break; }
  }
  const cv = document.createElement("canvas"); cv.width = nx; cv.height = ny; cv.getContext("2d")!.putImageData(img, 0, 0);
  return cv;
}
