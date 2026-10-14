// the Area › region picker and modal (explore#20 · #16 · #34), driven headless against a running dev server and the
// live release: an old single-region link, a short name widened, the whole layer, a map click in the modal on a
// gazetteer AOA and on a sanctuary section, a table tick, Apply, Esc, the multi-region outline after a reload. Prints
// one line per check and writes i20-area-*-<theme>.jpg into outDir (feedback/fixes/ holds the committed ones).
//   node scripts/area_shots.mjs http://localhost:5178 /tmp/shots [dark|light]
import puppeteer from "puppeteer-core"; import path from "node:path";
const [base, outDir, theme = "dark"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  userDataDir: path.join(process.env.TMPDIR ?? "/tmp", "explore-area-verify"), args: ["--window-size=1500,950", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], defaultViewport: { width: 1500, height: 920 } });
const page = (await browser.pages())[0];
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("explore_welcome", "1"); localStorage.setItem("cc-theme", t); } catch {} }, theme);
const ready = () => page.waitForFunction(() => (window.__marks ?? []).some((m) => m.name === "first_lens_ready"), { timeout: 120000 });
const area = () => page.evaluate(() => new URLSearchParams(location.search).get("area"));
const sentence = () => page.evaluate(() => document.querySelector(".sentence, [data-tour=sentence], h1")?.textContent ?? "");
const refine = async () => { const [b] = await page.$$("xpath/.//button[@role='tab'][contains(., 'Refine')]"); await b.click(); await sleep(600); };

// 1. an old single-region permalink parses as before
await page.goto(`${base}/?tour=off&theme=${theme}&area=${encodeURIComponent("in:National Marine Sanctuaries|Channel Islands")}`, { waitUntil: "domcontentloaded" });
await ready(); await sleep(2500);
console.log("1 area", await area(), "|", (await sentence()).match(/within[^·]*/)?.[0]);

// 1b. a short name this release spells longer is widened (the explore#34 path; "Greater" -> "Greater Farallones")
await page.goto(`${base}/?tour=off&theme=${theme}&area=${encodeURIComponent("in:National Marine Sanctuaries|greater")}`, { waitUntil: "domcontentloaded" });
await ready(); await sleep(2500);
console.log("1b area", await area(), "|", (await sentence()).match(/within[^·]*/)?.[0]);

// 2. whole layer from the select
await page.goto(`${base}/?tour=off&theme=${theme}&area=${encodeURIComponent("in:SoCal Aquaculture AOAs")}&map=-119.1,34.1,8.5`, { waitUntil: "domcontentloaded" });
await ready(); await sleep(3000); await refine();
await page.waitForFunction(() => [...document.querySelectorAll("label.f")].some((l) => l.textContent.startsWith("region")), { timeout: 30000 });
await sleep(1500);
const opts = await page.evaluate(() => { const sel = [...document.querySelectorAll("label.f")].find((l) => l.textContent.startsWith("region")).querySelector("select"); return { value: sel.value, opts: [...sel.options].map((o) => o.textContent) }; });
console.log("2 region select", JSON.stringify(opts).slice(0, 400));
const layerOpts = await page.evaluate(() => { const sel = [...document.querySelectorAll("label.f")].find((l) => l.textContent.startsWith("layer")).querySelector("select"); return [...sel.options].filter((o) => o.disabled).map((o) => o.textContent); });
console.log("2 disabled layers", JSON.stringify(layerOpts));
console.log("2 area", await area(), "|", (await sentence()).match(/within[^·]*/)?.[0]);
const grp = await page.$("[data-tour=area]");
await grp.screenshot({ path: path.join(outDir, `i20-area-whole-layer-${theme}.jpg`), quality: 85 });

// 2b. the modal on the AOAs (whole layer -> all ticked); click one polygon (gazetteer tile: name "Southern California
// AOA N2-C", source_id "N2-C") to untick it
{
  const [b] = await page.$$("xpath/.//button[contains(., 'choose on map / table')]"); await b.click();
  await page.waitForFunction(() => window.__regionMap && window.__regionMap.loaded() && window.__regionMap.getLayer("rp-fill"), { timeout: 30000 });
  await sleep(4000);
  console.log("2b opened", await page.$eval(".rp-count", (e) => e.textContent));
  const hit = await page.evaluate(() => { const m = window.__regionMap, c = m.getCanvas(), r = c.getBoundingClientRect();
    for (let y = 10; y < r.height; y += 6) for (let x = 10; x < r.width; x += 6) { const f = m.queryRenderedFeatures([x, y], { layers: ["rp-fill"] })[0]; if (f && f.properties.source_id === "N2-C") return { x: r.left + x + 3, y: r.top + y + 3, props: f.properties }; }
    return null; });
  console.log("2b hit", JSON.stringify(hit));
  if (hit) { await page.mouse.move(hit.x, hit.y, { steps: 3 }); await sleep(300); console.log("2b hover", await page.$eval(".rp-hover", (e) => e.textContent).catch(() => "none")); await page.mouse.click(hit.x, hit.y); await sleep(1200); }
  console.log("2b after click", await page.$eval(".rp-count", (e) => e.textContent), "|", await page.$$eval(".rp-scroll tbody tr", (rs) => rs.map((r) => `${r.className}:${r.cells[1].textContent}:${r.cells[2].textContent}`).join(" ")));
  if (hit) await page.mouse.move(hit.x, hit.y, { steps: 2 });
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, `i20-area-aoa-modal-${theme}.jpg`), quality: 85 });
  const [apply] = await page.$$("xpath/.//div[contains(@class,'modal-actions')]//button[contains(., 'Apply')]"); await apply.click(); await sleep(3000);
  console.log("2b area", await area(), "|", (await sentence()).match(/within[^·]*/)?.[0]);
}

// 3. the modal on National Marine Sanctuaries: none, then click Channel Islands on the map, tick Monterey Bay in the table
await page.evaluate(() => { const sel = [...document.querySelectorAll("label.f")].find((l) => l.textContent.startsWith("layer")).querySelector("select"); const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; s.call(sel, "National Marine Sanctuaries"); sel.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(1000);
const [chooseBtn] = await page.$$("xpath/.//button[contains(., 'choose on map / table')]");
await chooseBtn.click();
await page.waitForSelector(".modal-regions"); await sleep(500);
await page.waitForFunction(() => window.__regionMap && window.__regionMap.loaded() && window.__regionMap.getLayer("rp-fill"), { timeout: 30000 });
await sleep(4000);
const [none] = await page.$$("xpath/.//div[contains(@class,'rp-tools')]//button[contains(., 'none')]"); await none.click(); await sleep(300);
console.log("3 opened at", await page.evaluate(() => { const m = window.__regionMap; const c = m.getCenter(); return `${c.lng.toFixed(1)},${c.lat.toFixed(1)} z${m.getZoom().toFixed(1)}`; }));
await page.evaluate(() => window.__regionMap.jumpTo({ center: [-121.2, 35.6], zoom: 5.6 })); await sleep(3500);
const px = (lon, lat) => page.evaluate((lon, lat) => { const m = window.__regionMap; const p = m.project([lon, lat]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y, feats: m.queryRenderedFeatures(p, { layers: ["rp-fill"] }).map((f) => f.properties.name) }; }, lon, lat);
const ci = await px(-119.75, 33.95); console.log("3 click at", JSON.stringify(ci));
await page.mouse.move(ci.x - 5, ci.y, { steps: 3 }); await page.mouse.move(ci.x, ci.y, { steps: 3 }); await page.mouse.click(ci.x, ci.y); await sleep(800);
console.log("3 after map click", await page.$eval(".rp-count", (e) => e.textContent));
const ch = await px(-120.95, 34.85); console.log("3 hover at", JSON.stringify(ch));
await page.mouse.move(ch.x, ch.y, { steps: 3 }); await sleep(300); await page.mouse.click(ch.x, ch.y); await sleep(500);
console.log("3 chumash hover", await page.$eval(".rp-hover", (e) => e.textContent).catch(() => "none"), "|", await page.$eval(".rp-count", (e) => e.textContent));
const [mb] = await page.$$("xpath/.//div[contains(@class,'rp-scroll')]//tr[td[2][contains(., 'Monterey Bay')]]//input"); if (mb) await mb.click();
await sleep(1500);
console.log("3 count", await page.$eval(".rp-count", (e) => e.textContent));
console.log("3 rows", await page.$$eval(".rp-scroll tbody tr", (rs) => rs.map((r) => `${r.className}:${[...r.cells].slice(1).map((c) => c.textContent).join("|")}`).join(" ; ")));
await page.screenshot({ path: path.join(outDir, `i20-area-region-modal-${theme}.jpg`), quality: 85 });
const [apply] = await page.$$("xpath/.//div[contains(@class,'modal-actions')]//button[contains(., 'Apply')]"); await apply.click();
await sleep(4000);
console.log("4 area", await area(), "|", (await sentence()).match(/within[^·]*/)?.[0]);
console.log("4 modal gone", !(await page.$(".modal-regions")));
// 5. Esc cancels
const [chooseBtn2] = await page.$$("xpath/.//button[contains(., 'choose on map / table')]"); await chooseBtn2.click(); await page.waitForSelector(".modal-regions"); await sleep(800);
await page.keyboard.press("Escape"); await sleep(500);
console.log("5 esc closes", !(await page.$(".modal-regions")), await area());
await page.goto(`${base}/?tour=off&theme=${theme}&area=${encodeURIComponent(await area())}&map=-120.9,35.2,6.6`, { waitUntil: "domcontentloaded" }); await ready(); await sleep(5000);
console.log("6 reload", await area(), "|", (await sentence()).match(/within[^·]*/)?.[0]);
await page.screenshot({ path: path.join(outDir, `i20-area-multi-outline-${theme}.jpg`), quality: 85 });
await browser.close();
