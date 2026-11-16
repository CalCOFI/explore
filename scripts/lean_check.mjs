// the lean panel, clicked through in a real Chrome: every What category × every view × When × Where, the layers, Reset,
// the URL round-trip, back / forward, classic, light / dark and a phone-width window — and every download opened and
// checked against the filters in force and the numbers the view draws. Re-runnable; prints PASS / FAIL per check.
//   node scripts/lean_check.mjs [baseUrl] [outDir] [--only=regex] [--headed] [--list]
// downloads land in <outDir>/dl/<case>/ (the browser's own download, not a hook); screenshots in <outDir>/<case>.png
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=") || true]; }));
const pos = args.filter((a) => !a.startsWith("--"));
const base = (pos[0] ?? "http://localhost:5178/").replace(/\/?$/, "/");
const out = pos[1] ?? "shots/lean";
const only = opt.only ? new RegExp(opt.only) : null;
fs.mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DESK = { width: 1400, height: 900 };
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const profile = path.join(process.env.TMPDIR ?? "/tmp", "explore-lean-check-profile");
fs.rmSync(profile, { recursive: true, force: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: opt.headed ? false : "new", userDataDir: profile,
  args: ["--window-size=1420,1000", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars"], defaultViewport: DESK });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page, errs = [], cur = "";
const results = [];
let nPass = 0, nFail = 0;
const pass = (m) => { nPass++; results.push({ c: cur, ok: true, m }); console.log(`  ok   ${m}`); };
const fail = (m) => { nFail++; results.push({ c: cur, ok: false, m }); console.log(`  FAIL ${m}`); };
const check = (ok, m) => (ok ? pass(m) : fail(m));
// noise the app itself cannot fix: tile servers, the analytics beacon, the dev server's HMR socket
const IGNORE = /favicon|plausible|ERR_BLOCKED|net::ERR_ABORTED|Failed to load resource|\[vite\]|WebSocket|GroupMarkerNotSet|Download the React DevTools/;
async function freshPage() {
  if (page) await page.close().catch(() => {});
  page = await browser.newPage();
  page.on("pageerror", (e) => { errs.push(`pageerror: ${e.message}`); });
  page.on("console", (m) => { if (m.type() === "error" && !IGNORE.test(m.text())) errs.push(`console: ${m.text().slice(0, 240)}`); });
  const cdp = await page.createCDPSession();
  page.__cdp = cdp;
  return page;
}
const marks = () => page.evaluate(() => (window.__marks ?? []).length);
/** the view has settled: the first lens drew, no busy toast, the slice is the current pick, no area pending, and the timing
 *  marks have stopped arriving for `quiet` ms */
async function idle(timeout = 90000, quiet = 1200) {
  const t0 = Date.now(); let last = -1, since = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(() => {
      const v = window.__view, busy = !!document.querySelector(".status-toast.busy, .spin");
      const want = v ? (v.sel.realm === "bio" ? `bio:${v.sel.taxon}` : `env:${v.sel.var}`) : null;
      return { n: (window.__marks ?? []).length, ok: !!v && (window.__marks ?? []).some((m) => m.name === "first_lens_ready") && !busy && v.sliceKey === want && !v.areaPending };
    }).catch(() => ({ n: -1, ok: false }));
    if (s.n !== last) { last = s.n; since = Date.now(); }
    if (s.ok && Date.now() - since > quiet) return true;
    await sleep(150);
  }
  fail(`${cur}: the view did not settle in ${timeout / 1000} s`);
  return false;
}
async function ready(qs, vp = DESK) {
  await page.setViewport(vp);
  const url = base + (qs.startsWith("?") ? qs : `?${qs}`) + (/tour=/.test(qs) ? "" : `${qs.includes("?") || qs ? "&" : "?"}tour=off`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await idle();
}
const shot = async (name) => { const f = path.join(out, `${name}.png`); await page.screenshot({ path: f }); return f; };
const url = () => page.evaluate(() => location.search);
const qp = async () => Object.fromEntries(new URLSearchParams(await url()));
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
const exists = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom <= innerHeight + 1 && r.top >= -1 && getComputedStyle(e).visibility !== "hidden"; }, sel);
/** click the first element matching `sel` whose text includes `txt` (exact when `exact`) */
async function clickText(sel, txt, exact = false) {
  const ok = await page.evaluate((s, t, ex) => { const el = [...document.querySelectorAll(s)].find((e) => (ex ? e.textContent.trim() === t : e.textContent.includes(t))); if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; }, sel, txt, exact);
  if (!ok) throw new Error(`no ${sel} with text "${txt}"`);
  await sleep(250);
}
async function click(sel) { await page.waitForSelector(sel, { timeout: 15000 }); await page.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: "center" }); e.click(); }, sel); await sleep(250); }
const closeWhat = async () => { if (await exists(".wp .wp-cancel")) { await click(".wp .wp-cancel"); await sleep(300); } };
const view = () => page.evaluate(() => { const v = window.__view; return { lens: v.lens, sel: v.sel, st: v.stationRows.map((r) => ({ k: r.grid_key, mean: r.mean, n: r.n, ns: r.n_samples, nf: r.n_found })), hex: v.hexRows.map((r) => ({ k: String(r.hex), mean: r.mean, n: r.n, ns: r.n_samples, nf: r.n_found })), reg: v.regionRows.map((r) => ({ k: r.spatial_name, key: r.spatial_key, mean: r.mean, n: r.n, ns: r.n_samples, nf: r.n_found })), cruise: v.cruiseRows.length, sec: v.sectionCells.length, inView: v.inView, vc: v.viewCount,
  secN: v.sectionCells.reduce((a, r) => a + Number(r.n ?? 0), 0), cruiseN: v.cruiseSamples.reduce((a, r) => a + Number(r.n ?? 0), 0),
  yearN: v.yearRows.filter((r) => Math.floor(Number(r.year)) >= v.sel.years[0] && Math.floor(Number(r.year)) <= v.sel.years[1]).reduce((a, r) => a + Number(r.n ?? 0), 0), yearBins: v.yearRows.length,
  yearS: v.yearRows.filter((r) => Math.floor(Number(r.year)) >= v.sel.years[0] && Math.floor(Number(r.year)) <= v.sel.years[1]).reduce((a, r) => a + Number(r.n_samples ?? 0), 0),
  depthN: v.depthRows.filter((r) => r.depth_bin == null || (Number(r.depth_bin) >= v.sel.depth[0] && Number(r.depth_bin) <= v.sel.depth[1])).reduce((a, r) => a + Number(r.n ?? 0), 0), depthBins: v.depthRows.length }; });
const lens = async (name) => { await click(`.va-tile[aria-label="${name}"]`); await sleep(400); await idle(); };

// ── downloads: the browser's own download into a fresh folder per case ──────────────────────────────────────────────────
let dlN = 0;
async function download(kind, timeout = 120000) {
  const dir = path.resolve(out, "dl", `${cur}_${++dlN}`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await page.__cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  const btn = kind === "csv" ? ".dl-main" : kind === "zip" ? ".dl-zip" : kind;
  if (await page.evaluate((s) => document.querySelector(s)?.disabled ?? true, btn)) { fail(`${kind}: the ${btn} button is disabled`); return null; }
  await click(btn);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = fs.readdirSync(dir).filter((x) => !x.endsWith(".crdownload"));
    if (f.length) { await sleep(300); const p = path.join(dir, f[0]); return { name: f[0], buf: fs.readFileSync(p), path: p }; }
    const st = await text(".status-toast");
    if (st && /error/i.test(st)) { fail(`${kind}: ${st}`); return null; }
    await sleep(250);
  }
  fail(`${kind}: nothing downloaded in ${timeout / 1000} s (status: ${await text(".status-toast")})`);
  return null;
}
function parseCsv(s) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const cols = rows.shift() ?? [];
  return { cols, rows: rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))) };
}
const num = (x) => (x === "" || x == null ? null : Number(x));
const near = (a, b) => a == null || b == null ? a == b : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
/** every row obeys every filter in force; returns the first few violations */
function filterViolations(rows, sel, extra = {}) {
  const bad = [];
  const yr0 = sel.years[0], yr1 = sel.years[1] >= 2100 ? 9999 : sel.years[1];
  for (const r of rows) {
    const why = [];
    const y = num(r.year); if (y != null && (y < yr0 || y > yr1)) why.push(`year ${y}`);
    if (sel.q && r.quarter !== "" && !sel.q.includes(Number(r.quarter))) why.push(`quarter ${r.quarter}`);
    const d = num(r.depth_bin); if (d != null && (d < sel.depth[0] || d > sel.depth[1])) why.push(`depth_bin ${d}`);
    if (sel.realm === "bio" && sel.stage && r.life_stage !== sel.stage) why.push(`life_stage ${r.life_stage}`);
    if (sel.realm === "bio" && r.taxon_key && r.taxon_key !== sel.taxon) why.push(`taxon ${r.taxon_key}`);
    if (sel.datasets && !sel.datasets.includes(r.dataset_key)) why.push(`dataset ${r.dataset_key}`);
    if (sel.cruises && !sel.cruises.includes(r.cruise_key)) why.push(`cruise ${r.cruise_key}`);
    if (sel.lens === "cruise" && sel.cruise && r.cruise_key !== sel.cruise) why.push(`cruise ${r.cruise_key} (lens)`);
    if (sel.lens === "section" && r.line !== "" && Number(r.line) !== sel.line) why.push(`line ${r.line}`);
    if (extra.region && !r.region_name) why.push("no region_name");
    if (extra.regionNames && !extra.regionNames.includes(r.region_name)) why.push(`region ${r.region_name}`);
    if (extra.box) { const [w, s, e, n] = extra.box, lo = num(r.longitude), la = num(r.latitude); if (lo < w - 1e-6 || lo > e + 1e-6 || la < s - 1e-6 || la > n + 1e-6) why.push(`outside box ${lo},${la}`); }
    if (extra.gridKeys && !extra.gridKeys.includes(r.grid_key)) why.push(`grid_key ${r.grid_key}`);
    if (extra.hex && r.hex !== extra.hex) why.push(`hex ${r.hex}`);
    if (why.length) bad.push(`${r.obs_id || "(zero)"}: ${why.join(", ")}`);
    if (bad.length >= 5) break;
  }
  return bad;
}
/** the CSV's per-group numbers equal the ones the view draws (station / hexagon / region): the mean, the records and — for a
 *  species whose file carries its zero-filled tows — the samples (distinct sample_id, one net each) and those with a catch,
 *  which the hover says as "found in K of N samples" */
function numberMismatches(rows, v) {
  const bad = [];
  const withZeros = v.sel.realm === "bio" && v.sel.zeros && rows.some((r) => r.obs_id === "") && rows[0] && "sample_id" in rows[0];
  const cmp = (col, rowsOf, list) => {
    const m = new Map(list.map((x) => [String(x.k), x]));
    const seen = new Set();
    const nets = new Map(), found = new Map();
    if (withZeros) for (const r of rows) {
      const k = r[col]; if (!k) continue;
      (nets.get(k) ?? nets.set(k, new Set()).get(k)).add(r.sample_id);
      if (r.obs_id !== "") (found.get(k) ?? found.set(k, new Set()).get(k)).add(r.sample_id);
    }
    for (const r of rows) {
      const k = r[col]; if (!k || seen.has(k)) continue; seen.add(k);
      const g = m.get(k), mean = num(r[`${rowsOf}_mean`]), n = num(r[`${rowsOf}_n`]);
      if (!g) { if (mean != null) bad.push(`${rowsOf} ${k}: in the CSV (mean ${mean}) but not on the map`); continue; }
      if (!near(mean, g.mean)) bad.push(`${rowsOf} ${k}: CSV mean ${mean} vs map ${g.mean}`);
      if (n != null && n !== Number(g.n)) bad.push(`${rowsOf} ${k}: CSV n ${n} vs map ${g.n}`);
      if (nets.has(k) && g.ns != null && nets.get(k).size !== Number(g.ns)) bad.push(`${rowsOf} ${k}: CSV ${nets.get(k).size} samples vs map ${g.ns}`);
      if (nets.has(k) && g.nf != null && (found.get(k)?.size ?? 0) !== Number(g.nf)) bad.push(`${rowsOf} ${k}: CSV ${found.get(k)?.size ?? 0} samples with a catch vs map ${g.nf}`);
      if (bad.length > 4) return;
    }
    return seen.size;
  };
  let groups = 0;
  if (v.lens === "station" && rows[0] && "station_mean" in rows[0]) groups = cmp("grid_key", "station", v.st);
  if (v.lens === "hex" && rows[0] && "hex_mean" in rows[0]) groups = cmp("hex", "hex", v.hex);
  if (v.lens === "region" && rows[0] && "region_mean" in rows[0]) groups = cmp("region_name", "region", v.reg);
  return { bad, groups };
}
/** download a CSV and check it: non-empty, every filter, the map's numbers, the record count, a file name that says the subset */
async function checkCsv(label, extra = {}) {
  const v = await view();
  const f = await download("csv");
  if (!f) return null;
  const t = f.buf.toString("utf8");
  const { cols, rows } = parseCsv(t);
  check(rows.length > 0, `${label}: CSV ${f.name} has ${rows.length} rows, ${cols.length} columns`);
  const bad = filterViolations(rows, v.sel, extra);
  check(!bad.length, `${label}: every CSV row obeys the filters${bad.length ? ` — ${bad.join(" | ")}` : ""}`);
  const nm = numberMismatches(rows, v);
  if (nm.groups) check(!nm.bad.length, `${label}: the CSV's ${nm.groups} ${v.lens} groups match the map${nm.bad.length ? ` — ${nm.bad.join(" | ")}` : ""}`);
  const recs = rows.filter((r) => r.obs_id !== "").length;
  // the CSV holds one row per region a sample falls in: count the records once
  const uniq = extra.region ? new Set(rows.filter((r) => r.obs_id !== "").map((r) => r.obs_id)).size : recs;
  if (v.lens !== "cruise" && v.lens !== "section" && v.vc && !v.sel.var2) check(uniq === v.vc.n, `${label}: ${uniq} records in the CSV = ${v.vc.n} in the panel's count`);
  // a species: the panel's "N samples · K with a catch" against the CSV's samples, zero-filled tows included. A sample is
  // one net (sample_id, 2026-11-16: the unit the mean divides by), never the station visit (root_id, which holds 2–3 nets)
  if (v.sel.realm === "bio" && rows[0]) check("sample_id" in rows[0], `${label}: the CSV carries sample_id (the net a row belongs to)`);
  if (v.sel.realm === "bio" && v.vc && v.lens !== "cruise" && v.lens !== "section" && !v.sel.var2 && rows[0] && "sample_id" in rows[0]) {
    const all = new Set(rows.map((r) => r.sample_id)).size, found = new Set(rows.filter((r) => r.obs_id !== "").map((r) => r.sample_id)).size;
    check(found === v.vc.n_found && (!v.sel.zeros || all === v.vc.n_samples), `${label}: samples in the CSV ${all} (${found} with a catch) = the panel's ${v.vc.n_samples} (${v.vc.n_found})`);
  }
  // the charts: the Time strip's bars in the window, the Depth profile's bins in the band, the section's cells, the cruise's samples
  if (v.lens !== "cruise" && v.lens !== "section" && v.vc && v.yearBins && !v.sel.months) check(v.yearN === v.vc.n, `${label}: the Time strip's bars in ${v.sel.years.join("–")} add up to the panel's count (${v.yearN} vs ${v.vc.n})`);
  // …and its samples (a species: the nets, the zero-filled ones included) add up to the panel's "N samples"
  if (v.sel.realm === "bio" && v.lens !== "cruise" && v.lens !== "section" && v.vc && v.yearBins && !v.sel.months && !v.sel.var2) check(v.yearS === v.vc.n_samples, `${label}: the Time strip's samples in ${v.sel.years.join("–")} add up to the panel's ${v.vc.n_samples} samples (${v.yearS})`);
  if (v.lens !== "cruise" && v.lens !== "section" && v.vc && v.depthBins && v.sel.realm === "env") check(v.depthN === v.vc.n, `${label}: the Depth profile's bins in ${v.sel.depth.join("–")} m add up to the panel's count (${v.depthN} vs ${v.vc.n})`);
  if (v.lens === "section" && v.sec) check(v.secN === recs, `${label}: the section's cells hold the CSV's records (${v.secN} vs ${recs})`);
  if (v.lens === "cruise" && v.cruiseN) check(v.cruiseN === recs, `${label}: the cruise's samples hold the CSV's records (${v.cruiseN} vs ${recs})`);
  if (extra.name) check(extra.name.test(f.name), `${label}: the file name ${f.name} describes the subset (${extra.name})`);
  return { f, rows, cols, v };
}
async function checkZip(label, extra = {}) {
  const v = await view();
  const f = await download("zip", 180000);
  if (!f) return null;
  const z = await JSZip.loadAsync(f.buf);
  const names = Object.keys(z.files);
  check(names.includes("data/observations/observations.parquet") && names.includes("README.md") && names.includes("CITATION.md"), `${label}: zip ${f.name} (${(f.buf.length / 1e6).toFixed(1)} MB) holds README, CITATION, observations`);
  const c = z.file("data/observations/observations.csv");
  if (c) {
    const { rows } = parseCsv(await c.async("string"));
    check(rows.length > 0, `${label}: zip observations.csv has ${rows.length} rows`);
    const bad = filterViolations(rows, v.sel, extra);
    check(!bad.length, `${label}: every zip row obeys the filters${bad.length ? ` — ${bad.join(" | ")}` : ""}`);
    const nm = numberMismatches(rows, v);
    if (nm.groups) check(!nm.bad.length, `${label}: the zip's ${nm.groups} groups match the map${nm.bad.length ? ` — ${nm.bad.join(" | ")}` : ""}`);
  }
  const sum = z.file(`data/summary/${v.lens}.csv`);
  check(!!sum, `${label}: zip has data/summary/${v.lens}.csv`);
  if (extra.name) check(extra.name.test(f.name), `${label}: the zip name ${f.name} describes the subset (${extra.name})`);
  return { f, z, v };
}
const noErrors = (label) => { const e = errs.splice(0); check(!e.length, `${label}: no console errors${e.length ? ` — ${e.slice(0, 3).join(" | ")}` : ""}`); };
/** the URL round-trip: the same link in a fresh page draws the same state and the same numbers */
async function roundTrip(label) {
  await page.mouse.move(5, 5); await sleep(200);   // no hover card over the panel text
  const href = await page.evaluate(() => location.href), a = await view(), pa = await text(".lean-steps");
  const p2 = await browser.newPage(); await p2.setViewport(page.viewport());
  const old = page; page = p2;
  p2.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  await p2.goto(href, { waitUntil: "domcontentloaded" }); await idle();
  await closeWhat();
  const b = await view(), pb = await text(".lean-steps");
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const keys = ["lens", "realm", "taxon", "var", "var2", "stage", "den", "years", "q", "depth", "datasets", "area", "cruises", "cruise", "line", "res", "layer", "stat", "zeros", "pool", "lines", "obs", "effort"];
  const diff = keys.filter((k) => !same(a.sel[k], b.sel[k]));
  check(!diff.length, `${label}: reload keeps the state${diff.length ? ` — differs in ${diff.map((k) => `${k}: ${JSON.stringify(a.sel[k])} → ${JSON.stringify(b.sel[k])}`).join("; ")}` : ""}`);
  check(a.inView === b.inView && a.st.length === b.st.length && a.hex.length === b.hex.length && a.reg.length === b.reg.length, `${label}: reload draws the same numbers (${a.inView} / ${a.st.length} st / ${a.hex.length} hex / ${a.reg.length} reg → ${b.inView} / ${b.st.length} / ${b.hex.length} / ${b.reg.length})`);
  const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const A = norm(pa), B = norm(pb); let i = 0; while (i < A.length && A[i] === B[i]) i++;
  check(A === B, `${label}: reload shows the same panel text${A === B ? "" : ` — at ${i}: "…${A.slice(Math.max(0, i - 40), i + 60)}…" vs "…${B.slice(Math.max(0, i - 40), i + 60)}…"`}`);
  await p2.close(); page = old;
}
const layerToggle = async (name) => {
  if (!(await exists(".card-layers"))) { await click(".map-layers-btn"); await sleep(400); }
  const ok = await page.evaluate((n) => { const row = [...document.querySelectorAll(".layers-row.layers-main")].find((r) => r.querySelector("b")?.textContent.trim() === n); const i = row?.querySelector("input"); if (!i || i.disabled) return false; i.click(); return true; }, name);
  if (!ok) fail(`layers: no enabled "${name}" row`);
  await sleep(400); await idle();
};

// ── the cases ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SARDINE = "taxon=worms:217452";
const CASES = [];
const C = (name, fn) => CASES.push({ name, fn });

C("default", async () => {
  await ready("");
  check(await exists(".wp"), "the What picker is open on arrival");
  await shot("lean_default_picker");
  await closeWhat();
  for (const s of ["What", "When", "Where", "View as"]) check(await page.evaluate((t) => [...document.querySelectorAll(".lean-steps .group-title, .lean-steps h4")].some((h) => h.textContent.trim().startsWith(t)), s), `step "${s}" is shown`);
  check(await visible(".dl-main"), "Download CSV is on screen without scrolling (1400 × 900)");
  await page.setViewport({ width: 1280, height: 720 }); await sleep(500);
  check(await visible(".dl-main"), "Download CSV is on screen without scrolling (1280 × 720)");
  await page.setViewport(DESK); await sleep(300);
  // the two view pickers name the same view
  const hv = await text(".vm-btn"), pv = await text(".va-name");
  check(hv && pv && pv.includes(hv.trim()), `the header and panel view pickers agree (${hv?.trim()} / ${pv})`);
  await shot("lean_default");
  noErrors("default");
});

C("species_station", async () => {
  await ready(`${SARDINE}&stage=larva&den=per_10m2`); await closeWhat();
  await checkCsv("sardine larvae · stations", { name: /sardine|217452/i });
  await checkZip("sardine larvae · stations");
  noErrors("species_station");
});

C("species_units_zeros", async () => {
  await ready(`${SARDINE}&stage=egg&den=per_1000m3`); await closeWhat();
  const v = await view();
  check(v.sel.stage === "egg" && v.sel.den === "per_1000m3", `the link's stage and units hold (${v.sel.stage}, ${v.sel.den})`);
  await checkCsv("sardine eggs per 1000 m³");
  await click(".zeros-row .tgl"); await idle();
  check((await qp()).zeros === "0", "Count zeros off is in the URL");
  const r = await checkCsv("sardine eggs, zeros off");
  if (r) check(r.rows.every((x) => x.obs_id !== ""), "with zeros off, the CSV has no zero-filled rows");
  noErrors("species_units_zeros");
});

C("when_filters", async () => {
  await ready(`${SARDINE}&years=1990-2005&q=2,3`); await closeWhat();
  await checkCsv("years 1990–2005, spring + summer", { name: /1990.?2005/ });
  await roundTrip("years + seasons");
  noErrors("when_filters");
});

C("when_cruise", async () => {
  await ready(`var=temperature&years=2018-2019`); await closeWhat();
  // pick a cruise from the When step's list
  await click("#when-cruise-btn"); await sleep(700);
  const first = await page.evaluate(() => document.querySelector(".picker-pop li[role=option]")?.textContent ?? null);
  await page.evaluate(() => document.querySelector(".picker-pop li[role=option]")?.click());
  await sleep(400); await idle();
  const v = await view();
  check(!!v.sel.cruises?.length, `a cruise is picked from the When list (${first?.slice(0, 40)} → ${JSON.stringify(v.sel.cruises)})`);
  await checkCsv("one cruise");
  await shot("lean_when_cruise");
  noErrors("when_cruise");
});

const LENSES = [["Stations", "station"], ["Hexagon", "hex"], ["By region", "region"], ["Contour", "contour"], ["By cruise", "cruise"], ["Cross-section", "section"]];
for (const [what, qs] of [["species", `${SARDINE}&stage=larva&den=per_10m2`], ["temperature", "var=temperature&years=2015-2019"]]) {
  C(`views_${what}`, async () => {
    await ready(qs); await closeWhat();
    for (const [lab, id] of LENSES) {
      await lens(lab);
      const v = await view();
      check(v.lens === id, `${what} · ${lab}: the view is ${v.lens}`);
      const drew = id === "station" ? v.st.length : id === "hex" ? v.hex.length : id === "region" ? v.reg.length : id === "cruise" ? v.cruise : id === "section" ? v.sec : v.st.length;
      check(drew > 0, `${what} · ${lab}: draws ${drew} ${id} rows`);
      await shot(`lean_${what}_${id}`);
      await checkCsv(`${what} · ${lab}`);
      noErrors(`${what} · ${lab}`);
    }
    await checkZip(`${what} · section zip`);
  });
}

// every What category, picked as a person picks it: open What, open the category, take its first item
C("what_categories", async () => {
  await ready(`var=temperature&years=2015-2019`); await closeWhat();
  await click(".what-card"); await sleep(500);
  const cats = await page.evaluate(() => [...document.querySelectorAll(".wp .wp-row .wp-name")].map((e) => e.textContent.trim()));
  check(cats.length >= 10, `What lists ${cats.length} categories (${cats.join(", ")})`);
  for (const cat of cats) {
    if (!(await exists(".wp"))) { await click(".what-card"); await sleep(500); }
    await page.evaluate((c) => { const r = [...document.querySelectorAll(".wp .wp-row")].find((b) => b.querySelector(".wp-name")?.textContent.trim() === c); if (r && r.getAttribute("aria-expanded") !== "true") r.click(); }, cat);
    await sleep(400);
    const item = await page.evaluate(() => { const b = document.querySelector(".wp .wp-group.open .wp-item"); if (!b) return null; const t = b.querySelector(".wp-name")?.textContent.trim(); b.click(); return t; });
    if (!item) { fail(`${cat}: no item to pick`); continue; }
    await sleep(500); await idle(120000);
    const v = await view();
    const drew = v.st.length + v.hex.length;
    // nothing at a station in these years is fine when the view says why (off-grid samples: "See it in the Hexagon view")
    const why = drew ? "" : await page.evaluate(() => (document.body.innerText.match(/No data collected at stations[^\n]*|No observations[^\n]*|No [^\n]* caught under these choices[^\n]*/) ?? [""])[0]);
    check(!(await exists(".wp")) && (drew > 0 || !!why), `${cat} › ${item}: the map draws ${v.st.length} stations${why ? ` and says "${why}"` : ""} (${v.sel.realm === "bio" ? v.sel.taxon : v.sel.var}${v.sel.datasets ? ` · ${v.sel.datasets}` : ""})`);
    if (drew > 0) await checkCsv(`${cat} › ${item}`);
    noErrors(`${cat} › ${item}`);
  }
});

C("what_by_dataset", async () => {
  await ready(`var=temperature&years=2015-2019`); await closeWhat();
  await click(".what-card"); await sleep(500);
  await clickText(".wp-tabs button", "By dataset"); await sleep(400);
  const ds = await page.evaluate(() => [...document.querySelectorAll(".wp .wp-row .wp-name")].map((e) => e.textContent.trim()));
  check(ds.length > 5, `By dataset lists ${ds.length} datasets`);
  for (const d of ds.slice(0, 4)) {
    if (!(await exists(".wp"))) { await click(".what-card"); await sleep(500); await clickText(".wp-tabs button", "By dataset"); await sleep(400); }
    await page.evaluate((c) => { const r = [...document.querySelectorAll(".wp .wp-row")].find((b) => b.querySelector(".wp-name")?.textContent.trim() === c); if (r && r.getAttribute("aria-expanded") !== "true") r.click(); }, d);
    await sleep(400);
    const item = await page.evaluate(() => { const b = document.querySelector(".wp .wp-group.open .wp-item"); if (!b) return null; const t = b.querySelector(".wp-name")?.textContent.trim(); b.click(); return t; });
    if (!item) { fail(`${d}: no item`); continue; }
    await sleep(500); await idle(120000);
    const v = await view();
    check(v.st.length > 0 || v.vc?.n === 0, `By dataset › ${d} › ${item}: ${v.st.length} stations, datasets ${v.sel.datasets}`);
    if (v.st.length) await checkCsv(`By dataset › ${d} › ${item}`);
    noErrors(`By dataset › ${d}`);
  }
});

C("ramp_boundaries", async () => {
  await ready(`var=temperature&years=2015-2019&lens=hex&ramp=thermal_r&layers=off`); await closeWhat();
  check((await qp()).ramp === "thermal_r" && (await qp()).layers === "off", "a colour ramp and no boundary layers from the link");
  noErrors("ramp + layers=off");
  await roundTrip("ramp + layers=off");
  await ready(`var=temperature&years=2015-2019&lens=region&layers=noaa_onms_sanctuaries,data`); await closeWhat();
  await shot("lean_boundaries_region");
  noErrors("sanctuaries layer in the Region view");
});

C("view_header_sync", async () => {
  await ready("var=temperature"); await closeWhat();
  await click(".vm-btn"); await sleep(300); await clickText(".vm-list .vm-row", "Hexagon"); await idle();
  check((await view()).lens === "hex" && (await text(".va-name")).includes("Hexagon") && (await exists('.va-tile.on[aria-label="Hexagon"]')), "the header menu switches the view and the panel follows");
  await lens("Stations");
  check((await text(".vm-btn")).includes("Stations"), "the panel switches the view and the header follows");
  noErrors("view_header_sync");
});

C("hex_sizes", async () => {
  await ready("var=temperature&lens=hex"); await closeWhat();
  for (const r of [7, 3]) {
    await page.evaluate((r) => [...document.querySelectorAll(".hr-row button")].find((b) => b.title.includes({ 7: "1.2", 3: "60" }[r]))?.click(), r);
    await sleep(400); await idle();
    const v = await view();
    check(v.sel.res === r && v.hex.length > 0, `hexagon size ${r}: ${v.hex.length} hexagons`);
    // the smallest hexagons must be coloured, not white: sample the canvas pixels under a few hexagon centres
    await shot(`lean_hex_res${r}`);
  }
  noErrors("hex_sizes");
});

C("where_std_grid", async () => {
  await ready(`${SARDINE}`); await closeWhat();
  await clickText(".ws-opt", "75-station grid"); await idle();
  check((await qp()).area === "std", "75-station grid → area=std");
  const keys = await page.evaluate(() => null);
  await checkCsv("75-station grid");
  check(!(await page.evaluate(() => [...document.querySelectorAll(".ws-opt input")][0].checked)), "Full survey is not ticked while the 75-station grid is");
  noErrors("where_std_grid");
});

C("where_region", async () => {
  await ready(`${SARDINE}&area=in:National%20Marine%20Sanctuaries`); await closeWhat();
  const v = await view();
  check(v.sel.area?.startsWith("in:"), `a region set is in force (${v.sel.area})`);
  await shot("lean_where_region");
  const full = await page.evaluate(() => [...document.querySelectorAll(".ws-opt input")][0]?.checked);
  check(!full, "Full survey does not look selected while a region is in force");
  await checkCsv("all sanctuaries", { region: true, name: /sanctuar/i });
  await checkZip("all sanctuaries", { region: true });
  await roundTrip("region");
  noErrors("where_region");
});

C("where_region_one", async () => {
  await ready(`var=temperature&area=in:National%20Marine%20Sanctuaries`); await closeWhat();
  // untick all but one
  const names = await page.evaluate(() => [...document.querySelectorAll(".wr-row")].map((r) => r.title));
  check(names.length > 1, `${names.length} sanctuaries listed with data`);
  for (const nm of names.slice(1)) { await page.evaluate((n) => [...document.querySelectorAll(".wr-row")].find((r) => r.title === n)?.querySelector("input")?.click(), nm); await sleep(500); await idle(); }
  const v = await view();
  check(/^in:.*\|/.test(v.sel.area ?? ""), `one sanctuary left: ${v.sel.area}`);
  await checkCsv("one sanctuary", { region: true, regionNames: [names[0]] });
  // unticking the last one must not silently mean "all"
  await page.evaluate((n) => [...document.querySelectorAll(".wr-row")].find((r) => r.title === n)?.querySelector("input")?.click(), names[0]); await sleep(500); await idle();
  const v2 = await view();
  check(v2.sel.area !== "in:National Marine Sanctuaries", `unticking the last region does not turn into "all regions" (${v2.sel.area})`);
  await shot("lean_where_region_none");
  noErrors("where_region_one");
});

C("where_line_station", async () => {
  await ready(`var=temperature`); await closeWhat();
  const line = 'input[aria-label="CalCOFI line"]', stn = 'input[aria-label="station on that line (optional)"]';
  await page.click(line); await page.type(line, "9"); await sleep(300);
  check(await exists(".ls-list"), "the line box suggests lines");
  await clickText(".ls-opt", "90", true); await sleep(300);
  check(!(await exists(".ls-list")), "the line suggestion list closes after a pick");
  await page.click(stn); await sleep(300);
  check(await exists(".ls-list"), "the station box suggests that line's stations");
  await page.evaluate(() => document.querySelector(".ls-opt")?.click()); await sleep(300);
  check(!(await exists(".ls-list")), "the station suggestion list closes after a pick");
  await shot("lean_where_line_pick");
  await click(".ls-add"); await idle();
  const a = (await qp()).area;
  check(/^ln:90\/\d+/.test(a ?? ""), `+ Add puts line 90 / a station in the URL (${a})`);
  await checkCsv("line 90 station");
  await roundTrip("line/station");
  noErrors("where_line_station");
});

C("where_poly_draw", async () => {
  await ready(`var=temperature&years=2010-2019`); await closeWhat();
  await click(".wd-btn"); await sleep(300);
  const box = await page.evaluate(() => { const r = document.querySelector(".draw-overlay").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = box.x + box.w * 0.6, cy = box.y + box.h * 0.5, R = 90;
  await page.mouse.move(cx + R, cy); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(cx + R * Math.cos((i / 24) * 2 * Math.PI), cy + R * Math.sin((i / 24) * 2 * Math.PI), { steps: 2 });
  await shot("lean_where_poly_drawing");
  await page.mouse.up(); await sleep(400); await idle();
  const a = (await qp()).area;
  check(/^poly:/.test(a ?? ""), `a drawn loop is the area (${a?.slice(0, 40)})`);
  const full = await page.evaluate(() => [...document.querySelectorAll(".ws-opt input")][0]?.checked);
  check(!full, "Full survey does not look selected while a drawn area is in force");
  await shot("lean_where_poly");
  const pts = (a ?? "").slice(5).split("~").map((q) => q.split(",").map(Number));
  if (pts.length > 2) await checkCsv("drawn area", { box: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] });
  noErrors("where_poly_draw");
});

C("where_box_and_view", async () => {
  await ready(`var=temperature&years=2010-2019`); await closeWhat();
  check(await exists(".wd-box"), "Where offers Draw a box");
  check(await exists(".wd-view"), "Where offers Use the map view");
  if (await exists(".wd-box")) {
    await click(".wd-box"); await sleep(300);
    const b = await page.evaluate(() => { const r = document.querySelector(".draw-overlay").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(b.x + b.w * 0.45, b.y + b.h * 0.35); await page.mouse.down(); await page.mouse.move(b.x + b.w * 0.7, b.y + b.h * 0.65, { steps: 8 }); await page.mouse.up(); await sleep(400); await idle();
    const a = (await qp()).area;
    check(/^box:/.test(a ?? ""), `a box drawn on the map is the area (${a})`);
    const bb = a?.slice(4).split(",").map(Number);
    if (bb?.length === 4) await checkCsv("drawn box", { box: bb });
  }
  if (await exists(".wd-view")) {
    await click(".wd-view"); await idle();
    const a = (await qp()).area;
    check(/^box:/.test(a ?? ""), `Use the map view sets a box (${a})`);
  }
  noErrors("where_box_and_view");
});

C("where_hex", async () => {
  await ready(`var=temperature&lens=hex&res=4`); await closeWhat();
  const v = await view();
  const cell = v.hex.sort((a, b) => b.n - a.n)[0]?.k;
  await ready(`var=temperature&lens=hex&res=4&area=hx:${cell}&effort=on`); await closeWhat();
  check(/one .*hexagon/i.test((await text(".where-now")) ?? ""), `Where says one hexagon is the area (${await text(".where-now")})`);
  await checkCsv("single hexagon", { hex: cell });
  noErrors("where_hex (effort on)");
});

C("switch_what_after", async () => {
  await ready(`${SARDINE}&years=1995-2010&q=1,2&area=std&lens=hex&res=4`); await closeWhat();
  await click(".what-card"); await sleep(400);
  await page.type(".wp-search input", "temperature"); await sleep(400);
  await page.evaluate(() => document.querySelector(".wp .wp-item")?.click()); await sleep(300); await idle();
  const v = await view();
  check(v.sel.realm === "env" && v.lens === "hex" && v.sel.area === "std" && JSON.stringify(v.sel.q) === "[1,2]" && v.sel.years[0] === 1995, `switching What keeps When / Where / View (${v.sel.var}, ${v.lens}, ${v.sel.area}, ${v.sel.q}, ${v.sel.years})`);
  check(v.hex.length > 0, `and the map draws ${v.hex.length} hexagons`);
  await checkCsv("temperature after species, filters kept");
  noErrors("switch_what_after");
});

C("var2", async () => {
  await ready(`${SARDINE}&lens=hex&res=4`); await closeWhat();
  await click(".v2-add"); await sleep(400);
  const listed = await page.evaluate(() => [...document.querySelectorAll(".wp .wp-badge")].reduce((a, b) => a + Number(b.textContent.replace(/,/g, "")), 0));
  await page.type(".wp-search input", "temperature"); await sleep(400);
  await page.evaluate(() => document.querySelector(".wp .wp-item")?.click()); await sleep(500); await idle();
  const v = await view();
  check(/^temperature/.test(v.sel.var2 ?? ""), `with a species picked, temperature is offered and added as the second variable (${v.sel.var2}; ${listed} offered)`);
  // colour by the second variable, then reload: the choice is in the link
  if (await exists(".v2-switch button[role=radio]:nth-child(2), [role=radiogroup] button[aria-checked=false]")) {
    await page.evaluate(() => { const b = [...document.querySelectorAll("button[role=radio]")].find((x) => x.getAttribute("aria-checked") === "false" && x.closest(".v2sw, .v2-switch, .color-by, [role=radiogroup]")); b?.click(); });
    await sleep(500);
  }
  const u = await qp();
  check(u.color === "var2" || u.colorby === "var2" || u.by === "var2", `colour-by-second-variable is in the URL (${JSON.stringify(u)})`);
  await roundTrip("var2");
  const r = await checkCsv("species + temperature by hexagon");
  if (r) check(r.cols.some((c) => /_hex_mean$/.test(c)), "the CSV carries the second variable's hexagon mean");
  await lens("Stations");
  noErrors("var2 → stations");
  await lens("Hexagon");
  check(!!(await view()).sel.var2, "back to hexagons, the second variable is still there");
  noErrors("var2");
});

C("depth_band", async () => {
  await ready(`var=temperature&years=2010-2019`); await closeWhat();
  await click(".depth-row"); await sleep(400);
  const inp = await page.$$(".depth-edit input");
  if (inp.length >= 2) {
    await inp[1].focus(); await page.evaluate((e) => e.select(), inp[1]); await page.keyboard.type("100"); await page.keyboard.press("Enter"); await sleep(400); await idle();
  }
  const v = await view();
  check(v.sel.depth[1] === 100, `the depth band is 0–${v.sel.depth[1]} m`);
  await checkCsv("temperature 0–100 m", { name: /0.?100/ });
  await lens("Hexagon");
  await checkCsv("temperature 0–100 m hexagons");
  noErrors("depth_band");
});

C("layers", async () => {
  for (const lq of ["station", "hex", "contour", "region", "cruise", "section"]) {
    await ready(`${SARDINE}&lens=${lq}`); await closeWhat();
    if (!(await exists(".card-layers"))) { await click(".map-layers-btn"); await sleep(400); }
    const eff = await page.evaluate(() => [...document.querySelectorAll(".layers-row.layers-main")].find((r) => r.querySelector("b")?.textContent.trim() === "Effort")?.textContent.replace(/\s+/g, " ").trim());
    const effOn = !/not in this release/.test(eff ?? "");
    if (lq === "station") console.log(`  (the Effort row reads "${eff}")`);
    for (const L of ["Lines", "Observations", ...(effOn ? ["Effort"] : []), "Sea floor"]) {
      await layerToggle(L); noErrors(`${lq}: ${L} on`);
      await layerToggle(L); noErrors(`${lq}: ${L} off`);
    }
    await shot(`lean_layers_${lq}`);
  }
  await ready(`${SARDINE}&lines=on&obs=on&effort=on`); await closeWhat();
  const v = await view();
  check(v.sel.lines && v.sel.obs && v.sel.effort, "lines, observations and effort from the link");
  await roundTrip("layers");
});

C("reset", async () => {
  await ready(`${SARDINE}&stage=egg&den=per_1000m3&years=1990-2000&q=2&area=std&lens=hex&res=4&lines=on&var2=temperature`); await closeWhat();
  await click(".hd-reset"); await idle();
  const v = await view();
  check(v.sel.stage === "egg" && v.sel.den === "per_1000m3", `Reset keeps the life stage and the units (${v.sel.stage}, ${v.sel.den})`);
  check(v.sel.lens === "station" && !v.sel.area && !v.sel.q && v.sel.years[0] === 1949, "Reset clears view, area, seasons and years");
  check(!v.sel.lines, "Reset turns the Lines layer off");
  check(!v.sel.var2, "Reset drops the second variable");
  noErrors("reset");
});

C("history", async () => {
  await ready(`var=temperature&years=2010-2019`); await closeWhat();
  await lens("Hexagon");
  await clickText(".ws-opt", "75-station grid"); await idle();
  await lens("Contour");
  await page.goBack(); await sleep(800); await idle();
  let v = await view();
  check(v.lens === "hex" && v.sel.area === "std", `Back undoes the last step: Hexagon on the 75-station grid (${v.lens}, ${v.sel.area})`);
  check((await text(".va-name")).includes("Hexagon") && (await page.evaluate(() => [...document.querySelectorAll(".ws-opt input")][1]?.checked)), "and the panel shows it");
  await page.goBack(); await sleep(800); await idle();
  v = await view();
  check(v.lens === "hex" && !v.sel.area, `Back again: Hexagon, no area (${v.lens}, ${v.sel.area})`);
  await page.goBack(); await sleep(800); await idle();
  check((await view()).lens === "station", `Back again: Stations (${(await view()).lens})`);
  await page.goForward(); await sleep(800); await idle();
  check((await view()).lens === "hex", "Forward: Hexagon");
  noErrors("history");
});

C("pool_datasets", async () => {
  await ready(`var=temperature&years=2010-2019`); await closeWhat();
  const v = await view();
  check(v.sel.datasets?.length === 1, `one dataset by default (${v.sel.datasets})`);
  if (await exists(".ds-c-sel:not([disabled])")) {
    await click(".ds-c-sel"); await sleep(300);
    check(await exists(".ds-c-pool"), "the dataset list offers combining them");
    if (await exists(".ds-c-pool")) {
      await click(".ds-c-pool"); await sleep(400); await idle();
      const w = await view();
      check(!w.sel.datasets && w.sel.pool, `combined: datasets ${w.sel.datasets}, pool ${w.sel.pool}`);
      check(w.vc.n > v.vc.n, `combining datasets counts more (${v.vc.n} → ${w.vc.n})`);
      check((await qp()).datasets === "all", "the URL says datasets=all");
      const r = await checkCsv("temperature, every dataset");
      if (r) check(new Set(r.rows.map((x) => x.dataset_key)).size > 1, "the CSV holds more than one dataset");
      await roundTrip("pooled");
    }
  }
  noErrors("pool_datasets");
});

C("classic", async () => {
  await ready(`ui=classic&var=temperature`);
  check(await exists(".tabs [role=tab]"), "?ui=classic shows the Select / Refine / Share tabs");
  await clickText(".tabs button", "Refine"); await sleep(400);
  await shot("classic_refine");
  const hint = await text(".tab-refine");
  check(/all datasets|every dataset/.test(hint ?? ""), "classic offers all datasets");
  if (await exists(".tab-refine .linkish")) {
    await page.evaluate(() => [...document.querySelectorAll(".tab-refine .linkish")].find((b) => /all datasets/.test(b.textContent))?.click()); await sleep(500); await idle();
    const v = await view();
    check(!v.sel.datasets, `classic "all datasets" sticks (${v.sel.datasets})`);
  }
  noErrors("classic");
  await ready(`ui=lean`); await closeWhat();
  check(await exists(".lean-steps"), "?ui=lean brings the lean panel back");
});

C("themes_phone", async () => {
  for (const th of ["light", "dark"]) { await ready(`theme=${th}&${SARDINE}`); await closeWhat(); await shot(`lean_${th}`); noErrors(th); }
  await ready(`${SARDINE}`, PHONE);
  const o = await page.evaluate(() => document.documentElement.scrollWidth);
  check(o <= 376, `375 px: no horizontal scroll (${o})`);
  await shot("lean_phone_peek");
  if (await exists(".sheet-summary")) { await click(".sheet-summary"); await sleep(600); }
  await shot("lean_phone_half");
  await page.focus(".sheet-handle").catch(() => {}); await page.keyboard.press("ArrowUp"); await sleep(500);
  await shot("lean_phone_full");
  check(await exists(".dl-main"), "375 px: the Download CSV button is there");
  const r = await page.evaluate(() => { const b = document.querySelector(".dl-main")?.getBoundingClientRect(); return b ? b.right <= innerWidth + 1 : false; });
  check(r, "375 px: Download fits the width");
  noErrors("phone");
});

C("tour", async () => {
  for (const ui of ["lean", "classic"]) {
    await ready(`ui=${ui}&var=temperature`);
    await page.evaluate(() => window.__tour()); await sleep(900);
    let steps = 0, missing = [];
    for (let i = 0; i < 40; i++) {
      const s = await page.evaluate(() => { const d = window.__tourDriver; if (!d) return null; const st = d.getActiveStep?.(); const el = d.getActiveElement?.(); const r = el?.getBoundingClientRect?.(); return { t: st?.popover?.title ?? "", el: st?.element ? "anchor" : null, found: !!el && el.id !== "driver-dummy-element" && r && r.width > 0, last: !d.hasNextStep() }; });
      if (!s) break;
      steps++;
      if (s.el && !s.found) missing.push(`${s.t} (${s.el})`);
      if (s.last) break;
      await page.evaluate(() => document.querySelector(".driver-popover-next-btn")?.click()); await sleep(1100);   // Next, as a person clicks it: the step's own before() runs
    }
    check(steps > 3, `${ui} tour: ${steps} steps`);
    check(!missing.length, `${ui} tour: every step finds its element${missing.length ? ` — missing ${missing.join("; ")}` : ""}`);
    await page.evaluate(() => window.__tourDriver?.destroy()); await sleep(300);
    noErrors(`${ui} tour`);
  }
  await ready("ui=lean");   // ?ui=classic is remembered by the browser: hand the next case the lean panel
});

C("more_tools", async () => {
  await ready(`var=temperature`); await closeWhat();
  check(await exists(".dl-more"), "the download area has a More disclosure");
  if (await exists(".dl-more")) {
    await click(".dl-more .menu-btn"); await sleep(300);
    const items = await page.evaluate(() => [...document.querySelectorAll(".menu-list .menu-item, .dl-more-list button")].map((b) => b.textContent.trim()));
    for (const w of ["picture", "BibTeX", "citation", "SQL"]) check(items.some((t) => t.toLowerCase().includes(w.toLowerCase())), `More offers ${w} (${items.join(" · ")})`);
    await page.keyboard.press("Escape");
  }
  noErrors("more_tools");
});

C("hidden_steps", async () => {
  await ready(`${SARDINE}&years=1990-2000&area=std&lens=cruise`); await closeWhat();
  const t = await text(".lean-steps");
  check(/1990/.test(t) && /75-station/i.test(t), `the Cruise view still shows the year filter and the area in force (${/1990/.test(t)}, ${/75-station/i.test(t)})`);
  await lens("By region");
  const t2 = await text(".lean-steps");
  check(/75-station/i.test(t2), "the Region view still shows the area in force");
  await shot("lean_hidden_steps_region");
  noErrors("hidden_steps");
});

C("region_zoom", async () => {
  await ready(`var=temperature`); await closeWhat();
  await page.evaluate(() => window.__map.jumpTo({ center: [-119.5, 33.8], zoom: 7.5 })); await sleep(800);
  const z0 = await page.evaluate(() => window.__map.getZoom());
  await lens("By region"); await sleep(1500);
  const z1 = await page.evaluate(() => window.__map.getZoom());
  check(z1 >= z0 - 0.6, `By region keeps the map where it was (zoom ${z0.toFixed(1)} → ${z1.toFixed(1)})`);
  noErrors("region_zoom");
});

// the bottom dock never covers the Find data panel: right of it while it is open (also from a remembered full-width Time
// panel, the way the bug came back), the full width when it is folded (src/dock.ts)
const boxes = () => page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; }; return { sel: r(".card-select"), years: r(".card-years"), dt: r(".card-depthtime"), pills: r(".edge-pills.side-bottom") }; });
C("dock_clear", async () => {
  const W = { width: 1400, height: 850 };
  await ready(`${SARDINE}&stage=larva&den=per_10m2`, W);
  check(await exists(".wp"), "the What picker is open");
  let b = await boxes();
  check(b.sel && b.years && b.years.l > b.sel.r, `1400 × 850, picker open: the Time panel starts right of the panel (${b.years?.l} > ${b.sel?.r})`);
  await page.evaluate(() => { const m = document.querySelector(".mapwrap"); localStorage.setItem("explore.panel.years", JSON.stringify({ vp: `${innerWidth}x${innerHeight}`, left: 10, top: m.clientHeight - 178, width: m.clientWidth - 70, height: 168 })); });
  await page.reload({ waitUntil: "domcontentloaded" }); await idle();
  b = await boxes();
  check(b.sel && b.years && b.years.l > b.sel.r, `a remembered full-width Time panel steps clear of the open panel (${b.years?.l} > ${b.sel?.r})`);
  await shot("dock_clear_remembered");
  await click(".card-select .card-head [aria-label='Collapse to a pill']"); await sleep(600);
  b = await boxes();
  check(!b.sel && b.years && b.years.l <= 20, `the panel folded: the Time panel takes the width back (left ${b.years?.l})`);
  await page.evaluate(() => localStorage.removeItem("explore.panel.years"));
  await ready(`var=temperature&show=depthtime`, W);
  await page.evaluate(() => [...document.querySelectorAll(".dock-tabs button")].find((x) => /Anomaly/.test(x.textContent))?.click()); await sleep(500);
  b = await boxes();
  check(b.sel && b.dt && b.dt.l > b.sel.r, `the depth × time card starts right of the panel (${b.dt?.l} > ${b.sel?.r})`);
  await ready(`${SARDINE}&hide=years`, W);
  b = await boxes();
  check(b.sel && b.pills && b.pills.l > b.sel.r, `the collapsed Time pill sits right of the panel (${b.pills?.l} > ${b.sel?.r})`);
  noErrors("dock_clear");
});

// the What picker's Sort by (src/pickersort.ts): each row shows its observations; switching the sort reorders the open
// category (topics kept); the choice is remembered by the browser and is not in the link
C("what_sort", async () => {
  await ready(`${SARDINE}&stage=larva&den=per_10m2`, { width: 1400, height: 850 });
  if (!(await exists(".wp"))) { await click(".what-card"); await sleep(500); }
  const setSort = async (lab) => { await click(".wp-sortrow .sp-btn"); await sleep(200); await page.evaluate((l) => [...document.querySelectorAll(".wp-sortrow .sp-list li")].find((x) => x.textContent.includes(l))?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })), lab); await sleep(400); };
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".wp-group.open .wp-items > *")].map((e) => e.classList.contains("wp-sub") ? { sub: e.textContent } : { name: e.querySelector(".wp-name")?.firstChild?.textContent ?? "", n: Number((e.querySelector(".wp-n")?.getAttribute("aria-label") ?? "").replace(/,/g, "").match(/^\d+/)?.[0] ?? NaN) }));
  const inOrder = (xs, cmp) => xs.every((x, i) => i === 0 || cmp(xs[i - 1], x) <= 0);
  const groups = (rs) => rs.reduce((a, r) => { if (r.sub || !a.length) a.push([]); if (!r.sub) a[a.length - 1].push(r); return a; }, []);
  await setSort("Suggested");
  for (const cat of ["Fish Eggs and Larvae", "Water Properties"]) {
    await page.evaluate((c) => { document.querySelector(".wp-group.open > .wp-row")?.click(); const r = [...document.querySelectorAll(".wp .wp-row")].find((b) => b.querySelector(".wp-name")?.textContent.trim() === c); if (r && r.getAttribute("aria-expanded") !== "true") r.click(); }, cat);
    await sleep(500);
    const r0 = await rows(), items0 = r0.filter((r) => !r.sub), subs0 = r0.filter((r) => r.sub).map((r) => r.sub);
    check(items0.length > 3 && items0.every((r) => Number.isFinite(r.n) && r.n > 0), `${cat}: every row shows its observations (${items0.length} rows; first ${items0[0]?.name} ${items0[0]?.n})`);
    const badge = await page.evaluate(() => document.querySelector(".wp-group.open .wp-badge")?.getAttribute("aria-label") ?? "");
    check(/not of observations/.test(badge), `${cat}: the category pill says what it counts ("${badge}")`);
    await setSort("Name A–Z");
    const r1 = await rows(), coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    check(JSON.stringify(r1.filter((r) => !r.sub).map((r) => r.name)) !== JSON.stringify(items0.map((r) => r.name)), `${cat}: Name A–Z reorders the open category`);
    check(groups(r1).every((g) => inOrder(g.map((r) => r.name.replace(/^(the|a|an)\s+/i, "")), (a, b) => coll.compare(a, b))), `${cat}: A–Z within each topic`);
    check(JSON.stringify(r1.filter((r) => r.sub).map((r) => r.sub)) === JSON.stringify(subs0), `${cat}: the topics stay (${subs0.join(", ") || "none"})`);
    await setSort("Most observations");
    const r2 = await rows();
    check(groups(r2).every((g) => inOrder(g, (a, b) => b.n - a.n)), `${cat}: Most observations, largest first within each topic (${r2.filter((r) => !r.sub).slice(0, 3).map((r) => `${r.name} ${r.n}`).join(", ")})`);
  }
  check(!/sort/i.test(await url()), `the sort is not in the link (${await url()})`);
  await page.reload({ waitUntil: "domcontentloaded" }); await idle();
  if (!(await exists(".wp"))) { await click(".what-card"); await sleep(500); }
  check(/Most observations/.test(await text(".wp-sortrow .sp-btn") ?? ""), "the sort is remembered by the browser");
  await setSort("Suggested");
  noErrors("what_sort");
});

if (opt.list) { console.log(CASES.map((c) => c.name).join("\n")); process.exit(0); }
for (const c of CASES) {
  if (only && !only.test(c.name)) continue;
  cur = c.name; errs = [];
  console.log(`\n▸ ${c.name}`);
  await freshPage();
  try { await c.fn(); } catch (e) { fail(`${c.name} threw: ${e.message.split("\n")[0]}`); await shot(`err_${c.name}`).catch(() => {}); }
}
fs.writeFileSync(path.join(out, "lean_check.json"), JSON.stringify({ base, pass: nPass, fail: nFail, results }, null, 1));
console.log(`\n${nPass} passed · ${nFail} failed  (${path.join(out, "lean_check.json")})`);
await browser.close();
process.exit(nFail ? 1 : 0);
