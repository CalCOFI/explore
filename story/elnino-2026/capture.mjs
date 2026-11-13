// capture the story page frame by frame with headless Chrome, then encode it.
//   node story/elnino-2026/capture.mjs --url http://localhost:5181/ --out <dir> [--shots 0.5,6,12] [--from 0 --to 30] [--mp4 <file>] [--poster <png>]
// --shots  writes one PNG per listed time (seconds) into <dir> and stops: the way to look at a beat
// otherwise every frame t = k / fps for k in [from·fps, to·fps) is written to <dir>/f_%05d.png, and with --mp4 the
// frames are encoded to H.264 (yuv420p, +faststart, no audio) at the page's own fps.
// The page is driven through window.__story (page/main.ts): `ready` resolves when the fonts, the terrain tiles and the
// interpolated surfaces are in, and setT(t) resolves once that frame is on screen, so no frame is half-loaded.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("url", "http://localhost:5181/"), out = arg("out"), shots = arg("shots"), mp4 = arg("mp4"), poster = arg("poster");
const query = arg("query", "");   // extra page parameters, e.g. --query cam3=8.7,66,-50,1250,470 to try a camera (main.ts CAM3D_SPEC)
if (!out) { console.error("--out <dir> is required"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,   // ANGLE on Metal gives headless Chrome a real WebGL2 context on this machine (capture/webgl_probe.mjs)
  args: ["--window-size=1920,1080", "--hide-scrollbars", "--force-color-profile=srgb", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`console.${m.type()}:`, m.text().slice(0, 300)); });
page.on("requestfailed", (r) => console.log("REQUEST FAILED", r.url().slice(0, 140), r.failure()?.errorText));
const t0 = Date.now();
await page.goto(`${url}?t=0${query ? `&${query}` : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__story === "object", { timeout: 60000 });   // (a promise would be awaited: test the object)
await page.evaluate(() => window.__story.ready.then(() => true));
const info = await page.evaluate(() => ({ duration: window.__story.duration, fps: window.__story.fps, terrain: window.__story.terrain, check: window.__story.check }));
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(info));
// the page checks itself (main.ts selfCheck()): the section must stay in the frame through the whole camera move
if (!info.check?.sectionInFrame && !query) { console.error("STOP: the section leaves the frame during beat 7", JSON.stringify(info.check)); await browser.close(); process.exit(1); }
if (info.terrain?.missing) console.log(`WARNING: ${info.terrain.missing} of ${info.terrain.tiles} terrain tiles missing`);

const frame = async (t, file) => {
  await page.evaluate((x) => window.__story.setT(x), t);
  await page.screenshot({ path: file, type: "png", optimizeForSpeed: true });
};
if (shots) {
  for (const t of shots.split(",").map(Number)) { const f = path.join(out, `t_${t.toFixed(2).padStart(5, "0")}.png`); await frame(t, f); console.log("wrote", f); }
} else {
  const from = Number(arg("from", 0)), to = Number(arg("to", info.duration)), k0 = Math.round(from * info.fps), k1 = Math.round(to * info.fps);
  for (let k = k0; k < k1; k++) {
    await frame(k / info.fps, path.join(out, `f_${String(k).padStart(5, "0")}.png`));
    if (k % 60 === 0) console.log(`frame ${k} / ${k1}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log(`captured ${k1 - k0} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (poster) { fs.mkdirSync(path.dirname(poster), { recursive: true }); fs.copyFileSync(path.join(out, `f_${String(k1 - 1).padStart(5, "0")}.png`), poster); console.log("wrote", poster); }   // the last frame, as captured (lossless)
  if (mp4) {
    fs.mkdirSync(path.dirname(mp4), { recursive: true });
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(info.fps), "-start_number", String(k0), "-i", path.join(out, "f_%05d.png"),
      "-frames:v", String(k1 - k0), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4], { stdio: "inherit" });
    if (r.status !== 0) { console.error("ffmpeg failed"); process.exit(1); }
    console.log("wrote", mp4);
  }
}
await browser.close();
