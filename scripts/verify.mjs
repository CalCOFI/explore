// Phase-0 verification: drive the installed Chrome (headed, fresh profile = cold cache) through every lens,
// screenshot each, and dump the timing marks. usage: node scripts/verify.mjs [baseUrl] [outDir]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:5178/";
const out = process.argv[3] ?? "shots";
const profile = process.argv[4] ?? path.join(process.env.TMPDIR ?? "/tmp", "explore-spike-profile");
fs.mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, userDataDir: profile,
  args: ["--window-size=1400,900", "--no-first-run", "--no-default-browser-check"], defaultViewport: { width: 1400, height: 860 } });
const page = (await browser.pages())[0] ?? (await browser.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
const marks = () => page.evaluate(() => window.__marks ?? []);
const waitMark = async (re, timeout = 60000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const ms = await marks(); const m = ms.filter((x) => re.test(x.name)).pop(); if (m) return m;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for ${re}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
async function run(label, url, steps) {
  console.log(`\n== ${label}: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitMark(/^first_lens_ready$/);
  await waitMark(/^first_paint$/, 20000).catch(() => console.log("no first_paint mark (map load event)"));
  await sleep(1200);
  const r = { url, marks: await marks(), shots: {} };
  for (const [name, fn] of steps) {
    const n0 = (await marks()).length;
    await fn();
    await sleep(1600); // transition (700 ms) + settle
    const file = path.join(out, `${label}_${name}.png`);
    await page.screenshot({ path: file });
    r.shots[name] = (await marks()).slice(n0);
    console.log(`  ${name}: ${r.shots[name].map((m) => `${m.name} ${m.ms}ms`).join(" | ")}`);
  }
  r.marksAll = await marks();
  results[label] = r;
}
const clickLens = (txt) => async () => { await page.click(`.lenses button::-p-text(${txt})`); await waitMark(new RegExp(`^grain_switch:`)); };
const lenses = [["station", async () => {}], ["hex", clickLens("Hexagons")], ["cruise", clickLens("Cruises")], ["region", clickLens("Regions")], ["section", clickLens("Sections")]];

// 1. cold: fresh profile, sardine larvae per 10 m2, every lens
await run("cold", base + "?tour=off", lenses);
// 2. env: temperature, stations then section (line 90) with anomaly
await run("env", base + "?var=temperature&tour=off", [["station", async () => {}], ["section", clickLens("Sections")],
  ["section_anom", async () => { await page.click("input[type=checkbox]"); await sleep(300); }]]);
// 3. warm: same profile, repeat visit, straight to hexagons with the opening morph (tour on)
await run("warm", base + "?lens=hex&res=5", [["hex", async () => { await sleep(1500); }], ["station", clickLens("Stations")], ["hex", clickLens("Hexagons")]]);
// 4. phone-shaped viewport (emulation; not a phone CPU/memory)
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await run("phone", base + "?tour=off", [["station", async () => {}]]);
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 1));
await browser.close();
console.log("\nwritten", path.join(out, "results.json"));
