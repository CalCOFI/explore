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
const page = (await browser.pages())[0] ?? (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => { errors.push(e.message); console.log("PAGEERROR", e.message); });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
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
async function ready(url, viewport = DESKTOP) {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded" });
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
  { name: "u0_organism_by_category", url: "?tour=off", steps: async () => { await click("#organism-btn"); await page.select(".picker-tools select", "category"); await sleep(400); } },
  { name: "u0_organism_most", url: "?tour=off", steps: async () => { await click("#organism-btn"); await click(".picker-tools .seg button:nth-child(2)"); await sleep(400); } },
  { name: "u0_variable_open", url: "?var=temperature&tour=off", steps: async () => { await click("#variable-btn"); await sleep(400); } },
  { name: "u0_hex", url: "?lens=hex&res=5&tour=off", steps: async () => {} },
  { name: "u0_section_cruise_open", url: "?lens=section&var=temperature&line=90&tour=off", steps: async () => { await click("#section-cruise-btn"); await sleep(400); } },
  { name: "u0_cruise", url: "?lens=cruise&tour=off", steps: async () => { await click("#cruise-btn"); await sleep(400); } },
  { name: "u0_copy_menu", url: "?tour=off", steps: async () => { await clickText(".menu-btn", "Copy code"); await sleep(300); } },
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
  try {
    await ready(base + st.url, st.viewport ?? DESKTOP);
    await st.steps();
    await sleep(700);
    const lay = await assertLayout(st.name);
    if (st.assert) await st.assert(lay);
    if (st.tour) await walkTour(st.name);
    const file = await shot(st.name);
    results.states[st.name] = { url: st.url, layout: lay, ok: errors.length === n0, shot: file };
    console.log(`  shot ${file} · scroll ${lay.scrollW}×${lay.scrollH} in ${lay.vw}×${lay.vh}${lay.off.length ? "" : " · all controls in view"}`);
  } catch (e) { fail(`${st.name}: ${e.message}`); results.states[st.name] = { url: st.url, error: e.message }; }
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
