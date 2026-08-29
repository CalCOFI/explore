// the whole-view figure (plan D17): the map + the open panels with the pills and the status chip hidden
// and the footer baked in — what Share → Copy image / Download PNG gives, and what the feedback dialog
// annotates. One `html-to-image` toCanvas over the app root: it serializes the DOM into an SVG
// <foreignObject> and rasterizes it in the browser's own engine, so color-mix() works (html2canvas broke
// on it in the station app), Plotly's SVGs come along as DOM, and the two WebGL canvases (MapLibre, then
// deck.gl's non-interleaved overlay on top) come along as <img> from canvas.toDataURL — which is why both
// are created with preserveDrawingBuffer (map.tsx). The brand logo is cross-origin: html-to-image fetches it
// as a blob first (calcofi.io answers CORS), so the canvas is never tainted.
import { toCanvas } from "html-to-image";
import { drawFooter, FOOTER_PX, type Stamp } from "./export";

// what a clean figure leaves out: the map's own chrome and the transient controls
const HIDE = [".status", ".map-tr", ".pill-row", ".maplibregl-ctrl-top-right", ".brush-handle", ".rail-gutter", ".cc-versions", ".driver-popover", ".driver-overlay", ".modal-backdrop", ".menu-list", ".picker-pop", ".phone-pills", ".sheet-handle", ".deck-tooltip"];
const hidden = (n: HTMLElement) => HIDE.some((s) => n.matches?.(s));

export interface CaptureOpts { stamp: Stamp; scale?: number; root?: HTMLElement; footer?: boolean; hide?: string[] }
/** the composite as a canvas (devicePixelRatio, capped at 2); `hide` adds selectors the figure leaves out (the map figure drops the cards) */
export async function captureView(o: CaptureOpts): Promise<HTMLCanvasElement> {
  const root = o.root ?? (document.querySelector(".app") as HTMLElement);
  const scale = o.scale ?? Math.min(2, devicePixelRatio || 1);
  const extra = o.hide ?? [];
  const skip = (n: HTMLElement) => hidden(n) || extra.some((s) => n.matches?.(s));
  // redraw the WebGL canvases right before the read, so a preserved buffer is the current frame
  (window as any).__overlay?._deck?.redraw?.("capture"); (window as any).__map?.triggerRepaint?.();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#1b1d20";
  // an absolutely positioned root (a floating card) keeps its left/top in the clone and draws outside its own canvas: pin the clone
  // at 0,0. A relative root (the map box, a rail) stays as it is — it is the containing block of its absolute children
  const pos = getComputedStyle(root).position;
  const rootStyle = pos === "absolute" || pos === "fixed" ? { position: "static", left: "auto", top: "auto", right: "auto", bottom: "auto", margin: "0", transform: "none", maxHeight: "none", boxShadow: "none" } as Partial<CSSStyleDeclaration> : undefined;
  const shot = await toCanvas(root, { pixelRatio: scale, backgroundColor: bg, filter: (n) => !skip(n as HTMLElement), cacheBust: false, skipFonts: true, style: rootStyle }); // skipFonts: the brand's theme.css is cross-origin (cssRules throws) and the fonts are the system stack anyway
  if (!o.footer && o.footer !== undefined) return shot;
  const c = document.createElement("canvas"); c.width = shot.width; c.height = shot.height + FOOTER_PX * scale;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(shot, 0, 0);
  drawFooter(ctx, 0, shot.height, c.width, scale, o.stamp);
  return c;
}
export const canvasBlob = (c: HTMLCanvasElement, type = "image/png", quality?: number) => new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), type, quality));

/** luminance statistics over a coarse sample — verify.mjs's "not blank" check and the spike's own guard: a blank
 *  canvas has the background's mean AND no spread, a real dark map has a similar mean but dots, text and panels */
export function luminanceStats(c: HTMLCanvasElement): { mean: number; sd: number; nonBg: number } {
  const ctx = c.getContext("2d")!; const w = c.width, h = c.height; let sum = 0, sq = 0, n = 0, non = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 96));
  const d = ctx.getImageData(0, 0, w, h).data;
  const bg = d[0] * 0.2126 + d[1] * 0.7152 + d[2] * 0.0722; // the top-left pixel is the page background
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; sq += l * l; n++; if (Math.abs(l - bg) > 12) non++; }
  const mean = n ? sum / n : 0;
  return { mean, sd: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0, nonBg: n ? non / n : 0 };
}
export const meanLuminance = (c: HTMLCanvasElement) => luminanceStats(c).mean;
export async function blobStats(blob: Blob): Promise<{ mean: number; sd: number; nonBg: number; w: number; h: number }> {
  const bm = await createImageBitmap(blob); const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
  c.getContext("2d")!.drawImage(bm, 0, 0); return { ...luminanceStats(c), w: bm.width, h: bm.height };
}
/** downscale so the PNG stays under ~`maxBytes` (the feedback upload); returns the same canvas when it already fits */
export async function fitBytes(c: HTMLCanvasElement, maxBytes = 3e6): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  let cur = c;
  for (let i = 0; i < 4; i++) {
    const blob = await canvasBlob(cur);
    if (blob.size <= maxBytes) return { canvas: cur, blob };
    const n = document.createElement("canvas"); n.width = Math.round(cur.width * 0.75); n.height = Math.round(cur.height * 0.75);
    n.getContext("2d")!.drawImage(cur, 0, 0, n.width, n.height); cur = n;
  }
  return { canvas: cur, blob: await canvasBlob(cur) };
}
