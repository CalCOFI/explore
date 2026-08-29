// screenshot the brand icon contact sheet in both themes (after scripts/build_icons.mjs)
import puppeteer from "puppeteer-core"; import path from "node:path";
const dir = process.argv[2] ?? path.resolve("../CalCOFI.github.io/brand/v1"), out = process.argv[3] ?? "shots";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, defaultViewport: { width: 1100, height: 900, deviceScaleFactor: 2 } });
const page = await browser.newPage();
for (const t of ["dark", "light"]) { await page.goto("file://" + path.join(dir, "icons", "index.html"), { waitUntil: "load" }); await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, t); await new Promise((r) => setTimeout(r, 300)); await page.screenshot({ path: path.join(out, `icons_${t}.png`), fullPage: true }); }
await browser.close(); console.log("icon sheets written");
