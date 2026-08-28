// the two themed card screenshots for calcofi.io (brand contract: ?theme=<t>&tour=off at 1200x750)
import puppeteer from "puppeteer-core"; import path from "node:path";
const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, userDataDir: path.join(process.env.TMPDIR ?? "/tmp", "explore-card-profile"), args: ["--window-size=1240,820"], defaultViewport: { width: 1200, height: 750 } });
const page = (await browser.pages())[0];
for (const t of ["dark", "light"]) {
  await page.goto(`https://calcofi.io/explore/?theme=${t}&tour=off&lens=hex&res=5`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window.__marks ?? []).some((m) => m.name === "first_lens_ready"), { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${out}/explore_${t}.png` }); console.log("shot", t);
}
await browser.close();
