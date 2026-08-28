import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phase-0 spike. The duckdb-wasm bundles are self-hosted: imported with `?url`
// so Vite copies them beside the app (no jsDelivr in the critical path).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "./",
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] }, // ships its own worker + wasm; the optimizer breaks it (so did maplibre-gl 6's module worker — pinned to 5)
  server: { port: 5178, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
});
