# Changelog

## Unreleased

- **ramps: every lens now draws the same ramp for the same selection** (WS-R6, plan 2026-09-15 "faces round 2" D4 ·
  Q3). `src/ramps.ts` gained `lensRamp()` and `seriesRamp()` — the map, the contour surface, the section heatmap
  and the section's 3-D curtain call `lensRamp(sel)`; the year strip's cruise calendar calls `seriesRamp(sel)` (it
  never draws an anomaly, so it always gets the variable's own ramp). Fixed: the section heatmap
  (`SectionPlot`, `src/charts.tsx`) drew Plotly's built-in `"Viridis"` for every env variable and a hand-rolled
  five-stop diverging scale (`RAMP_DIV`, removed) for its anomaly, instead of `ramps.ts`'s rule and `balance`; the
  section's 3-D curtain (`Curtain3D`, `src/curtain.tsx`) had the same bug; the year strip's cruise calendar
  (`YearStrip`, `src/charts.tsx`) called `colorScale()` with no ramp id at all (silently `viridis` for every
  variable). The Layers card's ramp picker (`src/layers.tsx`) computed its own slightly different copy of the
  default-ramp expression (missing the `realm === "env"` guard on the anomaly condition) — it now calls
  `lensRamp()` too, so there is exactly one rule. Added `rampPlotly()` (`src/ramps.ts`) so a Plotly panel paints
  the same 11-stop ramp the map/contour lenses draw. New `tests/ramps.default.test.ts` (`npm test`, via a new
  `vitest` devDependency — the repo had no test runner before this).
