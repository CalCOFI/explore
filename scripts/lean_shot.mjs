// one screenshot of the lean panel for a URL (the What picker closed): node scripts/lean_shot.mjs <query> <out.png> [w] [h] [js-to-run]
import puppeteer from "puppeteer-core";
const [qs = "", out = "/tmp/lean.png", w = "1400", h = "900", js = ""] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-first-run", "--hide-scrollbars"], defaultViewport: { width: +w, height: +h } });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
await p.goto(`${process.env.BASE ?? "http://localhost:5178/"}?tour=off&${qs}`, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) { if (await p.evaluate(() => (window.__marks ?? []).some((m) => m.name === "first_lens_ready"))) break; await new Promise((r) => setTimeout(r, 200)); }
await new Promise((r) => setTimeout(r, 3500));
await p.evaluate(() => document.querySelector(".wp .wp-cancel")?.click());
await new Promise((r) => setTimeout(r, 600));
if (js) { console.log("JS", await p.evaluate(js)); await new Promise((r) => setTimeout(r, 2500)); }
await p.screenshot({ path: out });
console.log(await p.evaluate(() => location.search));
await b.close();
