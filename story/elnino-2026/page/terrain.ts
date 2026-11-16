// the sea floor, from the SAME published GEBCO 2025 terrain PMTiles the Explorer draws (src/basemap.ts BATHY_URL; the
// custom 1 m encoding e = r·65536 + g·256 + b − 10000), decoded in-page the way src/curtain.tsx loadMosaic() does it.
// That function lives in a React module (it would pull the whole app into this page), so its dozen lines are repeated
// here; the ramp is the app's own (BATHY_RAMP), imported.
//   · flatBathy(): the mosaic as one shaded, depth-coloured image for the bird's-eye beats (a flat bitmap: a 3-D mesh
//     under a perspective camera would shift against the coastline)
//   · floorMesh(): the mesh of the 3-D beat, metres from an origin, vertical exaggeration baked in, clipped to a plinth
//     a little below the section (curtain.tsx's stage: the abyss is not a tower). At the section's own exaggeration an
//     island is a needle, so the mesh is the terrain itself only beside the section's line and a low-passed, fading
//     backdrop away from it
import { PMTiles } from "pmtiles";
import { BATHY_URL, BATHY_RAMP } from "../../../src/basemap";

const TILE = 512, O = 20037508.342789244;
const mx = (lon: number) => (lon * O) / 180;
const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (O / Math.PI);
export const invMerc = (x: number, y: number): [number, number] => [(x * 180) / O, ((2 * Math.atan(Math.exp((y * Math.PI) / O)) - Math.PI / 2) * 180) / Math.PI];

export interface Mosaic { e: Float32Array; W: number; H: number; x0m: number; y1m: number; res: number; tiles: number; missing: number }

export async function loadMosaic(w: number, s: number, e: number, n: number, z = 7): Promise<Mosaic> {
  const pm = new PMTiles(`${BATHY_URL}gebco_2025_calcofi_terrain.pmtiles`);
  const far = new PMTiles(`${BATHY_URL}gebco_2025_calcofi_terrain_far.pmtiles`); // the coarser tier, where the core has no tile
  const span = (2 * O) / 2 ** z, res = span / TILE;
  const tx0 = Math.floor((mx(w) + O) / span), tx1 = Math.floor((mx(e) + O) / span);
  const ty0 = Math.floor((O - my(n)) / span), ty1 = Math.floor((O - my(s)) / span);
  const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, W = nx * TILE, H = ny * TILE;
  const el = new Float32Array(W * H).fill(NaN);
  let missing = 0;
  await Promise.all(Array.from({ length: nx * ny }, async (_, i) => {
    const x = tx0 + (i % nx), y = ty0 + Math.floor(i / nx);
    const t = (await pm.getZxy(z, x, y)) ?? (await far.getZxy(z, x, y).catch(() => undefined));
    if (!t) { missing++; return; }
    const img = await createImageBitmap(new Blob([t.data], { type: "image/png" }));
    const cv = new OffscreenCanvas(TILE, TILE), ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, TILE, TILE).data;
    const ox = (x - tx0) * TILE, oy = (y - ty0) * TILE;
    for (let r = 0; r < TILE; r++) for (let c = 0; c < TILE; c++) {
      const j = (r * TILE + c) * 4;
      el[(oy + r) * W + ox + c] = d[j] * 65536 + d[j + 1] * 256 + d[j + 2] - 10000;
    }
  }));
  return { e: el, W, H, x0m: tx0 * span - O, y1m: O - ty0 * span, res, tiles: nx * ny, missing };
}

/** the mosaic's lon/lat bounds [west, south, east, north]; its rows are regular in Web-Mercator y, which is what a
 *  deck BitmapLayer stretches between its bounds */
export function mosaicBounds(m: Mosaic): [number, number, number, number] {
  const [w, n] = invMerc(m.x0m, m.y1m), [e, s] = invMerc(m.x0m + m.W * m.res, m.y1m - m.H * m.res);
  return [w, s, e, n];
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** the app's dark depth ramp as (depth m ≥ 0) → rgb; the ramp's last stop (0 m, transparent) takes the −50 m colour */
function depthColor(): (d: number) => [number, number, number] {
  const st = BATHY_RAMP.dark, pts: { d: number; c: [number, number, number] }[] = [];
  for (let i = 0; i < st.length; i += 2) { const s = String(st[i + 1]); if (s.startsWith("#")) pts.push({ d: -(st[i] as number), c: hex(s) }); }
  pts.sort((a, b) => a.d - b.d);
  return (d: number) => {
    if (d <= pts[0].d) return pts[0].c;
    for (let i = 1; i < pts.length; i++) if (d <= pts[i].d) {
      const a = pts[i - 1], b = pts[i], f = (d - a.d) / (b.d - a.d);
      return [a.c[0] + (b.c[0] - a.c[0]) * f, a.c[1] + (b.c[1] - a.c[1]) * f, a.c[2] + (b.c[2] - a.c[2]) * f];
    }
    return pts[pts.length - 1].c;
  };
}

/** the bird's-eye sea floor: depth colour × a north-west light. Land (elevation ≥ 0) and missing tiles are transparent,
 *  so the page's own ground shows there and the land layer draws over it. */
export function flatBathy(m: Mosaic): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = m.W; cv.height = m.H;
  const ctx = cv.getContext("2d")!, img = ctx.createImageData(m.W, m.H), d = img.data, col = depthColor();
  const at = (i: number, j: number) => { const v = m.e[Math.min(m.H - 1, Math.max(0, j)) * m.W + Math.min(m.W - 1, Math.max(0, i))]; return Number.isFinite(v) ? v : 0; };
  for (let j = 0; j < m.H; j++) for (let i = 0; i < m.W; i++) {
    const o = j * m.W + i, e = m.e[o];
    if (!Number.isFinite(e) || e >= 0) continue;
    // slope toward the light (from the north-west, the cartographic habit), in metres per metre, softly exaggerated
    const dzx = (at(i + 1, j) - at(i - 1, j)) / (2 * m.res), dzy = (at(i, j - 1) - at(i, j + 1)) / (2 * m.res);
    const shade = Math.max(0.55, Math.min(1.6, 1 + 9 * (-dzx + dzy)));
    const c = col(-e);
    d[o * 4] = Math.min(255, c[0] * shade); d[o * 4 + 1] = Math.min(255, c[1] * shade); d[o * 4 + 2] = Math.min(255, c[2] * shade); d[o * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export interface FloorMesh { positions: Float32Array; texCoords: Float32Array; normals: Float32Array; indices: Uint32Array; texture: HTMLCanvasElement; vertices: number }
export interface FloorOpts {
  /** metres east / north are measured from here */ lon0: number; lat0: number;
  /** vertical exaggeration, and the plinth: no vertex lies deeper than zFloor (m, negative) */ exag: number; zFloor: number;
  /** the section's ends [lon, lat]: the floor is the TRUE sea floor within nearKm of that segment … */ a: [number, number]; b: [number, number];
  nearKm?: number;
  /** … a low-passed one from blendKm outward (islands and banks at this exaggeration are needles otherwise) … */ blendKm?: number;
  /** … and sinks to the plinth and into the page's ground between fade0Km and fade1Km */ fade0Km?: number; fade1Km?: number;
  step?: number; dim?: number; ground?: [number, number, number];
}
const smooth = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** three passes of a box blur of half-width r over a grid: close to a Gaussian */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0, n = 0; for (let k = Math.max(0, i - r); k <= Math.min(w - 1, i + r); k++) { s += a[j * w + k]; n++; } b[j * w + i] = s / n; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0, n = 0; for (let k = Math.max(0, j - r); k <= Math.min(h - 1, j + r); k++) { s += b[k * w + i]; n++; } a[j * w + i] = s / n; }
  }
  return a;
}
/** the 3-D sea floor in metres east / north of (lon0, lat0), z = elevation × exag. ONE vertical scale where the section
 *  meets it: within nearKm of the section's line it is the terrain itself; farther out it is low-passed, so an island or
 *  a bank is a rise and not a needle; beyond fade0Km it sinks to the plinth and fades into the ground. Never below zFloor
 *  (the plinth, a little under the section) and never above −2 m (the land polygons sit at 0). */
export function floorMesh(m: Mosaic, o: FloorOpts): FloorMesh {
  const step = o.step ?? 4, nearKm = o.nearKm ?? 7, blendKm = o.blendKm ?? 24, fade0 = o.fade0Km ?? 55, fade1 = o.fade1Km ?? 150, dim = o.dim ?? 0.8, ground = o.ground ?? [15, 26, 46];
  const kx = 111320 * Math.cos((o.lat0 * Math.PI) / 180), ky = 110540;
  const MW = Math.floor(m.W / step), MH = Math.floor(m.H / step);
  const xs = new Float32Array(MW), ys = new Float32Array(MH);
  for (let i = 0; i < MW; i++) xs[i] = (invMerc(m.x0m + i * step * m.res, 0)[0] - o.lon0) * kx;
  for (let j = 0; j < MH; j++) ys[j] = (invMerc(0, m.y1m - j * step * m.res)[1] - o.lat0) * ky;
  const raw = new Float32Array(MW * MH);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) { const v = m.e[Math.min(m.H - 1, j * step) * m.W + Math.min(m.W - 1, i * step)]; raw[j * MW + i] = Number.isFinite(v) ? v : -4000; }
  const clamp = (v: number) => Math.max(o.zFloor, Math.min(-2, v));
  // beside the line the terrain keeps its own shape at about 3 km (one light pass: a pinnacle one vertex wide is a needle
  // at this exaggeration); away from it, a 10 km low-pass
  const sharp = blur(raw.map(clamp), MW, MH, 1), soft = blur(sharp, MW, MH, 5), softRaw = blur(raw.map((v) => Math.min(0, v)), MW, MH, 5);
  // distance (km) of every vertex from the section's segment
  const ax = (o.a[0] - o.lon0) * kx, ay = (o.a[1] - o.lat0) * ky, bx = (o.b[0] - o.lon0) * kx, by = (o.b[1] - o.lat0) * ky, L2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const z = new Float32Array(MW * MH), far = new Float32Array(MW * MH);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const k = j * MW + i, t = Math.min(1, Math.max(0, ((xs[i] - ax) * (bx - ax) + (ys[j] - ay) * (by - ay)) / L2));
    const d = Math.hypot(xs[i] - (ax + t * (bx - ax)), ys[j] - (ay + t * (by - ay))) / 1000;
    const near = 1 - smooth(d, nearKm, blendKm); far[k] = smooth(d, fade0, fade1);
    const zz = soft[k] + (sharp[k] - soft[k]) * near;
    z[k] = o.zFloor + (zz - o.zFloor) * (1 - far[k]);
  }
  const pos = new Float32Array(MW * MH * 3), tex = new Float32Array(MW * MH * 2), nor = new Float32Array(MW * MH * 3);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const k = j * MW + i;
    pos[k * 3] = xs[i]; pos[k * 3 + 1] = ys[j]; pos[k * 3 + 2] = z[k] * o.exag;
    tex[k * 2] = Math.min(1, Math.max(0, -softRaw[k] / 6500)); tex[k * 2 + 1] = far[k];   // u: the (low-passed) true depth, also on the plinth · v: the fade
    const i0 = Math.max(0, i - 1), i1 = Math.min(MW - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(MH - 1, j + 1);
    const dzx = ((z[j * MW + i1] - z[j * MW + i0]) * o.exag) / (xs[i1] - xs[i0]), dzy = ((z[j0 * MW + i] - z[j1 * MW + i]) * o.exag) / (ys[j0] - ys[j1]);
    const nl = Math.hypot(dzx, dzy, 1);
    nor[k * 3] = -dzx / nl; nor[k * 3 + 1] = -dzy / nl; nor[k * 3 + 2] = 1 / nl;
  }
  const idx = new Uint32Array((MW - 1) * (MH - 1) * 6); let q = 0;
  for (let j = 0; j < MH - 1; j++) for (let i = 0; i < MW - 1; i++) {
    const a = j * MW + i, b = a + 1, c = a + MW, dd = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = dd;
  }
  // the texture: u = depth / 6500 through the app's ramp (curtain.tsx rampTexture()), v = 0 as it is → 1 the page's ground
  const col = depthColor(), TW = 256, TH = 32, tx = document.createElement("canvas"); tx.width = TW; tx.height = TH;
  const g = tx.getContext("2d")!, im = g.createImageData(TW, TH);
  for (let r = 0; r < TH; r++) for (let i = 0; i < TW; i++) {
    const c = col((i / (TW - 1)) * 6500), f = r / (TH - 1), p = (r * TW + i) * 4;
    for (let ch = 0; ch < 3; ch++) im.data[p + ch] = c[ch] * dim * (1 - f) + ground[ch] * f;
    im.data[p + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return { positions: pos, texCoords: tex, normals: nor, indices: idx, texture: tx, vertices: MW * MH };
}
