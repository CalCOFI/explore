// Sections as CURTAINS (plan 2026-08-31, D28 reshaped; Ben: "yes to the 3D curtain plot"): a deck-only 3-D
// scene for the Sections lens (env realm — the bio section is station × year and has no water column).
// One deck camera holds everything, so nothing can mis-register (the risk that killed pitch-only 3-D):
//  · the sea floor as one SimpleMeshLayer built here from the SAME published terrain PMTiles (a few z7 tiles
//    decoded in-page — custom 1 m encoding: e = r·65536 + g·256 + b − 10000), coloured by the validated ramp
//    via a 1-D texture (texCoord u = depth), lit by finite-difference normals;
//  · the section as a vertical curtain along the line's station track — the lens's own cells (or their
//    climatology anomaly) painted to a canvas texture with the panel's exact colour scales;
//  · station dots at the surface. Vertical exaggeration (URL `exag=`, default 60 — 500 m over 700 km is
//    invisible at ×1) is baked into the meshes and rebuilt debounced; the slider lives in the scene.
//  · the camera is the URL's (`cam=lon,lat,zoom,pitch,bearing`, written debounced after a move, absent while the
//    scene wears the line's own framing) so a shared link reopens at the exact vantage; the Nav3D group in the
//    map's top-right row (rotate · tilt · a compass that resets) and deck's keyboard bindings drive it
//    (Ben, 2026-09-10: "cannot locate any keyboard shortcuts or the control").
//  · the station grid at the surface for reference (Ben, 2026-09-10: "lost most other frames of reference"): every
//    grid cell over the floor as a dot with its station number, a thread through each line and the line's name at
//    its offshore end; the floor covers the standard pattern (lines 76.7–93.3) as well as the section's own line.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Deck, MapView as DeckMapView, COORDINATE_SYSTEM, SimpleMeshLayer, ScatterplotLayer, PathLayer, TextLayer } from "deck.gl";
import { PMTiles } from "pmtiles";
import { BATHY_URL, BATHY_RAMP } from "./basemap";
import { colorScale } from "./map";
import { RAMP_DIV, type SectionCell } from "./charts";
import type { GridCell } from "./map";
import { roundCam, sameCam, type Cam } from "./state";
import { IconButton } from "./ui";

// ── the live camera, an external store: the Nav3D control subscribes and is the only thing that re-renders on
//    a drag (the App hears a debounced, rounded copy through onCam for the URL) ──
let liveCam: Cam | null = null, homeCam: Cam | null = null, deckRef: any = null;
const camSubs = new Set<() => void>();
const setLive = (c: Cam | null) => { liveCam = c; camSubs.forEach((f) => f()); };
export const useCam3d = () => useSyncExternalStore((f) => { camSubs.add(f); return () => camSubs.delete(f); }, () => liveCam);
const asViewState = (c: Cam) => ({ longitude: c[0], latitude: c[1], zoom: c[2], pitch: c[3], bearing: c[4] });
/** move the camera (a new initialViewState with a transition: deck reports every frame back through onViewStateChange) */
const fly = (to: Partial<ReturnType<typeof asViewState>>, ms = 350) => {
  const c = liveCam ?? homeCam; if (!deckRef || !c) return;
  const vs = { ...asViewState(c), ...to }; vs.pitch = Math.max(0, Math.min(85, vs.pitch));
  deckRef.setProps({ initialViewState: { maxPitch: 85, ...vs, transitionDuration: ms } });
};
/** the camera moves the controls make — the same steps as deck's keyboard (shift + arrows, + / −) */
export const cam3d = {
  zoom:   (d: number) => fly({ zoom: (liveCam ?? homeCam)![2] + d }),
  rotate: (d: number) => fly({ bearing: (liveCam ?? homeCam)![4] + d }),
  tilt:   (d: number) => fly({ pitch: (liveCam ?? homeCam)![3] + d }),
  home:   () => { if (homeCam) fly(asViewState(homeCam), 600); },
};

/** the 3-D camera group for the map's top-right row: rotate · tilt · a compass whose needle shows north and the
 *  tilt (MapLibre's visualizePitch), a click on it restoring the line's own framing */
export function Nav3D() {
  const c = useCam3d();
  const pitch = c?.[3] ?? 0, bearing = c?.[4] ?? 0;
  return (
    <span className="map-nav3d" role="group" aria-label="3-D camera">
      <IconButton icon="ui-rotate-l" label="Rotate left (shift + ←, or shift-drag)" className="map-zoom-btn" onClick={() => cam3d.rotate(-15)} />
      <IconButton icon="ui-rotate-r" label="Rotate right (shift + →, or shift-drag)" className="map-zoom-btn" onClick={() => cam3d.rotate(15)} />
      <IconButton icon="ui-tilt-more" label="Tilt toward the horizon (shift + ↑)" className="map-zoom-btn" onClick={() => cam3d.tilt(10)} disabled={pitch >= 85} />
      <IconButton icon="ui-tilt-less" label="Tilt toward straight down (shift + ↓)" className="map-zoom-btn" onClick={() => cam3d.tilt(-10)} disabled={pitch <= 0} />
      <button type="button" className="cc-icon-button map-zoom-btn map-compass" aria-label="Reset the view to the line's framing"
        title={`bearing ${Math.round(bearing)}° · pitch ${Math.round(pitch)}° — click to reset to the line's framing`} onClick={cam3d.home}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ transform: `rotateX(${Math.min(pitch, 60) * 0.7}deg) rotateZ(${-bearing}deg)` }}>
          <path d="M12 2 L16 12 L12 10.5 L8 12 Z" className="north" />
          <path d="M12 22 L8 12 L12 13.5 L16 12 Z" className="south" />
        </svg>
      </button>
    </span>
  );
}

const TILE = 512, Z = 7, O = 20037508.342789244;
const mx = (lon: number) => (lon * O) / 180;
const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (O / Math.PI);
const inv = (x: number, y: number) => [x * 180 / O, (2 * Math.atan(Math.exp((y * Math.PI) / O)) - Math.PI / 2) * 180 / Math.PI];

export interface Mosaic { e: Float32Array; W: number; H: number; x0m: number; y1m: number; res: number }
const mosaics = new Map<string, Promise<Mosaic>>(); // per bbox key, decoded once per session
/** the GEBCO terrain-RGB tiles covering a bbox as one elevation mosaic (metres, negative below sea level); z7 for the
 *  curtain's sea floor, z6 for the Contours lens's land clip (contour.ts landMask) */
export async function loadMosaic(w: number, s: number, e: number, n: number, z = Z): Promise<Mosaic> {
  const key = [w, s, e, n, z].join(",");
  if (!mosaics.has(key)) mosaics.set(key, (async () => {
    const pm = new PMTiles(`${BATHY_URL}gebco_2025_calcofi_terrain.pmtiles`);
    const span = (2 * O) / 2 ** z, res = span / TILE;
    const tx0 = Math.floor((mx(w) + O) / span), tx1 = Math.floor((mx(e) + O) / span);
    const ty0 = Math.floor((O - my(n)) / span), ty1 = Math.floor((O - my(s)) / span);
    const W = (tx1 - tx0 + 1) * TILE, H = (ty1 - ty0 + 1) * TILE;
    const el = new Float32Array(W * H).fill(NaN);
    const cv = new OffscreenCanvas(TILE, TILE), ctx = cv.getContext("2d", { willReadFrequently: true })!;
    await Promise.all(Array.from({ length: (tx1 - tx0 + 1) * (ty1 - ty0 + 1) }, async (_, i) => {
      const x = tx0 + (i % (tx1 - tx0 + 1)), y = ty0 + Math.floor(i / (tx1 - tx0 + 1));
      const t = await pm.getZxy(z, x, y); if (!t) return; // outside the core: the far tier is not needed for a line scene
      const img = await createImageBitmap(new Blob([t.data], { type: "image/png" }));
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, TILE, TILE).data;
      const ox = (x - tx0) * TILE, oy = (y - ty0) * TILE;
      for (let r = 0; r < TILE; r++) for (let c = 0; c < TILE; c++) {
        const j = (r * TILE + c) * 4;
        el[(oy + r) * W + ox + c] = d[j] * 65536 + d[j + 1] * 256 + d[j + 2] - 10000;
      }
    }));
    return { e: el, W, H, x0m: tx0 * span - O, y1m: O - ty0 * span, res };
  })());
  return mosaics.get(key)!;
}
/** the elevation under a lon/lat from a mosaic (NaN outside it) */
export function mosaicAt(m: Mosaic, lon: number, lat: number): number {
  const c = Math.floor((mx(lon) - m.x0m) / m.res), r = Math.floor((m.y1m - my(lat)) / m.res);
  return c < 0 || r < 0 || c >= m.W || r >= m.H ? NaN : m.e[r * m.W + c];
}

function rampTexture(theme: "dark" | "light"): HTMLCanvasElement {
  const stops = BATHY_RAMP[theme]; const cv = document.createElement("canvas"); cv.width = 256; cv.height = 1;
  const ctx = cv.getContext("2d")!; const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i < stops.length; i += 2) {
    const d = -(stops[i] as number) / 6500; // texCoord u = depth / 6500
    if (d >= 0 && d <= 1) g.addColorStop(d, String(stops[i + 1]).replace(/rgba\(([^)]*),0\)/, "rgba($1,1)"));
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 1); return cv;
}

function divergingAt(t: number, dark: boolean): string {
  const stops = RAMP_DIV(dark); let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  const f = (b[0] - a[0]) > 0 ? (t - a[0]) / (b[0] - a[0]) : 0;
  const px = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const ca = px(a[1]), cb = px(b[1]);
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * f)).join(",")})`;
}

/** the curtain's texture: one column per station, one row per 10 m bin; no value = transparent */
function curtainTexture(cells: SectionCell[], clim: SectionCell[] | null, anom: boolean, theme: string,
                        stations: number[], maxY: number): { cv: HTMLCanvasElement; painted: number } {
  const K = 8, rows = Math.max(1, Math.round(maxY / 10) + 1);
  const cv = document.createElement("canvas"); cv.width = Math.max(1, stations.length * K); cv.height = rows;
  const ctx = cv.getContext("2d")!;
  let painted = 0;
  const climMap = new Map((clim ?? []).map((c) => [`${c.station}|${c.month}|${c.y}`, c.v]));
  const val = (c: SectionCell) => !anom ? c.v : (climMap.has(`${c.station}|${c.month}|${c.y}`) ? c.v - climMap.get(`${c.station}|${c.month}|${c.y}`)! : null);
  const vals = cells.map(val).filter((v): v is number => v != null);
  if (!vals.length) return { cv, painted: 0 };
  const amax = Math.max(0.1, ...vals.map(Math.abs));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const base = colorScale([lo, hi], 255);
  const paint = (v: number) => anom ? divergingAt((v / amax + 1) / 2, theme === "dark") : `rgb(${base(v).slice(0, 3).join(",")})`;
  // a bottle cast samples discrete standard depths: interpolate each station's column between its valued
  // bins (what the 2-D panel's zsmooth does), never past the deepest one — the curtain ends where the data does
  for (let xi = 0; xi < stations.length; xi++) {
    const col = cells.filter((c) => c.station === stations[xi]).map((c) => ({ r: Math.round(c.y / 10), v: val(c) }))
      .filter((c): c is { r: number; v: number } => c.v != null).sort((a, b) => a.r - b.r);
    for (let i = 0; i < col.length; i++) {
      if (i < col.length - 1) {
        const a = col[i], b = col[i + 1];
        for (let r = a.r; r < b.r; r++) { ctx.fillStyle = paint(a.v + ((b.v - a.v) * (r - a.r)) / Math.max(1, b.r - a.r)); ctx.fillRect(xi * K, r, K, 1); painted++; }
      } else { ctx.fillStyle = paint(col[i].v); ctx.fillRect(xi * K, col[i].r, K, 1); painted++; }
    }
  }
  return { cv, painted };
}

export function Curtain3D(p: { cells: SectionCell[]; clim: SectionCell[] | null; anom: boolean; theme: "dark" | "light";
                               line: number; grid: GridCell[]; exag: number; onExag: (v: number | null) => void; unit: string;
                               cam: Cam | null; onCam: (c: Cam | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const deck = useRef<any>(null);
  const [status, setStatus] = useState("decoding the sea floor …");
  const onCam = useRef(p.onCam); onCam.current = p.onCam;

  const track = p.grid.filter((g) => g.line === p.line).sort((a, b) => a.station - b.station);
  const stations = [...new Set(p.cells.map((c) => c.station))].sort((a, b) => a - b);
  const maxY = Math.max(100, ...p.cells.map((c) => c.y));
  const lon0 = track.length ? track[Math.floor(track.length / 2)].home[0] : -121.5;
  const lat0 = track.length ? track[Math.floor(track.length / 2)].home[1] : 33.2;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const off = (lon: number, lat: number): [number, number] => [(lon - lon0) * kx, (lat - lat0) * ky];

  // frame the CURTAIN'S FACE (chosen from a camera sweep, shots/slice4/cam_*): look slightly obliquely at the
  // ribbon from the line's south-east side, the centre pulled toward the camera so the below-surface curtain
  // fills the frame rather than hanging under it
  const a = track[0]?.home ?? [-122.5, 32.5], b2 = track[track.length - 1]?.home ?? [-120.5, 34];
  const trackBearing = (Math.atan2((b2[0] - a[0]) * kx, (b2[1] - a[1]) * ky) * 180) / Math.PI;
  const camB = trackBearing - 90 + 20, camR = (camB * Math.PI) / 180;
  homeCam = roundCam([lon0 - Math.sin(camR) * 0.55 / Math.max(0.2, Math.cos((lat0 * Math.PI) / 180)), lat0 - Math.cos(camR) * 0.55, 7.6, 55, camB]);
  useEffect(() => {
    const start = p.cam ?? homeCam!;
    let timer = 0;
    const d = new Deck({
      parent: el.current!,
      // keyboard on: the canvas takes focus on a click, then arrows pan, shift + arrows rotate and tilt, + / − zoom
      views: new DeckMapView({ controller: { touchRotate: true, keyboard: true } as any }),
      initialViewState: { ...asViewState(start), maxPitch: 85 },
      onViewStateChange: ({ viewState }: any) => {
        const c: Cam = [viewState.longitude, viewState.latitude, viewState.zoom, viewState.pitch, viewState.bearing];
        setLive(c);
        // the URL hears the rounded camera once the move settles; the line's own framing is "no cam=" (a fresh link)
        clearTimeout(timer);
        timer = window.setTimeout(() => { const r = roundCam(c); onCam.current(sameCam(r, homeCam) ? null : r); }, 300);
      },
      deviceProps: { type: "webgl", webgl: { preserveDrawingBuffer: true } } as any,
      layers: [],
    } as any);
    deck.current = d; deckRef = d; setLive(start); (window as any).__deck3d = d;
    // deck's pointer handling preventDefaults the press, so a click never focuses the canvas on its own (probe
    // 2026-09-10: activeElement stayed BODY); focus it ourselves, or the keyboard bindings are unreachable
    const focusCanvas = () => { (el.current?.querySelector("canvas") as HTMLElement | null)?.focus(); };
    el.current!.addEventListener("pointerdown", focusCanvas, true);
    (window as any).__setCam = (vs: any) => d.setProps({ initialViewState: { maxPitch: 85, ...vs } }); // verify/tuning hook
    (window as any).__cam3d = () => liveCam; (window as any).__cam3dOps = cam3d;                    // verify hooks
    return () => { clearTimeout(timer); el.current?.removeEventListener("pointerdown", focusCanvas, true); d.finalize(); deck.current = null; deckRef = null; setLive(null); };
  }, []);
  // another line is another place: the camera goes back to that line's framing and the URL drops its cam=
  const lineSeen = useRef(p.line);
  useEffect(() => { if (lineSeen.current !== p.line) { lineSeen.current = p.line; cam3d.home(); onCam.current(null); } }, [p.line]);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!track.length) { setStatus("no stations on this line"); return; }
      const lons = track.map((t) => t.home[0]), lats = track.map((t) => t.home[1]);
      // the floor: the line's own bbox ∪ the standard pattern's (lines 76.7–93.3 — the 66 stations every cruise
      // occupies, the frame of reference a reader knows), so neighbouring lines stand on ground, not in the void
      const std = p.grid.filter((g) => g.line >= 76.7 && g.line <= 93.3);
      const bb = { w: Math.min(...lons, ...std.map((g) => g.home[0])) - 0.9, s: Math.min(...lats, ...std.map((g) => g.home[1])) - 0.7,
                   e: Math.max(...lons, ...std.map((g) => g.home[0])) + 0.9, n: Math.max(...lats, ...std.map((g) => g.home[1])) + 0.7 };
      const m = await loadMosaic(bb.w, bb.s, bb.e, bb.n);
      if (dead) return;
      // ── the sea-floor mesh, decimated ×4 (z7 is 611 m/px, so vertices sit ~2.4 km apart) ──
      const S = 4, MW = Math.floor(m.W / S), MH = Math.floor(m.H / S);
      const pos = new Float32Array(MW * MH * 3), tex = new Float32Array(MW * MH * 2), nor = new Float32Array(MW * MH * 3);
      // the stage is the SECTION'S depth window: floor clipped a little below the curtain, so the shelf and
      // banks it hangs over are honest while the abyss becomes a flat plinth instead of a x60 tower
      const zFloor = -(maxY * 1.4 + 100);
      const z = (i: number, j: number) => Math.max(zFloor, Math.min(0, m.e[Math.min(m.H - 1, j * S) * m.W + Math.min(m.W - 1, i * S)] || 0));
      for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
        const [lon, lat] = inv(m.x0m + i * S * m.res, m.y1m - j * S * m.res);
        const [x, y] = off(lon, lat); const k = j * MW + i; const zz = z(i, j);
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = zz * p.exag;
        tex[k * 2] = Math.min(1, -zz / 6500); tex[k * 2 + 1] = 0.5;
        const dzx = (z(Math.min(MW - 1, i + 1), j) - z(Math.max(0, i - 1), j)) * p.exag, dzy = (z(i, Math.min(MH - 1, j + 1)) - z(i, Math.max(0, j - 1))) * p.exag;
        const step = 2 * S * m.res; const nl = Math.hypot(dzx, dzy, step) || 1;
        nor[k * 3] = -dzx / nl; nor[k * 3 + 1] = dzy / nl; nor[k * 3 + 2] = step / nl;
      }
      const idx = new Uint32Array((MW - 1) * (MH - 1) * 6); let q = 0;
      for (let j = 0; j < MH - 1; j++) for (let i = 0; i < MW - 1; i++) {
        const a = j * MW + i, b = a + 1, c = a + MW, dd = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = dd;
      }
      // ── the curtain: one column per station with data, surface to maxY ──
      const cs = stations.map((st) => track.find((t) => t.station === st)).filter((t): t is GridCell => !!t);
      const cN = cs.length;
      const cpos = new Float32Array(cN * 2 * 3), ctex = new Float32Array(cN * 2 * 2);
      cs.forEach((t, i) => {
        const [x, y] = off(t.home[0], t.home[1]); const u = (i + 0.5) / cN;
        cpos.set([x, y, 0], i * 3); ctex.set([u, 0], i * 2);                       // surface row
        cpos.set([x, y, -maxY * p.exag], (cN + i) * 3); ctex.set([u, 1], (cN + i) * 2); // bottom row
      });
      const cidx = new Uint32Array((cN - 1) * 6); q = 0;
      for (let i = 0; i < cN - 1; i++) { const a = i, b = i + 1, c = cN + i, dd = cN + i + 1; cidx[q++] = a; cidx[q++] = c; cidx[q++] = b; cidx[q++] = b; cidx[q++] = c; cidx[q++] = dd; }
      const { cv: ctexture, painted } = curtainTexture(p.cells, p.clim, p.anom, p.theme, stations, maxY);
      // a hairline frame: the anomaly ramp's midpoint is deliberately the PANEL's background colour, which on
      // this stage is the terrain — a near-normal curtain would otherwise vanish into it (light theme, 1950)
      const surf = cs.map((t) => [...off(t.home[0], t.home[1]), 0] as [number, number, number]);
      const frame = [...surf, ...surf.slice().reverse().map(([x, y]) => [x, y, -maxY * p.exag] as [number, number, number]), surf[0]];
      // ── the station grid at the surface: every cell over the floor, threaded by line and labelled ──
      const ref = p.grid.filter((g) => g.home[0] >= bb.w && g.home[0] <= bb.e && g.home[1] >= bb.s && g.home[1] <= bb.n);
      const byLine = new Map<number, GridCell[]>();
      for (const g of ref) (byLine.get(g.line) ?? byLine.set(g.line, []).get(g.line)!).push(g);
      const threads = [...byLine.entries()].map(([ln, gs]) => ({ line: ln, path: gs.sort((a, b) => a.station - b.station).map((g) => [...off(g.home[0], g.home[1]), 0] as [number, number, number]) }));
      const fmtN = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
      // a line's name at BOTH ends: the offshore end is out of frame as often as not (Ben, 2026-09-10: "label the Lines too")
      const lineEnds = [...byLine.entries()].flatMap(([ln, gs]) => {
        const sorted = gs.slice().sort((a, b) => a.station - b.station);
        return [sorted[0], sorted[sorted.length - 1]].map((g) => ({ text: `line ${fmtN(ln)}`, pos: [...off(g.home[0], g.home[1]), 0] as [number, number, number], own: ln === p.line }));
      });
      const dark = p.theme === "dark";
      const ink = (a: number) => (dark ? [220, 230, 240, a] : [30, 45, 60, a]) as [number, number, number, number];
      const halo = (dark ? [8, 18, 32, 200] : [245, 247, 250, 200]) as [number, number, number, number];
      const font = getComputedStyle(document.body).fontFamily || "sans-serif";
      const textProps = { coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0] as [number, number, number],
        fontFamily: font, fontSettings: { sdf: true, fontSize: 64, buffer: 8, radius: 8 }, outlineWidth: 1.5, outlineColor: halo, sizeUnits: "pixels" as const,
        getTextAnchor: "middle" as const, billboard: true };
      (window as any).__curtain = { stations: cN, cells: p.cells.length, painted, terrainVerts: MW * MH, maxDepth: maxY, exag: p.exag, anom: p.anom, gridDots: ref.length, lines: threads.length };
      deck.current?.setProps({ layers: [
        new SimpleMeshLayer({ id: "floor", coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0],
          data: [0], getPosition: () => [0, 0, 0], mesh: { attributes: { positions: { value: pos, size: 3 }, texCoords: { value: tex, size: 2 }, normals: { value: nor, size: 3 } }, indices: { value: idx, size: 1 } } as any,
          texture: rampTexture(p.theme), getColor: [255, 255, 255, 255] }),
        new SimpleMeshLayer({ id: "curtain", coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0],
          data: [0], getPosition: () => [0, 0, 0], mesh: { attributes: { positions: { value: cpos, size: 3 }, texCoords: { value: ctex, size: 2 } }, indices: { value: cidx, size: 1 } } as any,
          texture: ctexture, getColor: [255, 255, 255, 255], material: false, parameters: { cullMode: "none" } as any }),
        new PathLayer({ id: "curtain-frame", coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0],
          data: [frame], getPath: (d: any) => d, widthMinPixels: 1.5, widthMaxPixels: 2,
          getColor: (p.theme === "dark" ? [255, 255, 255, 80] : [30, 45, 60, 110]) as any }),
        new PathLayer({ id: "grid-threads", coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0],
          data: threads, getPath: (d: any) => d.path, widthMinPixels: 1, widthMaxPixels: 1.5,
          getColor: (d: any) => (d.line === p.line ? ink(150) : ink(55)) as any }),
        new ScatterplotLayer({ id: "grid-dots", coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0],
          data: ref.filter((g) => g.line !== p.line), getPosition: (g: GridCell) => [...off(g.home[0], g.home[1]), 0] as any,
          radiusMinPixels: 2, radiusMaxPixels: 3.5, getFillColor: ink(120) as any }),
        new ScatterplotLayer({ id: "dots3d", coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [lon0, lat0, 0],
          data: track, getPosition: (t: GridCell) => [...off(t.home[0], t.home[1]), 0] as any, radiusMinPixels: 3, radiusMaxPixels: 6,
          getFillColor: (t: GridCell) => (stations.includes(t.station) ? [255, 214, 10, 235] : [160, 170, 180, 160]) as any }),
        new TextLayer({ id: "grid-station-labels", ...textProps, data: ref, getPosition: (g: GridCell) => [...off(g.home[0], g.home[1]), 0] as any,
          getText: (g: GridCell) => fmtN(g.station), getSize: (g: GridCell) => (g.line === p.line ? 13 : 11), getPixelOffset: [0, -9],
          getAlignmentBaseline: "bottom", getColor: (g: GridCell) => (g.line === p.line ? ink(240) : ink(150)) as any }),
        new TextLayer({ id: "grid-line-labels", ...textProps, data: lineEnds, getPosition: (d: any) => d.pos, getText: (d: any) => d.text,
          getSize: (d: any) => (d.own ? 15 : 13), fontWeight: 700, getPixelOffset: [0, 14], getAlignmentBaseline: "top",
          getColor: (d: any) => (d.own ? [255, 214, 10, 240] : ink(190)) as any }),
      ] });
      // the anomaly is month-matched, always (the climatology's own rule): a cruise whose calendar month never
      // cleared the >= 3-cruise floor (September, mostly) has NO baseline — the panel goes blank by design, and
      // in 3-D the frame still shows the curtain's extent; say why it is empty
      setStatus(p.anom && painted === 0 && p.cells.length > 0
        ? "no month-matched climatology for this cruise's month (needs ≥ 3 cruises in 1993–2013) — the anomaly curtain is blank"
        : "");
    })().catch((e) => setStatus(`3-D scene failed: ${e.message}`));
    return () => { dead = true; };
  }, [p.cells, p.clim, p.anom, p.theme, p.line, p.grid.length, p.exag]);

  return (
    <div ref={el} className="curtain-scene">
      {status && <div className="curtain-status hint">{status}</div>}
      <div className="curtain-ui">
        <label className="hint">exaggeration ×{p.exag}
          <input type="range" min={10} max={150} step={10} value={p.exag}
            onChange={(e) => p.onExag(+e.target.value === 60 ? null : +e.target.value)} /></label>
        <span className="hint">drag pans · shift-drag rotates and tilts · scroll zooms · arrows after a click · the curtain is the section panel's colours{p.anom ? " (anomaly)" : ""} · floor clipped below {Math.round(maxY * 1.4 + 100)} m</span>
      </div>
    </div>
  );
}
