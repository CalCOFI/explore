// download a bundle from the running app and list what is inside it
import puppeteer from "puppeteer-core";
import fs from "node:fs"; import path from "node:path";
const base = process.argv[2] ?? "http://localhost:5178/"; const out = path.resolve(process.argv[3] ?? "shots/bundle"); fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, userDataDir: path.join(process.env.TMPDIR ?? "/tmp", "explore-bundle-profile"), defaultViewport: { width: 1300, height: 800 } });
const page = (await browser.pages())[0];
const cdp = await page.createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: out });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
for (const url of [base + "?tour=off&lens=hex&res=5", base + "?tour=off&var=temperature&lens=region&layer=National%20Marine%20Sanctuaries&years=2000-2020"]) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window.__marks ?? []).some((m) => m.name === "first_lens_ready"), { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 800));
  const t = Date.now();
  const r = await page.evaluate(async () => { await window.__download(); return window.__lastBundle; });
  console.log(url.slice(base.length), "→", r?.name, (r?.bytes / 1e6).toFixed(2), "MB in", Date.now() - t, "ms");
  await new Promise((r) => setTimeout(r, 1500));
}
await browser.close();
