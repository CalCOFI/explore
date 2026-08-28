// one screenshot of the app at a URL after it is ready, optionally clicking a selector first
import puppeteer from "puppeteer-core"; import path from "node:path";
const [url, file, click] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, userDataDir: path.join(process.env.TMPDIR ?? "/tmp", "explore-shot-profile"), args: ["--window-size=1400,900"], defaultViewport: { width: 1400, height: 860 } });
const page = (await browser.pages())[0];
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => (window.__marks ?? []).some((m) => m.name === "first_lens_ready"), { timeout: 90000 });
if (click) { await page.click(click); await new Promise((r) => setTimeout(r, 1200)); }
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: file }); console.log("wrote", file); await browser.close();
