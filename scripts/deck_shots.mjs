// The update-deck screenshots that need driving, not just a URL: the attribution modal, the Share tab
// with "Cite this data" open, the feedback dialog mid-annotation, and the bare header (the shape every
// CalCOFI product wears). Same rules as scripts/tour_shots.mjs — a local production build reading the
// real release, ?tour=off, an explicit ?theme=light, so a re-shoot after a UI change is one command:
//
//   npm run build && npx vite preview --port 4173
//   node scripts/deck_shots.mjs http://localhost:4173/ ../workflows/presentations/assets/explore
//
// Everything here is LIGHT: the deck shows one theme (the brand slide's light/dark pair is the one
// exception, and it is about the themes).
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = pos[0] ?? "http://localhost:4173/";
const out = pos[1] ?? "shots/deck";
const only = opt.only ? new RegExp(opt.only) : null;
fs.mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BIG = { width: 1600, height: 1000, deviceScaleFactor: 2 };
const profile = path.join(process.env.TMPDIR ?? "/tmp", "explore-deck-profile");
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
const waitTiles = async (timeout = 45000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) { if (await page.evaluate(() => { const m = window.__map; return !m || (m.loaded() && m.areTilesLoaded()); })) return true; await sleep(200); }
  console.log("  (tiles not settled)"); return false;
};
async function ready(url, settle = 2500) {
  await page.setViewport(BIG);
  await page.goto(base.replace(/\/$/, "/") + url, { waitUntil: "domcontentloaded" });
  await waitMark(/^first_lens_ready$/);
  await waitMark(/^first_paint$/, 30000);
  await waitTiles();
  await sleep(settle);
}
/** the union of the named elements, padded and clamped — a clip of the live page, never a resized crop */
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
  console.log(`  wrote ${file} · ${clip ? `${Math.round(clip.width)}x${Math.round(clip.height)} clip` : "full"} · ${Math.round(fs.statSync(file).size / 1024)} kB`);
}
const click = (sel) => page.click(sel);
const clickText = (scope, txt) => page.click(`${scope}::-p-text(${txt})`);
/** drag the pointer along a path in page coordinates — how a pen/arrow mark is drawn on the annotator canvas */
async function drag(pts) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y, { steps: 8 }); await sleep(60); }
  await page.mouse.up();
  await sleep(400);
}

const SHOTS = [
  // ── attribution ────────────────────────────────────────────────────────────
  // Data Sources & Attribution: one row per dataset in view, each with its citation, licence and DOI.
  // The panel inside the modal is expanded first, or the shot shows collapsed rows only.
  { name: "sources_modal_light", url: "?modal=sources&tour=off&theme=light",
    steps: async () => {
      await sleep(800);
      await page.evaluate(() => document.querySelectorAll(".modal-sources details").forEach((d) => (d.open = true)));
      await sleep(600);
    },
    clip: [".modal-sources"], pad: 18 },
  // the Share tab with "Cite this data" open: the release citation plus every dataset in view, as text or BibTeX
  { name: "share_cite_light", url: "?tour=off&theme=light",
    steps: async () => {
      await clickText(".card-select .tabs button", "Share");
      await sleep(500);
      await clickText(".card-select", "Cite this data");
      await sleep(900);
    },
    clip: [".card-select", ".menu-list"], pad: 16 },
  // ── feedback ───────────────────────────────────────────────────────────────
  // the dialog mid-annotation: the captured view, the tool row (arrow · circle · rect · pen · text,
  // the colours, undo/clear) and a mark being drawn — feedback.tsx's .pill.act[data-tour=feedback-edit]
  { name: "feedback_annotate_light", url: "?tour=off&theme=light",
    steps: async () => {
      await click(".cc-header .cc-feedback");
      await page.waitForSelector(".modal-feedback", { visible: true });
      await sleep(1200);                                    // the view is captured into the thumbnail
      await page.waitForSelector('[data-tour="feedback-edit"]:not([disabled])', { timeout: 30000 });
      await click('[data-tour="feedback-edit"]');
      await page.waitForSelector(".annotator canvas", { visible: true });
      await sleep(600);
      const b = await page.evaluate(() => { const r = document.querySelector(".annotator canvas").getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      // an arrow to a point on the map, then a circle around it — two marks, the way a reviewer marks a view
      await drag([[b.x + b.w * 0.24, b.y + b.h * 0.24], [b.x + b.w * 0.45, b.y + b.h * 0.46]]);
      await page.click('.annot-tools .seg button[title="circle"]').catch(() => {});
      await drag([[b.x + b.w * 0.44, b.y + b.h * 0.42], [b.x + b.w * 0.56, b.y + b.h * 0.56]]);
      await sleep(400);
    },
    clip: [".modal-feedback"], pad: 18 },
  // the same speech bubble, in the app's own header — the 4-up strip on the feedback slide
  { name: "header_explore_light", url: "?tour=off&theme=light", steps: async () => { await sleep(400); },
    clip: [".cc-header"], pad: 0 },
];

for (const s of SHOTS) {
  if (only && !only.test(s.name)) continue;
  console.log(`== ${s.name}: ${s.url}`);
  await ready(s.url);
  await s.steps();
  await shot(s.name, s.clip ? await clipOf(s.clip, s.pad ?? 14, s.padL ?? 0) : undefined);
}
await browser.close();
console.log(`done · ${out}`);
