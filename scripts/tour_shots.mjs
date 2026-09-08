// The tour / documentation screenshots: one PNG per lens, plus the UI close-ups the docs book's
// "Explorer guide" (calcofi.io/docs/explore.html) and the update deck point at. Everything here is
// deterministic — ?tour=off, an explicit ?theme=, the view named entirely by URL parameters — so a
// re-shoot after a UI change is one command and the pictures never drift from the app.
//
//   node scripts/tour_shots.mjs [baseUrl] [outDir] [--only=regex]
//   node scripts/tour_shots.mjs http://localhost:5179/ shots/tour
//
// The lens shots are 1600 x 1000 CSS px at device scale 2 (retina); card_explore_{light,dark} are
// 1200 x 750 at scale 1 — the exact shape calcofi.io's product cards use (CalCOFI.github.io
// scripts/shots.py: live_url?theme=<t>&tour=off, 1200x750), so one can replace the card.
// A close-up is a CLIP of the live page, never a resized crop: the union of the elements named,
// padded, clamped to the viewport — a popover that escapes its anchor is part of the union.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = pos[0] ?? "http://localhost:5179/";
const out = pos[1] ?? "shots/tour";
const only = opt.only ? new RegExp(opt.only) : null;
fs.mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BIG = { width: 1600, height: 1000, deviceScaleFactor: 2 };
const CARD = { width: 1200, height: 750, deviceScaleFactor: 1 };   // calcofi.io's card shape
const profile = path.join(process.env.TMPDIR ?? "/tmp", "explore-tour-profile");
fs.rmSync(profile, { recursive: true, force: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, userDataDir: profile,
  args: ["--window-size=1640,1080", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars"], defaultViewport: BIG });
const page = (await browser.pages())[0];
page.on("pageerror", (e) => console.log("  PAGEERROR", e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = () => page.evaluate(() => window.__marks ?? []);
const waitMark = async (re, timeout = 120000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) { const m = (await marks()).filter((x) => re.test(x.name)).pop(); if (m) return m; await sleep(100); }
  console.log(`  (timeout waiting for ${re})`); return null;
};
// the sea floor is PMTiles: a shot taken before they settle shows bare CARTO water
const waitTiles = async (timeout = 45000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) { if (await page.evaluate(() => { const m = window.__map; return !m || (m.loaded() && m.areTilesLoaded()); })) return true; await sleep(200); }
  console.log("  (tiles not settled)"); return false;
};
async function ready(url, viewport = BIG, settle = 2500) {
  await page.setViewport(viewport);
  await page.goto(base.replace(/\/$/, "/") + url, { waitUntil: "domcontentloaded" });
  await waitMark(/^first_lens_ready$/);
  await waitMark(/^first_paint$/, 30000);
  await waitTiles();
  await sleep(settle);
}
/** the union of the named elements, padded and clamped — what a "close-up" means here */
async function clipOf(sels, pad = 14, padL = 0) {
  const r = await page.evaluate((sels, pad, padL) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    for (const s of sels) for (const el of document.querySelectorAll(s)) {
      const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); n++;
    }
    if (!n) return null;
    const x = Math.max(0, x0 - Math.max(pad, padL)), y = Math.max(0, y0 - pad);
    return { x, y, width: Math.min(innerWidth, x1 + pad) - x, height: Math.min(innerHeight, y1 + pad) - y };
  }, sels, pad, padL);
  if (!r) throw new Error(`no element for ${sels.join(", ")}`);
  return r;
}
async function shot(name, clip) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, clip });
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  wrote ${file} · ${clip ? `${Math.round(clip.width)}x${Math.round(clip.height)} clip` : "full"} · ${kb} kB`);
}
const click = (sel) => page.click(sel);
const clickText = (scope, txt) => page.click(`${scope}::-p-text(${txt})`);

// ── the shots ────────────────────────────────────────────────────────────────
const SHOTS = [
  // the default view (Stations), both themes, at the reading size and at the card shape
  { name: "stations_light", url: "?tour=off&theme=light", steps: async () => {} },
  { name: "stations_dark", url: "?tour=off&theme=dark", steps: async () => {} },
  { name: "card_explore_light", url: "?tour=off&theme=light", viewport: CARD, steps: async () => {} },
  { name: "card_explore_dark", url: "?tour=off&theme=dark", viewport: CARD, steps: async () => {} },
  // one per remaining lens
  { name: "hexagons", url: "?lens=hex&res=5&tour=off&theme=light", steps: async () => {} },
  { name: "contours_temperature_grid_labels", url: "?lens=contour&var=temperature&grain=station&labels=on&tour=off&theme=light",
    steps: async () => { await waitMark(/^contour:/, 180000); await sleep(4000); } },
  // an ENV variable on the cruise lens: every cast on the track carries a value, so the track and its dots read
  // (the newest cruise of a bio taxon is a handful of near-zero tows on a 0-0 scale)
  { name: "cruises", url: "?lens=cruise&var=temperature&tour=off&theme=light", steps: async () => { await sleep(3000); } },
  { name: "regions", url: "?lens=region&tour=off&theme=light", steps: async () => { await sleep(2000); } },
  // the two shapes of a section: env cuts DEPTH on one cruise, bio (depth-integrated tows) cuts YEARS
  { name: "sections_env", url: "?lens=section&var=temperature&line=90&tour=off&theme=light", steps: async () => { await sleep(2000); } },
  { name: "sections_bio", url: "?lens=section&line=90&tour=off&theme=light", steps: async () => { await sleep(2000); } },
  { name: "sections_3d", url: "?lens=section&var=temperature&line=90&view=3d&tour=off&theme=light", steps: async () => { await sleep(9000); } },
  // ── the UI close-ups ───────────────────────────────────────────────────────
  { name: "sentence_dropdown", url: "?tour=off&theme=light",
    steps: async () => { await click('.sentence .ts-toggle'); await sleep(500); await click('.ts-sent .menu-btn[title^="how the observations"]'); await sleep(500); },
    clip: [".sentence", ".menu-list"] },
  { name: "controls_select", url: "?tour=off&theme=light", steps: async () => { await sleep(300); }, clip: [".card-select"] },
  { name: "controls_refine", url: "?tour=off&theme=light&years=1990-2020&q=2,3",
    steps: async () => { await clickText(".card-select .tabs button", "Refine"); await sleep(500); }, clip: [".card-select"] },
  { name: "controls_share", url: "?tour=off&theme=light",
    steps: async () => { await clickText(".card-select .tabs button", "Share"); await sleep(500); }, clip: [".card-select"] },
  { name: "layers_panel", url: "?lens=hex&var=temperature&layers=noaa_onms_sanctuaries,data&tour=off&theme=light",
    steps: async () => { await sleep(1200); await click(".map-layers-btn"); await sleep(900); }, clip: [".card-layers"], pad: 24, padL: 760 },
  { name: "pane_controls", url: "?lens=section&var=temperature&line=90&tour=off&theme=light",
    steps: async () => { await sleep(1500); await click(".card-section .card-head .menu-btn"); await sleep(500); },
    clip: [".card-section", ".menu-list"] },
  { name: "help_menu", url: "?tour=off&theme=light",
    steps: async () => { await click('[data-tour="help"] button'); await sleep(500); }, clip: [".cc-header", ".menu-list"] },
  { name: "time_strip", url: "?tour=off&theme=light", steps: async () => { await sleep(600); }, clip: [".card-years"] },
  { name: "depth_control", url: "?var=temperature&tour=off&theme=light&show=depth",
    steps: async () => { await sleep(2000); }, clip: [".card-depth"] },
];

for (const s of SHOTS) {
  if (only && !only.test(s.name)) continue;
  console.log(`== ${s.name}: ${s.url}`);
  await ready(s.url, s.viewport ?? BIG);
  await s.steps();
  await shot(s.name, s.clip ? await clipOf(s.clip, s.pad ?? 14, s.padL ?? 0) : undefined);
}
await browser.close();
console.log(`done · ${out}`);
