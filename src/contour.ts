// the Contour lens's client side: hands the station summaries to contour.worker.ts and turns the answer into what
// the map draws — a colour bitmap in Mercator-regular cells, isolines by marching squares, and the cell under the pointer.
export type Method = "idw" | "ok" | "tps";
export interface SurfaceGrid { lon0: number; lon1: number; latS: number; latN: number; nx: number; ny: number; cellDeg: number }
export interface Fit { n: number; nCells: number; loo: number; ms: number; vg?: { nugget: number; psill: number; range: number }; edf?: number }
export interface ContourReq { id: number; lon: Float64Array; lat: Float64Array; z: Float64Array; method: Method; cellDeg: number; maskKm: number; wantSe: boolean }
export type ContourReply =
  | { id: number; kind: "value"; grid: SurfaceGrid; values: Float32Array; fit: Fit }
  | { id: number; kind: "se"; se: Float32Array | null; ms: number }
  | { id: number; kind: "error"; message: string };
export interface Surface { grid: SurfaceGrid; values: Float32Array; se: Float32Array | null; seMs: number | null; fit: Fit; method: Method }

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (s: Surface) => void; reject: (e: Error) => void; onSe: (se: Float32Array | null, ms: number) => void; method: Method }>();
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./contour.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<ContourReply>) => {
    const r = e.data, p = pending.get(r.id); if (!p) return;
    if (r.kind === "value") p.resolve({ grid: r.grid, values: r.values, se: null, seMs: null, fit: r.fit, method: p.method });
    else if (r.kind === "se") { p.onSe(r.se, r.ms); pending.delete(r.id); }
    else { p.reject(new Error(r.message)); pending.delete(r.id); }
  };
  return worker;
}
/** interpolate z at (lon, lat) → resolves with the value surface; the error surface (when the method has one) arrives through onSe */
export function computeSurface(pts: { lon: number; lat: number; z: number }[], method: Method, opts: { cellDeg?: number; maskKm?: number; wantSe?: boolean; onSe?: (se: Float32Array | null, ms: number) => void } = {}): Promise<Surface> {
  const id = ++seq;
  const req: ContourReq = { id, lon: Float64Array.from(pts, (p) => p.lon), lat: Float64Array.from(pts, (p) => p.lat), z: Float64Array.from(pts, (p) => p.z), method, cellDeg: opts.cellDeg ?? 0.06, maskKm: opts.maskKm ?? MASK_KM, wantSe: !!opts.wantSe };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: (s) => { resolve(s); if (!req.wantSe) pending.delete(id); }, reject, onSe: opts.onSe ?? (() => {}), method });
    ensureWorker().postMessage(req);
  });
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

/** the surface as an RGBA canvas (row 0 = north); blank cells are transparent but borrow a neighbour's colour so linear filtering leaves no dark fringe */
export function surfaceImage(v: Float32Array, nx: number, ny: number, color: (x: number) => [number, number, number, number], alpha = 235): HTMLCanvasElement {
  const img = new ImageData(nx, ny), d = img.data;
  for (let o = 0; o < nx * ny; o++) { const x = v[o]; if (!Number.isFinite(x)) continue; const c = color(x); d[o * 4] = c[0]; d[o * 4 + 1] = c[1]; d[o * 4 + 2] = c[2]; d[o * 4 + 3] = alpha; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = j * nx + i; if (d[o * 4 + 3]) continue;
    for (const q of [o - 1, o + 1, o - nx, o + nx]) if (q >= 0 && q < nx * ny && d[q * 4 + 3]) { d[o * 4] = d[q * 4]; d[o * 4 + 1] = d[q * 4 + 1]; d[o * 4 + 2] = d[q * 4 + 2]; break; }
  }
  const cv = document.createElement("canvas"); cv.width = nx; cv.height = ny; cv.getContext("2d")!.putImageData(img, 0, 0);
  return cv;
}
