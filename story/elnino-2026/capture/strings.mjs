// every string the film puts on screen, in the order it appears: the audit a reviewer checks against the findings.
//   node story/elnino-2026/capture/strings.mjs [url]      (the page must be served: vite preview, port 5181)
// Steps the page's clock every 0.1 s and reads the words that are visible (opacity > 0.5): the column, the pill, the
// legend in force, the callout and tag of beat 7, the strip's labels, the credit. In-scene labels drawn by deck.gl
// (isoline values, place names, depth marks, the section's +4 / +8) are not DOM text and are listed in the README.
import puppeteer from "puppeteer-core";
const url = process.argv[2] ?? "http://localhost:5181/";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--window-size=1920,1080"], defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(`${url}?t=0`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__story === "object", { timeout: 60000 });
await page.evaluate(() => window.__story.ready.then(() => true));
const beats = await page.evaluate(() => window.__story.beats);
const beatOf = (t) => Object.entries(beats).filter(([, b]) => t >= b).length;
const seen = new Map();   // beat -> ordered set of strings
for (let k = 0; k < 300; k++) {
  const t = k / 10;
  const words = await page.evaluate(async (x) => {
    await window.__story.setT(x);
    const vis = (el) => el && Number(getComputedStyle(el).opacity) > 0.5 && el.textContent.trim();
    const out = [];
    for (const id of ["kicker", "year", "pill", "caption", "caption2", "callout-big", "callout-text", "tag"]) {
      const el = document.getElementById(id), host = id.startsWith("callout-") ? document.getElementById("callout") : el;
      if (vis(host) && el.textContent.trim()) out.push(`${id}: ${el.textContent.trim()}`);
    }
    for (const lg of document.querySelectorAll(".legend")) if (vis(lg)) out.push(`legend: ${lg.querySelector(".legend-title").textContent} [${[...lg.querySelectorAll(".legend-ticks span")].map((s) => s.textContent).join(" ")}]`);
    for (const tx of document.querySelectorAll("#strip text, #leader text")) if (Number(tx.getAttribute("opacity") ?? 1) > 0.5 && !/rgba\([^)]*,0(\.0+)?\)/.test(tx.getAttribute("style") ?? "")) out.push(`${tx.closest("svg").id}: ${tx.textContent}`);
    out.push(`credit: ${document.getElementById("credit").innerText.replace(/\n/g, " / ")}`);
    return out;
  }, t);
  const b = beatOf(t); if (!seen.has(b)) seen.set(b, new Map());
  for (const w of words) if (!seen.get(b).has(w)) seen.get(b).set(w, t);
}
for (const [b, m] of seen) { console.log(`\n== beat ${b} (from ${beats[`B${b}`]} s)`); for (const [w, t] of m) console.log(`  ${t.toFixed(1).padStart(4)} s  ${w}`); }
await browser.close();
