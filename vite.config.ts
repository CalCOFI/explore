import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

// the brand the build wears (plan 2026-08-30, Phase 2): VITE_BRAND = v1 | v2, default v2 since the flip (2026-09-04); v1 only on request.
// brand/<v>.head.html is that version's head.html pasted verbatim (v2 with the app-scale meta above it);
// the plugin puts it where index.html says <!-- %BRAND_HEAD% -->, and src/brand.ts reads the same value
// for the header lockup, the default theme and the fonts the capture embeds. pages.yml builds both.
process.env.VITE_BRAND = process.env.VITE_BRAND === "v1" ? "v1" : "v2";
const brandHead = (): Plugin => ({
  name: "calcofi-brand-head",
  transformIndexHtml: (html) => html.replace("<!-- %BRAND_HEAD% -->", fs.readFileSync(`brand/${process.env.VITE_BRAND}.head.html`, "utf8").trim()),
});

// Phase-0 spike. The duckdb-wasm bundles are self-hosted: imported with `?url`
// so Vite copies them beside the app (no jsDelivr in the critical path).
export default defineConfig({
  plugins: [react(), brandHead()],
  base: process.env.VITE_BASE ?? "./",
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] }, // ships its own worker + wasm; the optimizer breaks it (so did maplibre-gl 6's module worker — pinned to 5)
  server: { port: 5178, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
});
