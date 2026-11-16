// does headless Chrome give this machine a WebGL2 context that DRAWS (from tmux over ssh, no window server session)?
// usage: node story/elnino-2026/capture/webgl_probe.mjs <out.png> [extra chrome flags …]
import puppeteer from "puppeteer-core";
const [out, ...flags] = process.argv.slice(2);
const html = `<!doctype html><body style="margin:0;background:#0f1a2e"><canvas id=c width=640 height=360></canvas><script>
  const gl = document.getElementById("c").getContext("webgl2", { preserveDrawingBuffer: true });
  window.__probe = { ok: !!gl };
  if (gl) {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    window.__probe.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, "#version 300 es\\nin vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }"));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, "#version 300 es\\nprecision highp float; out vec4 o; void main(){ o = vec4(0.9, 0.3, 0.2, 1.); }"));
    gl.linkProgram(p); gl.useProgram(p);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.8, -0.8, 0.8, -0.8, 0, 0.8]), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(p, "a"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0.06, 0.1, 0.18, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4); gl.readPixels(320, 150, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); window.__probe.centre = Array.from(px);
  }
</script></body>`;
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--window-size=640,360", "--hide-scrollbars", ...flags], defaultViewport: { width: 640, height: 360, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.setContent(html);
const probe = await page.evaluate(() => window.__probe);
await page.screenshot({ path: out });
console.log(JSON.stringify({ flags, ...probe }));
await browser.close();
