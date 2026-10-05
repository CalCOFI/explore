# Changelog

## Unreleased

- **the redrawn station grid (release v2026.10.04, WS-1004J1)**. The grid now has one Voronoi cell per official
  station (SCCOOS inshore stations included, each on a "line" of its own: 81.7, 81.8, 85.4, 86.8, 88.5, 91.7, 93.4)
  plus the historical cells, with decimals in `grid_key` and a `grid_crosswalk` from the previous grid
  (`src/gridkey.ts`, `tests/gridkey.test.ts`):
  · the *line* menu offers only lines with two stations or more (`sectionLines()`); a `line=` link to a one-station
    line opens the nearest line with a section and says so under the menu; a click on such a station in *Sections*
    opens its card instead of switching to a section that cannot be drawn; the tooltip and card title say
    "on a line of its own — no section"; the 3-D curtain draws no one-point thread or doubled label for it.
  · a saved `station=` link resolves through `grid_crosswalk`: a key gone from the grid opens the new cell with the
    largest share of the old one, a key redrawn below 90 % of its old area stays, an unknown key stays with an empty
    card — the card says which, every time.
  · `sql/slice_bio.sql`'s line / station regex was already decimal-, sign- and `_hist`-safe (obs_bio has no line /
    station column); it is now pinned by a test, and agrees with `grid.line` / `grid.station` for all 225 cells.
- **Hexagons draw a per-cast variable** (explore#13, Hexagons part): `sql/slice_cast.sql` takes `hex7` from
  `sample_root` (`{{root_hex7}}`, a column probe in `App.tsx`; NULL on an older release, where the lens still says
  why it is empty). *Copy code* hands over the same. `scripts/smoke_release.mjs` checks it, and reads the table
  store beside `SMOKE_RELEASE_PREFIX` so it runs against a staging cut.
- **the per-cast grain: derived products that are one value per cast** (WS-1002E, plan 2026-10-02 D2, explore#13;
  design in [`docs/cast-grain.md`](docs/cast-grain.md)). The `calcofi_ctd-derived` dataset's per-cast products
  (v2026.10.01: three mixed-layer depths, the chlorophyll maximum and its depth, the integrated chlorophyll and the
  depth it reached) live in `sample_measurement`, which no lens read. The app now joins `sample_measurement` ⋈
  `sample_root` itself (`sql/slice_cast.sql`) into the same `slice` the bio and env realms build, so every lens
  template runs on it unchanged; the depth columns are NULL, so the depth band never filters a per-cast value and the
  title sentence, the legend and the figure stamp carry no depth clause. What is per-cast, and its label, units,
  definition and ramp, come from the release's `measurement_type` registry (`src/castgrain.ts`) — no measurement-type
  name is in the app. The variable picker gains a **Derived (hydrographic)** group (the per-bin spice and averaged
  sigma-theta sit in it too), a `derived` badge and the registry's definition on hover; the sentence says
  "(derived, one value per cast)"; a line under the picker links the dataset page. Stations, Contours, Cruises and
  Regions draw a per-cast variable; Sections and Hexagons say why they do not. *Share › Copy code* and the download
  bundle hand over the same join against the release's object URLs (R and Python parity on the real release:
  97 stations, max |diff| 1.4e-14). `measurement_qual` goes through `qualOkSQL()` (`src/qual.ts`), a byte-for-byte
  twin of `calcofi4r::cc_qual_ok_sql()`.
- **ramps: a per-cast depth draws `deep`** — `defaultRamp()` / `lensRamp()` / `seriesRamp()` take an optional registry
  hint (`RampHint`): a per-cast variable in metres is a depth, whatever its name says (`mld_sigma_theta_003` matched
  `/sigma/` and drew `dense`, `mld_temperature_02` drew `thermal`, `chl_max_depth` drew `algae`). Per-bin variables
  pass no hint and are unchanged.
- **tests run the SQL**: `src/sqltpl.ts` (the template renderer, moved out of `engine.ts`) and `src/reproduce.ts`
  (the *Copy code* / bundle SQL, moved out of `bundle.ts`) are pure, so `npm test` renders the lens templates and the
  copied SQL and runs them in duckdb-wasm's node build — the engine the browser ships — on synthetic fixtures
  (`tests/castgrain.sql.test.ts`, `tests/reproduce.test.ts`, `tests/qual.test.ts`, `tests/castgrain.test.ts`).
- **`scripts/smoke_release.mjs` fails when it should**: it compared the page to a constant (`v2026.09.04`), so every
  release since read `hasVersion: false`; it now reads `latest.txt`, runs a per-cast pass (the variable the app lists
  from the registry: every value placed and counted, no depth clause, the copied SQL carrying the join) and exits 1 on
  any failed check. `scripts/verify.mjs` gains `--headless` and twelve `g_cast_*` states.
- **fixed: an empty section threw on every resize** — `SectionPlot`'s relayout handler set `xaxis2.range` on a plot
  with no trace on that axis ("Cannot read properties of undefined (reading '_template')"); live for any variable
  with no rows on the chosen line, and always for a per-cast variable.
- `DS_SHORT` names `calcofi_ctd-derived` ("CTD derived"); the picker's *by dataset* tree showed the raw key.

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
- **ramps: two `defaultRamp()` regex-order bugs** (WS-R2 parity check, copying the rule verbatim into the landing
  site's `RAMP_OF`): `sigma_theta` matched `/temp|theta/` before `/sigma|dens/` and drew thermal instead of dense —
  density is now tested first. `wind_dir_deg` matched `/wind/` and drew the speed ramp — a direction is not a
  speed, so `/wind|speed|current/` now excludes anything matching `/dir/` and falls to the default (viridis).
