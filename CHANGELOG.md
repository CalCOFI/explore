# Changelog

## Unreleased

- **a depth × time anomaly card** (explore#28 part 2, Rasmus Swalethorp: "an anomaly plot with depth on the y and time on
  the x axis"). An *Anomaly · depth × time* pill above the Time panel opens a card (`show=depthtime`, so a permalink
  reproduces it; `max=depthtime` fills the map with it): x is the cruise season (the cruise's year and quarter), y the
  10 m depth bin increasing downward, the colour the mean departure from the 1993–2013 normal over the observations in
  each cell, on the map lenses' diverging ramp (cmocean *balance*, a 5–95 % window symmetric about 0). It reads #22's
  `slice_anom` (`sql/anom_depth_time.sql`), so each observation has its own station × cruise month × depth bin normal
  subtracted before pooling, and no baseline is re-derived; a cell with no baseline is blank, never 0, and its hover says
  so. It follows every filter in force — years, season, depth band, datasets and the Area (the standard grid or a
  region) — and the *month · season* baseline toggle in its header (`base=season`, written whatever the lens while the
  card is open). Hover: the season, the bin ("50–60 m"), the anomaly with its unit, n and the cruise. An organism, a
  per-cast variable or a variable without a climatology gets the reason instead of a plot. Share › Copy code and the
  download bundle add `05_anom_slice.sql` and `06_anom_depth_time.sql` while the card is open, reading the release's
  climatology objects by URL. `src/depthtime.ts`, `tests/depthtime.test.ts`. The bottom-edge pills now sit above an open
  Time panel (they were hidden under it).

- **the season is the cruise's quarter** (fix, explore#17). The season filter used each cast's calendar date
  (`quarter(datetime)` in `sql/slice_cast.sql`; the release's calendar `quarter` on obs_env / obs_bio through
  v2026.10.08), so with `q=3` the inshore line 93.3 stations of 2026-07-3322, worked on 30 June, vanished. Every slice
  now takes `year` / `quarter` from the cruise_key (`{{cruise_year}}` / `{{cruise_quarter}}`, built-in tokens of
  `src/sqltpl.ts`; the calendar only for a missing or malformed key), and the month-resolved year filter and the year
  strip's month bins read the cruise's month — the same rule calcofi4db 4.24.0 applies at release, so this is a no-op on
  the next release and the fix on older ones (`tests/season.test.ts`).
- **a monthly or a seasonal normal** (Rasmus Swalethorp, 2026-10-06). Beside *difference from the 1993–2013 normal*, a
  *month · season* toggle (`base=season`) subtracts the cruise's quarter (`season_mean`, pooled by `season_n`) instead of
  its month (`clim_mean` by `clim_n`); captions say which ("the 1993–2013 July normal" / "Jul–Sep normal"). A NULL
  `clim_mean` (the month under the 5-cruise floor while its quarter passes) is "no monthly baseline", exactly like an
  absent row (`anomaly.ts climBaseSql()`, `sql/section_clim.sql`). The season needs the release's `season_*` columns
  (calcofi4db 4.24.0+), found by a column probe; on v2026.10.08 the toggle is disabled and says why.
- **anomalies in Hexagons and Contours, per-cast derived products included** (Rasmus Swalethorp, 2026-10-07). An env
  variable's anomaly is no longer Sections-only: `sql/anom_slice.sql` subtracts each observation's own cell (dataset,
  station, cruise month or quarter, depth bin — NULL-safe for a per-cast value — and type) before anything is pooled,
  into `slice_anom`, which `hex.sql`, `station.sql` and `contour_cast.sql` read (`{{tbl}}`). An observation with no
  baseline drops out, never 0; the lens options and the legend say what share had one (`sql/anom_share.sql`). The ramp
  is cmocean *balance* on a window symmetric about 0 (`ramps.ts drawsAnomaly()`), for the value and percentile surfaces
  and the hexagon mean / median, never for a count, an error or a year. A per-cast value is matched on its cast's
  grid_key (sample_root has no site_key; the climatology's grid_key is its station's modal cell, 81 stations in 81
  cells for calcofi_ctd-derived in v2026.10.08); on a release without per-cast climatology cells the checkbox is
  disabled and says why. The title sentence carries the same choice as a chip.

- **"N observations in view" counts what the map summarizes** (fix; `sql/count.sql`, `tests/strip.sql.test.ts`). The
  legend, the Select card's foot and the phone sheet showed the pick's whole-release total from the picker, whatever
  the years, season, depth band, datasets or Area. They now count under every filter in force; the Sections and
  Cruises lenses count what they draw (one line, one cruise). The default view reads lower than before because the
  0–500 m band and the quality flags now count too. The dataset pills keep the picker's totals.
- **the Depth panel says why it is empty** (fix). It said "depth-integrated net tows" for any pick without depth rows,
  a CTD variable included. Now: "no observations under these filters: …" when the filters leave nothing (spice in
  2025 Q3, explore#29), "one value per cast" for a per-cast variable, "depth-integrated net tows" for net tows only, and
  "no depth on these values" for surface or weather measurements. The depth band stays editable when the selection is
  merely empty, and the empty-result note names the Area too.

- **an Area filter** (explore#20; `src/area.ts`, `sql/area_regions.sql`, `tests/area.test.ts`). Refine › Area confines every
  lens, both strips and the download to one part of the ocean through a new `{{area_filter}}` in `sql/_filters.sql`:
  *everywhere*, the **standard grid** (`area=std`, the grid's `pattern = standard` cells, lines 76.7–93.3, the same
  footprint every cruise; `area=std,ext` adds the extended lines 60–73.3), the **map view** frozen as a lon/lat box
  (`area=box:w,s,e,n`), or a **region** (`area=in:layer|name`) of any layer the release intersected with its samples,
  grouped as the Layers card groups them, exact per sample through `sample_spatial`. A boundary layer the release has
  not intersected (the US EEZ in v2026.10.08) is listed but cannot be picked. The title sentence gains "· within …", the
  map outlines a box or region in yellow, and a link that names an area waits for it rather than draw everything first.
  The Regions lens accepts any intersected layer in `layer=`, not only four.
- **the Time strip's mean ± se is per season, across station means** (explore#21; `sql/years.sql`, `tests/strip.sql.test.ts`).
  Four points a year, one per quarter (`tbin=year` and the *season · year* toggle keep one a year). The mean and its
  standard error are now over each station's mean in the bin, so the band shows how the stations differ instead of
  shrinking with every bottle. Hover names the season, the stations and the cruises. A season filter spaces the line
  by the kept quarters, so Q1 alone draws one connected line.
- **a season with no point says why** (explore#23; `sql/cruise_seasons.sql`). In mean ± se by season, a grey × marks a
  season no cruise sailed (January 2022, spring 2020); an amber ring marks one where a cruise sailed but the view has
  none of the pick (bottle data after May 2021, the preliminary 2025–26 CTD cruises without corrected oxygen), with the
  cruises named in the hover.
- **the Sections legend says what the section shows** (fix, explore#12; `src/anomaly.ts sectionRange()`). It read the
  map's station rows, which this lens never refreshes, so the first pick's range (106.31) stayed under every later
  variable's unit. It now takes the section's own range, symmetric about 0 as a difference from the normal.
- **year and depth boxes keep what you type** (fix, explore#26; `src/ranges.ts`, `NumInput` in `src/ui.tsx`). A cleared
  box stored 0 and then showed "01973"; a box now commits on Enter, on leaving it, on a spinner step or on a whole
  four-digit year, and every half-typed year no longer runs a query. A `years=1973-1973` link now reopens as 1973, not
  as all years.
- **‹ › step the year window** (explore#27; `YearRange`). Beside the year boxes in Refine and the title sentence's year
  chip: one year steps by one (1973 → 1974), a range by its own width (1974–1987 → 1988–2001), held inside the record.
  The feedback box is labelled "Your feedback (what happened, what you expected, or an idea)".
- **the spline is the default contour method** (explore#24). `interp=` defaults to `tps` (station grid); the buttons
  read spline · kriging · IDW. A link with `interp=ok` or `interp=idw` draws what it did; one with no `interp=` now draws
  the spline.
- **"Sea temperature"** (explore#25): the unified bottle + CTD temperature's label; `var=temperature` is unchanged.

- **a Lines layer on the 2-D map** (`lines=on`; `src/gridkey.ts` `lineThreads()`, `src/map.tsx`, `src/layers.tsx`,
  `tests/gridkey.test.ts`, `tests/obs.test.ts`; Erin Satterthwaite, 2026-10-02: "a map of the CalCOFI stations (and
  lines, if possible)"). A *Lines* row in the Layers card threads each line through its official stations in station
  order, a white hairline on a dark halo, and writes its name ("line 93.3") just past both ends. It draws in every
  lens, above the data and under the Observations, and stays on with *Data* off, so `data=off&obs=on&lines=on` is
  the sampling, the lines, the sea floor and the boundaries alone. Historical cells (`…_hist`) are not threaded
  (they ran lines across Baja California into the Gulf), nor is a station on a line of its own. The labels use a
  system sans-serif, because a web font that has not loaded yet leaves deck's glyph atlas empty.

- **an Observations layer, independent of Data** (`src/layers.tsx`, `src/map.tsx`, `src/state.ts`,
  `tests/obs.test.ts`; Erin Satterthwaite, 2026-10-05: "a black dot at the 'center' of these clusters and just have a
  basemap that is the ocean floor (not temp)"). A new *Observations* row in the Layers card draws every site in the
  selection (each cast, tow or site at its own position, the Contours lens's site grain) as a dot of a chosen colour,
  black by default, in every lens and on top of the data and the boundaries. It stays on when *Data* is off, so
  `data=off&obs=on` shows where the ship sampled over the sea floor, the wind, oil and gas and aquaculture layers, and
  nothing else. The URL carries it as `obs=on` (black) or `obs=<hex>`. With *Data* off the legend says "data off"
  instead of drawing a colour bar it no longer uses, and with *Observations* on it shows the dot.

- **the bundled layers fallback is generated again, from the latest release** (`scripts/dev_spatial_layers.R`,
  `src/spatial_layers.fallback.ts`). The script hard-coded v2026.08.25 and the retired explore-dev cut, and failed once
  that local copy was gone. It now reads `spatial` and `sample_spatial` from the release `latest.txt` names (or a
  version argument) by their catalog paths, and no longer uploads to `explore-dev-root/`. The fallback is v2026.10.08:
  the six gazetteer rows come from the CSV (calcofi4db 4.23.0, workflows#163) instead of a hand merge, and now carry
  feature counts and bboxes (wind leases 52, rescinded 3,325, OCS planning 27, Program 11 draft 20, O&G leases 34,
  SoCal AOAs 10); membership counts follow v2026.10.08.

- **spatial-layer rows may point at the oceanmetrics gazetteer** (`src/spatial_registry.ts`, `tests/spatial_registry.test.ts`).
  A `source_type = pmtiles` registry row now honours an optional absolute `source_url` (instead of
  `${pmtiles_base}${source}.pmtiles`), a `source_layer` (the vector layer inside the archive, when it is not `source`)
  and `popup_fields` (feature properties the hover popup lists under the name); with none of them the row draws as before.
  `boem_wind_planning` keeps its slug but is now "BOEM Wind Leases" from
  `https://storage.oceanmetrics.io/gazetteer/boem_wind_leases/places.pmtiles` (popup: lease name, status, status date);
  new boundary rows `boem_wind_planning_rescinded`, `boem_ocs_planning`, `boem_program_11_draft`,
  `boem_pacific_og_leases`, `noaa_aoa_socal` read `gazetteer/<slug>/places.pmtiles`. The bundled snapshot's gazetteer rows
  replace a release sidecar row of the same id that has no `source_url` (`mergeRegistry`), so old links keep drawing a
  wind layer. An unreachable archive logs one warning and leaves the layer empty. The Regions lens no longer offers
  the wind layer (the gazetteer rows carry no sample memberships).

- **the anomaly is matched on the cruise's month, never the cast's calendar month** (fix). `sql/section.sql` now
  emits `month = TRY_CAST(substr(cruise_key, 6, 2) AS INTEGER)` — the month SWFSC designates in the `YYYY-MM-NODC`
  key — and the 2-D section and the 3-D curtain key the baseline through one rule (`src/anomaly.ts`). A cruise that
  begins on a month's last days occupies its first stations in the month before: 2026-07-3322 worked line 93.3's
  stations 26.7–45 on 2026-06-30, looked up a June climatology that no 1993–2013 cruise made, and drew them blank;
  they now subtract the July baseline (`tests/anomaly.test.ts`). Tooltips say "the cruise's month", and the cruise
  floor they quote is the release's 5 (`CLIM_MIN_CRUISES`; `min_cruises = 5L` at release), not 3.

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
