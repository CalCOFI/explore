import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

import { brandBase, brandOf, headFor } from "./src/brandurl";

// the brand the build wears (plan 2026-08-30, Phase 2; v3 since 2026-11-17): VITE_BRAND = v1 | v2 | v3, default v3 —
// v2 with the brand's header (the same words on every product, sentence case, the menu button, the wave under the bar).
// v2 builds what was live until then; v1 the superseded look. VITE_BRAND_URL (default https://calcofi.io/brand/) is
// where the brand is loaded from: a preview that carries its own copy of the site sets it to /brand/.
// brand/<v>.head.html is that version's head.html pasted verbatim, with the app-scale meta above it; the plugin puts it
// where an entry page says <!-- %BRAND_HEAD% -->, pointed at VITE_BRAND_URL, and without the app-scale meta for
// builder.html, which is a page at the reading scale. src/brand.ts reads the same two values for the header lockup,
// the default theme and the fonts the capture embeds (the rules are src/brandurl.ts, tests/brandurl.test.ts).
// DEPLOY ORDER: calcofi.io/brand/v3/ (CalCOFI.github.io) has to be live before a v3 build of this app is; until then
// VITE_BRAND=v2 builds what is live today.
process.env.VITE_BRAND = brandOf(process.env.VITE_BRAND);
process.env.VITE_BRAND_URL = brandBase(process.env.VITE_BRAND_URL);
const brandHead = (): Plugin => ({
  name: "calcofi-brand-head",
  transformIndexHtml: (html, ctx) => html.replace("<!-- %BRAND_HEAD% -->", headFor(fs.readFileSync(`brand/${process.env.VITE_BRAND}.head.html`, "utf8"),
    { base: process.env.VITE_BRAND_URL, scale: process.env.VITE_BRAND === "v3" && /builder\.html$/.test(ctx.path) ? "page" : "app" })),
});

// Phase-0 spike. The duckdb-wasm bundles are self-hosted: imported with `?url`
// so Vite copies them beside the app (no jsDelivr in the critical path).
export default defineConfig({
  plugins: [react(), brandHead()],
  base: process.env.VITE_BASE ?? "./",
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] }, // ships its own worker + wasm; the optimizer breaks it (so did maplibre-gl 6's module worker — pinned to 5)
  server: { port: 5178, strictPort: true },
  // two pages: the Explorer (index.html) and the Query Builder (builder.html, src/builder/)
  build: { target: "es2022", chunkSizeWarningLimit: 6000, rollupOptions: { input: { main: "index.html", builder: "builder.html" } } },
});
