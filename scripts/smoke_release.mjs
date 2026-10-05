// smoke check: does a built/deployed Explorer read the PROMOTED release? opens the URL headless (no window),
// waits for the app, and reports whether the page text names the release version, any console/page errors,
// failed requests, and every calcofi-db object it fetched (with status). written for the 2026-09-04 flip from
// the explore-dev cut to ducklake/releases; run it after every release and after every pages.yml change.
//   node scripts/smoke_release.mjs [baseUrl] [screenshot.png] [query, default "?tour=off"; "?tour=on" forces the welcome card]
//
// Second pass (plan 2026-10-02 D2, explore#13): the PER-CAST grain. The app lists the release's per-cast variables
// from its measurement_type registry (window.__cast, src/castgrain.ts) — the smoke names none of them. It opens the
// one with the most casts (or SMOKE_CAST_VAR=<measurement_type>) in the Stations lens and checks that the slice came
// from sample_measurement ⋈ sample_root, that every value the release holds is placed and counted, that the title
// sentence carries no depth clause and says "derived", and that Share › Copy code hands over that same join against
// content-addressed URLs; then opens it in Hexagons, which must draw when the release's sample_root carries hex7
// (v2026.10.04+) and say why not when it does not. Any failed check exits 1. SMOKE_RELEASE_PREFIX points it at
// a staging cut (ducklake-staging/releases; the tables prefix follows, or SMOKE_TABLES_PREFIX). SMOKE_CAST=off skips the pass (a release before v2026.10.01
// has no per-cast variable) — a release that should have one and lists none FAILS, it does not skip.
import puppeteer from "puppeteer-core";
const base = process.argv[2] ?? "http://localhost:5181/";
const shot = process.argv[3] ?? "smoke.png";
const DATA = (process.env.SMOKE_DATA_URL ?? "https://storage.googleapis.com/calcofi-db/").replace(/\/?$/, "/");
const PREFIX = (process.env.SMOKE_RELEASE_PREFIX ?? "ducklake/releases").replace(/\/$/, "");
// the content-addressed table store beside that releases prefix (ducklake/tables; ducklake-staging/tables for a staging run)
const TABLES = (process.env.SMOKE_TABLES_PREFIX ?? PREFIX.replace(/releases$/, "tables")).replace(/\/$/, "");
// the version the page must name: latest.txt of the same prefix the build reads (was a constant, "v2026.09.04",
// which every release since has failed)
const latest = await fetch(`${DATA}${PREFIX}/latest.txt`, { cache: "no-cache" }).then((r) => (r.ok ? r.text() : "")).then((t) => t.trim()).catch(() => "");
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args: ["--no-first-run", "--no-default-browser-check"], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [], failed = [], releaseReqs = new Set();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
page.on("requestfailed", (r) => failed.push(r.url().slice(0, 140) + " " + (r.failure()?.errorText ?? "")));
page.on("response", (r) => { const u = r.url(); if (u.includes("storage.googleapis.com")) { releaseReqs.add(u.replace(/^https:\/\/storage.googleapis.com\/calcofi-db\//, "").slice(0, 110) + " -> " + r.status()); } });
const query = process.argv[4] ?? "?tour=off";
await page.goto(base + query, { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 15000));
const text = await page.evaluate(() => document.body.innerText);
const hasVersion = !!latest && text.includes(latest);
const hasDev = /explore-dev/.test(text);
const nPlotly = await page.evaluate(() => document.querySelectorAll(".js-plotly-plot").length);
const nMap = await page.evaluate(() => document.querySelectorAll(".maplibregl-canvas, canvas").length);
const out = { latest, hasVersion, hasDev, nPlotly, nCanvas: nMap, errors: errors.slice(0, 8), failed: failed.slice(0, 8),
  gcs: [...releaseReqs].slice(0, 25), textHead: text.slice(0, 300).replace(/\n/g, " | ") };
await page.screenshot({ path: shot });

// ── the per-cast grain ────────────────────────────────────────────────────────────────────────────────────────────
const fails = [];
if (!hasVersion) fails.push(`the page does not name the promoted release (${latest || `no latest.txt at ${DATA}${PREFIX}/`})`);
if (process.env.SMOKE_CAST === "off") out.cast = { skipped: "SMOKE_CAST=off" };
else {
  const check = (ok, what) => { if (!ok) fails.push(what); return !!ok; };
  // the census is fetched once the first lens has answered; the registry-keyed list follows it
  const listed = await page.waitForFunction(() => (window.__cast?.vars ?? []).length > 0, { timeout: 60000 }).then(() => true, () => false);
  const vars = listed ? await page.evaluate(() => window.__cast.vars) : [];
  check(vars.length > 0, "the app lists no per-cast variable (registry grain = sample, published by a derived dataset) — expected from v2026.10.01 on");
  const want = process.env.SMOKE_CAST_VAR;
  const v = want ? vars.find((x) => x.key === want) : vars.slice().sort((a, b) => b.n - a.n)[0];
  if (want) check(!!v, `SMOKE_CAST_VAR=${want} is not a per-cast variable of this release (it lists: ${vars.map((x) => x.key).join(", ")})`);
  if (v) {
    errors.length = 0; releaseReqs.clear();
    await page.goto(`${base}?tour=off&var=${encodeURIComponent(v.key)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const ready = await page.waitForFunction((k) => window.__sliceKey === `env:${k}` && (window.__marks ?? []).some((m) => m.name === "first_lens_ready"), { timeout: 120000 }, v.key).then(() => true, () => false);
    check(ready, `${v.key}: the per-cast slice never became ready`);
    await new Promise((r) => setTimeout(r, 2500));
    const s = await page.evaluate(() => {
      const txt = (q) => document.querySelector(q)?.innerText?.replace(/\s+/g, " ").trim() ?? null;
      const mark = (n) => (window.__marks ?? []).filter((m) => m.name === n).slice(-1)[0];
      return { grain: window.__cast?.grain ?? null, list: window.__cast?.vars ?? [], picker: window.__picker ?? [], sentence: txt(".ts-text"), legend: txt(".ts-legend"),
        derivedLine: txt(".derived-line"), datasetHref: document.querySelector(".derived-line a")?.href ?? null,
        station: mark("query:station")?.note ?? null, depth: mark("query:depth_strip")?.note ?? null, slice: (window.__marks ?? []).find((m) => m.name.startsWith("slice:"))?.note ?? null };
    });
    const now = s.list.find((x) => x.key === v.key);
    const nSlice = s.picker.reduce((a, r) => a + r.n, 0), gcs = [...releaseReqs];
    check(s.grain === "cast", `${v.key}: the app does not read it as per-cast (grain ${s.grain})`);
    check(now && now.n_placed === now.n, `${v.key}: ${now?.n} values in the release, ${now?.n_placed} placed by a sample_root row`);
    check(now && nSlice === now.n, `${v.key}: the slice holds ${nSlice} values, sample_measurement ${now?.n}`);
    check(s.picker.length > 0 && s.picker.every((r) => v.datasets.includes(r.dataset_key)), `${v.key}: the slice's dataset_key (${s.picker.map((r) => r.dataset_key).join(", ")}) is not the measurement's (${v.datasets.join(", ")})`);
    check(/^[1-9]\d* rows$/.test(s.station ?? ""), `${v.key}: the Stations lens returned ${s.station}`);
    check(s.depth === "0 rows", `${v.key}: a per-cast variable has a depth profile (${s.depth})`);
    // the depth clause is the sentence's own chip, "· 0–500 m" after the season — a label may say "from 10 m" itself
    check(!!s.sentence && !/·\s\d+–\d+ m\b/.test(s.sentence), `${v.key}: the title sentence carries a depth clause: ${s.sentence}`);
    check(/derived, one value per cast/.test(s.sentence ?? ""), `${v.key}: the title sentence does not say it is derived, per cast: ${s.sentence}`);
    check(/ casts\b/.test(s.legend ?? ""), `${v.key}: the legend does not count casts: ${s.legend}`);
    check(/^https:\/\/calcofi\.io\/datasets\/[^/]+\/$/.test(s.datasetHref ?? ""), `${v.key}: no dataset-page link under the picker (${s.datasetHref})`);
    for (const t of ["sample_measurement", "sample_root"]) check(gcs.some((u) => u.includes(`${TABLES}/${t}/`) && u.endsWith("-> 200")), `${v.key}: ${t} was not fetched from its content-addressed object`);
    check(!gcs.some((u) => u.includes(`measurement_type=${v.key}/`)), `${v.key}: an obs_env object was fetched for a per-cast variable`);
    // Share › Copy code › SQL: the same join, against the release's own object URLs
    await page.evaluate(() => [...document.querySelectorAll(".tabs [role=tab]")].find((b) => /Share/.test(b.innerText))?.click());
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => [...document.querySelectorAll(".menu-btn")].find((b) => /Copy code/.test(b.innerText))?.click());
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => [...document.querySelectorAll(".menu-item")].find((b) => /^SQL/.test(b.innerText.trim()))?.click());
    await new Promise((r) => setTimeout(r, 500));
    const sql = (await page.evaluate(() => window.__lastCopy ?? "")) ?? "";
    check(/FROM read_parquet\('https:\/\/[^']*\/tables\/sample_measurement\/[^']+\.parquet'\) sm\s+JOIN read_parquet\('https:\/\/[^']*\/tables\/sample_root\/[^']+\.parquet'\) r ON r\.root_sample_key = sm\.sample_key/.test(sql), `${v.key}: Copy code › SQL does not carry the sample_measurement ⋈ sample_root join against the catalog's objects`);
    check(!/releases\/v[\d.]+\/parquet\//.test(sql), `${v.key}: the copied SQL holds a hand-built releases/{v}/parquet/ path`);
    check(/measurement_qual/.test(sql) && /AS qual_ok/.test(sql), `${v.key}: the copied SQL does not apply the quality predicate`);
    check(errors.length === 0, `${v.key}: console errors: ${errors.slice(0, 3).join(" | ")}`);
    out.cast = { var: v.key, listed: vars.map((x) => `${x.key} (${x.n})`), n_release: now?.n ?? null, n_placed: now?.n_placed ?? null, n_slice: nSlice, station: s.station, slice: s.slice,
      sentence: s.sentence, legend: s.legend, derivedLine: s.derivedLine, datasetHref: s.datasetHref, copiedSqlChars: sql.length, gcs: gcs.filter((u) => /sample_measurement|sample_root|measurement_type\//.test(u)), errors: errors.slice(0, 8) };
    await page.screenshot({ path: shot.replace(/\.png$/, "") + "_cast.png" });
    // Hexagons: a release whose sample_root carries hex7 (v2026.10.04+) draws the per-cast variable in hexagons; an older
    // one shows the lens's note instead. Either way the page says which — never an unexplained empty map.
    errors.length = 0;
    await page.goto(`${base}?tour=off&lens=hex&var=${encodeURIComponent(v.key)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const hexReady = await page.waitForFunction(() => (window.__marks ?? []).some((m) => m.name === "query:hex") || !!document.querySelector("[data-cast-note=hex]"), { timeout: 120000 }).then(() => true, () => false);
    await new Promise((r) => setTimeout(r, 1500));
    const h = await page.evaluate(() => ({ hex7: window.__cast?.hex ?? null, rows: (window.__marks ?? []).filter((m) => m.name === "query:hex").slice(-1)[0]?.note ?? null, note: document.querySelector("[data-cast-note=hex]")?.innerText ?? null }));
    check(hexReady, `${v.key}: the Hexagons lens never answered`);
    if (h.hex7) check(/^[1-9]\d* rows$/.test(h.rows ?? "") && !h.note, `${v.key}: sample_root carries hex7 but the Hexagons lens drew ${h.rows}${h.note ? ` and says: ${h.note}` : ""}`);
    else check(!!h.note, `${v.key}: no hex7 on sample_root and the Hexagons lens does not say why it is empty`);
    check(errors.length === 0, `${v.key} (Hexagons): console errors: ${errors.slice(0, 3).join(" | ")}`);
    out.cast.hex = h;
    await page.screenshot({ path: shot.replace(/\.png$/, "") + "_cast_hex.png" });
  }
}
out.ok = fails.length === 0; out.fails = fails;
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(out.ok ? 0 : 1);
