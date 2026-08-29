// figures (plan D19) and the shared footer stamp (D17): every Plotly panel exports as PNG (2×, the theme
// background — never transparent — and a footer with the selection, the unit, the release and the view
// URL), SVG (vector, for papers; Plotly emits it) and CSV (the panel's own table, the same one the bundle
// writes). Filenames: calcofi_explore_<panel>_<lens>_<release>_<yyyymmdd>.<ext>. The whole-view figure
// (capture.ts) stamps the same footer, so the two match.
import type { Row } from "./engine";

let PlotlyMod: any = null;
const plotly = () => PlotlyMod ? Promise.resolve(PlotlyMod) : import("plotly.js-dist-min").then((m) => (PlotlyMod = m.default ?? m));
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ymd = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
export const figureName = (panel: string, lens: string, release: string, ext: string) => `calcofi_explore_${panel}_${lens}_${release}_${ymd()}.${ext}`;

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function csv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => v == null ? "" : typeof v === "number" ? String(v) : (v instanceof Date ? v.toISOString() : `"${String(v).replace(/"/g, '""')}"`);
  return cols.join(",") + "\n" + rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n") + "\n";
}

/** the footer every figure carries: selection · unit · release · calcofi.io/explore + the view URL */
export interface Stamp { title: string; unit?: string; release: string; url: string; extra?: string }
export const FOOTER_PX = 34; // at scale 1
export function stampLines(s: Stamp): [string, string] {
  return [`${s.title}${s.unit ? ` · ${s.unit}` : ""}${s.extra ? ` · ${s.extra}` : ""}`, `CalCOFI Explorer · release ${s.release} · ${s.url.replace(/^https?:\/\//, "")}`];
}
/** draw the footer band onto a canvas (in place, below `top`) */
export function drawFooter(ctx: CanvasRenderingContext2D, x: number, top: number, width: number, scale: number, s: Stamp) {
  const h = FOOTER_PX * scale, pad = 8 * scale;
  ctx.fillStyle = cssVar("--panel") || "#24272b"; ctx.fillRect(x, top, width, h);
  ctx.fillStyle = cssVar("--border") || "#3a3f44"; ctx.fillRect(x, top, width, Math.max(1, scale));
  const [l1, l2] = stampLines(s);
  ctx.font = `${11 * scale}px ${cssVar("--sans") || "system-ui"}`; ctx.textBaseline = "middle";
  ctx.fillStyle = cssVar("--fg") || "#e6e9ed"; ctx.fillText(ellipsize(ctx, l1, width - 2 * pad), x + pad, top + h * 0.32);
  ctx.fillStyle = cssVar("--muted") || "#9aa0a6"; ctx.fillText(ellipsize(ctx, l2, width - 2 * pad), x + pad, top + h * 0.7);
}
function ellipsize(ctx: CanvasRenderingContext2D, t: string, w: number) {
  if (ctx.measureText(t).width <= w) return t;
  let s = t; while (s.length > 4 && ctx.measureText(s + "…").width > w) s = s.slice(0, -4); return s + "…";
}
const load = (src: string) => new Promise<HTMLImageElement>((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = err; im.src = src; });

/** a Plotly panel as a PNG blob: 2× scale, theme background, footer */
export async function plotPng(div: HTMLElement, s: Stamp, scale = 2): Promise<Blob> {
  const P = await plotly();
  const w = div.clientWidth, h = div.clientHeight;
  const url = await P.toImage(div, { format: "png", width: w, height: h, scale });
  const im = await load(url);
  const c = document.createElement("canvas"); c.width = w * scale; c.height = (h + FOOTER_PX) * scale;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = cssVar("--panel") || "#24272b"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(im, 0, 0);
  drawFooter(ctx, 0, h * scale, c.width, scale, s);
  return new Promise((ok) => c.toBlob((b) => ok(b!), "image/png"));
}
/** a Plotly panel as SVG with the footer as text */
export async function plotSvg(div: HTMLElement, s: Stamp): Promise<Blob> {
  const P = await plotly();
  const w = div.clientWidth, h = div.clientHeight;
  const url: string = await P.toImage(div, { format: "svg", width: w, height: h });
  const svg = decodeURIComponent(url.replace(/^data:image\/svg\+xml[^,]*,/, ""));
  const [l1, l2] = stampLines(s).map((t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  const font = (cssVar("--sans") || "system-ui").replace(/"/g, "'");
  const bg = cssVar("--panel") || "#24272b", fg = cssVar("--fg") || "#e6e9ed", muted = cssVar("--muted") || "#9aa0a6", border = cssVar("--border") || "#3a3f44";
  const H = h + FOOTER_PX;
  const out = svg
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, `<svg$1 height="${H}"`)
    .replace(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/, `viewBox="0 0 $1 ${H}"`)
    .replace(/<\/svg>\s*$/, `<rect x="0" y="${h}" width="${w}" height="${FOOTER_PX}" fill="${bg}"/><rect x="0" y="${h}" width="${w}" height="1" fill="${border}"/><text x="8" y="${h + 12}" font-family="${font}" font-size="11" fill="${fg}">${l1}</text><text x="8" y="${h + 25}" font-family="${font}" font-size="11" fill="${muted}">${l2}</text></svg>`);
  // Plotly's SVG has a transparent paper (the panels draw on the app's panel colour): give it the theme background
  const withBg = out.replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="${bg}"/>`);
  return new Blob([withBg], { type: "image/svg+xml" });
}
export function csvBlob(rows: Row[]): Blob { return new Blob([csv(rows)], { type: "text/csv" }); }

export async function copyImage(blob: Blob): Promise<boolean> {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); return true; } catch { return false; }
}
