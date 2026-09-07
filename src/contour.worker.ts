// the Contour lens's numerics, off the main thread: an interpolated surface over the station summaries, its error
// surface and its leave-one-out error. Plain typed arrays, no library — n is the station grain (≤ 218 cells), so a
// global solve is cheap (plan 2026-09-07 § D31–D33; the timings are in the plan's "Measured" section).
//   idw  inverse-distance weighting, power 1.3 (parity with the superseded Contour Explorer's terra::interpIDW) — no error surface
//   ok   ordinary kriging: an exponential variogram fitted by weighted least squares, the kriging standard deviation as the error
//   tps  a thin-plate spline (mgcv's s(lon, lat) basis) with the smoothing picked by GCV; its standard error from the smoother
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

interface Local { X: Float64Array; Y: Float64Array; Z: Float64Array; n: number; kx: number; ky: number; lonc: number; latc: number }

/** the empirical semivariogram (15 bins to half the max distance) and an exponential model fitted by weighted least squares */
function variogram(L: Local) {
  const { X, Y, Z, n } = L; const nb = 15;
  let dmax = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dmax = Math.max(dmax, Math.hypot(X[i] - X[j], Y[i] - Y[j]));
  dmax /= 2;
  const bs = new Float64Array(nb), bn = new Float64Array(nb);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
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
    for (const e of emp) { const m = c0 + c1 * (1 - Math.exp(-e.h / a)); ss += (e.n * (e.g - m) ** 2) / (m * m); }
    if (ss < best.ss) best = { ss, nugget: c0, psill: c1, range: a };
  }
  return best;
}

function run(req: ContourReq, post: (r: ContourReply) => void) {
  const t0 = performance.now();
  const n = req.lon.length;
  // ── the grid: rows evenly spaced in Web-Mercator y, so the bitmap the map stretches between the bounds is exact ──
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  for (let i = 0; i < n; i++) { lo0 = Math.min(lo0, req.lon[i]); lo1 = Math.max(lo1, req.lon[i]); la0 = Math.min(la0, req.lat[i]); la1 = Math.max(la1, req.lat[i]); }
  const pad = 0.7, s = req.cellDeg * R;
  const lon0 = lo0 - pad, yN = merc(la1 + pad), yS = merc(la0 - pad);
  const nx = Math.ceil(((lo1 + pad - lon0) * R) / s), ny = Math.ceil((yN - yS) / s);
  const grid: SurfaceGrid = { lon0, lon1: lon0 + (nx * s) / R, latS: imerc(yN - ny * s), latN: imerc(yN), nx, ny, cellDeg: req.cellDeg };
  // ── a local equirectangular km frame about the points' centre ──
  const lonc = (lo0 + lo1) / 2, latc = (la0 + la1) / 2, kx = 111.32 * Math.cos(latc * R), ky = 110.57;
  const L: Local = { X: new Float64Array(n), Y: new Float64Array(n), Z: Float64Array.from(req.z), n, kx, ky, lonc, latc };
  for (let i = 0; i < n; i++) { L.X[i] = (req.lon[i] - lonc) * kx; L.Y[i] = (req.lat[i] - latc) * ky; }
  const cellXY = (i: number, j: number): [number, number] => [(lon0 + ((i + 0.5) * s) / R - lonc) * kx, (imerc(yN - (j + 0.5) * s) - latc) * ky];
  // ── the mask: a cell farther than maskKm from every station is blank (never an extrapolation) ──
  const mask = new Uint8Array(nx * ny); const r2 = req.maskKm * req.maskKm; let nMask = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [px, py] = cellXY(i, j);
    for (let k = 0; k < n; k++) if ((L.X[k] - px) ** 2 + (L.Y[k] - py) ** 2 <= r2) { mask[j * nx + i] = 1; nMask++; break; }
  }
  const values = new Float32Array(nx * ny).fill(NaN);
  const fit: Fit = { n, nCells: nMask, loo: NaN, ms: 0 };
  let seFn: ((se: Float32Array) => void) | null = null;

  if (req.method === "idw") {
    const power = 1.3, rad2 = 200 ** 2, sm2 = 5 ** 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = j * nx + i; if (!mask[o]) continue;
      const [px, py] = cellXY(i, j); let sw = 0, sz = 0;
      for (let k = 0; k < n; k++) { const d2 = (L.X[k] - px) ** 2 + (L.Y[k] - py) ** 2; if (d2 > rad2) continue; const w = 1 / Math.pow(d2 + sm2, power / 2); sw += w; sz += w * L.Z[k]; }
      values[o] = sw ? sz / sw : NaN;
    }
    let se = 0;
    for (let i = 0; i < n; i++) { let sw = 0, sz = 0; for (let k = 0; k < n; k++) { if (k === i) continue; const d2 = (L.X[k] - L.X[i]) ** 2 + (L.Y[k] - L.Y[i]) ** 2; const w = 1 / Math.pow(d2 + sm2, power / 2); sw += w; sz += w * L.Z[k]; } se += (sz / sw - L.Z[i]) ** 2; }
    fit.loo = Math.sqrt(se / n);
  } else if (req.method === "ok") {
    const vg = variogram(L); fit.vg = vg;
    const m = n + 1, cov = (d: number) => vg.psill * Math.exp(-d / vg.range);
    const K = new Float64Array(m * m);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) K[i * m + j] = i === j ? vg.psill + vg.nugget + 1e-6 * vg.psill : cov(Math.hypot(L.X[i] - L.X[j], L.Y[i] - L.Y[j])); K[i * m + n] = 1; K[n * m + i] = 1; }
    const Ki = inverse(K, m);
    // the weights applied to z fall out once: w = Ki·[z;0], so a prediction is one dot product per cell
    const wz = new Float64Array(m);
    for (let i = 0; i < m; i++) { let acc = 0; for (let j = 0; j < n; j++) acc += Ki[i * m + j] * L.Z[j]; wz[i] = acc; }
    let se = 0; for (let i = 0; i < n; i++) se += (wz[i] / Ki[i * m + i]) ** 2; fit.loo = Math.sqrt(se / n); // Dubrule 1983
    const kv = new Float64Array(m); kv[n] = 1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = j * nx + i; if (!mask[o]) continue;
      const [px, py] = cellXY(i, j); let z = 0;
      for (let k = 0; k < n; k++) z += wz[k] * cov(Math.hypot(L.X[k] - px, L.Y[k] - py));
      values[o] = z + wz[n];
    }
    seFn = (out) => {
      const lam = new Float64Array(m);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = j * nx + i; if (!mask[o]) continue;
        const [px, py] = cellXY(i, j);
        for (let k = 0; k < n; k++) kv[k] = cov(Math.hypot(L.X[k] - px, L.Y[k] - py));
        let v = vg.psill + vg.nugget;
        for (let a = 0; a < m; a++) { let acc = 0; const row = a * m; for (let b = 0; b < m; b++) acc += Ki[row + b] * kv[b]; lam[a] = acc; }
        for (let a = 0; a < m; a++) v -= lam[a] * kv[a];
        out[o] = Math.sqrt(Math.max(0, v));
      }
    };
  } else {
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
      let se = 0, tr = 0, rss = 0;
      for (let i = 0; i < n; i++) { const e = c[i] * lam; rss += e * e; se += (e / (lam * Ki[i * m + i])) ** 2; tr += 1 - lam * Ki[i * m + i]; }
      const gcv = se / n / (1 - tr / n) ** 2;
      if (!best || gcv < best.gcv) best = { gcv, lam, c, Ki, loo: Math.sqrt(se / n), edf: tr, rss };
    }
    const b = best!; fit.loo = b.loo; fit.edf = b.edf;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = j * nx + i; if (!mask[o]) continue;
      const [px, py] = cellXY(i, j); let z = b.c[n] + b.c[n + 1] * px + b.c[n + 2] * py;
      for (let k = 0; k < n; k++) z += b.c[k] * ker(Math.hypot(L.X[k] - px, L.Y[k] - py));
      values[o] = z;
    }
    const sigma2 = b.rss / Math.max(1, n - b.edf);
    seFn = (out) => {
      const bx = new Float64Array(m);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const o = j * nx + i; if (!mask[o]) continue;
        const [px, py] = cellXY(i, j);
        for (let k = 0; k < n; k++) bx[k] = ker(Math.hypot(L.X[k] - px, L.Y[k] - py));
        bx[n] = 1; bx[n + 1] = px; bx[n + 2] = py;
        let v = 0;
        for (let a = 0; a < n; a++) { let acc = 0; const row = a * m; for (let bb = 0; bb < m; bb++) acc += b.Ki[row + bb] * bx[bb]; v += acc * acc; }
        out[o] = Math.sqrt(sigma2 * v);
      }
    };
  }
  fit.ms = performance.now() - t0;
  post({ id: req.id, kind: "value", grid, values, fit });
  if (req.wantSe && seFn) {
    const t1 = performance.now(); const se = new Float32Array(nx * ny).fill(NaN); seFn(se);
    post({ id: req.id, kind: "se", se, ms: performance.now() - t1 });
  } else if (req.wantSe) post({ id: req.id, kind: "se", se: null, ms: 0 });
}

self.onmessage = (e: MessageEvent<ContourReq>) => {
  try { run(e.data, (r) => (self as any).postMessage(r)); }
  catch (err: any) { (self as any).postMessage({ id: e.data.id, kind: "error", message: String(err?.message ?? err) }); }
};
