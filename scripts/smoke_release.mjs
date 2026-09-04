// smoke check: does a built/deployed Explorer read the PROMOTED release? opens the URL headless (no window),
// waits for the app, and reports whether the page text names the release version, any console/page errors,
// failed requests, and every calcofi-db object it fetched (with status). written for the 2026-09-04 flip from
// the explore-dev cut to ducklake/releases; run it after every release and after every pages.yml change.
//   node scripts/smoke_release.mjs [baseUrl] [screenshot.png] [query, default "?tour=off"; "?tour=on" forces the welcome card]
import puppeteer from "puppeteer-core";
const base = process.argv[2] ?? "http://localhost:5181/";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args: ["--no-first-run", "--no-default-browser-check"], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [], failed = [], releaseReqs = new Set();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
page.on("requestfailed", (r) => failed.push(r.url().slice(0, 140) + " " + (r.failure()?.errorText ?? "")));
page.on("response", (r) => { const u = r.url(); if (u.includes("storage.googleapis.com")) { releaseReqs.add(u.replace(/^https:\/\/storage.googleapis.com\/calcofi-db\//, "").slice(0, 90) + " -> " + r.status()); } });
const query = process.argv[4] ?? "?tour=off";
await page.goto(base + query, { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 15000));
const text = await page.evaluate(() => document.body.innerText);
const hasVersion = /v2026\.09\.04/.test(text);
const hasDev = /explore-dev/.test(text);
const nPlotly = await page.evaluate(() => document.querySelectorAll(".js-plotly-plot").length);
const nMap = await page.evaluate(() => document.querySelectorAll(".maplibregl-canvas, canvas").length);
console.log(JSON.stringify({ hasVersion, hasDev, nPlotly, nCanvas: nMap, errors: errors.slice(0, 8), failed: failed.slice(0, 8),
  gcs: [...releaseReqs].slice(0, 25), textHead: text.slice(0, 300).replace(/\n/g, " | ") }, null, 1));
await page.screenshot({ path: process.argv[3] ?? "smoke.png" });
await browser.close();
