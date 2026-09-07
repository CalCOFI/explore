// the Contour lens's numerics, off the main thread: an interpolated surface over a point set, its error surface and
// its leave-one-out error. Plain typed arrays, no library. Two modes (plan 2026-09-07 § D31, D40):
//   global (nmax = 0)  every point in one system — the station grain (≤ 218 cells): kriging inverts once, the spline
//                      picks its smoothing by GCV; the error surface is the n² term and follows in a second message
//   local  (nmax > 0)  the nmax nearest points per cell (exact, by a bucket search) — the cast grain (tens of thousands
//                      of root samples): one small solve per cell gives the value AND its error together; the
//                      variogram fits on ≤ 2,000 points and the LOO runs on ≤ 500, both picked by a seeded LCG so
//                      calcofi4r::cc_interpolate() / calcofi4py.interpolate() reproduce them exactly
//   idw  inverse-distance weighting, power 1.3, radius 200 km, 5 km smoothing (parity with terra::interpIDW) — no error
//   ok   ordinary kriging: an exponential variogram fitted by weighted least squares; the kriging SD is the error
//   tps  a thin-plate spline (mgcv's s(lon, lat) basis), smoothing by GCV; its standard error — global mode only
import type { ContourReq, ContourReply, SurfaceGrid, Fit } from "./contour";

const R = Math.PI / 180;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * R) / 2));
const imerc = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / R;

/** dense inverse by Gauss–Jordan with partial pivoting (n ≤ a few hundred) */
function inverse(A: Float64Array, n: number): Float64Array {
  const M = Float64Array.from(A), I = new Float64Array(n * n);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
    if (p !== c) for (let k = 0; k < n; k++) { let t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; t = I[c * n + k]; I[c * n + k] = I[p * n + k]; I[p * n + k] = t; }
    const d = M[c * n + c] || 1e-12;
    for (let k = 0; k < n; k++) { M[c * n + k] /= d; I[c * n + k] /= d; }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r * n + c]; if (!f) continue;
      for (let k = 0; k < n; k++) { M[r * n + k] -= f * M[c * n + k]; I[r * n + k] -= f * I[c * n + k]; }
    }
  }
  return I;
}
/** solve A x = b in place (Gaussian elimination, partial pivoting); A and b are overwritten, x lands in b */
function solve(A: Float64Array, b: Float64Array, n: number) {
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) { for (let k = c; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = b[c]; b[c] = b[p]; b[p] = t; }
    const d = A[c * n + c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r * n + c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; b[r] -= f * b[c]; }
  }
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k]; b[r] = s / (A[r * n + r] || 1e-12); }
}
/** a seeded LCG (Numerical Recipes) — the same sequence in R and Python, so a subsample is the same subsample */
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
/** k of n indices without replacement, by a partial Fisher–Yates on the LCG; the first k in draw order */
function sample(n: number, k: number, seed: number): Int32Array {
  const idx = new Int32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  if (k >= n) return idx;
  const r = lcg(seed);
  for (let i = 0; i < k; i++) { const j = i + Math.floor(r() * (n - i)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  return idx.subarray(0, k);
}

interface Local { X: Float64Array; Y: Float64Array; Z: Float64Array; n: number }

/** the empirical semivariogram (15 bins to half the maximum distance) over at most 2,000 points, and an exponential model by WLS */
function variogram(L: Local) {
  const pick = sample(L.n, 2000, 1), m = pick.length, nb = 15;
  const X = Float64Array.from(pick, (i) => L.X[i]), Y = Float64Array.from(pick, (i) => L.Y[i]), Z = Float64Array.from(pick, (i) => L.Z[i]);
  let dmax = 0;
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) dmax = Math.max(dmax, Math.hypot(X[i] - X[j], Y[i] - Y[j]));
  dmax /= 2;
  const bs = new Float64Array(nb), bn = new Float64Array(nb);
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
    const d = Math.hypot(X[i] - X[j], Y[i] - Y[j]); if (d >= dmax) continue;
    const b = Math.floor((d / dmax) * nb); bs[b] += 0.5 * (Z[i] - Z[j]) ** 2; bn[b]++;
  }
  const emp: { h: number; g: number; n: number }[] = [];
  for (let b = 0; b < nb; b++) if (bn[b]) emp.push({ h: ((b + 0.5) * dmax) / nb, g: bs[b] / bn[b], n: bn[b] });
  const svar = Math.max(1e-9, emp[emp.length - 1]?.g ?? 1);
  let best = { ss: Infinity, nugget: 0, psill: svar, range: dmax / 3 };
  for (const nug of [0, 0.05, 0.1, 0.2, 0.3]) for (const rg of [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5]) for (const sill of [0.6, 0.8, 1, 1.2, 1.5]) {
    const a = rg * dmax, c0 = nug * svar, c1 = Math.max(1e-9, sill * svar - c0);
    let ss = 0;
    for (const e of emp) { const mm = c0 + c1 * (1 - Math.exp(-e.h / a)); ss += (e.n * (e.g - mm) ** 2) / (mm * mm); }
    if (ss < best.ss) best = { ss, nugget: c0, psill: c1, range: a };
  }
  return { nugget: best.nugget, psill: best.psill, range: best.range, nFit: m };
}

/** an exact k-nearest search over a bucket grid: the nmax nearest by distance, ties by index */
class Buckets {
  B: number; x0: number; y0: number; nbx: number; nby: number; heads: Int32Array; next: Int32Array;
  constructor(L: Local, B: number) {
    this.B = B; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < L.n; i++) { x0 = Math.min(x0, L.X[i]); y0 = Math.min(y0, L.Y[i]); x1 = Math.max(x1, L.X[i]); y1 = Math.max(y1, L.Y[i]); }
    this.x0 = x0; this.y0 = y0; this.nbx = Math.floor((x1 - x0) / B) + 1; this.nby = Math.floor((y1 - y0) / B) + 1;
    this.heads = new Int32Array(this.nbx * this.nby).fill(-1); this.next = new Int32Array(L.n);
    for (let i = 0; i < L.n; i++) { const b = this.bucket(L.X[i], L.Y[i]); this.next[i] = this.heads[b]; this.heads[b] = i; }
  }
  bucket(x: number, y: number) { return Math.min(this.nby - 1, Math.max(0, Math.floor((y - this.y0) / this.B))) * this.nbx + Math.min(this.nbx - 1, Math.max(0, Math.floor((x - this.x0) / this.B))); }
  /** fills idx/d2 (sorted ascending) with the k nearest to (px, py) within `maxRing` buckets (so within maxRing·B — a
   *  point farther than that is never a neighbour: the local neighbourhood is "the k nearest within 3 × mask_km"),
   *  skipping `skip`; returns how many. Capped because an unbounded ring walk over an empty ocean cost 35 s. */
  nearest(L: Local, px: number, py: number, k: number, idx: Int32Array, d2: Float64Array, skip = -1, maxRing = 3): number {
    const bi = Math.floor((px - this.x0) / this.B), bj = Math.floor((py - this.y0) / this.B);
    let cnt = 0; const lim2 = (maxRing * this.B) ** 2;
    const ins = (i: number, dd: number) => { // keep the k best, sorted; ties by index (a later index never displaces an equal distance)
      let pos = cnt < k ? cnt : k - 1;
      if (cnt >= k && dd >= d2[k - 1]) return;
      while (pos > 0 && d2[pos - 1] > dd) { d2[pos] = d2[pos - 1]; idx[pos] = idx[pos - 1]; pos--; }
      d2[pos] = dd; idx[pos] = i; if (cnt < k) cnt++;
    };
    for (let r = 0; r <= maxRing; r++) {
      for (let j = bj - r; j <= bj + r; j++) {
        if (j < 0 || j >= this.nby) continue;
        for (let i = bi - r; i <= bi + r; i++) {
          if (i < 0 || i >= this.nbx || (Math.abs(i - bi) !== r && Math.abs(j - bj) !== r)) continue;
          for (let p = this.heads[j * this.nbx + i]; p !== -1; p = this.next[p]) { if (p === skip) continue; const dd = (L.X[p] - px) ** 2 + (L.Y[p] - py) ** 2; if (dd <= lim2) ins(p, dd); }
        }
      }
      // exact once the k-th distance is inside the rings searched: anything in ring r+1 is at least r·B away
      if (cnt >= k && d2[k - 1] <= (r * this.B) ** 2) break;
    }
    return cnt;
  }
}

function run(req: ContourReq, post: (r: ContourReply) => void) {
  const t0 = performance.now();
  const n = req.lon.length, nmax = Math.max(0, Math.floor(req.nmax ?? 0));
  const local = nmax > 0 && nmax < n;
  // ── the grid: rows evenly spaced in Web-Mercator y, so the bitmap the map stretches between the bounds is exact ──
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  for (let i = 0; i < n; i++) { lo0 = Math.min(lo0, req.lon[i]); lo1 = Math.max(lo1, req.lon[i]); la0 = Math.min(la0, req.lat[i]); la1 = Math.max(la1, req.lat[i]); }
  const pad = 0.7, s = req.cellDeg * R;
  const lon0 = lo0 - pad, yN = merc(la1 + pad), yS = merc(la0 - pad);
  const nx = Math.ceil(((lo1 + pad - lon0) * R) / s), ny = Math.ceil((yN - yS) / s);
  const grid: SurfaceGrid = { lon0, lon1: lon0 + (nx * s) / R, latS: imerc(yN - ny * s), latN: imerc(yN), nx, ny, cellDeg: req.cellDeg };
  // ── a local equirectangular km frame about the points' centre ──
  const lonc = (lo0 + lo1) / 2, latc = (la0 + la1) / 2, kx = 111.32 * Math.cos(latc * R), ky = 110.57;
  const L: Local = { X: new Float64Array(n), Y: new Float64Array(n), Z: Float64Array.from(req.z), n };
  for (let i = 0; i < n; i++) { L.X[i] = (req.lon[i] - lonc) * kx; L.Y[i] = (req.lat[i] - latc) * ky; }
  const cx = new Float64Array(nx), cy = new Float64Array(ny);
  for (let i = 0; i < nx; i++) cx[i] = (lon0 + ((i + 0.5) * s) / R - lonc) * kx;
  for (let j = 0; j < ny; j++) cy[j] = (imerc(yN - (j + 0.5) * s) - latc) * ky;
  // ── the distance to the nearest point per cell: the mask (blank beyond maskKm) and the edge fade the map draws ──
  const tm: Record<string, number> = {}; let tp = performance.now(); const lap = (k: string) => { const t = performance.now(); tm[k] = Math.round(t - tp); tp = t; };
  const bk = new Buckets(L, req.maskKm);
  const dist = new Float32Array(nx * ny), r2 = req.maskKm * req.maskKm; let nMask = 0;
  const nIdx = new Int32Array(Math.max(1, nmax)), nD2 = new Float64Array(Math.max(1, nmax));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = j * nx + i;
    const c = bk.nearest(L, cx[i], cy[j], 1, nIdx, nD2, -1, 1); // ring 1 = everything within maskKm
    dist[o] = c ? Math.sqrt(nD2[0]) : Infinity; if (c && nD2[0] <= r2) nMask++;
  }
  lap("mask");
  const values = new Float32Array(nx * ny).fill(NaN);
  const fit: Fit = { n, nCells: nMask, loo: NaN, ms: 0, nmax: local ? nmax : 0, phases: tm };
  let se: Float32Array | null = null, seFn: ((se: Float32Array) => void) | null = null;
  const each = (f: (o: number, px: number, py: number) => void) => { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = j * nx + i; if (dist[o] * dist[o] > r2) continue; f(o, cx[i], cy[j]); } };

  if (req.method === "idw") {
    const power = 1.3, rad2 = 200 ** 2, sm2 = 5 ** 2;
    const idw = (px: number, py: number, skip: number): number => {
      let sw = 0, sz = 0;
      if (local) { const c = bk.nearest(L, px, py, nmax, nIdx, nD2, skip); for (let a = 0; a < c; a++) { const d2 = nD2[a]; if (d2 > rad2) break; const w = 1 / Math.pow(d2 + sm2, power / 2); sw += w; sz += w * L.Z[nIdx[a]]; } }
      else for (let k = 0; k < n; k++) { if (k === skip) continue; const d2 = (L.X[k] - px) ** 2 + (L.Y[k] - py) ** 2; if (d2 > rad2) continue; const w = 1 / Math.pow(d2 + sm2, power / 2); sw += w; sz += w * L.Z[k]; }
      return sw ? sz / sw : NaN;
    };
    each((o, px, py) => { values[o] = idw(px, py, -1); }); lap("surface");
    const pick = sample(n, 500, 2); let e = 0, c = 0;
    for (const i of pick) { const v = idw(L.X[i], L.Y[i], i); if (Number.isFinite(v)) { e += (v - L.Z[i]) ** 2; c++; } }
    fit.loo = Math.sqrt(e / Math.max(1, c)); fit.nLoo = pick.length; lap("loo");
  } else if (req.method === "ok") {
    const vg = variogram(L); lap("variogram"); fit.vg = { nugget: vg.nugget, psill: vg.psill, range: vg.range }; fit.nFit = vg.nFit;
    const cov = (d: number) => vg.psill * Math.exp(-d / vg.range), diag = vg.psill + vg.nugget + 1e-6 * vg.psill;
    if (!local) {
      const m = n + 1, K = new Float64Array(m * m);
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) K[i * m + j] = i === j ? diag : cov(Math.hypot(L.X[i] - L.X[j], L.Y[i] - L.Y[j])); K[i * m + n] = 1; K[n * m + i] = 1; }
      const Ki = inverse(K, m);
      const wz = new Float64Array(m);   // the weights applied to z fall out once: w = Ki·[z;0], so a prediction is one dot product per cell
      for (let i = 0; i < m; i++) { let acc = 0; for (let j = 0; j < n; j++) acc += Ki[i * m + j] * L.Z[j]; wz[i] = acc; }
      let e = 0; for (let i = 0; i < n; i++) e += (wz[i] / Ki[i * m + i]) ** 2; fit.loo = Math.sqrt(e / n); fit.nLoo = n; // Dubrule 1983
      each((o, px, py) => { let z = 0; for (let k = 0; k < n; k++) z += wz[k] * cov(Math.hypot(L.X[k] - px, L.Y[k] - py)); values[o] = z + wz[n]; });
      const kv = new Float64Array(m); kv[n] = 1;
      seFn = (out) => {
        const lam = new Float64Array(m);
        each((o, px, py) => {
          for (let k = 0; k < n; k++) kv[k] = cov(Math.hypot(L.X[k] - px, L.Y[k] - py));
          let v = vg.psill + vg.nugget;
          for (let a = 0; a < m; a++) { let acc = 0; const row = a * m; for (let b = 0; b < m; b++) acc += Ki[row + b] * kv[b]; lam[a] = acc; }
          for (let a = 0; a < m; a++) v -= lam[a] * kv[a];
          out[o] = Math.sqrt(Math.max(0, v));
        });
      };
    } else {
      // local: one (c+1)-system per cell gives the weights, the value and the variance together
      se = new Float32Array(nx * ny).fill(NaN);
      const m = nmax + 1, K = new Float64Array(m * m), kv = new Float64Array(m), lam = new Float64Array(m);
      const krige = (px: number, py: number, skip: number, out: [number, number]) => {
        const c = bk.nearest(L, px, py, nmax, nIdx, nD2, skip); if (c < 2) { out[0] = NaN; out[1] = NaN; return; }
        const mm = c + 1;
        for (let a = 0; a < c; a++) { const ia = nIdx[a]; for (let b = 0; b < c; b++) { const ib = nIdx[b]; K[a * mm + b] = a === b ? diag : cov(Math.hypot(L.X[ia] - L.X[ib], L.Y[ia] - L.Y[ib])); } K[a * mm + c] = 1; K[c * mm + a] = 1; kv[a] = cov(Math.sqrt(nD2[a])); }
        K[c * mm + c] = 0; kv[c] = 1;
        for (let a = 0; a < mm; a++) lam[a] = kv[a];
        solve(K, lam, mm);
        let z = 0, v = vg.psill + vg.nugget;
        for (let a = 0; a < c; a++) { z += lam[a] * L.Z[nIdx[a]]; v -= lam[a] * kv[a]; }
        v -= lam[c] * kv[c];
        out[0] = z; out[1] = Math.sqrt(Math.max(0, v));
      };
      const o2: [number, number] = [0, 0];
      each((o, px, py) => { krige(px, py, -1, o2); values[o] = o2[0]; se![o] = o2[1]; }); lap("surface");
      const pick = sample(n, 500, 2); let e = 0, cc = 0;
      for (const i of pick) { krige(L.X[i], L.Y[i], i, o2); if (Number.isFinite(o2[0])) { e += (o2[0] - L.Z[i]) ** 2; cc++; } }
      fit.loo = Math.sqrt(e / Math.max(1, cc)); fit.nLoo = pick.length; lap("loo");
    }
  } else {
    if (local) { post({ id: req.id, kind: "error", message: "the spline needs every point in one system — pick the station grain, or kriging / IDW at the cast grain" }); return; }
    // thin-plate spline: r² log r kernel + a linear trend; the ridge λ picked by GCV over a log grid (the LOO residuals
    // and the hat-matrix trace both come from the inverse, so nine fits cost nine inverses)
    const m = n + 3, ker = (r: number) => (r > 0 ? r * r * Math.log(r) : 0);
    const K0 = new Float64Array(m * m);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) K0[i * m + j] = ker(Math.hypot(L.X[i] - L.X[j], L.Y[i] - L.Y[j]));
      K0[i * m + n] = K0[n * m + i] = 1; K0[i * m + n + 1] = K0[(n + 1) * m + i] = L.X[i]; K0[i * m + n + 2] = K0[(n + 2) * m + i] = L.Y[i];
    }
    let scale = 0; for (let i = 0; i < n * m; i++) scale = Math.max(scale, Math.abs(K0[i]));
    let best: { gcv: number; lam: number; c: Float64Array; Ki: Float64Array; loo: number; edf: number; rss: number } | null = null;
    for (const lam of [1e-4, 1e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1, 3, 10].map((x) => x * scale)) {
      const K = Float64Array.from(K0); for (let i = 0; i < n; i++) K[i * m + i] += lam;
      const Ki = inverse(K, m), c = new Float64Array(m);
      for (let i = 0; i < m; i++) { let acc = 0; for (let j = 0; j < n; j++) acc += Ki[i * m + j] * L.Z[j]; c[i] = acc; }
      let e = 0, tr = 0, rss = 0;
      for (let i = 0; i < n; i++) { const r = c[i] * lam; rss += r * r; e += (r / (lam * Ki[i * m + i])) ** 2; tr += 1 - lam * Ki[i * m + i]; }
      const gcv = e / n / (1 - tr / n) ** 2;
      if (!best || gcv < best.gcv) best = { gcv, lam, c, Ki, loo: Math.sqrt(e / n), edf: tr, rss };
    }
    const b = best!; fit.loo = b.loo; fit.nLoo = n; fit.edf = b.edf;
    each((o, px, py) => { let z = b.c[n] + b.c[n + 1] * px + b.c[n + 2] * py; for (let k = 0; k < n; k++) z += b.c[k] * ker(Math.hypot(L.X[k] - px, L.Y[k] - py)); values[o] = z; });
    const sigma2 = b.rss / Math.max(1, n - b.edf);
    seFn = (out) => {
      const bx = new Float64Array(m);
      each((o, px, py) => {
        for (let k = 0; k < n; k++) bx[k] = ker(Math.hypot(L.X[k] - px, L.Y[k] - py));
        bx[n] = 1; bx[n + 1] = px; bx[n + 2] = py;
        let v = 0;
        for (let a = 0; a < n; a++) { let acc = 0; const row = a * m; for (let bb = 0; bb < m; bb++) acc += b.Ki[row + bb] * bx[bb]; v += acc * acc; }
        out[o] = Math.sqrt(sigma2 * v);
      });
    };
  }
  fit.ms = performance.now() - t0;
  post({ id: req.id, kind: "value", grid, values, dist, fit, se });
  if (req.wantSe && !se && seFn) {
    const t1 = performance.now(); const out = new Float32Array(nx * ny).fill(NaN); seFn(out);
    post({ id: req.id, kind: "se", se: out, ms: performance.now() - t1 });
  } else if (req.wantSe && !se) post({ id: req.id, kind: "se", se: null, ms: 0 });
}

self.onmessage = (e: MessageEvent<ContourReq>) => {
  try { run(e.data, (r) => (self as any).postMessage(r)); }
  catch (err: any) { (self as any).postMessage({ id: e.data.id, kind: "error", message: String(err?.message ?? err) }); }
};
