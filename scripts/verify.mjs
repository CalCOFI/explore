// verification: drive the installed Chrome (headed, fresh profile = cold cache) through the lenses and
// through every panel STATE the UI plan names, screenshot each at 1280 × 800 (desktop) and 390 × 844
// (phone), assert no horizontal overflow and that every control is reachable, and dump the timing marks.
// the Claude-in-Chrome tab never paints, so this script is the only verification path.
//   node scripts/verify.mjs [baseUrl] [outDir] [--only=regex] [--timing]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = pos[0] ?? "http://localhost:5178/";
const out = pos[1] ?? "shots";
const only = opt.only ? new RegExp(opt.only) : null;
const profile = path.join(process.env.TMPDIR ?? "/tmp", "explore-verify-profile");
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, userDataDir: profile,
  args: ["--window-size=1300,900", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars"], defaultViewport: DESKTOP });
const errors = [];
let page;
// a long headed session can lose its tab ("detached Frame" / "Session closed"): open a fresh one and carry on
async function freshPage() {
  page = await browser.newPage();
  page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
  for (const p of await browser.pages()) if (p !== page) await p.close().catch(() => {});
}
await freshPage();
const marks = () => page.evaluate(() => window.__marks ?? []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitMark = async (re, timeout = 90000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const ms = await marks(); const m = ms.filter((x) => re.test(x.name)).pop(); if (m) return m;
    await sleep(50);
  }
  throw new Error(`timeout waiting for ${re}`);
};
const results = { states: {}, timing: {}, errors };
let fails = 0;
const fail = (msg) => { fails++; console.log("  FAIL", msg); };
// brand v2 (plan 2026-08-30 Phase 2): style.css draws its shadows and on-accent text from the tokens, never black or #fff
{ const css = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8"); for (const bad of ["#fff", "rgba(0,0,0", "rgba(0, 0, 0"]) if (css.includes(bad)) fail(`style.css still has ${bad}`); }

// ── layout assertions ────────────────────────────────────────────────────────
async function assertLayout(name) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = innerWidth, vh = innerHeight;
    const off = [];
    for (const el of document.querySelectorAll("[data-tour], .lenses button, .picker-btn, .pill.act, .rail-head button, .card-head button, .pill-row button, .sheet-handle")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue; // display:none = not offered in this state
      if (getComputedStyle(el).visibility === "hidden" || el.closest(".sheet.detent-peek .sheet-body")) continue; // a sheet's body at the peek detent is folded away, not offered
      // inside a scroll box (a rail body, a sheet body, a card body) the vertical position is reachable by scrolling; only the horizontal must fit
      let scrollable = false; for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if ((o === "auto" || o === "scroll") && a.scrollHeight > a.clientHeight + 1) { scrollable = true; break; } }
      if (b.right > vw + 1 || b.left < -1 || (!scrollable && (b.bottom > vh + 1 || b.top < -1))) off.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} ${(el.getAttribute("data-tour") || el.textContent || "").trim().slice(0, 20)} @ ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    return { scrollW: de.scrollWidth, scrollH: de.scrollHeight, vw, vh, bodyOverflowX: getComputedStyle(document.body).overflowX, off };
  });
  if (r.scrollW > r.vw + 1) fail(`${name}: horizontal overflow ${r.scrollW} > ${r.vw}`);
  if (r.off.length) fail(`${name}: ${r.off.length} control(s) outside the viewport: ${r.off.slice(0, 4).join(" | ")}`);
  return r;
}
async function shot(name) { const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); return file; }
const click = async (sel) => { await page.click(sel); };
const clickText = async (scope, txt) => page.click(`${scope}::-p-text(${txt})`);
const clickLens = async (txt) => { await clickText(".lenses button", txt); await waitMark(/^grain_switch:/); };
// FILTERS and EXPORT start folded (U7): a step that reaches into one expands it first
const expandGroup = async (name) => { const open = await page.$(`.group[data-group="${name}"].open`); if (!open) { await click(`.group[data-group="${name}"] .group-toggle`); await sleep(250); } };
async function ready(url, viewport = DESKTOP, until = "lens") {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (until === "sidecars") { await waitMark(/^fetch:sidecars$/); await sleep(200); return; }
  await waitMark(/^first_lens_ready$/);
  await waitMark(/^first_paint$/, 20000).catch(() => console.log("  (no first_paint mark)"));
  await sleep(1200);
}

// ── the states (plan U0 · U1 · U3 · U6 · U4a) ───────────────────────────────
const STATES = [
  // U0 — words + lists
  { name: "u0_station", url: "?tour=off", steps: async () => {} },
  { name: "u0_organism_open", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(400); } },
  { name: "u0_organism_search", url: "?tour=off", steps: async () => { await click("#organism-btn"); await page.type(".picker-search input", "anchovy"); await sleep(400); } },
  { name: "u0_organism_by_category", url: "?tour=off", steps: async () => { await click("#organism-btn"); await clickText(".picker-tabs [role=tab]", "Search"); await page.select(".picker-tools select", "category"); await sleep(400); } },
  { name: "u0_organism_most", url: "?tour=off", steps: async () => { await click("#organism-btn"); await clickText(".picker-tabs [role=tab]", "Search"); await click(".picker-tools .seg button:nth-child(2)"); await sleep(400); } },
  { name: "u0_variable_open", url: "?var=temperature&tour=off", steps: async () => { await click("#variable-btn"); await sleep(400); } },
  { name: "u0_hex", url: "?lens=hex&res=5&tour=off", steps: async () => {} },
  { name: "u0_section_cruise_open", url: "?lens=section&var=temperature&line=90&tour=off", steps: async () => { await click("#section-cruise-btn"); await sleep(400); } },
  { name: "u0_cruise", url: "?lens=cruise&tour=off", steps: async () => { await click("#cruise-btn"); await sleep(400); } },
  { name: "u0_copy_menu", url: "?tour=off", steps: async () => { await expandGroup("export"); await clickText(".menu-btn", "Copy code"); await sleep(300); } },
  { name: "u0_light", url: "?tour=off&theme=light", steps: async () => {} },
  { name: "u0_native", url: "?tour=off&native=1", steps: async () => {} },
  // U1 — rails, cards, z-order (the two layering-bug URLs), viewport defaults
  { name: "u1_default", url: "?tour=off", steps: async () => {}, assert: async () => { const n = await page.$$eval(".rail", (r) => r.length); if (n !== 3) fail(`u1_default: ${n} rails open (expected 3)`); } },
  { name: "u1_fold_depth_years", url: "?tour=off&hide=depth,years", steps: async () => {}, assert: async () => { const n = await page.$$eval(".rail-pill", (r) => r.length); if (n !== 2) fail(`u1_fold: ${n} pills (expected 2)`); } },
  { name: "u1_fold_all", url: "?tour=off&hide=select,depth,years", steps: async () => {} },
  { name: "u1_fold_click", url: "?tour=off", steps: async () => { await click(".rail-years .rail-head button[aria-label^='Fold']"); await sleep(400); await click(".rail-select .rail-head button[aria-label^='Fold']"); await sleep(500); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/hide=/.test(u)) fail(`u1_fold_click: URL has no hide= (${u})`); } },
  { name: "u1_unfold_click", url: "?tour=off&hide=depth", steps: async () => { await click(".rail-pill.rail-depth"); await sleep(500); }, assert: async () => { const u = await page.evaluate(() => location.search); if (/hide=/.test(u)) fail(`u1_unfold_click: URL still has hide= (${u})`); } },
  { name: "u1_max_years", url: "?tour=off&max=years", steps: async () => {} },
  { name: "u1_max_depth", url: "?var=temperature&tour=off&max=depth", steps: async () => { await sleep(1200); } },
  { name: "u1_max_select", url: "?tour=off&max=select", steps: async () => {} },
  { name: "u1_max_esc", url: "?tour=off&max=years", steps: async () => { await page.keyboard.press("Escape"); await sleep(400); }, assert: async () => { const u = await page.evaluate(() => location.search); if (/max=/.test(u)) fail(`u1_max_esc: URL still has max= (${u})`); } },
  { name: "u1_section_bug", url: "?lens=section&taxon=worms:217452&stage=larva&den=per_10m2&line=90&cruise=2009-04-OIFS&tour=off", steps: async () => {} },
  { name: "u1_section_min", url: "?lens=section&var=temperature&line=90&tour=off", steps: async () => { await click(".card-section .card-head button[aria-label^='Minimize']"); await sleep(400); }, assert: async () => { const n = await page.$$eval(".pill.mini", (r) => r.length); if (n !== 1) fail(`u1_section_min: ${n} pills (expected 1)`); } },
  { name: "u1_section_max", url: "?lens=section&var=temperature&line=90&tour=off&max=section", steps: async () => {} },
  { name: "u1_cruise_timing_bug", url: "?lens=cruise&timing=1&tour=off", steps: async () => {} },
  { name: "u1_station_card", url: "?tour=off&station=st90-ln90", steps: async () => { await sleep(800); } },
  { name: "u1_station_drag", url: "?tour=off&station=st90-ln90", steps: async () => {
      await sleep(600); const h = await page.$(".card-station .card-head"); const b = await h.boundingBox();
      await page.mouse.move(b.x + 60, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x - 300, b.y + 200, { steps: 8 }); await page.mouse.up(); await sleep(300); },
    assert: async () => { const st = await page.$eval(".card-station", (el) => el.style.left); if (!st) fail("u1_station_drag: the card did not move"); } },
  { name: "u1_1000px", url: "?tour=off", viewport: { width: 1000, height: 700 }, steps: async () => {}, assert: async () => { const n = await page.$$eval(".rail-pill.rail-depth", (r) => r.length); if (n !== 1) fail(`u1_1000px: depth rail not folded by default`); } },
  { name: "u1_light_section", url: "?lens=section&var=temperature&line=90&tour=off&theme=light", steps: async () => {} },
  // U1 · D18 — the phone: bottom sheet detents, pills, a lens switch, the full-screen picker
  { name: "p_peek", url: "?tour=off", viewport: PHONE, steps: async () => {}, assert: async () => { const h = await page.$eval(".sheet", (el) => el.getBoundingClientRect().height); if (h < 80 || h > 140) fail(`p_peek: sheet ${h}px`); } },
  { name: "p_half", url: "?tour=off", viewport: PHONE, steps: async () => { await click(".sheet-summary"); await sleep(500); }, assert: async () => { const h = await page.$eval(".sheet", (el) => el.getBoundingClientRect().height); if (Math.abs(h - 422) > 20) fail(`p_half: sheet ${h}px (expected ~422)`); } },
  { name: "p_full", url: "?tour=off", viewport: PHONE, steps: async () => { await page.focus(".sheet-handle"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await sleep(500); }, assert: async () => { const h = await page.$eval(".sheet", (el) => el.getBoundingClientRect().height); if (Math.abs(h - 760) > 20) fail(`p_full: sheet ${h}px (expected ~760)`); } },
  { name: "p_drag", url: "?tour=off", viewport: PHONE, steps: async () => { const h = await page.$(".sheet-handle"); const b = await h.boundingBox(); await page.touchscreen.touchStart(b.x + b.width / 2, b.y + 5); await page.touchscreen.touchMove(b.x + b.width / 2, b.y - 300); await page.touchscreen.touchEnd(); await sleep(500); },
    assert: async () => { const h = await page.$eval(".sheet", (el) => el.getBoundingClientRect().height); if (h < 380) fail(`p_drag: sheet ${h}px after a 300 px drag up`); } },
  { name: "p_lens_section", url: "?var=temperature&tour=off", viewport: PHONE, steps: async () => { await click(".lens-strip button::-p-text(Sections)"); await waitMark(/^grain_switch:/); await sleep(1500); } },
  { name: "p_depth", url: "?var=temperature&tour=off", viewport: PHONE, steps: async () => { await click(".phone-pills button[data-tour=depth]"); await sleep(900); } },
  { name: "p_years", url: "?tour=off", viewport: PHONE, steps: async () => { await click(".phone-pills button[data-tour=years]"); await sleep(900); } },
  { name: "p_organism", url: "?tour=off", viewport: PHONE, steps: async () => { await click(".sheet-summary"); await sleep(400); await click("#organism-btn"); await sleep(500); } },
  { name: "p_hex", url: "?lens=hex&res=5&tour=off", viewport: PHONE, steps: async () => {} },
  { name: "p_light", url: "?tour=off&theme=light", viewport: PHONE, steps: async () => { await click(".sheet-summary"); await sleep(400); } },
  // U3 — help: the welcome card (?tour=on), about, feedback, and every tour step resolving in the state its before() makes
  { name: "u3_welcome", url: "?tour=on", steps: async () => {}, assert: async () => { if (!(await page.$(".modal-welcome"))) fail("u3_welcome: no welcome card"); } },
  { name: "u3_no_welcome_after_seen", url: "?tour=on", steps: async () => { await click(".modal-welcome .btn:not(.primary)"); await sleep(300); await page.goto(base + "?lens=hex&res=5", { waitUntil: "domcontentloaded" }); await waitMark(/^first_lens_ready$/); await sleep(800); },
    assert: async () => { if (await page.$(".modal-welcome")) fail("u3: the welcome card came back after Explore"); } },
  { name: "u3_about", url: "?tour=off", steps: async () => { await click('[data-tour="about"]'); await sleep(500); }, assert: async () => { const n = await page.$$eval(".about-datasets tr", (r) => r.length); if (n < 10) fail(`u3_about: ${n} dataset rows`); } },
  { name: "u3_feedback", url: "?tour=off", steps: async () => { await click('[data-tour="feedback"]'); await sleep(400); }, assert: async () => { const href = await page.$eval(".modal-feedback a.btn", (a) => a.href); if (!/github\.com\/CalCOFI\/explore\/issues\/new/.test(href)) fail(`u3_feedback: issue link ${href}`); } },
  { name: "u3_about_light", url: "?tour=off&theme=light", steps: async () => { await click('[data-tour="about"]'); await sleep(500); } },
  { name: "u3_tour", url: "?tour=off", steps: async () => { await page.evaluate(() => window.__tour()); await sleep(900); }, tour: true },
  { name: "p3_welcome", url: "?tour=on", viewport: PHONE, steps: async () => {} },
  { name: "p3_about", url: "?tour=off", viewport: PHONE, steps: async () => { await click('[data-tour="more"] button'); await sleep(300); await clickText(".menu-item", "About"); await sleep(500); } },
  { name: "p3_tour", url: "?tour=off", viewport: PHONE, steps: async () => { await page.evaluate(() => window.__tour()); await sleep(900); }, tour: true },
  // U6 — the year strip: zoom (yview=) by URL, wheel and double-click; brush → years=; zoom-to-selection; month LOD + month brush; season; the cruise calendar
  { name: "u6_yview_url", url: "?tour=off&yview=2000-2012", steps: async () => { await sleep(1500); },
    assert: async () => { if (!(await page.$(".context-bar"))) fail("u6_yview_url: no context bar"); const n = await page.$$eval(".rail-years .plot .bars .point", (r) => r.length); if (n < 100) fail(`u6_yview_url: ${n} bars (expected month bins, > 100)`); } },
  { name: "u6_wheel", url: "?tour=off", steps: async () => { const b = await (await page.$(".rail-years .plot")).boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5); await page.mouse.wheel({ deltaY: -400 }); await sleep(300); await page.mouse.wheel({ deltaY: -400 }); await sleep(700); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/yview=/.test(u)) fail(`u6_wheel: no yview= after wheel (${u})`); } },
  // Plotly counts a double-click from its own mousedown timing, which puppeteer's synthetic clicks never satisfy; the context bar's
  // dblclick and the header's reset button are the verifiable paths (a real mouse also resets on the strip itself)
  // CDP synthesizes no dblclick from clickCount: 2 in this Chrome, so the pair is sent as down/up(1) + down/up(2); a real mouse does the same
  { name: "u6_dblclick_reset", url: "?tour=off&yview=2000-2012", steps: async () => { await sleep(800); const b = await (await page.$(".context-bar")).boundingBox(); const x = b.x + b.width * 0.5, y = b.y + b.height * 0.5; await page.mouse.move(x, y);
      await page.mouse.down({ clickCount: 1 }); await page.mouse.up({ clickCount: 1 }); await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 }); await sleep(700);
      if (/yview=/.test(await page.evaluate(() => location.search))) { console.log("  (no synthetic dblclick from CDP; dispatching one)"); await page.$eval(".context-bar", (el) => el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))); await sleep(500); } },
    assert: async () => { const u = await page.evaluate(() => location.search); if (/yview=/.test(u)) fail(`u6_dblclick_reset: yview= survived a double-click on the context bar (${u})`); } },
  { name: "u6_reset_button", url: "?tour=off&yview=2000-2012", steps: async () => { await sleep(800); await click('[data-tour="zoom-reset"]'); await sleep(700); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (/yview=/.test(u)) fail(`u6_reset_button: yview= survived the reset button (${u})`); if (await page.$(".context-bar")) fail("u6_reset_button: the context bar is still there"); } },
  { name: "u6_brush", url: "?tour=off", steps: async () => { const b = await (await page.$(".rail-years .plot")).boundingBox(); const y = b.y + b.height * 0.45; await page.mouse.move(b.x + b.width * 0.5, y); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.7, y, { steps: 6 }); await page.mouse.up(); await sleep(900); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/years=\d{4}-\d{4}/.test(u)) fail(`u6_brush: no whole-year years= after a brush (${u})`); if (!(await page.$(".brush-handle"))) fail("u6_brush: no zoom-to-selection handle"); } },
  { name: "u6_zoom_to_selection", url: "?tour=off&years=1990-2005", steps: async () => { await sleep(600); await click(".brush-handle button[aria-label='zoom to selection']"); await sleep(1200); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/yview=19(8|9)\d/.test(u)) fail(`u6_zoom_to_selection: yview= not on the selection (${u})`); if (!/years=1990-2005/.test(u)) fail(`u6_zoom_to_selection: the filter moved (${u})`); } },
  { name: "u6_month_brush", url: "?tour=off&yview=2008-2013", steps: async () => { await sleep(1500); const b = await (await page.$(".rail-years .plot")).boundingBox(); const y = b.y + b.height * 0.45; await page.mouse.move(b.x + b.width * 0.4, y); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.6, y, { steps: 6 }); await page.mouse.up(); await sleep(900); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/years=\d{4}-\d{2}%3A\d{4}-\d{2}|years=\d{4}-\d{2}:\d{4}-\d{2}/.test(u)) fail(`u6_month_brush: no month-resolved years= (${u})`); } },
  { name: "u6_positive_only", url: "?tour=off&zeros=0", steps: async () => { await sleep(600); },
    assert: async () => { if (!(await page.$(".den .zeros .chip.on"))) fail("u6_positive_only: the chip is not on for zeros=0"); await click(".den .zeros .chip"); await sleep(400); const u = await page.evaluate(() => location.search); if (/zeros=/.test(u)) fail(`u6_positive_only: zeros= survived the toggle (${u})`); } },
  { name: "u6_season", url: "?tour=off&q=2,3", steps: async () => { await expandGroup("filters"); await click(".chip::-p-text(season)"); await sleep(300); },
    assert: async () => { const t = await page.$eval(".chip::-p-text(season)", (el) => el.textContent); if (!/Q2 Q3/.test(t)) fail(`u6_season: chip reads ${t}`); } },
  { name: "u6_cruises", url: "?tour=off", steps: async () => { await clickText(".rail-years .seg button", "cruises"); await sleep(1800); },
    assert: async () => { const n = await page.$$eval(".rail-years .plot .bars .point", (r) => r.length); if (n < 100) fail(`u6_cruises: ${n} cruise cells`); const t = await page.$$eval(".rail-years .plot .ytick text", (r) => r.map((x) => x.textContent)); if (!t.includes("Jan") || !t.includes("Oct")) fail(`u6_cruises: month rows not labelled (${t.join(" ")})`); else console.log(`  ${n} cells · rows ${t.join(" ")}`); } },
  { name: "u6_cruises_zoomed", url: "?tour=off&yview=2009.1-2009.9&lens=cruise", steps: async () => { await clickText(".rail-years .seg button", "cruises"); await sleep(1800); },
    assert: async () => { const n = await page.$$eval(".rail-years .plot .annotation-text", (r) => r.length); if (n < 1) fail(`u6_cruises_zoomed: ${n} cruise codes visible (expected >= 1 over 0.8 years: a 3-week cruise is ~50 px)`); else console.log(`  ${n} cruise code(s) labelled`); } },
  { name: "u6_cruise_pick", url: "?tour=off&yview=2006-2011&lens=cruise", steps: async () => { await clickText(".rail-years .seg button", "cruises"); await sleep(1800); const before = await page.evaluate(() => new URLSearchParams(location.search).get("cruise"));
      const boxes = await page.$$eval(".rail-years .plot .bars .point path", (ps) => { const pl = document.querySelector(".rail-years .js-plotly-plot .nsewdrag").getBoundingClientRect(); return ps.map((p) => { const b = p.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width]; }).filter((b) => b[2] > 6 && b[0] > pl.left + 4 && b[0] < pl.right - 4); }); const b = boxes[Math.floor(boxes.length / 2)]; await page.mouse.click(b[0], b[1]); await sleep(1200);
      const after = await page.evaluate(() => new URLSearchParams(location.search).get("cruise")); if (after === before) fail(`u6_cruise_pick: cruise stayed ${before}`); else console.log(`  picked ${before} → ${after}`); } },
  { name: "u6_max_cruises", url: "?tour=off&max=years&yview=1995-2015", steps: async () => { await clickText(".max-panel .seg button", "cruises"); await sleep(1800); } },
  { name: "u6_light_mean_zoomed", url: "?tour=off&var=temperature&yview=2010-2016&theme=light", steps: async () => { await clickText(".rail-years .seg button", "mean ± se"); await sleep(1500); } },
  { name: "p6_years_cruises", url: "?tour=off", viewport: PHONE, steps: async () => { await click(".phone-pills button[data-tour=years]"); await sleep(900); await clickText(".sheet .seg button", "cruises"); await sleep(1800); } },
  // U4a — share + figures: the whole-view capture is not blank (spread + non-background fraction, since a dark map and a blank
  // dark canvas share a mean), every panel exports PNG / SVG / CSV, the maximized panel at its larger size
  { name: "u4_share_menu", url: "?tour=off", steps: async () => { await expandGroup("export"); await clickText(".menu-btn", "Share"); await sleep(300); } },
  { name: "u4_export_menu", url: "?tour=off", steps: async () => { await click(".rail-years .export-menu .menu-btn"); await sleep(300); } },
  { name: "u4_capture", url: "?tour=off", steps: async () => {}, assert: async () => {
      const r = await page.evaluate(() => window.__captureView());
      fs.writeFileSync(path.join(out, "u4_capture_export.png"), Buffer.from(r.dataUrl.split(",")[1], "base64"));
      console.log(`  capture ${r.w}×${r.h} · mean ${r.mean.toFixed(1)} sd ${r.sd.toFixed(1)} non-bg ${(r.nonBg * 100).toFixed(0)} %`);
      if (r.sd < 15 || r.nonBg < 0.15) fail(`u4_capture: looks blank (sd ${r.sd.toFixed(1)}, non-bg ${(r.nonBg * 100).toFixed(0)} %)`); } },
  { name: "u4_capture_section_light", url: "?lens=section&var=temperature&line=90&tour=off&theme=light", steps: async () => {}, assert: async () => {
      const r = await page.evaluate(() => window.__captureView()); fs.writeFileSync(path.join(out, "u4_capture_section_light_export.png"), Buffer.from(r.dataUrl.split(",")[1], "base64"));
      console.log(`  capture ${r.w}×${r.h} · mean ${r.mean.toFixed(1)} sd ${r.sd.toFixed(1)} non-bg ${(r.nonBg * 100).toFixed(0)} %`); if (r.sd < 15 || r.nonBg < 0.15) fail("u4_capture_section_light: looks blank"); } },
  { name: "u4_figures", url: "?lens=section&var=temperature&line=90&station=st90-ln90&tour=off", steps: async () => { await sleep(1200); }, assert: async () => {
      for (const [id, kind] of [["years", "png"], ["years", "svg"], ["years", "csv"], ["depth", "png"], ["depth", "csv"], ["section", "png"], ["section", "svg"], ["section", "csv"], ["station", "png"], ["station", "csv"], ["timing", "csv"]]) {
        try { const r = await page.evaluate((id, kind) => window.__figure(id, kind), id, kind);
          const ok = kind === "png" ? (r.sd >= 8 && r.nonBg >= 0.03) : kind === "svg" ? /<svg/.test(r.text) && r.stamped : r.bytes > 20 && r.lines > 2;
          console.log(`  ${id}.${kind}: ${r.name} ${r.bytes} B${kind === "png" ? ` ${r.w}×${r.h} sd ${r.sd.toFixed(1)} non-bg ${(r.nonBg * 100).toFixed(0)} %` : ""}${ok ? "" : "  <-- FAIL"}`);
          if (!ok) fail(`u4_figures: ${id}.${kind} looks wrong`);
          if (kind === "png") fs.writeFileSync(path.join(out, `u4_figure_${id}.png`), Buffer.from(r.dataUrl.split(",")[1], "base64"));
          if (!new RegExp(`^calcofi_explore_${id}_section_v\\d{4}\\.\\d{2}\\.\\d{2}_\\d{8}\\.${kind}$`).test(r.name)) fail(`u4_figures: filename ${r.name}`);
        } catch (e) { fail(`u4_figures: ${id}.${kind}: ${e.message}`); }
      } } },
  { name: "u4_figure_max", url: "?tour=off&max=years", steps: async () => { await sleep(800); }, assert: async () => {
      const r = await page.evaluate(() => window.__figure("years", "png")); console.log(`  maximized years.png ${r.w}×${r.h}`); if (r.w < 2000) fail(`u4_figure_max: ${r.w}px wide — not the maximized size`); } },
  { name: "p4_share", url: "?tour=off", viewport: PHONE, steps: async () => { await click(".sheet-summary"); await sleep(400); await expandGroup("export"); await page.evaluate(() => document.querySelector(".sheet-body").scrollTo(0, 9999)); await sleep(200); await clickText(".menu-btn", "Share"); await sleep(400); } },
  // U7 — cleanup: the header (no links, the release at the right), folded FILTERS / EXPORT, the folded denominator, the map's
  // extent in the URL (so Share → Copy link and the feedback URL reopen at the same zoom), the map's own ⬇, the annotator's text tool
  { name: "u7_header", url: "?tour=off", steps: async () => {},
    assert: async () => {
      if (await page.$(".cc-header .cc-links")) fail("u7_header: the query / schema / docs links are still in the header");
      const r = await page.evaluate(() => { const rel = document.querySelector('[data-tour="release"]').getBoundingClientRect(), t = document.querySelector(".cc-title").getBoundingClientRect(); return { rel: rel.left, title: t.right, vw: innerWidth }; });
      if (r.rel < r.vw * 0.55) fail(`u7_header: the release chip sits at x=${Math.round(r.rel)} of ${r.vw} (expected on the right)`);
      const groups = await page.$$eval(".group.folded", (g) => g.map((x) => x.dataset.group)); if (!groups.includes("filters") || !groups.includes("export")) fail(`u7_header: folded groups = ${groups.join(",")} (expected filters + export)`);
      if (await page.$(".den-list")) fail("u7_header: the denominator radios are open by default");
      const den = await page.$eval(".den-toggle b", (el) => el.textContent); if (!/per 10 m²|per 1000 m³|raw count/.test(den)) fail(`u7_header: the denominator line reads "${den}"`);
      if (await page.$(".rail-select .rail-body > .hint")) fail("u7_header: the rail's footer sentence (the lens title + DuckDB) is still there — the header carries the lens title"); } },
  { name: "u7_den_open", url: "?tour=off", steps: async () => { await click(".den-toggle"); await sleep(300); },
    assert: async () => { const n = await page.$$eval(".den-list input[name=den]", (r) => r.length); if (n !== 3) fail(`u7_den_open: ${n} radios`); const t = await page.$eval(".den-list", (el) => el.textContent); if (!/standard haul factor/.test(t)) fail("u7_den_open: no standard-haul-factor note"); } },
  { name: "u7_filters_open", url: "?tour=off&years=1990-2005&q=1,2", steps: async () => {},
    assert: async () => { const t = await page.$eval('.group[data-group="filters"] .group-right', (el) => el.textContent).catch(() => ""); if (!/1990–2005/.test(t) || !/Q1 Q2/.test(t)) fail(`u7_filters_open: the folded FILTERS summary reads "${t}"`); await expandGroup("filters"); const n = await page.$$eval(".chips .chip", (r) => r.length); if (n < 4) fail(`u7_filters_open: ${n} chips after expanding`); } },
  { name: "u7_map_extent", url: "?tour=off", steps: async () => { await page.evaluate(() => window.__map.easeTo({ center: [-118.5, 32.5], zoom: 7.2, duration: 0 })); await sleep(600); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/map=-118\.5(,|%2C)32\.5(,|%2C)7\.2/.test(u)) fail(`u7_map_extent: the URL has no map= after a move (${u})`); } },
  { name: "u7_map_extent_reopen", url: "?tour=off&map=-118.5,32.5,7.2", steps: async () => {},
    assert: async () => { const v = await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lng, c.lat, window.__map.getZoom()]; }); if (Math.abs(v[0] + 118.5) > 0.01 || Math.abs(v[1] - 32.5) > 0.01 || Math.abs(v[2] - 7.2) > 0.05) fail(`u7_map_extent_reopen: the map opened at ${v.map((x) => x.toFixed(2)).join(",")}`); } },
  { name: "u7_map_export", url: "?tour=off&lens=hex&res=5", steps: async () => { await click('[data-tour="map-export"] .menu-btn'); await sleep(300); },
    assert: async () => {
      const items = await page.$$eval('[data-tour="map-export"] .menu-item', (r) => r.map((x) => x.textContent.slice(0, 3))); if (items.join() !== "PNG,CSV") fail(`u7_map_export: items ${items.join(",")} (expected PNG,CSV — no SVG for WebGL)`);
      await page.keyboard.press("Escape");
      const png = await page.evaluate(() => window.__figure("map", "png")); console.log(`  map.png ${png.w}×${png.h} nonBg ${png.nonBg.toFixed(2)}`); if (png.nonBg < 0.05) fail(`u7_map_export: map.png looks blank (nonBg ${png.nonBg.toFixed(2)})`); if (png.w < 600) fail(`u7_map_export: map.png ${png.w}px wide`);
      const csv = await page.evaluate(() => window.__figure("map", "csv")); if (csv.lines < 10 || !/hex/.test(csv.text)) fail(`u7_map_export: map.csv ${csv.lines} lines, head ${csv.text.slice(0, 60)}`); else console.log(`  map.csv ${csv.lines} lines`); } },
  { name: "u7_annotate_text", url: "?tour=off", steps: async () => { await click('[data-tour="feedback"]'); await page.waitForSelector(".feedback-shot img", { timeout: 20000 }); await sleep(200); await click('[data-tour="feedback-edit"]'); await page.waitForSelector(".annot-stage canvas"); await sleep(300);
      await click(".annot-tools .seg button[aria-label='hot pink']"); await click(".annot-tools .seg button[aria-label=text]");
      const b = await (await page.$(".annot-stage canvas")).boundingBox(); await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.3); await sleep(200);
      if (!(await page.$(".annot-text"))) { fail("u7_annotate_text: no text input after a click"); return; }
      await page.keyboard.type("spike here"); await page.keyboard.press("Enter"); await sleep(200); },
    assert: async () => { const t = await page.$eval(".annotator .hint", (el) => el.textContent); if (!/1 mark/.test(t)) fail(`u7_annotate_text: ${t}`); const n = await page.$$eval(".annot-tools .seg[aria-label=colour] button", (r) => r.length); if (n !== 3) fail(`u7_annotate_text: ${n} colours (expected 3)`); } },
  // U7b — a dataset filter from the other realm (Ben's ?lens=hex&var=temperature&datasets=swfsc_ichthyo) is pruned when the slice answers, never shown as "0 observations" under the pre-engine legend
  { name: "u7_stale_dataset_filter", url: "?lens=hex&res=5&var=temperature&q=3&datasets=swfsc_ichthyo&hide=depth&tour=off", steps: async () => { await sleep(800); },
    assert: async () => {
      const u = await page.evaluate(() => location.search); if (/datasets=/.test(u)) fail(`u7_stale_dataset_filter: datasets= survived (${u})`);
      const ttl = await page.$eval(".legend .ttl", (el) => el.textContent); if (/coverage\.json/.test(ttl)) fail(`u7_stale_dataset_filter: the legend is the pre-engine text: ${ttl}`);
      const st = await page.$eval(".status", (el) => el.textContent); const n = +(st.match(/([\d,]+) observations/)?.[1] ?? "0").replace(/,/g, ""); if (!(n > 0)) fail(`u7_stale_dataset_filter: status "${st}"`); else console.log(`  ${st}`);
      const hexes = await page.evaluate(() => (window.__overlay?._deck?.props.layers ?? []).find((l) => l.id === "hexes")?.props.data?.length ?? 0); if (hexes < 10) fail(`u7_stale_dataset_filter: ${hexes} hexagons drawn`); } },
  { name: "u7_realm_switch_drops_filter", url: "?lens=hex&res=5&datasets=swfsc_ichthyo&tour=off", steps: async () => { await clickText(".seg.realm button", "Environment"); await waitMark(/^slice:env/); await sleep(1500); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (/datasets=/.test(u)) fail(`u7_realm_switch_drops_filter: datasets= survived the realm switch (${u})`); const st = await page.$eval(".status", (el) => el.textContent); if (/ 0 observations/.test(st)) fail(`u7_realm_switch_drops_filter: ${st}`); } },
  // Ben's second screenshot: a hexagon view whose FIRST lens answer was empty (a filter with nothing in it) kept the pre-engine legend and a
  // count-mode colour domain after the filter was cleared — the station table is fetched once at open on a non-station lens, and
  // preSlice was keyed on it being empty. Now it is keyed on the first lens having answered.
  { name: "u7_empty_then_filled", url: "?lens=hex&res=5&var=temperature&years=2030-2031&tour=off", steps: async () => { await sleep(600);
      const ttl0 = await page.$eval(".legend .ttl", (el) => el.textContent); const empty = await page.$(".legend-empty"); console.log(`  before: "${ttl0.slice(0, 40)}…" empty-note ${!!empty}`); if (/coverage\.json/.test(ttl0)) fail(`u7_empty_then_filled: empty result shown under the pre-engine legend: ${ttl0}`); if (!empty) fail("u7_empty_then_filled: no 'nothing in the selection' note");
      await expandGroup("filters"); await click(".chip::-p-text(years) .x"); await waitMark(/^query:hex$/); await sleep(1500); },
    assert: async () => {
      const ttl = await page.$eval(".legend .ttl", (el) => el.textContent); if (/coverage\.json/.test(ttl)) fail(`u7_empty_then_filled: still the pre-engine legend after the filter cleared: ${ttl}`);
      const ticks = await page.$$eval(".legend .ticks span", (r) => r.map((x) => x.textContent)); const lo = parseFloat(ticks[0].replace(/,/g, "")); if (!(lo > 0)) fail(`u7_empty_then_filled: colour domain ${ticks.join(" ")} — count mode (0 …), not the 5–95 % of the mean`); else console.log(`  legend "${ttl.slice(0, 50)}" · domain ${ticks[0]}–${ticks[2]}`);
      if (await page.$(".legend-empty")) fail("u7_empty_then_filled: the empty note survived"); } },
  // U7c — the picker opens on the folded category tree: the pick's category open to it + "… N more", every other category one row; typing searches within the tree
  { name: "u7_picker_tree", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(400); },
    assert: async () => {
      const t = await page.evaluate(() => ({ tab: document.querySelector(".picker-tabs [role=tab][aria-selected=true]")?.textContent.trim(), groups: [...document.querySelectorAll(".browse-group")].map((g) => ({ title: g.querySelector(".lab").firstChild.textContent, open: g.classList.contains("open"), partial: g.classList.contains("partial"), items: g.querySelectorAll(".browse-item:not(.more)").length, more: g.querySelector(".browse-item.more")?.textContent ?? null })), sel: document.querySelector(".browse-item.sel .lab")?.textContent }));
      console.log(`  tab ${t.tab} · ${t.groups.length} categories · open: ${t.groups.filter((g) => g.open).map((g) => `${g.title} (${g.items} shown, ${g.more ?? "no more row"})`).join("; ")} · selected: ${t.sel}`);
      if (!/Browse/.test(t.tab ?? "")) fail(`u7_picker_tree: opened on ${t.tab}`);
      const open = t.groups.filter((g) => g.open); if (open.length !== 1 || !open[0].partial || open[0].items !== 1 || !/more in/.test(open[0].more ?? "")) fail(`u7_picker_tree: expected one partial category with the pick + a more row`);
      if (!/sardine/i.test(t.sel ?? "")) fail(`u7_picker_tree: the selected row is ${t.sel}`);
      if (t.groups.length < 6) fail(`u7_picker_tree: ${t.groups.length} categories`); } },
  { name: "u7_picker_tree_more", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(300); await click(".browse-item.more"); await sleep(300); },
    assert: async () => { const n = await page.$$eval(".browse-group.open .browse-item:not(.more)", (r) => r.length); if (n < 500) fail(`u7_picker_tree_more: ${n} items after "more"`); else console.log(`  ${n} items after the more row`); if (await page.$(".browse-item.more")) fail("u7_picker_tree_more: the more row survived"); } },
  { name: "u7_picker_tree_search", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(300); await page.type(".picker-search input", "anchovy"); await sleep(400); },
    assert: async () => { const r = await page.evaluate(() => ({ groups: [...document.querySelectorAll(".browse-group")].filter((g) => g.offsetHeight > 0).map((g) => g.querySelector(".lab").firstChild.textContent), items: [...document.querySelectorAll(".browse-item:not(.more) .lab")].map((x) => x.textContent), count: document.querySelector(".picker-count")?.textContent })); console.log(`  "${r.count}" · ${r.groups.join(" · ")} · ${r.items.slice(0, 4).join(", ")}`); if (!r.items.length || !r.items.every((x) => /anchov|engraul/i.test(x))) fail(`u7_picker_tree_search: ${r.items.slice(0, 5).join(", ")}`); if (r.groups.length > 3) fail(`u7_picker_tree_search: ${r.groups.length} categories still shown`); } },
  { name: "u7_picker_tree_enter", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(300); await page.type(".picker-search input", "northern anchovy"); await sleep(300); await page.keyboard.press("Enter"); await sleep(1500); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/taxon=worms%3A?\d+/.test(u) || /217452/.test(u)) fail(`u7_picker_tree_enter: ${u}`); else console.log(`  picked → ${decodeURIComponent(u).match(/taxon=[^&]+/)[0]}`); } },
  { name: "u7_variable_tree", url: "?var=temperature&tour=off", steps: async () => { await click("#variable-btn"); await sleep(400); },
    assert: async () => { const g = await page.$$eval(".browse-group", (r) => r.map((x) => `${x.querySelector(".lab").firstChild.textContent}${x.classList.contains("open") ? " [open]" : ""}`)); console.log(`  ${g.join(" · ")}`); if (!g.some((x) => /Physical Oceanography \[open\]/.test(x))) fail(`u7_variable_tree: Physical Oceanography not the open one`); if (!(await page.$(".browse-item.sel"))) fail("u7_variable_tree: Temperature not shown selected"); } },
  // U4b — feedback: the dialog captures the view, the annotator draws, Send posts to the endpoint (mocked here) and thanks with the issue link
  { name: "u4b_feedback_open", url: "?tour=off", steps: async () => { await click('[data-tour="feedback"]'); await page.waitForSelector(".feedback-shot img", { timeout: 20000 }); await sleep(300); },
    assert: async () => { const src = await page.$eval(".feedback-shot img", (i) => i.src); if (!src.startsWith("data:image/jpeg")) fail("u4b_feedback_open: no thumbnail"); const dis = await page.$eval('[data-tour="feedback-send"]', (b) => b.disabled); if (!dis) fail("u4b_feedback_open: Send enabled with no text / no endpoint"); if (!(await page.$(".hint.warn"))) fail("u4b_feedback_open: no 'no endpoint' note"); } },
  { name: "u4b_annotate", url: "?tour=off", steps: async () => { await click('[data-tour="feedback"]'); await page.waitForSelector(".feedback-shot img", { timeout: 20000 }); await sleep(200); await click('[data-tour="feedback-edit"]'); await page.waitForSelector(".annot-stage canvas"); await sleep(300);
      const b = await (await page.$(".annot-stage canvas")).boundingBox(); await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 8 }); await page.mouse.up(); await sleep(200);
      await click(".annot-tools .seg button[aria-label=circle]"); await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.55); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.75, { steps: 6 }); await page.mouse.up(); await sleep(200); },
    assert: async () => { const t = await page.$eval(".annotator .hint", (el) => el.textContent); if (!/2 marks/.test(t)) fail(`u4b_annotate: ${t}`); } },
  { name: "u4b_send_mock", url: "?tour=off", steps: async () => {
      await page.evaluate(() => localStorage.setItem("explore.feedback_url", "https://feedback.test/exec"));
      await page.setRequestInterception(true);
      page.__posted = null;
      page.__onreq = (req) => { if (req.url().startsWith("https://feedback.test/")) { page.__posted = req.postData(); req.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, id: "abc123", issue_url: "https://github.com/CalCOFI/explore/issues/999" }) }); } else req.continue(); };
      page.on("request", page.__onreq);
      await click('[data-tour="feedback"]'); await page.waitForSelector(".feedback-shot img", { timeout: 20000 }); await sleep(200);
      await click('[data-tour="feedback-edit"]'); await page.waitForSelector(".annot-stage canvas"); const b = await (await page.$(".annot-stage canvas")).boundingBox(); await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.6, { steps: 6 }); await page.mouse.up(); await sleep(100); await clickText(".annot-tools .btn", "Done"); await sleep(300);
      await page.type('[data-tour="feedback-text"]', "that spike is weird"); await sleep(200); await click('[data-tour="feedback-send"]'); await page.waitForSelector(".modal-feedback a[href*='issues/999']", { timeout: 15000 }); await sleep(300); },
    assert: async () => {
      const j = JSON.parse(page.__posted ?? "{}"); page.off("request", page.__onreq); await page.setRequestInterception(false);
      console.log(`  posted: app=${j.app} text=${JSON.stringify(j.text)} release=${j.release} viewport=${j.viewport} theme=${j.theme} image=${j.image ? (j.image.length / 1e3).toFixed(0) + " KB" : "none"} website=${JSON.stringify(j.website)}`);
      if (j.app !== "explore" || j.text !== "that spike is weird" || !/^v\d{4}/.test(j.release) || !/^data:image\/png/.test(j.image ?? "") || j.website !== "" || !/lens=/.test(j.url)) fail("u4b_send_mock: payload wrong");
      if (j.image && j.image.length > 4.2e6) fail(`u4b_send_mock: image ${j.image.length} chars > 3 MB after fitBytes`);
      const t = await page.$eval(".modal-feedback .modal-body", (el) => el.textContent); if (!/public issue/.test(t)) fail(`u4b_send_mock: thanks reads ${t.slice(0, 80)}`); } },
  { name: "p4b_feedback", url: "?tour=off", viewport: PHONE, steps: async () => { await click('[data-tour="more"] button'); await sleep(200); await clickText(".menu-item", "Feedback"); await page.waitForSelector(".feedback-shot img", { timeout: 20000 }); await sleep(300); } },
  // U2 — Browse (by category · by dataset) from coverage.json's taxa[] and categories; the organism list before the engine is warm
  { name: "u2_prewarm", url: "?tour=off", ready: "sidecars", steps: async () => { await click("#organism-btn"); await sleep(300); },
    assert: async () => { const n = await page.$$eval("#organism-list li[role=option]", (r) => r.length); const warm = await page.evaluate(() => (window.__marks ?? []).some((m) => m.name === "query:taxa")); console.log(`  ${n} organisms listed · taxa.sql answered: ${warm}`); if (n < 1000) fail(`u2_prewarm: ${n} organisms before the engine (coverage.json taxa[])`); } },
  { name: "u2_browse_category", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(300); await click('[data-tour="browse"]'); await sleep(300); await clickText(".picker-tabs .seg button", "by category"); await sleep(200); await clickText(".browse-row .lab", "Fish Eggs"); await sleep(300); },
    assert: async () => { const g = await page.$$eval(".browse-group", (r) => r.map((x) => `${x.querySelector(".lab").firstChild.textContent} (${x.querySelector(".lab small").textContent})`)); const items = await page.$$eval(".browse-group.open .browse-item", (r) => r.length); console.log(`  ${g.length} categories: ${g.join(" · ")} · ${items} organisms under the open one`); if (g.length < 6 || items < 500) fail(`u2_browse_category: ${g.length} groups, ${items} items`); } },
  { name: "u2_browse_dataset", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(300); await click('[data-tour="browse"]'); await sleep(200); await clickText(".picker-tabs .seg button", "by dataset"); await sleep(300); await clickText(".browse-row .lab", "farallon"); await sleep(300); },
    assert: async () => { const g = await page.$$eval(".browse-group", (r) => r.length); const items = await page.$$eval(".browse-group.open .browse-item", (r) => r.length); console.log(`  ${g} datasets · ${items} organisms under farallon`); if (g < 8 || items < 50) fail(`u2_browse_dataset: ${g} groups, ${items} items`); } },
  { name: "u2_browse_pick", url: "?tour=off", steps: async () => { await click("#organism-btn"); await sleep(300); await click('[data-tour="browse"]'); await sleep(200); await clickText(".picker-tabs .seg button", "by category"); await sleep(200); await clickText(".browse-row .lab", "Seabirds"); await sleep(300); await clickText(".browse-item .lab", "Sooty Shearwater"); await sleep(1500); },
    assert: async () => { const u = await page.evaluate(() => location.search); if (!/taxon=itis/.test(u)) fail(`u2_browse_pick: ${u}`); else console.log(`  picked → ${decodeURIComponent(u).match(/taxon=[^&]+/)[0]}`); } },
  { name: "u2_variable_browse", url: "?var=temperature&tour=off", steps: async () => { await click("#variable-btn"); await sleep(300); await click('[data-tour="browse"]'); await sleep(300); await clickText(".browse-row .lab", "Nutrients"); await sleep(300); },
    assert: async () => { const g = await page.$$eval(".browse-group", (r) => r.map((x) => x.querySelector(".lab").firstChild.textContent)); console.log(`  categories: ${g.join(" · ")}`); if (!g.includes("Nutrients & Chemistry") || !g.includes("Carbonate System")) fail("u2_variable_browse: the registry's categories are missing"); } },
  { name: "p2_browse", url: "?tour=off", viewport: PHONE, steps: async () => { await click(".sheet-summary"); await sleep(400); await click("#organism-btn"); await sleep(400); await click('[data-tour="browse"]'); await sleep(300); } },
  // brand v2 preview (plan 2026-08-30 Phase 2) — meaningful on a VITE_BRAND=v2 build (the dev server: VITE_BRAND=v2 npm run dev); on v1 they report and skip
  { name: "v2_default_light", url: "?tour=off", steps: async () => {
      // a FRESH context: an earlier state's ?theme= link persisted (as it should), so drop the cookies and storage and reopen
      await page.evaluate(() => { localStorage.clear(); }); const cdp = await page.createCDPSession(); await cdp.send("Network.clearBrowserCookies"); await cdp.detach();
      await page.goto(base + "?tour=off", { waitUntil: "domcontentloaded" }); await waitMark(/^first_lens_ready$/); await sleep(1200); }, assert: async () => {
      const b = await page.evaluate(() => ({ v: window.ccTheme?.version, t: document.documentElement.dataset.theme, s: document.documentElement.getAttribute("data-cc-scale"), ss: document.fonts.check('16px "Source Sans 3"'), lockup: !!document.querySelector('.cc-header .cc-home img[src*="logo_calcofi_h"]'), org: !!document.querySelector(".cc-title-org"), cookie: document.cookie, hdr: document.querySelector(".cc-header").getBoundingClientRect().height, fs: getComputedStyle(document.querySelector(".group-title")).fontSize }));
      console.log(`  ccTheme.version ${b.v} · theme ${b.t} · scale ${b.s} · Source Sans 3 ${b.ss} · lockup ${b.lockup} · header ${b.hdr}px · group title ${b.fs}`);
      if (b.v !== "2") { console.log("  (a v1 build — the v2 checks are skipped)"); return; }
      if (b.t !== "light") fail(`v2_default_light: a fresh context opened ${b.t}`); if (b.s !== "app") fail("v2_default_light: data-cc-scale is not app"); if (!b.ss) fail("v2_default_light: Source Sans 3 not loaded");
      if (!b.lockup) fail("v2_default_light: no lockup in the header"); if (b.org) fail("v2_default_light: the cc-title-org span is still there"); if (/cc_theme=/.test(b.cookie)) fail(`v2_default_light: the default was persisted (${b.cookie})`); if (b.hdr > 46) fail(`v2_default_light: header ${b.hdr}px (app scale is 44)`); } },
  { name: "v2_dark", url: "?tour=off&theme=dark", steps: async () => {}, assert: async () => {
      const b = await page.evaluate(() => ({ v: window.ccTheme?.version, t: document.documentElement.dataset.theme, cookie: document.cookie, bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() })); if (b.v !== "2") return;
      if (b.t !== "dark" || b.bg !== "#0f1a2e") fail(`v2_dark: theme ${b.t} bg ${b.bg}`); if (!/cc_theme_src=user/.test(b.cookie)) fail(`v2_dark: ?theme= did not persist with the marker (${b.cookie})`); } },
  { name: "v2_capture_fonts", url: "?tour=off", steps: async () => {}, assert: async () => {
      if ((await page.evaluate(() => window.ccTheme?.version)) !== "2") return;
      const n = await page.evaluate(() => window.__fontEmbedCss().then((s) => s.length)); console.log(`  font-embed css ${(n / 1e3).toFixed(0)} KB`); if (n < 50000) fail(`v2_capture_fonts: font-embed css is ${n} chars (expected the woff2 files inlined)`);
      const r = await page.evaluate(() => window.__captureView()); fs.writeFileSync(path.join(out, "v2_capture_light.png"), Buffer.from(r.dataUrl.split(",")[1], "base64")); console.log(`  capture ${r.w}×${r.h} · mean ${r.mean.toFixed(1)} sd ${r.sd.toFixed(1)} non-bg ${(r.nonBg * 100).toFixed(0)} %`); if (r.sd < 15 || r.nonBg < 0.15) fail("v2_capture_fonts: looks blank");
      // the lockup drew: the mark's yellow in the capture's top-left corner (a <picture> wrapper lost it silently)
      const y = await page.evaluate(async (du) => { const img = new Image(); await new Promise((ok) => { img.onload = ok; img.src = du; }); const c = document.createElement("canvas"); c.width = 300; c.height = 50; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, 300, 50, 0, 0, 300, 50); const d = ctx.getImageData(0, 0, 300, 50).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 180 && d[i + 2] < 120) n++; return n; }, r.dataUrl);
      console.log(`  lockup yellow px in the corner: ${y}`); if (y < 10) fail(`v2_capture_fonts: the header lockup is missing from the capture (${y} yellow px)`); } },
  { name: "v2_capture_dark", url: "?lens=section&var=temperature&line=90&tour=off&theme=dark", steps: async () => {}, assert: async () => {
      if ((await page.evaluate(() => window.ccTheme?.version)) !== "2") return;
      const r = await page.evaluate(() => window.__captureView()); fs.writeFileSync(path.join(out, "v2_capture_dark.png"), Buffer.from(r.dataUrl.split(",")[1], "base64")); if (r.sd < 15 || r.nonBg < 0.15) fail("v2_capture_dark: looks blank"); } },
  { name: "v2_tour", url: "?tour=off", steps: async () => { await page.evaluate(() => window.__tour()); await sleep(900); }, tour: true },
  { name: "v2_phone", url: "?tour=off", viewport: PHONE, steps: async () => {}, assert: async () => {
      const b = await page.evaluate(() => ({ v: window.ccTheme?.version, src: [...document.querySelectorAll(".cc-header .cc-home img")].find((i) => i.getBoundingClientRect().width > 0)?.currentSrc ?? "", hdr: document.querySelector(".cc-header").getBoundingClientRect().height })); if (b.v !== "2") return;
      console.log(`  header ${b.hdr}px · logo ${b.src.split("/").pop()}`); if (!/logo_calcofi(_light)?\.svg$/.test(b.src)) fail(`v2_phone: the header shows ${b.src.split("/").pop()} (expected the bare mark under 480 px)`); if (b.hdr > 48) fail(`v2_phone: header ${b.hdr}px`); } },
];
// every tour step: its anchor resolves and is on screen in the state its before() produced; one screenshot per step
async function walkTour(name) {
  for (let i = 0; i < 12; i++) {
    const st = await page.evaluate(() => { const d = window.__tourDriver; if (!d || !d.isActive()) return null; const s = d.getActiveStep(); const el = document.querySelector(".driver-active-element"); const b = el?.getBoundingClientRect(); return { i: d.getActiveIndex(), title: s?.popover?.title, has: d.hasNextStep(), box: b ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : null, pop: !!document.querySelector(".driver-popover") }; });
    if (!st) { if (i === 0) fail(`${name}: the tour did not start`); break; }
    const [l, t, w, h] = st.box ?? [0, 0, 0, 0];
    if (!st.box || w === 0 || h === 0) fail(`${name} step ${st.i} (${st.title}): no highlighted element`);
    else if (l < -1 || t < -1 || l + w > (await page.evaluate(() => innerWidth)) + 1 || t + h > (await page.evaluate(() => innerHeight)) + 1) fail(`${name} step ${st.i} (${st.title}): anchor off-screen ${st.box.join(",")}`);
    if (!st.pop) fail(`${name} step ${st.i}: no popover`);
    await shot(`${name}_${String(st.i).padStart(2, "0")}`);
    console.log(`  step ${st.i} ${st.title} @ ${st.box?.join(",")}`);
    if (!st.has) { await page.evaluate(() => window.__tourDriver?.destroy()); break; }
    await page.click(".driver-popover-next-btn"); await sleep(900);
  }
}
for (const st of STATES) {
  if (only && !only.test(st.name)) continue;
  console.log(`\n== ${st.name}: ${st.url}`);
  const n0 = errors.length;
  if (page.isClosed() || page.mainFrame().detached) { console.log("  (tab lost — opening a fresh one)"); await freshPage(); }
  try {
    await ready(base + st.url, st.viewport ?? DESKTOP, st.ready);
    await st.steps();
    await sleep(700);
    const lay = await assertLayout(st.name);
    if (st.assert) await st.assert(lay);
    if (st.tour) await walkTour(st.name);
    const file = await shot(st.name);
    results.states[st.name] = { url: st.url, layout: lay, ok: errors.length === n0, shot: file };
    console.log(`  shot ${file} · scroll ${lay.scrollW}×${lay.scrollH} in ${lay.vw}×${lay.vh}${lay.off.length ? "" : " · all controls in view"}`);
  } catch (e) {
    if (/detached Frame|Session closed|Target closed/.test(e.message)) { console.log("  (tab lost mid-state — fresh tab, one retry)"); await freshPage(); try { await ready(base + st.url, st.viewport ?? DESKTOP, st.ready); await st.steps(); await sleep(700); const lay = await assertLayout(st.name); if (st.assert) await st.assert(lay); if (st.tour) await walkTour(st.name); const file = await shot(st.name); results.states[st.name] = { url: st.url, layout: lay, ok: true, shot: file, retried: true }; continue; } catch (e2) { e = e2; } }
    fail(`${st.name}: ${e.message}`); results.states[st.name] = { url: st.url, error: e.message }; }
  if (errors.length > n0) fail(`${st.name}: ${errors.length - n0} page error(s)`);
}

// ── the timing runs (Phase 0/1: every lens, cold then warm) ──────────────────
if (opt.timing != null) {
  async function run(label, url, steps, viewport = DESKTOP) {
    console.log(`\n== ${label}: ${url}`);
    await ready(url, viewport);
    const r = { url, marks: await marks(), shots: {} };
    for (const [name, fn] of steps) {
      const n0 = (await marks()).length;
      await fn();
      await sleep(1600);
      const file = path.join(out, `${label}_${name}.png`);
      await page.screenshot({ path: file });
      r.shots[name] = (await marks()).slice(n0);
      console.log(`  ${name}: ${r.shots[name].map((m) => `${m.name} ${m.ms}ms`).join(" | ")}`);
    }
    r.marksAll = await marks();
    results.timing[label] = r;
  }
  const lenses = [["station", async () => {}], ["hex", () => clickLens("Hexagons")], ["cruise", () => clickLens("Cruises")], ["region", () => clickLens("Regions")], ["section", () => clickLens("Sections")]];
  await run("cold", base + "?tour=off", lenses);
  await run("env", base + "?var=temperature&tour=off", [["station", async () => {}], ["section", () => clickLens("Sections")], ["section_anom", async () => { await page.click("input[type=checkbox]"); await sleep(300); }]]);
  await run("warm", base + "?lens=hex&res=5", [["hex", async () => { await sleep(1500); }], ["station", () => clickLens("Stations")], ["hex", () => clickLens("Hexagons")]]);
  await run("phone", base + "?tour=off", [["station", async () => {}]], PHONE);
}

fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 1));
await browser.close();
console.log(`\n${fails ? `${fails} FAILURE(S)` : "all checks passed"} · written ${path.join(out, "results.json")}`);
process.exit(fails ? 1 : 0);
