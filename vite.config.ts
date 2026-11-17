import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

import { brandBase, brandOf, headFor } from "./src/brandurl";
import { appOf, queryAddress, redirectHtml, QUERY_LIVE } from "./src/queryurl";

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

// WHICH PAGES A BUILD HOLDS (src/queryurl.ts has the rules, tests/queryurl.test.ts pins them):
//   npm run build                       the Explorer (index.html) and the Query Builder beside it (builder.html) → dist/
//   VITE_QUERY_URL=<its own address>    the same, but builder.html is a small page that redirects there with the link's
//                                       query string and fragment (the Query Builder is not built into dist/ at all)
//   npm run build:query (VITE_APP=query) the Query Builder alone, emitted as index.html → dist-query/, for its own
//                                       address (calcofi.io/query/, deployed by the thin repo CalCOFI/query)
const APP = appOf(process.env.VITE_APP), QUERY_URL = queryAddress(process.env.VITE_QUERY_URL);
process.env.VITE_APP = APP;
process.env.VITE_QUERY_URL = QUERY_URL;
/** the Query Builder's own build: its one page is the folder's index, and names its live address as canonical */
const queryAsIndex = (): Plugin => ({
  name: "calcofi-query-as-index", enforce: "post",
  transformIndexHtml: (html) => html.replace("<!-- %CANONICAL% -->", `<link rel="canonical" href="${QUERY_LIVE}">`),
  // a bundle entry cannot be renamed in place: the page is taken out and emitted again under the folder's index
  generateBundle(_, bundle) {
    const h = bundle["builder.html"];
    if (!h || h.type !== "asset") return;
    delete bundle["builder.html"];
    this.emitFile({ type: "asset", fileName: "index.html", source: h.source });
  },
});
/** the Explorer's build once the Query Builder has its own address: builder.html stays, as the redirect */
const builderRedirect = (): Plugin => ({
  name: "calcofi-builder-redirect",
  generateBundle() { this.emitFile({ type: "asset", fileName: "builder.html", source: redirectHtml(QUERY_URL) }); },
});
const pages: Record<string, string> = APP === "query" ? { builder: "builder.html" } : QUERY_URL ? { main: "index.html" } : { main: "index.html", builder: "builder.html" };

// Phase-0 spike. The duckdb-wasm bundles are self-hosted: imported with `?url`
// so Vite copies them beside the app (no jsDelivr in the critical path).
export default defineConfig({
  plugins: [react(), brandHead(), ...(APP === "query" ? [queryAsIndex()] : QUERY_URL ? [builderRedirect()] : [])],
  base: process.env.VITE_BASE ?? "./",
  publicDir: APP === "query" ? false : "public",   // public/ holds the Explorer's land outline; the Query Builder draws no map
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] }, // ships its own worker + wasm; the optimizer breaks it (so did maplibre-gl 6's module worker — pinned to 5)
  server: { port: 5178, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 6000, outDir: APP === "query" ? "dist-query" : "dist", rollupOptions: { input: pages } },
});
