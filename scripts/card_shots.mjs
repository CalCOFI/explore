// the two themed card screenshots for calcofi.io (brand contract: ?theme=<t>&tour=off at 1200x750)
//   node scripts/card_shots.mjs ~/Github/CalCOFI/CalCOFI.github.io/images                              # the live card
//   node scripts/card_shots.mjs shots/v2 https://calcofi.io/explore/v2/ explore_v2                      # the brand v2 preview, for the meeting
import puppeteer from "puppeteer-core"; import path from "node:path"; import fs from "node:fs";
const [out, base = "https://calcofi.io/explore/", prefix = "explore"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, userDataDir: path.join(process.env.TMPDIR ?? "/tmp", "explore-card-profile"), args: ["--window-size=1240,820"], defaultViewport: { width: 1200, height: 750 } });
const page = (await browser.pages())[0];
for (const t of ["dark", "light"]) {
  await page.goto(`${base}?theme=${t}&tour=off&lens=hex&res=5`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window.__marks ?? []).some((m) => m.name === "first_lens_ready"), { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${out}/${prefix}_${t}.png` }); console.log("shot", `${out}/${prefix}_${t}.png`);
}
await browser.close();
