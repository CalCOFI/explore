// the Query Builder (builder.html), clicked through in a real Chrome against the live release: a link's picks, the automatic
// download, a pick the release does not hold, a dataset the default units do not fit, every "Rows" shape, the three lenses,
// a region chosen, every hexagon size, an empty result, a phone-width window, both themes, and the keyboard — and every CSV
// opened and checked against what the page said. Re-runnable; prints ok / FAIL per check and exits 1 on any FAIL.
//   npm run build && npx vite preview --port 4047 &
//   node scripts/builder_check.mjs [baseUrl] [outDir] [--only=regex] [--headed]
// Brand v3 (the default build since 2026-11-17) loads its header from VITE_BRAND_URL: until calcofi.io/brand/v3/ is live,
// check a build made with VITE_BRAND_URL pointing at a served copy of the site's brand/ folder (README § Brand), or a
// VITE_BRAND=v2 build, on which brand_header reports and skips.
// downloads land in <outDir>/dl/<case>/ (the browser's own download); screenshots in <outDir>/<case>.png
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.join("=") || true]; }));
const pos = args.filter((a) => !a.startsWith("--"));
const base = (pos[0] ?? "http://localhost:4047/").replace(/\/?$/, "/");
const out = pos[1] ?? "shots/builder";
const only = opt.only ? new RegExp(opt.only) : null;
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DESK = { width: 1400, height: 900 };
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const profile = path.join(process.env.TMPDIR ?? "/tmp", "explore-builder-check-profile");
fs.rmSync(profile, { recursive: true, force: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: opt.headed ? false : "new", userDataDir: profile,
  args: ["--window-size=1420,1000", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars"], defaultViewport: DESK });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page, errs = [], cur = "", nPass = 0, nFail = 0;
const fails = [];
const pass = (m) => { nPass++; console.log(`  ok   ${m}`); };
const fail = (m) => { nFail++; fails.push(`${cur}: ${m}`); console.log(`  FAIL ${m}`); };
const check = (ok, m) => (ok ? pass(m) : fail(m));
const IGNORE = /favicon|plausible|ERR_BLOCKED|net::ERR_ABORTED|Failed to load resource|\[vite\]|WebSocket|Download the React DevTools/;

const SARDINE = "bio:swfsc_ichthyo:worms:217452", TEMP = "env:calcofi_bottle:temperature", TEMP_CTD = "env:calcofi_ctd-cast:temperature";
const link = (picks, extra = "") => `${base}builder.html${picks.length ? "?" + picks.map((p) => "pick=" + encodeURIComponent(p)).join("&") : ""}${extra}`;

async function open(url, viewport = DESK) {
  if (page) await page.close().catch(() => {});
  page = await browser.newPage(); errs = [];
  await page.setViewport(viewport);
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORE.test(m.text())) errs.push(`console: ${m.text().slice(0, 240)}`); });
  const dir = path.resolve(out, "dl", cur); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  page.__dl = dir;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // the lists are in when a group is drawn (the coverage sidecar has arrived)
  await page.waitForSelector(".tb .grp", { timeout: 60000 });
}
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const selected = async () => Number((/(\d+) selected/.exec((await text(".cols .chead .r")) ?? "") ?? [0, 0])[1]);
/** set a <select> by its accessible name (aria-label, or the row's label) to the option whose text matches */
async function choose(name, optionRe) {
  const ok = await page.evaluate((name, src) => {
    const re = new RegExp(src, "i");
    const sel = [...document.querySelectorAll(".tb select")].find((s) => (s.getAttribute("aria-label") ?? "") === name);
    if (!sel) return `no select named ${name}`;
    const o = [...sel.options].find((o) => re.test(o.textContent) || re.test(o.value));
    if (!o) return `no option ${src} in ${name}: ${[...sel.options].map((o) => o.textContent).join(" · ")}`;
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(sel, o.value);
    sel.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }, name, optionRe.source ?? String(optionRe));
  if (ok !== true) fail(ok);
  await sleep(60);
}
async function type(name, value) {
  const ok = await page.evaluate((name, value) => {
    const el = [...document.querySelectorAll(".tb input")].find((s) => (s.getAttribute("aria-label") ?? "") === name);
    if (!el) return `no input named ${name}`;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true })); return true;
  }, name, value);
  if (ok !== true) fail(ok);
  await sleep(60);
}
const lens = async (label) => { await page.evaluate((label) => [...document.querySelectorAll(".tb .lens label")].find((l) => l.textContent.trim() === label)?.click(), label); await sleep(80); };
/** build the preview and wait for its row count (or the error); returns { rows, ms, err, notes, head } */
/** poll the page (not waitForFunction: its frame-driven polling stalls in a headless window) until fn() is truthy */
async function until(fn, timeout = 60000, arg) {
  const t = Date.now();
  while (Date.now() - t < timeout) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(150); }
  return false;
}
async function preview(timeout = 240000) {
  await until(() => !/Getting ready/.test(document.querySelector(".prev .chead .r")?.textContent ?? ""));   // the datasets' names name the columns
  const t = Date.now();
  // a real click (a user gesture), as a reader makes it; absent when the table on screen is already current
  if (await page.$(".prev [data-act=preview]")) await page.click(".prev [data-act=preview]");
  await until(() => /\d rows?$/.test((document.querySelector(".prev .chead .r")?.textContent ?? "").trim()) || !!document.querySelector(".tb-bar .warn"), timeout);
  return page.evaluate((ms) => ({
    rows: Number(((/([\d,]+) rows?/.exec(document.querySelector(".prev .chead .r")?.textContent ?? "") ?? [0, "-1"])[1]).replace(/,/g, "")),
    err: document.querySelector(".tb-bar .warn")?.textContent ?? null, ms,
    notes: [...document.querySelectorAll(".tb-notes li")].map((x) => x.textContent),
    head: [...document.querySelectorAll(".prev th")].map((x) => x.textContent),
  }), Date.now() - t);
}
/** press Download CSV and read the file the browser saved (null when none arrived) */
async function download(wait = 60000, click = true) {
  const dir = page.__dl, before = new Set(fs.readdirSync(dir));
  if (click) { await until(() => !document.querySelector(".tb-bar .dl").disabled); await page.click(".tb-bar .dl"); }   // a real click: Chrome lets a page save several files only on user gestures
  const t = Date.now();
  while (Date.now() - t < wait) {
    const f = fs.readdirSync(dir).find((x) => !before.has(x) && !x.endsWith(".crdownload") && !x.endsWith(".read"));
    // read it, then move it aside: the next save from this page has the same name and would replace it unseen
    if (f) { await sleep(300); const c = readCsv(path.join(dir, f)); fs.renameSync(path.join(dir, f), path.join(dir, `${fs.readdirSync(dir).length}_${f}.read`)); return c; }
    if (await page.evaluate(() => !!document.querySelector(".tb-bar .warn"))) return null;
    await sleep(200);
  }
  return null;
}
function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l !== "");
  const cells = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
  const head = cells(lines[0]);
  return { file: path.basename(file), bytes: fs.statSync(file).size, head, n: lines.length - 1, rows: lines.slice(1).map((l) => Object.fromEntries(cells(l).map((v, i) => [head[i], v]))) };
}
const noErrors = () => { check(!errs.length, `no console or page errors${errs.length ? `: ${errs.slice(0, 3).join(" | ")}` : ""}`); };

const cases = {
  // ── a link picks for the reader ─────────────────────────────────────────────────────────────────────────────────────
  async link_two_picks() {
    await open(link([SARDINE, TEMP]));
    check((await page.title()) === "Query Builder · CalCOFI.io", `page title is "${await page.title()}"`);
    // brand v3 (2026-11-17): the crumb and the h1 are in the wave band (.tb-title in both layouts); a v2 build keeps the crumb in .tb-hd
    check(/Query Builder/.test((await text(".tb-title .crumb")) ?? (await text(".tb-hd .crumb"))) && (await text(".tb-title h1")) === "Query Builder", "crumb and heading say Query Builder");
    check((await selected()) === 2, "the link's two picks are ticked (2 selected)");
    // REGRESSION (2026-11-17): the first Show preview, clicked before the datasets' names had arrived, built a table that was
    // stale the moment they did, so nothing appeared until a second click
    const p = await preview(120000);
    check(p.rows > 1000 && !p.err, `yearly averages per station: ${p.rows.toLocaleString()} rows in ${p.ms} ms${p.err ? ` — ${p.err}` : ""}`);
    check(p.head.join() === ["year", "line", "station", "pacific_sardine_pilchard_larva_per_10m2_ichthyoplankton", "sea_temperature_bottle"].join() || p.head.length === 5, `columns: ${p.head.join(", ")}`);
    const c = await download();
    check(!!c && c.n === p.rows, `Download CSV: ${c?.file} holds ${c?.n} rows, the preview's ${p.rows}`);
    if (c) {
      const sard = c.head.find((h) => /sardine/.test(h)), temp = c.head.find((h) => /temperature/.test(h));
      const zeros = c.rows.filter((r) => r[sard] === "0").length, blanks = c.rows.filter((r) => r[sard] === "").length, both = c.rows.filter((r) => r[sard] !== "" && r[temp] !== "").length;
      check(zeros > 0 && blanks > 0, `a 0 and a blank are different cells: ${zeros} zeros (a net sorted, no sardine larvae), ${blanks} blanks (no net that station-year)`);
      check(both > 0, `${both} of ${c.n} rows carry both a larval density and a temperature`);
      check(/^calcofi_table_v\d{4}\.\d\d\.\d\d.*_\d{4}-\d\d-\d\d\.csv$/.test(c.file), `file name carries the release and the date: ${c.file}`);
    }
    await page.screenshot({ path: path.join(out, "link_two_picks.png") });
    noErrors();
  },
  async link_download() {
    await open(link([SARDINE], "&download=1"));
    const c = await download(120000, false);
    check(!!c && c.n > 1000, `?pick=…&download=1 starts the CSV by itself: ${c?.file} (${c?.n} rows)`);
    check(!/download=1/.test(page.url()) && /pick=/.test(page.url()), `the address drops download=1 and keeps the pick: ${page.url().replace(base, "")}`);
    noErrors();
  },
  async link_unknown_pick() {
    await open(link(["env:calcofi_ctd-derived:mld_temperature_02"], "&download=1"));
    await sleep(1500);
    const note = await text(".tb-note");
    check(/not in this release/.test(note ?? ""), `a pick the release does not hold shows a notice: ${note?.slice(0, 110)}`);
    check((await selected()) === 0 && fs.readdirSync(page.__dl).length === 0, "nothing is ticked and nothing downloads");
    noErrors();
  },
  async link_shape() {
    await open(link([SARDINE], "&rows=sample&stations=all&download=1"));
    const c = await download(120000, false);
    check(!!c && c.head.slice(0, 5).join() === "date,cruise,line,station,depth_m", `&rows=sample&stations=all: the CSV is per sample (${c?.head.slice(0, 5).join(", ")}; ${c?.n} rows)`);
    check((await page.evaluate(() => document.querySelector('.tb select[aria-label="Stations"]').value)) === "all", "and Stations reads Every station");
    noErrors();
  },
  async link_offgrid() {
    // the phytoplankton samples carry no grid cell: a link to one of its taxa starts on Hexagons, and Stations says why it is blank
    const cov = await (await fetch((await (await fetch("https://storage.googleapis.com/calcofi-db/ducklake/releases/latest.txt")).text()).trim().replace(/^/, "https://storage.googleapis.com/calcofi-db/ducklake/releases/") + "/coverage.json")).json();
    const t = cov.taxa.filter((t) => (t.datasets ?? []).some((d) => d.dataset_key === "calcofi_phytoplankton")).sort((a, b) => b.n_obs - a.n_obs)[0];
    await open(link([`bio:calcofi_phytoplankton:${t.taxon_key}`], "&download=1"));
    const c = await download(120000, false);
    check(!!c && c.n > 0 && c.head.includes("hexagon"), `a phytoplankton pick with &download=1 starts on Hexagons and saves ${c?.n} rows (${c?.head.join(", ")})`);
    await lens("Stations");
    check(/off CalCOFI's station grid/.test((await text(".fbody .tb-note")) ?? ""), `Stations says why its column would be blank: ${(await text(".fbody .tb-note"))?.slice(0, 90)}`);
    noErrors();
  },
  // ── a dataset the default units and life stage do not fit ──────────────────────────────────────────────────────────
  async other_datasets() {
    const cov = await (await fetch((await (await fetch("https://storage.googleapis.com/calcofi-db/ducklake/releases/latest.txt")).text()).trim().replace(/^/, "https://storage.googleapis.com/calcofi-db/ducklake/releases/") + "/coverage.json")).json();
    const top = (ds) => { const t = cov.taxa.filter((t) => (t.datasets ?? []).some((d) => d.dataset_key === ds)).sort((a, b) => b.datasets.find((d) => d.dataset_key === ds).n_obs - a.datasets.find((d) => d.dataset_key === ds).n_obs)[0]; return t && `bio:${ds}:${t.taxon_key}`; };
    const dss = cov.datasets.filter((d) => d.realm === "bio").map((d) => d.dataset_key);
    const picks = dss.map(top).filter(Boolean);
    await open(link(picks));
    check((await selected()) === picks.length, `the most-recorded species of each of the ${dss.length} organism datasets, ticked from a link (${await selected()} selected)`);
    await choose("Stations", /Every station/); await choose("Rows", /Yearly/);
    await lens("Hexagons"); await choose("Hexagon size", /120 km/);
    const p = await preview();
    check(p.rows > 0 && !p.err, `built: ${p.rows} rows in ${p.ms} ms${p.err ? ` — ${p.err}` : ""}`);
    const c = await download();
    if (c) {
      const blank = c.head.filter((h) => !["year", "hexagon"].includes(h)).filter((h) => c.rows.every((r) => r[h] === ""));
      check(blank.length === 0, blank.length ? `blank columns: ${blank.join(", ")}` : `none of the ${picks.length} species columns is blank`);
      check(p.notes.length > 0, `the page says which columns are not per 10 m² larvae (${p.notes.length} notes; first: ${p.notes[0]?.slice(0, 120)})`);
      console.log(`       columns: ${c.head.join(", ")}`);
    } else fail("no CSV");
    noErrors();
  },
  // ── the acceptance task: sardine larvae and temperature, line 93.3, spring ─────────────────────────────────────────
  async task_line_933_spring() {
    await open(link([SARDINE, TEMP, TEMP_CTD]));
    await type("First year", 2019); await type("Last year", 2019); await choose("Season", /Spring/);
    await type("Shallowest depth (m)", 0); await type("Deepest depth (m)", 10);
    await choose("Rows", /Custom/); await choose("Group by place", /Per station/); await choose("Group by time", /Per sample date/); await choose("Group by depth", /Depths together/);
    const p = await preview();
    check(p.rows > 0 && !p.err, `spring 2019, 0–10 m, per station and sample date: ${p.rows} rows${p.err ? ` — ${p.err}` : ""}`);
    const c = await download();
    if (c) {
      const l933 = c.rows.filter((r) => r.line === "93.3");
      const sard = c.head.find((h) => /sardine/.test(h)), tb = c.head.find((h) => /temperature.*bottle/.test(h)), tc = c.head.find((h) => /temperature.*ctd/.test(h));
      check(l933.length > 0, `line 93.3 is in the table (${l933.length} rows of ${c.n}); the reader filters the line column, the page has no line filter`);
      const paired = l933.filter((r) => r[sard] !== "" && (r[tb] !== "" || r[tc] !== "")).length, nets = l933.filter((r) => r[sard] !== "").length;
      check(paired > 0, `on line 93.3, ${paired} of ${nets} rows with a net also carry a temperature`);
      check(l933.every((r) => /^\d{4}-\d\d-\d\d$/.test(r.date)), `the date column reads as a date (${l933[0]?.date})`);
      console.log(`       line 93.3 rows: ${l933.slice(0, 4).map((r) => `${r.date} st ${r.station}: larvae ${r[sard] || "·"} / bottle ${r[tb] || "·"} / ctd ${r[tc] || "·"}`).join(" ; ")}`);
    } else fail("no CSV");
    await page.screenshot({ path: path.join(out, "task_line_933_spring.png") });
    noErrors();
  },
  // ── every Rows shape, the three lenses, a region chosen, every hexagon size ────────────────────────────────────────
  async rows_shapes() {
    await open(link([SARDINE, TEMP]));
    await type("First year", 2015); await type("Last year", 2019);
    for (const [name, re, keys] of [["every sample", /Every sample/, ["date", "cruise", "line", "station", "depth_m"]], ["yearly", /Yearly/, ["year", "line", "station"]], ["seasonal", /Seasonal/, ["year", "season", "line", "station"]], ["monthly", /Monthly/, ["year", "month", "line", "station"]]]) {
      await choose("Rows", re);
      const p = await preview(), c = p.err ? null : await download();
      check(!!c && c.n === p.rows && keys.every((k, i) => c.head[i] === k), `${name}: ${p.rows.toLocaleString()} rows, keys ${c?.head.slice(0, keys.length).join(", ")}${p.err ? ` — ${p.err}` : ""}`);
      const said = await text(".tb .explain");
      check(!/Nothing is combined/.test(said ?? ""), `the sentence does not claim nothing is combined: “${said?.slice(0, 90)}…”`);
    }
    noErrors();
  },
  async region_chosen() {
    // the path that failed silently in the Explorer draft of 10 Nov (a DuckDB parser error with a region picked)
    await open(link([SARDINE, TEMP]));
    await page.evaluate(() => document.querySelector('.tb select[aria-label="Region"]').focus());
    await until(() => document.querySelector('.tb select[aria-label="Region"]').options.length > 2);
    await choose("Region", /National Marine Sanctuaries/);
    let p = await preview(), c = p.err ? null : await download();
    check(!!c && c.n === p.rows && c.n > 0, `Stations inside any sanctuary: ${p.rows} rows, CSV ${c?.n}${p.err ? ` — ${p.err}` : ""}`);
    await lens("Regions");
    await until(() => (document.querySelector('.tb select[aria-label="Boundary layer"]')?.options.length ?? 0) > 2);
    await choose("Boundary layer", /National Marine Sanctuaries/); await choose("Region of the layer", /Channel Islands/);
    p = await preview(); c = p.err ? null : await download();
    check(!!c && c.n === p.rows && c.n > 0 && c.rows.every((r) => /Channel Islands/.test(r.region)), `Regions › National Marine Sanctuaries › Channel Islands: ${p.rows} rows, every one in it${p.err ? ` — ${p.err}` : ""}`);
    await choose("Boundary layer", /BOEM Pacific Oil & Gas Leases/);
    p = await preview();
    check(!p.err && p.rows >= 0, `a layer with “&” in its name builds (${p.rows} rows)${p.err ? ` — ${p.err}` : ""}`);
    noErrors();
  },
  async hexagon_sizes() {
    await open(link([SARDINE, TEMP]));
    await lens("Hexagons"); await type("First year", 2010); await type("Last year", 2019);
    let last = 0;
    for (const size of ["120 km", "45 km", "17 km", "6 km", "2.5 km"]) {
      await choose("Hexagon size", new RegExp(size.replace(".", "\\.")));
      const p = await preview();
      check(!p.err && p.rows > last, `${size}: ${p.rows.toLocaleString()} rows in ${p.ms} ms (more than the size above)${p.err ? ` — ${p.err}` : ""}`);
      last = p.rows;
    }
    noErrors();
  },
  // REGRESSION (2026-11-17): the per-net probe was remembered from the first build, so a species added after a water-only
  // table was zero-filled per station visit, not per net — other numbers than the same picks made together
  async order_independent() {
    const shape = async () => { await choose("Stations", /Every station/); await choose("Rows", /Custom/); await choose("Group by place", /All stations/); await choose("Group by time", /All years/); };
    const value = (c) => Number(c?.rows[0]?.[c.head.find((h) => /sardine/.test(h))]);
    await open(link([TEMP]));
    await shape(); await preview();                                   // water only, built first
    await type("Search species", "pacific sardine");
    await until(() => [...document.querySelectorAll(".tb label.it")].some((l) => /Pacific Sardine/i.test(l.textContent) && /Ichthyo/i.test(l.textContent)));
    await page.evaluate(() => [...document.querySelectorAll(".tb label.it")].find((l) => /Pacific Sardine/i.test(l.textContent) && /Ichthyo/i.test(l.textContent)).querySelector("input").click());
    check((await selected()) === 2, "a species added after a water-only table was built");
    await preview(); const a = value(await download());
    await open(link([SARDINE, TEMP]));
    await shape(); await preview(); const b = value(await download());
    check(Number.isFinite(a) && a === b, `its mean is the same as with both picked from the start: ${a} = ${b} (larvae per 10 m², every station, all years)`);
    noErrors();
  },
  async too_many() {
    await open(link([]));
    await page.click('.tb input[aria-label="Select all species"]');
    const warn = await text(".tb-bar .warn");
    check(/one table takes up to/.test(warn ?? "") && await page.evaluate(() => document.querySelector(".tb-bar .dl").disabled), `Select all species: the page says the limit and Download is off — ${warn}`);
    noErrors();
  },
  async empty_result() {
    await open(link([TEMP]));
    await type("First year", 1900); await type("Last year", 1901);
    const c = await download(15000);
    const warn = await text(".tb-bar .warn");
    check(c === null && fs.readdirSync(page.__dl).length === 0, "no rows: no file is saved");
    check(/Nothing matches/.test(warn ?? ""), `and the page says why: ${warn}`);
    await type("First year", 1990); await type("Last year", 1991);
    const p = await preview();
    check(p.rows > 0 && !(await text(".tb-bar .warn")), "the message clears once a table builds");
    noErrors();
  },
  async big_table() {
    await open(link([SARDINE, TEMP, TEMP_CTD, "env:calcofi_bottle:salinity", "env:calcofi_bottle:oxygen_ml_l"]));
    await choose("Rows", /Every sample/);
    const p = await preview(), t = Date.now(), c = p.err ? null : await download(180000);
    const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));
    check(!!c && c.n === p.rows, `every sample, 5 columns, 1949–now: ${p.rows.toLocaleString()} rows built in ${p.ms} ms, CSV ${c ? (c.bytes / 1e6).toFixed(1) : "?"} MB saved in ${Date.now() - t} ms; page heap ${heap} MB${p.err ? ` — ${p.err}` : ""}`);
    noErrors();
  },
  // ── phone, themes, keyboard, names ─────────────────────────────────────────────────────────────────────────────────
  async phone_375() {
    await open(link([SARDINE, TEMP]), PHONE);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dl: (() => { const r = document.querySelector(".tb-bar .dl").getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; })(),
      small: [...document.querySelectorAll(".tb button, .tb select, .tb input[type=number], .tb summary")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 24).map((e) => e.className || e.tagName).slice(0, 6) }));
    // against the 375 px asked for, not innerWidth: a phone browser widens its layout to fit a page that overflows
    check(m.sw <= PHONE.width && m.iw <= PHONE.width, `375 px: nothing is wider than the window (page ${m.sw} px, layout ${m.iw} px)`);
    check(m.dl.l >= 0 && m.dl.r <= PHONE.width, `the Download CSV button is on screen (${Math.round(m.dl.l)}–${Math.round(m.dl.r)} px)`);
    check(m.small.length === 0, `no control is shorter than 24 px (WCAG 2.5.8)${m.small.length ? `: ${m.small.join(", ")}` : ""}`);
    const p = await preview();
    check(p.rows > 0 && !p.err, `the preview builds on a phone-width window (${p.rows} rows)`);
    await page.screenshot({ path: path.join(out, "phone_375_light.png"), fullPage: true });
    await open(link([SARDINE, TEMP], "&theme=dark"), PHONE);
    await page.screenshot({ path: path.join(out, "phone_375_dark.png"), fullPage: true });
    noErrors();
  },
  async themes() {
    for (const th of ["light", "dark"]) {
      await open(link([SARDINE, TEMP], `&theme=${th}`));
      check((await page.evaluate(() => document.documentElement.dataset.theme)) === th, `?theme=${th} is worn`);
      await preview();
      // contrast of the small grey text and of the notice, against what is painted behind them
      const low = await page.evaluate(() => {
        const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const rgb = (s) => { const m = s.match(/[\d.]+/g).map(Number); return m.length >= 4 && m[3] === 0 ? null : m.slice(0, 3); };
        const bgOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if (c) return c; } return [255, 255, 255]; };
        const out = [];
        for (const e of document.querySelectorAll(".tb .sub, .tb .lensdesc, .tb .lh .t, .tb .row > span:first-child, .tb th, .tb-title .crumb, .tb-title .rel, .tb-hd .crumb, .tb-hd nav a, .cc-header .cc-nav > a, .cc-header .cc-m2-t, .tb .explain, .tb-bar .sum, .tb label.it em, .tb label.it i, .tb .chead .r, .tb .gt .n, .tb-title p, .tb .rule li")) {
          if (!e.offsetParent || !e.textContent.trim()) continue;
          const fg = rgb(getComputedStyle(e).color), bg = bgOf(e); if (!fg) continue;
          const a = lum(fg), b = lum(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (cr < 4.5) out.push(`${(e.className || e.tagName).toString().slice(0, 18)} ${cr.toFixed(2)}`);
        }
        return [...new Set(out)];
      });
      check(low.length === 0, `${th}: small text meets 4.5:1${low.length ? ` — below: ${low.slice(0, 8).join("; ")}` : ""}`);
      await page.screenshot({ path: path.join(out, `desktop_${th}.png`) });
    }
    noErrors();
  },
  // ── brand v3 (2026-11-17): the page wears calcofi.io's bar and wave ───────────────────────────────────────────────────
  // The words are the brand's (nav.json beside the brand's header.js: how many, which open a menu and where each goes are
  // READ from it, never typed here), in sentence case; a word with a menu opens on a
  // press and closes on Escape with focus back on it; under 1100 px the menu button's column lists every line and every
  // line can be reached on a 375 x 667 phone; the wave band follows the bar; and the page still fits its window.
  async brand_header() {
    await open(link([]));
    const ver = await page.evaluate(() => window.ccTheme?.version ?? null);
    if (ver !== "3") { pass(`a brand v${ver ?? "?"} build: the brand's header is not worn here (brand_header skipped)`); return; }
    check(await until(() => document.querySelector("#cc-nav")?.getAttribute("data-cc-nav-state") === "ready", 20000), "the brand's header.js drew the words into the empty nav");
    const navUrl = await page.evaluate(() => new URL("nav.json", [...document.scripts].find((x) => /\/v3\/header\.js/.test(x.src)).src).href);
    const nav = await (await fetch(navUrl)).json();
    const want = nav.words.map((w) => w.title);
    const lines = nav.words.flatMap((w) => (w.menu ? w.menu.flatMap((c) => c.items).filter((i) => !i.rule).map((i) => i.url) : [w.url]));
    const bar = () => page.evaluate(() => {
      const navEl = document.getElementById("cc-nav"), hdr = document.querySelector(".cc-header");
      const tops = [...navEl.children], word = (e) => (e.matches("a") ? e : e.querySelector(".cc-m2-t"));
      const shown = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && r.width > 0 && r.height > 0; };
      return { words: tops.map((e) => word(e).textContent.trim()), tt: [...new Set(tops.map((e) => getComputedStyle(word(e)).textTransform))], title: [document.querySelector(".cc-header .cc-title")?.textContent.trim(), getComputedStyle(document.querySelector(".cc-header .cc-title")).textTransform],
        links: [...navEl.querySelectorAll("a")].map((a) => a.getAttribute("href")), navShown: shown(navEl), burger: shown(hdr.querySelector(".cc-menu-button")),
        wave: hdr.nextElementSibling?.classList.contains("cc-wave") ?? false, waveH: Math.round(hdr.nextElementSibling?.getBoundingClientRect().height ?? 0), hdrH: Math.round(hdr.getBoundingClientRect().height),
        // one row: every drawn child of the bar (the open column apart) is centred on the same line
        oneRow: (() => { const c = [...hdr.children].filter(shown).filter((e) => !(e.id === "cc-nav" && hdr.classList.contains("cc-nav-open"))).map((e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); return Math.max(...c) - Math.min(...c) < 20; })(),
        sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight,
        home: hdr.querySelector(".cc-home")?.getAttribute("href"), h1: document.querySelectorAll("h1").length, h1In: !!document.querySelector(".cc-wave h1") };
    });
    let h = await bar();
    check(JSON.stringify(h.words) === JSON.stringify(want) && want.length >= 3, `the bar's ${want.length} words are the brand's, from ${navUrl.replace(/^https?:\/\/[^/]+/, "")}: ${h.words.join(" · ")}`);
    check(h.tt.length === 1 && h.tt[0] === "none" && h.title[1] === "none" && h.title[0] === "Query Builder", `sentence case: the words and the title "${h.title[0]}" are not uppercased (text-transform ${h.tt.join(", ")} / ${h.title[1]})`);
    check(JSON.stringify(h.links) === JSON.stringify(lines), `every line links where the brand's list says (${h.links.length} links)`);
    check(h.navShown && !h.burger, "at 1400 px the words are in the bar and the menu button is not drawn");
    check(h.wave && h.h1 === 1 && h.h1In, `the wave band directly follows the bar and holds the page's one h1 (${h.waveH} px)`);
    check(h.oneRow && h.hdrH <= 80, `the bar is one row (${h.hdrH} px)`);
    check(h.sw <= h.iw && h.sh <= h.ih, `the page fits its ${h.iw} x ${h.ih} window (document ${h.sw} x ${h.sh})`);
    // a word with a menu: a press opens it, Escape closes it and puts focus back on the word
    const menu = () => page.evaluate(() => { const m = document.querySelector("#cc-nav .cc-m2"), t = m.querySelector(".cc-m2-t"), d = m.querySelector(".cc-dd"); return { ex: t.getAttribute("aria-expanded"), vis: getComputedStyle(d).visibility, focus: document.activeElement === t, n: d.querySelectorAll("a").length }; });
    let m = await menu();
    check(m.ex === "false" && m.vis === "hidden", "a menu is shut at rest");
    await page.focus("#cc-nav .cc-m2-t"); await sleep(250); m = await menu();
    check(m.vis === "hidden", "focus alone does not open it (tabbing past the bar opens nothing)");
    await page.keyboard.press("Enter"); await sleep(350); m = await menu();
    const firstMenu = nav.words.find((w) => w.menu), firstN = firstMenu.menu.flatMap((c) => c.items).filter((i) => !i.rule).length;
    check(m.ex === "true" && m.vis === "visible" && m.n === firstN, `Enter opens it: "${firstMenu.title}", its ${m.n} lines (aria-expanded ${m.ex})`);
    await page.keyboard.press("Tab"); await sleep(100);
    await page.keyboard.press("Escape"); await sleep(400); m = await menu();
    check(m.ex === "false" && m.vis === "hidden" && m.focus, "Escape closes it and focus is back on its word");
    // the breakpoint: 1100 px is the bar, 1099 px the menu button; then a phone
    await page.setViewport({ width: 1100, height: 800 }); await sleep(300); h = await bar();
    check(h.navShown && !h.burger && h.oneRow && h.sw <= h.iw, `1100 px: the title and all ${want.length} words on one row, no menu button (bar ${h.hdrH} px, document ${h.sw} px wide)`);
    await page.setViewport({ width: 1099, height: 800 }); await sleep(300); h = await bar();
    check(!h.navShown && h.burger && h.oneRow && h.sw <= h.iw, `1099 px: the menu button carries the words, the bar stays one row (${h.hdrH} px)`);
    for (const vp of [{ width: 820, height: 1180 }, { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]) {
      await open(link([]), vp);
      await until(() => document.querySelector("#cc-nav")?.getAttribute("data-cc-nav-state") === "ready", 20000);
      h = await bar();
      check(!h.navShown && h.burger && h.oneRow && h.sw <= h.iw, `${vp.width} px: one row with the menu button, no sideways scroll (bar ${h.hdrH} px, document ${h.sw} px)`);
      await page.click(".cc-header .cc-menu-button"); await sleep(400);
      const col = await page.evaluate(async () => {
        const navEl = document.getElementById("cc-nav"), as = [...navEl.querySelectorAll("a")], out = { n: as.length, ex: document.querySelector(".cc-menu-button").getAttribute("aria-expanded"), unreachable: [] };
        const cols = new Set(as.map((a) => Math.round(a.getBoundingClientRect().left / 40)));
        out.oneColumn = cols.size <= 2;   // a word, and the lines of a menu indented under their word
        for (const a of as) { a.scrollIntoView({ block: "nearest" }); await new Promise((r) => setTimeout(r, 15)); const r = a.getBoundingClientRect(); if (!(r.height > 0 && r.top >= 0 && r.bottom <= innerHeight)) out.unreachable.push(a.textContent.trim().slice(0, 24)); }
        out.sw = document.documentElement.scrollWidth; return out;
      });
      check(col.ex === "true" && col.n === lines.length && col.oneColumn, `${vp.width} px: the menu button opens all ${col.n} lines in one column`);
      check(col.unreachable.length === 0 && col.sw <= vp.width, `${vp.width} x ${vp.height}: every line can be brought into the window${col.unreachable.length ? ` — not: ${col.unreachable.join(", ")}` : ""}`);
      await page.keyboard.press("Escape"); await sleep(300);
      check(await page.evaluate(() => !document.querySelector(".cc-header").classList.contains("cc-nav-open") && document.activeElement === document.querySelector(".cc-menu-button")), `${vp.width} px: Escape closes the column and focus is back on the menu button`);
    }
    for (const th of ["light", "dark"]) {
      await open(link([], `?theme=${th}`));
      await sleep(400);
      await page.screenshot({ path: path.join(out, `brand_header_${th}.png`), clip: { x: 0, y: 0, width: 1400, height: 220 } });
    }
    noErrors();
  },
  async keyboard_and_names() {
    await open(link([SARDINE, TEMP]));
    await until(() => !document.querySelector(".tb-bar .dl").disabled);   // the bar's buttons wait for the datasets' names
    const unnamed = await page.evaluate(() => [...document.querySelectorAll(".tb input, .tb select, .tb button, .tb a")].filter((e) => {
      if (!e.offsetParent && e.type !== "radio") return false;
      const name = e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e.labels && [...e.labels].map((l) => l.textContent.trim()).join(" ")) || e.textContent.trim() || e.querySelector?.("img")?.alt;
      return !name;
    }).map((e) => `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ""}.${e.className}`));
    check(unnamed.length === 0, `every control has an accessible name${unnamed.length ? ` — without: ${[...new Set(unnamed)].slice(0, 8).join(", ")}` : ""}`);
    const fake = await page.evaluate(() => [...document.querySelectorAll('.tb a[href="#"]')].map((a) => a.textContent.trim()));
    check(fake.length === 0, `actions are buttons, not href="#" links${fake.length ? ` — ${fake.join(", ")}` : ""}`);
    check(await page.evaluate(() => [...document.querySelectorAll(".tb .gt")].every((b) => b.hasAttribute("aria-expanded"))), "each group's toggle says whether it is open (aria-expanded)");
    check(await page.evaluate(() => !!document.querySelector(".prev .chead [aria-live]")), "the preview's row count is announced (aria-live)");
    check(await page.evaluate(() => document.querySelectorAll(".tb h2").length >= 3), "the three steps are headings (h2)");
    // Tab from the top: focus must be visible on every stop, and reach Download CSV
    const stops = [];
    for (let i = 0; i < 150; i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e), host = e.closest(".lens label, .search") ?? e, hs = getComputedStyle(host);
        const ring = (c) => (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== "none";
        return { what: `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ""} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 28)}`, ring: ring(cs) || ring(hs), dl: e.classList.contains("dl") }; });
      if (!s) continue; stops.push(s); if (s.dl) break;
    }
    const noRing = stops.filter((s) => !s.ring).map((s) => s.what);
    check(stops.some((s) => s.dl), `Tab reaches Download CSV (${stops.length} stops)${stops.some((s) => s.dl) ? "" : ` — order: ${stops.map((s) => s.what).join(" > ").slice(-700)}`}`);
    check(noRing.length === 0, `every stop shows a focus ring${noRing.length ? ` — none on: ${[...new Set(noRing)].slice(0, 8).join("; ")}` : ""}`);
    // keyboard only: open the first group with Enter, tick with Space, preview with Enter
    await page.focus(".tb .gt"); await page.keyboard.press("Enter");
    check(await page.evaluate(() => document.querySelector(".tb .gt").getAttribute("aria-expanded") === "true" && !!document.querySelector(".tb .its")), "Enter opens a group");
    const before = await selected();
    await page.focus(".tb .its input[type=checkbox]"); await page.keyboard.press("Space"); await sleep(100);
    check((await selected()) !== before, "Space ticks a species");
    await page.focus(".prev [data-act=preview]"); await page.keyboard.press("Enter");
    await until(() => /rows/.test(document.querySelector(".prev .chead .r")?.textContent ?? "") || !!document.querySelector(".tb-bar .warn"), 240000);
    check(/rows/.test((await text(".prev .chead .r")) ?? ""), "Enter on Show preview builds it");
    noErrors();
  },
  async rule_and_notes() {
    await open(link([SARDINE, TEMP]));
    const rule = await page.evaluate(() => [...document.querySelectorAll(".tb .rule li")].map((x) => x.textContent));
    check(rule.length >= 4 && rule.some((l) => /blank/i.test(l)) && rule.some((l) => /0/.test(l)), `"How rows are matched" states the rule (${rule.length} lines), with what a blank and a 0 mean`);
    await until(() => !document.querySelector(".tb-bar [data-act=about]").disabled);
    await page.click(".tb-bar [data-act=about]");
    const dir = page.__dl; let f = null;
    for (let i = 0; i < 300 && !f; i++) { f = fs.readdirSync(dir).find((x) => x.endsWith(".txt")); await sleep(200); }
    const txt = f ? fs.readFileSync(path.join(dir, f), "utf8") : "";
    check(/How rows are matched/.test(txt) && /Columns/.test(txt) && /cite/i.test(txt), `"About this table" saves ${f}: the columns with units, the rule, the filters and how to cite`);
    check(/pacific_sardine/.test(txt) && /sea_temperature\w*bottle/.test(txt) && /degC|°C/.test(txt), "it names each column and the temperature's units");
    noErrors();
  },
};

for (const [name, fn] of Object.entries(cases)) {
  if (only && !only.test(name)) continue;
  cur = name; console.log(`\n${name}`);
  try { await fn(); } catch (e) { fail(`threw: ${String(e?.message ?? e).split("\n")[0]}`); }
}
await browser.close();
console.log(`\n${nPass} ok, ${nFail} FAIL`);
if (nFail) { console.log(fails.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
