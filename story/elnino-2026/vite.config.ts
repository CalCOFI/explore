// the story page is its own Vite root, so the Explorer's build (../../vite.config.ts, index.html, dist/) never sees it:
//   npx vite        --config story/elnino-2026/vite.config.ts        live, http://localhost:5180/
//   npx vite build  --config story/elnino-2026/vite.config.ts        the static page capture reads (story/elnino-2026/dist/)
// It imports the app's own modules (src/ramps.ts, src/contour.ts + its worker, src/basemap.ts) rather than copies of
// them, and serves the app's public/ (land.geojson, which src/contour.ts landMask() fetches from BASE_URL).
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

export default defineConfig({
  root: path.join(here, "page"),
  publicDir: path.join(repo, "public"),
  base: "./",
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
  server: { port: 5180, strictPort: true, fs: { allow: [repo] } },
  preview: { port: 5181, strictPort: true },
  build: { outDir: path.join(here, "dist"), emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 6000 },
});
