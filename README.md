# CalCOFI Explorer

Live at **https://calcofi.io/explore/**.

One web app for looking at the integrated CalCOFI database through six *lenses* — **stations**,
**hexagons**, **contours**, **cruises**, **regions** and **sections** — for one **organism** (a taxon, from the net tows
and censuses) or one **ocean variable** (from the bottle, CTD, carbonate and weather series) at a time.
Everything runs in your browser: the SQL executes in DuckDB-WASM against the frozen release, so there is
no server between you and the data, and the same bytes `calcofi4r` / `calcofi4py` read.

The design history lives in two planning documents in the `workflows` repo
(`.claude/plans/2026-08-28 CalCOFI Explorer …` and `2026-08-29 CalCOFI Explorer UI …`); this README
says what the app does and how to work on it without needing them.

## Using it

- **The map is the page, and everything else floats over it.** The **title sentence** at the top says what
  the map shows in plain words — *"Pacific sardine (pilchard) larva, the mean per 10 m² of sea surface at
  each station, all years · all seasons."* — with the colour scale and the observation count beside it. Its
  ▾ opens the sentence as the controls: every part becomes a chip whose popover is the same picker the
  *Controls* panel holds, so the two cannot disagree; opening one folds the other. The *Controls* panel
  (top-left) has three tabs — **Select** (Biology or Environment, the organism or variable, *View as* the
  six lenses (the active one full size, the others as icon slivers), and *More options* for the summary statistic, how counts
  are standardized, whether zeros are counted, the dataset pills and the sources — a disclosure that
  remembers its state), **Refine** (years, season, depth band, datasets) and **Share**. *Time* floats along
  the bottom and *Depth* starts folded to a pill on the right edge; both are brushes — drag on them to
  filter the map to a span of years or a depth band. **Every panel moves** (drag its bar; double-click sends
  it back to its place), **collapses** to a labelled pill on the nearest edge, **expands** to fill the map
  (Esc restores) and **resizes** from its edges or corner. Under 900 px (a phone) the *Controls* panel is a
  bottom sheet and the strips are pills on the map's edge.
- **Depth signals; it never opens itself.** The pill is quiet when a pick has no depth axis (a
  depth-integrated net tow), lights up the moment a pick sampled at depth arrives — the band in its label, a
  sparkline of the mean profile, one pulse — and carries the band with a reset once you brush one. The
  panel opens only when you click it, or when a shared link names a band (`depth=`).
- **Adding a second variable** (*+ Add a variable*, in step 1 of the lean panel, in every view). The comparison is
  by hexagon: the added water measurement is averaged into the same hexagons as the first pick
  (`lens=hex&var2=…`). In the Hexagon view the button is plain; in any other view it reads *+ Add a variable
  (Hexagon view)* and a press switches the map to hexagons before its picker opens; closing the picker without a
  choice puts the view back. A variable already added stays through a change of view: its card says *Shown in the
  Hexagon view*, with a *Show* link, and the downloads carry it in the Hexagon view only. The classic layout has
  no picker for it; a link with `var2` still draws it there (`src/addvar.ts`, `tests/addvar.test.ts`).
- **Picking an organism or variable.** The picker opens as a **tree folded by category** — each category
  one row with its icon, item count, year span and a log-scale bar of how much data it holds — with the
  current pick shown under its own category and a *"… N more"* row for the rest. Click a category to open
  it in full; type to search within the tree; the *Search* tab is the flat A–Z list with sort and grouping
  for when you know the name.
- **Nothing is averaged across things that should not be averaged.** Biology views are one taxon × one
  life stage × one *denominator*: **per 10 m² of sea surface** (count × standard haul factor ÷ proportion
  sorted — the CalCOFI larvae-per-10 m² standard, for oblique and vertical tows), **per 1000 m³ strained**
  (count ÷ proportion sorted ÷ volume strained × 1000 — for manta tows and any tow with a flowmeter) or
  the **raw count** (not comparable across gear or datasets). The denominator line under the picker says
  which is in force, for which datasets, and how many observations it excludes; open it for the formulas.
  One pill per dataset × stage; a ⚠ pill is a raw count with no effort in the release. The default stage
  and denominator follow the same rule as `calcofi4r::cc_default_stage()` / `cc_default_denominator()`.
- **A derived variable says so, and a per-cast one has no depth.** The *Derived (hydrographic)* group in the variable
  picker holds what the `calcofi_ctd-derived` dataset publishes: values computed from the CTD profiles rather than
  measured. Two are **per depth bin** (spice, the sensor-pair averaged sigma-theta) and read like any other variable.
  The rest are **per cast** — one number for the whole cast: a mixed-layer depth, the depth and value of the
  chlorophyll maximum, the integrated chlorophyll. A per-cast value is not a depth observation, so the release keeps it
  in `sample_measurement` on the cast's `sample` rather than in `obs_env`, and the app joins it itself
  (`sql/slice_cast.sql`: `sample_measurement` ⋈ `sample_root`) into the same slice every lens runs on. So the title
  sentence carries **no depth clause** — *"Mixed-layer depth, … (derived, one value per cast), the mean at each
  station, all years · all seasons."* — the count is **casts**, the Depth pill says *no depth axis*, and the depth band
  never filters it. *Stations*, *Contours*, *Cruises*, *Regions* and *Hexagons* draw it (Hexagons pool by the cast's
  own H3 cell, `sample_root.hex7`, which the release carries since v2026.10.04; on an older release the lens says why it
  is empty); *Sections* (they cut depth) say why they do not. Hover the word *derived*, the picker row or *how it
  is computed* for the definition — the registry's own `description` and `derivation`, never text written in the app —
  and follow the link to the dataset page for its methods. **Nothing is keyed on a measurement-type name**: what is
  per-cast, its label, units, definition and ramp all come from the release's `measurement_type` registry
  (`src/castgrain.ts`), so a type renamed or redefined in the next release needs no edit here.
  [`docs/cast-grain.md`](docs/cast-grain.md) is the design.
- **A contour is computed in the browser, and it shows its own error.** The *Contours* lens interpolates a point
  summary under the same filters as every other lens — **every site** (each cast, tow or site at its own
  position to 0.01°, repeat occupations pooled; `sql/contour_cast.sql`), or the **station grid** (one point per
  `grid_key` cell; `grain=station`) — into a surface in a Web Worker (`src/contour.worker.ts`, plain typed arrays, no library): a **thin-plate spline**, the
  default (mgcv's `s(lon, lat)` basis, the smoothing picked by GCV — the GAM `calcofi4r::pts_to_contours_gam()` fits;
  station grid only), **ordinary kriging** (an exponential variogram fitted by weighted least squares; `interp=ok`) or
  **IDW** (power 1.3, what the superseded Contour Explorer drew with `terra::interpIDW`; `interp=idw`). At the site grain kriging and IDW take the **24
  nearest points within 180 km per cell** (one small solve each, so the error comes free; ≈ 1 s for 12,000 sites);
  at the station grid every point is in one system (≈ 0.3 s, the error surface ≈ 3 s more). The *surface* menu draws the statistic itself, **its error** (the
  kriging standard deviation, or the spline's standard error — IDW has none, it is a weighted average, not a model),
  the **observation density**, the **first / last year sampled**, the **5th / 95th percentiles** or their
  **spread** — each interpolated the same way from the station table (`sql/station.sql` now carries `p05` / `p95`).
  The isolines take a darkened version of the ramp colour at their level, so they stand out of the surface without
  fighting it. **Contour labels** (on by default; `labels=off`, a checkbox in the options and a row in the Layers card)
  write the level along each isoline in white on a dark halo, rotated to follow it, one per ~260 px of line and never
  within 70 px of another, so their density follows the zoom. The **inputs** (the sites or stations the surface was fitted to) are a layer of their own — *show the inputs* in the
  options and a row under *Data* in the Layers card, `inputs=on|off`; on by default for the station dots, off for
  thousands of sites. The fit line under the method reports the
  **leave-one-out RMSE**, the variogram (nugget · sill · range) or the effective degrees of freedom, and the time it
  took. A cell farther than 60 km from any point is blank, the edge fades over the last 15 km, and **land is clipped**
  (Natural Earth 10 m land, bundled as `public/land.geojson`, rasterised onto the grid) — the map never extrapolates, and never over land. `interp=`, `grain=` and `surface=` are in the URL; the map's CSV is the point table the surface
  interpolates. **One algorithm, three runtimes:** `calcofi4r::cc_interpolate()` and
  `calcofi4py.interpolate()` are the same code by hand, pinned by `scripts/parity/contour_fixture.json` — written by
  the worker itself (`node scripts/parity/contour_fixture.mjs`) and copied byte-for-byte into both packages'
  test fixtures — so a surface made in R or Python matches the map cell for cell.
- **Lines is a layer of its own** (`lines=on`): each CalCOFI line threaded through its official stations in station
  order and named at both ends (`lineThreads()` in `src/gridkey.ts`, the rule the 3-D curtain draws at the surface),
  independent of the *Data* row. Historical cells (`_hist`) and a station on a line of its own are not threaded.
- **Observations is a layer of its own** (`obs=on`, or `obs=<hex>` for another colour): every cast, tow or site in the
  selection at its own position (to 0.01°, `sql/contour_cast.sql`) as a dot, in any lens and on top of everything.
  It is independent of the *Data* row, so `data=off&obs=on` draws the sampling over the sea floor and the boundaries
  with no summary colour.
- **Effort is a layer of its own** (`effort=on`): the survey effort in the release's `sample_track` — each on-effort
  segment as an amber path and the line of sight to each sighted animal as a thinner one — for the selected datasets in
  the time window (by the cruise's month) and, in the Cruises lens, the shown cruise. It never depends on the taxon: it
  is where the observers looked. Absent (the row disabled) on a release without `sample_track`.
- **The data layer has its own rows in the Layers card**: on/off (`data=off` leaves the sea floor and boundaries
  alone), opacity (`datao=`), the **colour ramp** (`ramp=thermal`, `_r` reverses): cmocean's 22 ramps (Thyng et
  al. 2016), viridis and oce's GEBCO ramp, in `src/ramps.ts`; with no `ramp=` the variable picks its cmocean
  convention (thermal for temperature, haline for salinity, algae for chlorophyll, dense for density, tempo for
  nutrients, ice for oxygen; viridis for biology) — and its **place among the boundary layers**: the *Data* row under
  *On the map* drags like any boundary, and `layers=noaa_onms_sanctuaries,data` draws the sanctuaries over the data.
  deck.gl runs **interleaved** inside MapLibre's own layer stack for this (D36), which also puts the data under the
  basemap's labels.
- **One lens at a time in the Controls panel.** *View as* shows the active lens full size with a line under it and
  the other five as icon slivers; click any of them to open the six as rows with their help text, pick one, and it
  closes. Switching between Stations and Hexagons still travels the dots (the one morph that shows pooling); every
  other switch is a short cross-fade.
- **A section's y-axis is the realm.** In *Environment* the *Sections* lens draws a **depth section** — the
  stations along one CalCOFI line across the x-axis, depth down the y-axis, for **one cruise** (optionally as
  the anomaly against the 1993–2013 climatology), with the 3-D curtain beside it. In *Biology* the tows are
  **depth-integrated**, so there is no depth axis: the lens draws a **station-by-year** section — the same
  stations across the x-axis, **years** down the y-axis, **across all cruises**. The title sentence says which
  it is ("as a depth section along line 90 on cruise …" · "as a station-by-year section along line 90 across
  all cruises"), and so do the card title and the figure title.
- **A section is laid out like the map, and carries both rulers.** *Sections* draws **offshore on the left,
  the coast on the right** — a CalCOFI line runs west-south-west off the coast — and labels the x-axis
  **station number above, distance offshore below**. The two are one ruler: `+proj=calcofi` is equidistant
  along a line at **7.386 km = 3.99 nmi (4 nautical miles) per station unit**, measured constant to 0.02 %
  over the 665 km of line 90, so the axis is linear in both at once. It is linear rather than categorical
  for that reason: spacing stations evenly by index drew 80 → 90 (74 km) as wide as 30 → 35 (37 km).
  [ctd-transects](https://calcofi.io/ctd-transects/) draws the same section the same way.
- **A section needs two stations.** The *line* menu offers every line of the release's grid with at least two cells.
  Since v2026.10.04 the grid has one cell per official station, and the SCCOOS inshore stations each sit on a "line" of
  their own (93.4, 86.8, 88.5 …): those are stations — on the map, in the station card ("on a line of its own — no
  section") — never a one-column section. A `line=` link to one opens the nearest line that has a section and says so;
  clicking such a station in *Sections* opens its card instead of switching the line.
- **A saved station link follows its cell.** v2026.10.04 redrew the grid, so a `station=` key from an earlier release
  may name a different polygon or none. The app resolves it through the release's `grid_crosswalk` (`src/gridkey.ts`):
  a key that is gone opens the new cell holding the largest share of the old one, a key that was redrawn below 90 % of
  its old area stays, and a key nobody knows stays selected with an empty card — each with a line on the card saying
  which. It never shows a different area without saying so.
- **An anomaly is a departure from one fixed baseline.** In the *Sections*, *Hexagons* and *Contours* lenses,
  *difference from the 1993–2013 normal* (`anom=1`) subtracts the release's own `climatology` table
  (`calcofi4db::build_climatology()`): the mean for that station, the **cruise's month** (the MM of its
  `YYYY-MM-NODC` key, never the calendar day a station was worked) and its 10 m depth bin over 1993–2013, kept only
  where at least 5 cruises contribute — the same table [ctd-transects](https://calcofi.io/ctd-transects/) subtracts,
  so the two products cannot disagree. The *month · season* toggle beside it (`base=season`) subtracts the cruise's
  **quarter** instead (Jul–Sep for a July cruise; the release's `season_*` columns, calcofi4db 4.24.0+; on an older
  release the toggle is disabled and says why). The map lenses subtract **each observation's own cell before pooling**
  (`sql/anom_slice.sql`): a hexagon or a contour site is a mean of departures, an observation with no baseline drops out
  (never 0), and the options say what share had one. A per-cast derived variable (a mixed-layer depth) is matched by its
  cast's grid cell, with no depth bin, once the release carries per-cast climatology cells. The year, season and depth
  filters do not touch the baseline (that is what makes anomalies comparable across cruises); the datasets in view are
  pooled weighted by their observation counts. Red is above normal, blue below (cmocean *balance*), the scale symmetric
  about zero; a cell with no baseline is blank, never zero. A section where no cell has one (a cruise whose month never
  reached five cruises at these stations) says so instead of drawing — *"no 1993–2013 March normal at these stations — try
  the seasonal normal, or show as measured"* — and its legend shows no range; the app never switches the baseline itself.
- **The season is the cruise's quarter.** The season filter (`q=`) and the year range's month edges read the cruise's
  designated month, so a July cruise's stations worked on 30 June are in Q3 (explore#17).
- **A preliminary cruise says so, where the release says so.** A view of one cruise (a depth section, the Cruises lens'
  shown cruise) whose dataset in view is not `final` on that cruise wears a pill beside the cruise in the title sentence —
  *Preliminary — CTD & bottle 1 m-binned*, the wording [ctd-transects](https://calcofi.io/ctd-transects/) uses — and the
  cruise picker's rows say *preliminary*; a finished cruise wears nothing. It is the release's `sample_root.data_stage`
  (calcofi4db 4.37.0+), read once from a `sample_root` the session already holds (`src/stage.ts`, `sql/cruise_stage.sql`):
  on a release without that column nothing is read and nothing is shown, and no cruise is ever listed in the app.
- **The URL is the whole view.** Lens, organism or variable, stage, denominator, years, season, depth,
  dataset filter, region, line, cruise, summary statistic, the anomaly and its baseline (`anom=1`, `base=season`), the contour method and surface (`interp=`, `surface=`), the data layer (`data=`, `datao=`, `ramp=`), theme, the sea floor (`bathy=`, `bathyo=`), which panels are folded or maximized (`hide=` · `show=` · `max=`), the years strip's mode (`strip=`),
  the **map extent** (`map=lon,lat,zoom`) and, in the 3-D section, the **camera** (`cam=lon,lat,zoom,pitch,bearing`,
  written once you move it) are all in it — so *Share → Copy link*, a bookmark and a
  feedback report all reopen at exactly the same place. `?tour=off` suppresses the welcome card and tour
  (and opens no modal at all); `?modal=sources` opens *Data Sources &amp; Attribution*, the one modal the URL
  carries, so an attribution link is shareable;
  `?theme=dark|light` sets the theme. The **sea floor** under every lens is GEBCO 2025 (shaded relief +
depth colour + isobaths), drawn from terrain-RGB PMTiles at
`storage.calcofi.io/calcofi-db/bathymetry/` (override with `VITE_BATHY_URL`); the layers button on the
map toggles its parts and opacity, `?bathy=off` reproduces the plain basemap, `bathy=relief,contours`
keeps a subset, `bathyo=0.5` sets its opacity. The style is COMPOSED (CARTO ⊕ sea floor, one object,
`setStyle(diff)`), so a theme flip can never drop the layers — see the 2026-08-31 map-layers plan in
CalCOFI/workflows for how the tiles are built. **The coast is a land mask** (plan 2026-09-09, D47): CARTO's
water fill sinks to the bottom of the style, the sea floor, the boundaries under the Data row and the data draw
over it, then OpenStreetMap's land polygons (`_spatial/osm_land.pmtiles`, the coastline CARTO's own water derives
from) in the background colour, a copy of CARTO's water without the ocean (lakes), and every CARTO land layer
where it was — so nothing spills onto land and roads, county / state / country lines and labels stay on top.
`land=off` restores the old stack (a diagnostic only: the card has no switch for it); `basemap=nolabels` hides CARTO's own text (place names, road names, points of
interest, water names) for a data-centric view — the isobath labels and the registry's label layers stay. CARTO's
text is always toned down (one mid grey at `basemapo=` opacity, 0.6 dark / 0.7 light by default, Regular weight, a
thinner halo, 1 px smaller: its near-white Montserrat Medium out-shouted the data), and gains the **island names**
CARTO's tiles carry but its styles never drew (`place_island` from z8, `place_island_minor` from z10); the names layer draws at 12/10/9 px
and its row's opacity (`layers=gebco_gazetteer::0.45`). **Reference
layers** ride the boundary registry with `role = reference`:
`gebco_gazetteer` (undersea feature names from the IHO-IOC GEBCO Gazetteer, a `label` layer — symbols by rank,
`layers=gebco_gazetteer[:colour]`) and `esri_ocean_reference` (Esri's World Ocean Reference as a `raster` row,
for comparison); the mask itself is never an *On the map* row, and a label row's opacity slider sits under the row. A link without `layers=`
shows the registry's default-visible reference layers (the names, above the data, not in the legend);
`layers=off` shows none; any explicit list is exactly that list.
- **Share** (the *Controls* panel's third tab): **Download data (zip)** hands over the bytes shown, the exact
  SQL against the release's content-addressed object URLs, per-dataset citations and `reproduce.R` /
  `reproduce.py` that run the same query; **Copy code** gives that SQL, or R or Python; **Cite this data**
  copies the citations; **Copy link** copies the view, and **Copy image** / **Download PNG** the whole view
  as a figure with the selection, release and URL stamped in a footer; *Register a product*, *Send
  feedback* and *SQL & timing* live there too. Every panel's bar has its own ⬇ (PNG · SVG · CSV), and the
  map's ⬇ in its top-right row exports the map with its title (PNG) or the table the lens draws
  (CSV) — the map is WebGL, so it has no SVG.
- **Nothing lingers after a lens change.** Switching from Stations to Hexagons travels the station dots to their
  hexagon centres and fades them out as they arrive (the pooling in one move); every other lens change is a short
  cross-fade in place, so a lens never carries dots it does not explain — Sections keeps only its line's stations,
  Contours only the optional inputs, Cruises only its own sampled dots and track.
- **Feedback** (the speech bubble in the header, immediately left of the theme toggle — the shape
  calcofi.io and the docs book wear) captures the view, lets you mark it up (arrow, circle, rectangle, pen,
  text; yellow, blue or hot pink) and sends it with your note, the view URL, release, viewport and theme
  to the team — by mail with the screenshot inline, to a Sheet, and as a public issue in this repo
  *without* your email. Without a configured endpoint the dialog offers a prefilled GitHub issue instead.
- **The header** is the release picker (the word *release* links to the schema and release notes, the bold
  value is a list of the releases), **Help ▾** — the tour, the *Explorer guide*
  ([calcofi.io/docs/explore.html](https://calcofi.io/docs/explore.html)), *Start here* (the welcome), About,
  Data Sources & Attribution, Register a product and Keyboard — then the **feedback** bubble and the theme
  toggle, in that order on every CalCOFI product. The map's own buttons —
  zoom, layers, its ⬇ — sit in one row at the map's top right.
- **Keyboard:** in the 3-D section, once the scene has been clicked, arrows pan, `shift` + arrows rotate and
  tilt, `+` / `−` zoom (the top-right row has the same moves as buttons, and a compass that resets the framing) ·
  `?` replays the tour · `Esc` closes a dialog, the welcome or a chip's popover, or restores an
  expanded panel · `↑ ↓ Enter` in the lists · `A`–`Z` strip to jump in the flat list.

## The Query Builder (`builder.html`)

A second page of the same build (`src/builder/`, a second Vite entry): one CSV of any species and water
measurements, by station, hexagon or region, with no code. It answers Rasmus Swalethorp's wish from the
12 November 2026 database tour ("a gui … that allows you to structure your query … think MS Access style").

- **Each column is one species or measurement from one dataset**, built by the Explorer's own slice templates
  (`sql/slice_bio.sql` with its per-net zero-fill, `sql/slice_env.sql`), so a value here is the value the Explorer
  shows. `src/builder/query.ts` shapes them into one table; `tests/builder.sql.test.ts` runs it on a fixture.
- **Links can pick for the reader**: `builder.html?pick=bio:<dataset_key>:<taxon_key>` or
  `env:<dataset_key>:<measurement>`, repeated or comma-separated; `&download=1` also starts the CSV. calcofi.io's
  dataset pages link this way. A pick the release does not hold shows a notice and nothing downloads
  (`src/builder/picks.ts`, `tests/builder.picks.test.ts`).
- **Units and life stage are per column.** The page's one choice (larva, per 10 m²) fits the ichthyoplankton tows
  only; a dataset that cannot serve it is given per 1000 m³ or as counted, at the stage it records, and the page and
  the column name say so (`resolvePick()`).
- **How rows are matched is said on the page** (the fold of that name) and in *About this table*, a text file with
  each column and its units, the rows kept, the rule and how to cite (`ruleLines()`, `aboutText()`,
  `tests/builder.rule.test.ts`). The words are generated from the parameters the SQL is made from; change the SQL and
  `ruleLines()` together. Two rules are in force:
  - **Stations › Every sample, with a species picked: one row per net, each water dataset's one nearest cast beside
    it** (below).
  - **Every other shape** (yearly, seasonal, monthly, Custom groupings, the Hexagons and Regions lenses, and Every
    sample with water alone): one row per place × time (× 10 m depth step) that any column has a sample for; a cell
    is the statistic of that column's values in the row. Nets are not paired with casts, and the page says so.
- **A depth range ends before its deeper end**: "0 to 10 m" is the first 10 m step only, "0 to 500 m" the fifty
  steps above 500 m (`depthTo()`, `binWhere()`). Until 2026-11-17 the last step was included, so "0 to 10 m" pooled
  0 to 20 m. The Explorer's own depth filter (`sql/_filters.sql`) still includes it.
- One table takes up to 40 columns (`MAX_PICKS`): each is a slice in the browser's memory.

### The Query Builder's own address (`/query/`)

The code stays here (`src/builder/` imports the Explorer's engine, SQL templates, export, citation and area modules);
the page gets its own address, **https://calcofi.io/query/**, served by the thin repo
[CalCOFI/query](https://github.com/CalCOFI/query), whose Pages workflow checks this repo out and builds only the
Query Builder. `src/queryurl.ts` holds the rules, `tests/queryurl.test.ts` pins them.

| build | what it makes |
|---|---|
| `npm run build` | `dist/`: the Explorer (`index.html`) and the Query Builder beside it (`builder.html`), as before |
| `npm run build:query` (`VITE_APP=query`) | `dist-query/`: the Query Builder alone, as `index.html`, with `rel=canonical` to its live address. Its own script is 700 kB (208 kB gzipped) and 12 kB of CSS, against the Explorer's 7,130 kB (2,127 kB) and 237 kB; both ship the same DuckDB-WASM. Set `VITE_BASE=/query/` |
| `VITE_QUERY_URL=https://calcofi.io/query/ npm run build` | `dist/` with `builder.html` as a small **redirect page** (`redirectHtml()`): it goes to that address carrying `location.search` and `location.hash` unchanged, so the dataset pages' `?pick=…&rows=sample&stations=all&download=1` links and anything already shared still land and still download; `noindex`, canonical to the new address, a plain link without JavaScript. The Query Builder is not built into `dist/` at all |

- **Links between the two, one place each** (`src/links.ts`): the Explorer's link to the Query Builder is `QUERY_URL`
  (`VITE_QUERY_URL`, else `./builder.html`); the Query Builder's link to the Explorer is `EXPLORE_URL` (`./` beside
  it; from its own build `<VITE_SITE_URL>explore/`, or `VITE_EXPLORE_URL`).
- **The Explorer links to the Query Builder** under its downloads (*Build a table across datasets · Query Builder*; the
  lean panel's download area, the classic *Share* tab, and the same line on a phone). The link carries the view's
  species or measurement, once per dataset in view, and the lens when it is Stations, Hexagons or Regions
  (`viewPicks()`, `viewLens()`). It does not carry the years, seasons, depth, area, life stage, units or an added
  variable: the builder's links take picks and a shape only, and the link's title says so. A measurement the builder
  does not list (one value per cast) opens it with nothing picked.
- **The SQL console had `/query/` first**: from 2026-08-10 calcofi.io/query/ sent readers on to `/db-query/`. The
  Query Builder's head therefore says *Prefer to write SQL? db-query* (`SQL_CONSOLE`).
- **Going live, in order**: (1) create CalCOFI/query with Pages and let it deploy, then delete the site repo's
  `query/index.html` (the old redirect to `/db-query/`); (2) check https://calcofi.io/query/ answers with the Query
  Builder; (3) deploy the site with its links to `/query/`; (4) set the repository variable `VITE_QUERY_URL` to
  `https://calcofi.io/query/` here and re-run `pages`, which turns `/explore/builder.html` into the redirect. Until
  (4) both addresses serve the app. Setting the variable before (2) would redirect the old address to the SQL console.
- A push here does not start CalCOFI/query's workflow by itself: it runs on a daily schedule, on demand, and on a
  `repository_dispatch` of type `explore-updated` (its README has the one step this repo's `pages.yml` would need).

### How a net is matched to a cast

Ben, 2026-11-17: "We need a time, xy distance, z depth filter for matching, and preference for matching by time vs
distance, and the calculation included in each row." `netSql()` in `src/builder/query.ts`;
`tests/builder.match.test.ts` has one fixture assertion per rule.

**The rule.** Under Stations › Every sample a table that holds a species is one row per net: every net of the
species' datasets that passes the filters, whether or not a cast is found for it. Each water dataset is matched to
the net on its own: of its casts within ± 12 hours and 5 km of the net that have a value in the depth range, the row
takes one, the nearest in time (the nearest in distance breaks a tie). Hours and kilometres are measured between the
samples' own recorded times (UTC) and positions (great circle); station numbers, calendar dates and cruise names
play no part. A water value is the average of that one cast's values in the depth range (0 to 10 m), never of
several casts, and every measurement of a dataset comes from the same cast. A net with no cast inside both windows
keeps its row with that dataset's columns blank; two nets of one visit are two rows and may share a cast.

**The controls** are a group in step 2, *Match water to each net*, shown only when it applies (one row per net, and
water picked): time ± hours, distance km, the water's depth range, and *prefer* nearest in time or in distance. While
it shows it replaces the plain Depth row: the depth range is the water's and does not filter the nets. With a
species alone (the dataset pages' `&rows=sample` links) the table is still one row per net and nothing is matched.

**The calculation in each row.** After the net's own columns (`date`, `cruise`, `line`, `station`, `net_id`,
`net_time`, `latitude`, `longitude`, `tow_type`) and each water dataset's measurements comes one set of columns per
water dataset, ending like its measurements (`_hydrographic_bottle`):

| column | what |
|---|---|
| `cast_id` | the matched cast's id in the release; blank = no cast inside the windows |
| `cast_time` | its time, UTC (of its first value in the depth range) |
| `cast_station` | its own line and station |
| `cast_hours` | cast time minus net time: negative = the cast was taken first |
| `cast_km` | great-circle distance between net and cast |
| `cast_depth_min_m`, `cast_depth_max_m` | the depths of the cast's values used |
| `cast_n_depths` | how many depths those are |

**Why ± 12 hours and 5 km** (release v2026.11.14; nets of `swfsc_ichthyo`, the nearest cast in time on the same
cruise):

| net → cast | nets with a cast on the cruise | hours apart, 50 / 75 / 90 / 95% | km to that cast, 50 / 75 / 90% |
|---|---|---|---|
| ichthyoplankton → bottle | 53,487 | 1.0 / 2.1 / 19 / 117 | 0.4 / 22 / 153 |
| ichthyoplankton → CTD cast | 16,793 | 1.4 / 1.9 / 3.0 / 4.9 | 0.7 / 74 / 111 |
| krill (`cce-lter_euphausiids`) → bottle | 6,417 | 0.8 / 1.7 / 7.3 / 32 | 0.9 / 20 / 164 |
| CUFES → bottle | 23,288 | 2.2 / 3.4 / 38 / 124 | 21 / 39 / 227 |

A net either has its station visit's cast (under an hour or two, under a kilometre) or the nearest cast is another
station's, tens of kilometres off. The windows only have to sit in the gap. Ichthyoplankton nets (69,263) that find
a cast, bottle | CTD:

| | 2 km | 5 km | 10 km | 20 km |
|---|---|---|---|---|
| ± 3 h | 37,512 \| 9,188 | 38,099 \| 9,288 | 38,956 \| 9,330 | 39,833 \| 9,420 |
| ± 6 h | 37,726 \| 9,386 | 38,317 \| 9,495 | 39,180 \| 9,561 | 40,138 \| 9,935 |
| ± 12 h | 37,870 \| 15,525 | **38,466 \| 15,711** | 39,337 \| 15,768 | 40,310 \| 15,849 |
| ± 24 h | 38,134 \| 15,587 | 38,727 \| 15,779 | 39,620 \| 15,843 | 40,633 \| 15,935 |

- **5 km**: 98% of the bottle pairs are within 2 km; 5 km adds some 600 nets whose cast was logged a few
  kilometres away. No station has another within 2 km and 15 of 262 have one within 5 km (the closest pair is
  2.4 km), so a neighbouring station's cast can be taken only at those; at 10 km the casts taken from another
  station label double (1,950 against 1,012).
- **12 hours**: a 6 hour window loses 6,216 of the 15,711 CTD pairs. On the cruises of 1993 to 1999, 2005 and 2006
  (and parts of 2000, 2004 and 2007) the release's CTD cast times sit a median 9 hours before the net at the same
  position, against 1 to 1.5 hours in every other year: local time stored as UTC, by the look of it. That is the
  release's to fix (`calcofi_ctd-cast`); until then `cast_hours` shows it, and 12 hours keeps those visits paired.
  Dropping the cruise from the rule changes 34 bottle pairs of 38,498 and no CTD pair.
- **Nearest in time** is the default; under it 478 nets (1.2%) take a different bottle cast than nearest in distance
  would. Krill nets pair like the ichthyoplankton nets (4,694 of 7,477 with a bottle cast). CUFES samples are taken
  under way, not on station: 2,868 of 47,989 have a bottle cast inside the windows.

**What it changed** (sardine larvae beside bottle temperature, standard grid, every sample): 25,719 nets, 16,479
(64%) with a cast; 391 of those pairs are farther than 2 km, 201 farther than 3 hours, 86 farther than 6 hours, and
808 take a cast of another UTC date. In the unit of the earlier rule (cruise × grid station × UTC date) 13,642 of
18,926 rows (72%) now hold a net with its temperature, against 12,378 (65%). Of the 9,240 nets without one, 8,189
have no bottle cast within 24 hours and 20 km at all (among them most CalVET egg tows, of which 61 of 2,119 are
matched, and the 144 nets after the bottle data ends in May 2021), 659 have one within 12 hours but 5 to 20 km away, 162 one 12 to 24 hours away, and
230 have a cast inside the windows with no quality-checked temperature above 10 m. The table builds in about 2.3 s
in headless Chrome on the Mac mini (`match_nets` prints it).

## Attribution

These are sixteen datasets that people collected, curated and depend on being cited for, and a view
usually **pools several of them** — the statistic is averaged across the datasets that share the chosen
life stage and denominator (never across denominators or life stages). Pooling is exactly why each of
those datasets has to be named, so the app names them everywhere a number can leave it:

- **The welcome states the norm and opens the doors.** A card floating over the live map — no dim — asks
  *What would you like to explore?*: two doors (*An organism* / *An ocean variable* open the *Controls* panel
  on that picker), four real questions (each a view the app already understands, as its URL query — see
  `QUESTIONS` in `src/help.tsx`), **Start exploring** and *Take the tour*. The citation norm is one sentence
  under them — *"These data are free to use and are cited when used: every view names its datasets, and
  Share → Cite writes the citation for you"* — accepted by continuing: every way in stores `explore_cite_ack`
  beside `explore_welcome`. It is **not a gate** — Esc and × enter too. `?tour=on` shows the card again,
  `?tour=off` never shows it (the brand contract's deterministic screenshot); *Help → Start here* brings it
  back.
- **The Sources line** sits in the *Controls* panel's *More options*, under the dataset pills, and the panel's
  footer counts the sources in view: one chip per dataset the view pools — `provider · dataset · licence` —
  that opens that dataset's citation with a copy button.
- **Every figure footer carries three lines**: the selection, `CalCOFI Explorer · release · the view URL`,
  and `Data: <dataset_key, …> · cite: calcofi.io/explore → Cite this data`. PNG (1× and 2×), SVG and the
  whole-view capture all share it (`src/export.ts` `stampLines()`).
- **Every panel CSV carries a `dataset_key` column.** A row that already has one keeps it; a **pooled** row
  gains one holding the datasets it pools, `;`-separated. A column, never a leading `#` comment line — a
  comment breaks `read.csv`, `pandas.read_csv` and DuckDB's `read_csv_auto` alike.
- **Cite this data** (EXPORT group, and the ⋯ menu) copies the release citation plus every dataset in view
  as text or BibTeX (`@misc` built from the release's own fields — the app never fetches to cite).
- **Data Sources & Attribution** (`?modal=sources`, the ❞ button in the header, the ⋯ menu on a phone, and
  from About): one row **per dataset** — never per taxon or per variable, so the phytoplankton dataset is
  one row and not 393 — with its citation, licence, DOI, PIs, acknowledgement, contact and links, the rows
  in view first, and the integrated database's own citation plus one CalCOFI front door in the footer.
- **Register a product** ("I used CalCOFI data in …") is the feedback dialog's second kind: title, link or
  DOI, the datasets in view prefilled, through the same Apps Script → Sheet → mail → public issue pipeline,
  labelled `derived-product`. The Apps Script must read `label` from the payload for the issue to be filed
  under it; the zero-backend fallback link already carries `labels=derived-product`.

All of it reads the release's own `dataset` rows and `catalog.json` through **`src/cite.ts`** — one set of
builders, so the bundle's `CITATION.md`, the modal and the clipboard cannot drift. Nothing is fetched.

**What degrades, and how.** The `dataset` columns `doi`, `license_url`, `acknowledgement`, `contact` and
`source_accessed`, the `provider` table (for `provider_short`) and `catalog.citation` all arrive with the
attribution contract (calcofi4db 3.30.0, workflows WS-A0/A1) in the next release; until then the app runs on
the dev catalog, which has none of them. Each is optional:

| absent | what the app does instead |
|---|---|
| `dataset.doi` | no DOI link; BibTeX omits the `doi` field |
| `dataset.license_url` | the licence chip is plain text, unless the SPDX id is one `cite.ts` knows a URL for |
| `dataset.acknowledgement` | the line is omitted (it is not invented from `citation_others`) |
| `dataset.contact` | no *contact* link; the modal's front door is the only route |
| `dataset.source_accessed` | no "Accessed:" line in the copied citation or the BibTeX note |
| `dataset.citation_main` | "no citation in this release — the dataset's provider question is open", in italics; the copy button disappears |
| `dataset.license` | no licence chip at all (an absent licence is a fact, not a label) |
| a `provider` table | `provider_short` falls back to `cite.ts`'s `PROVIDER_SHORT` map, then to the slug |
| `catalog.citation` | the same wording is built locally from `version` + `release_date` (+ `catalog.doi` when minted), so it matches `calcofi4db::release_citation()` |
| `dataset.parquet` not yet loaded | the Sources line still names the pooled datasets by key |

## Run it locally

```sh
npm install
```

### Preview locally (before pushing)

The app needs a release catalog to read. The deployed site reads the real release
(`https://storage.googleapis.com/calcofi-db/` + `ducklake/releases`, the defaults) since v2026.09.04,
the first release to ship the browser-shaped objects. For development you can still use the
catalog-shaped local copy of the v2026.08.25 objects (built once by
`~/_big/calcofi/explore-spike/data2/build_dev_catalog.R`; the same content is on GCS under
`explore-dev`, which the site read before the flip):

```sh
ln -s ~/_big/calcofi/explore-spike/data2 public/data2      # once
VITE_DATA_URL=data2/ VITE_RELEASE_PREFIX=explore-dev/releases npm run dev
```

then open **http://localhost:5178/**. This is Vite's dev server with hot reload: every saved edit shows
in the browser without a rebuild, so leave it running while you work. Ctrl-C stops it.

For a production-shaped check — the real bundle, same data — build it and serve the build:

```sh
VITE_DATA_URL=data2/ VITE_RELEASE_PREFIX=explore-dev/releases npm run build
npx vite preview --host --port 5179     # http://localhost:5179/  (--host also exposes it to a phone on the same Wi-Fi)
```

`VITE_DATA_URL` is the bucket (or folder) root and `VITE_RELEASE_PREFIX` the releases prefix under it;
unset, they default to the real release on `https://storage.googleapis.com/calcofi-db/` +
`ducklake/releases`, which works too once a release carries the browser-shaped objects.

### Checks

```sh
npm test                                                                   # vitest: the rules, on synthetic fixtures
npx tsc --noEmit                                                           # the type check (npm run build runs it too)
node scripts/smoke_release.mjs https://calcofi.io/explore/ smoke.png       # after a release or a deploy: the promoted release, and the per-cast grain
node scripts/verify.mjs http://localhost:5178/ shots/dev --only=<regex>   # drive the app through its states
node scripts/verify.mjs http://localhost:5179/ shots/prod --timing        # + cold/warm lens timings
node scripts/bundle_check.mjs http://localhost:5178/ shots/bundle          # download two bundles and list them
node scripts/builder_check.mjs http://localhost:4047/ shots/builder        # the Query Builder against the live release (npx vite preview --port 4047)
node scripts/builder_check.mjs http://localhost:4047/explore/ shots/builder --builder=/query/   # the same, at its own address; old_address follows the redirect
node scripts/lean_check.mjs http://localhost:4047/ shots/lean              # the lean panel, every view and download, and the brand's header
node scripts/card_shots.mjs ~/Github/CalCOFI/CalCOFI.github.io/images     # the two themed card screenshots
node scripts/tour_shots.mjs http://localhost:5179/ shots/tour              # the docs/deck pictures: a lens each + the UI close-ups
```

`tour_shots.mjs` writes the pictures the docs book's [Explorer guide](https://calcofi.io/docs/explore.html)
and the update deck use — one per lens (both section shapes, and the 3-D curtain), the two product-card
shots at calcofi.io's own 1200 × 750, and the UI close-ups (the sentence's chips, the three Controls tabs,
the Layers card, a pane's own bar, the Help menu, the Time strip, the Depth profile). Each is named
entirely by URL parameters, so a re-shoot after a UI change is one command; `shots/tour/README.md` lists
every file with its URL.

`verify.mjs` opens the installed Chrome (headed, fresh profile) at 1280 × 800 and 390 × 844, walks every
named state, screenshots each, asserts no horizontal overflow and every control in view, and writes
`results.json`. It is the only reliable way to see the app under automation; `--only` picks states by
regex, `--headless` runs without a window (the DOM and layout assertions and the screenshots; the timing runs
stay headed). `npm run build` also type-checks (`tsc --noEmit`).

`npm test` runs the rules on small synthetic fixtures (`tests/`): the ramp rule, the quality predicate (pinned to
`calcofi4r::cc_qual_ok_sql()` byte for byte), the per-cast grain's registry rules, and — in **duckdb-wasm's node
build, the same engine the browser ships** (`tests/helpers/duck.ts`) — the SQL templates themselves and the SQL that
*Copy code* hands over. `smoke_release.mjs` is the check against a real release: it exits 1 when the page does not name
`latest.txt`'s version, or when the per-cast pass fails (the variable the app lists from the registry, opened in the
Stations lens: every value placed and counted, no depth clause, the copied SQL carrying the
`sample_measurement` ⋈ `sample_root` join against content-addressed URLs). `SMOKE_CAST_VAR=<type>` picks the
variable, `SMOKE_CAST=off` skips the pass for a release older than v2026.10.01.

`builder_check.mjs` clicks the Query Builder through in headless Chrome against the live release and opens every CSV
it saves: a link's picks and `&download=1`, a pick the release does not hold, the most-recorded species of every
organism dataset (no blank column), the task "sardine larvae and temperature, line 93.3, spring 2019" (every net
paired with its bottle and its CTD cast), how a net is matched (`match_nets`: the group and its defaults, the pairs
the README reports, a window changing the count, the match columns in the CSV and in *About this table*), every *Rows*
shape, the three lenses, a region chosen, every hexagon size, an empty result, the column limit, the same picks made
in two orders, a 375 px window, both themes (contrast of the small text), and the keyboard (names, focus rings,
Enter and Space).

Both `builder_check.mjs` and `lean_check.mjs` have a `brand_header` case (brand v3): the words equal `nav.json`'s
titles and link where it says (how many words, and which open a menu, are read from it), sentence case, a menu opens on a press and closes on Escape with focus back on
its word, the menu button's column lists every line and each can be brought into a 375 × 667 window, a `.cc-wave`
directly follows the bar, and the page still fits its window (for the Explorer: bar + strip + map fill it exactly,
in the lean and the classic layout). **Until `calcofi.io/brand/v3/` is live**, run them against a build that loads
the brand from a served copy: build the site (`CalCOFI.github.io`), build this app with `VITE_BASE=/explore/
VITE_SITE_URL=/ VITE_BRAND_URL=/brand/`, serve the site's `_site` with this `dist` at `/explore/`, and pass that
`…/explore/` as the base URL. A plain `vite preview` of a default build would ask the live site for a v3 it does
not have yet.

## Brand (the bar, the words, the wave)

The app and the Query Builder wear calcofi.io's brand, loaded live from `calcofi.io/brand/` (`CalCOFI.github.io`
publishes it; its contract is `brand/v3/README.md` there). Two build variables choose it, and `src/brandurl.ts`
holds the rules (`tests/brandurl.test.ts`):

| variable | values | default |
|---|---|---|
| `VITE_BRAND` | `v1` · `v2` · `v3` | `v3` since 2026-11-17 |
| `VITE_BRAND_URL` | where the brand is served | `https://calcofi.io/brand/` |

- **v3 is v2 with the brand's header.** Tokens, type, logos and favicons are v2's own files, still at `brand/v2/`.
  v3 adds `header.css`, `header.js`, `theme.js` (version "3") and `nav.json`: the header's words are **one list for
  every product** (on 2026-11-17: Data ▾ · Map ▾ · Query · Cite · Learn · Docs · FAQ · News · calcofi.org ↗, sentence
  case; the list is calcofi.io's to change, and nothing here names a word or counts them), and under
  the bar sits a navy band that ends in a wave. `brand/v3.head.html` is the head block.
- **Neither page types the words.** Each renders an empty
  `<nav class="cc-links cc-nav" id="cc-nav" data-cc-nav>` and the brand's menu button; the brand's `header.js`
  draws the words into the nav from `nav.json` beside itself and runs the menus and the button. React renders no
  children in that nav, so it never touches what the brand drew.
- **The Query Builder is a page**, at the reading scale (its head block drops the app-scale meta): the bar is
  calcofi.io's (lockup, "Query Builder", the brand's words from 1100 px, the menu button below, the toggle), and its
  crumb, h1, one line and release are in the wave band. Its own DATA · EXPLORER · DOCS links are gone; the brand's
  words carry them. The page's column is the brand's container with the site's 24 px inset.
- **The Explorer is an app** whose bar is full of its own controls, so it keeps them and asks for the brand's menu
  button at every width (`class="cc-header cc-nav-menu"`): the same words are one press away, in a panel that
  drops from the bar's right end. Under the bar, the wave is a 15 px strip, a row of the app's grid, so the map
  still gets exactly what is left of the window; `--cc-header-h` is measured to the strip's bottom.
- **A preview that carries its own copy of the site** sets `VITE_BRAND_URL=/brand/` (with `VITE_BASE=/explore/
  VITE_SITE_URL=/`), so the header it shows is the one under review and the words' links stay on the preview.
- **v2 and v1 still build.** `VITE_BRAND=v2` is what was live until v3: the Explorer's bar without the menu button
  or the strip, the Query Builder with its own small header. `brand_header` in both check scripts reports and skips.
- **Three things first worked around here are the brand's own since 2026-11-17** (`brand/v3/header.css`): on a
  `.cc-nav-menu` bar the open words drop as a panel from the bar's right end and the bar does not wrap;
  `.cc-wave-in` is `border-box`; `.cc-wave` carries a colour under its gradient. The stopgaps are gone from
  `src/style.css` and `src/builder/builder.css`.

**Deploy order.** A v3 build loads `calcofi.io/brand/v3/`, so the site has to be live first: a v3 Explorer deployed
before it would have no `theme.js`. `pages.yml` builds `VITE_BRAND: ${{ vars.VITE_BRAND || 'v2' }}`, so the deploy
stays on v2 until the repository variable says `v3`. The order: merge and deploy `CalCOFI.github.io`; check that
`https://calcofi.io/brand/v3/nav.json` answers; set the variable `VITE_BRAND` to `v3`; re-run `pages`.

## Deploy

`.github/workflows/pages.yml` builds with `VITE_DATA_URL` + `VITE_RELEASE_PREFIX` + `VITE_BASE=/explore/`
(and `VITE_FEEDBACK_URL`, see below) and publishes `dist/` to GitHub Pages on every push to `main`. The
page reads `{prefix}/latest.txt` → `{prefix}/{version}/catalog.json` (plus the `coverage.json`,
`coverage_stations.json`, `grid.geojson` and `spatial.geojson` sidecars) and every object by its catalog
path — never a hand-built `releases/{v}/parquet/` path. The build has two entries (`vite.config.ts`
`rollupOptions.input`): `index.html`, the Explorer, and `builder.html`, the Query Builder, published side by
side as `/explore/` and `/explore/builder.html`. Once the repository variable `VITE_QUERY_URL` is set,
`builder.html` is a redirect to the Query Builder's own address (§ The Query Builder's own address).

### The layers registry (where it lives)

The boundary/reference rows are NOT built in this repo. `~/Github/CalCOFI/workflows/metadata/spatial_layers.csv` →
`calcofi4db::build_spatial_layers()` → the release's `spatial_layers.json` sidecar. `scripts/dev_spatial_layers.R` builds
the bundled `src/spatial_layers.fallback.ts` with the same function, from the `spatial` and `sample_spatial` tables of
the release `latest.txt` names (or the version given as its argument), read over HTTPS by their catalog paths; the
`workflows` checkout must be on `main`. Rows backed by the oceanmetrics gazetteer carry three optional fields the app
honours (`src/spatial_registry.ts`): `source_url` (absolute PMTiles URL), `source_layer` (vector layer name) and
`popup_fields` (JSON list). The CSV has these columns and `build_spatial_layers()` passes them through (calcofi4db
>= 4.23.0, workflows#163). A release built before then lacks them, so `mergeRegistry()` overlays the fallback's
gazetteer rows on its sidecar.

### The feedback endpoint (once)

The dialog posts to a Google Apps Script that `calcofi4r::cc_feedback_script()` generates. Setup: a
Sheet with a `feedback` tab (header = `calcofi4r::cc_feedback_header()`) and a `recipients` tab (one
email per row — edit a cell to add someone, no redeploy); paste `cat(cc_feedback_script())` as the
Sheet's script and deploy it as a web app ("execute as me", "anyone"); add `GITHUB_TOKEN` (contents +
issues on this repo) as a script property for the public issue; put the `/exec` URL in the repository
variable `VITE_FEEDBACK_URL`. Re-paste the script after a calcofi4r change (1.14.1 added the inline
screenshot in the mail). Usage analytics go through the fleet's GA4 snippet in `index.html`
(`calcofi4r::cc_ga_html("public/ga.html", "explore")`); an automated browser is never counted.

## How it is built

- **Stack:** Vite + React 18 + TypeScript · MapLibre GL (keyless CARTO basemap, swapped on the brand's
  `cc:theme` event) · deck.gl `MapboxOverlay` (`ScatterplotLayer` carries the station dots between
  lenses, `H3HexagonLayer`, `GeoJsonLayer`, `TripsLayer`, `BitmapLayer` for the contoured surface) · DuckDB-WASM self-hosted in a Web Worker,
  no extensions, objects fetched whole and registered as buffers · Plotly for the depth strip, year
  strip, section and cruise series · `h3-js` · the brand from `<VITE_BRAND_URL>/<VITE_BRAND>/` — v3 since 2026-11-17
  (§ Brand above): v2, the SIO look (light default, Source Sans 3, the lockup at 28 px, `data-cc-scale="app"`, since
  the flip on 2026-09-04), with the brand's header; `VITE_BRAND=v2` builds v2 alone and `v1` the superseded
  dark-default look. `vite.config.ts` injects
  `brand/<v>.head.html`; `src/brand.ts` carries the same choice into the header and the capture (v2 embeds
  the woff2 files so the feedback PNG is set in Source Sans 3). `verify.mjs`'s `v2_*` states check the
  default build and skip on a v1 one.
- **Data:** the release's browser-shaped objects — `obs_bio`, one `obs_env` partition per variable,
  `sample_root`, `sample_spatial`, `taxon`, `dataset`, `measurement_type`, `cruise` — cut by
  `calcofi4db::build_*` at release time, resolved through the catalog by `src/release.ts` (a port of
  `calcofi4r::cc_release_sources()`). The category tree comes from `coverage.json` (`taxa[]` and
  `variables[].category`, calcofi4db ≥ 3.25.0; `src/categories.ts` keeps a keyword fallback for an
  older release); the categories themselves are `workflows/metadata/category.csv` and the icons
  `calcofi.io/brand/v2/icons/` (`scripts/build_icons.mjs` regenerates that sprite from
  `src/icon-paths.ts`, and the app renders the same paths inline).
- **Code map:** `sql/*.sql` are the lens queries the browser runs (`{{named}}` params, the shared
  filter in `_filters.sql`; `density.sql` is the denominator fixture shared with calcofi4r /
  calcofi4py; `slice_cast.sql` / `cast_census.sql` / `cast_list.sql` are the per-cast grain) · `src/sqltpl.ts` is
  the template renderer (pure, so a test can run a template) and `src/engine.ts` runs and times them ·
  `src/castgrain.ts` says which variables are per-cast and derived, from the registry · `src/qual.ts` is
  `qualOkSQL()`, the quality predicate's twin · `src/reproduce.ts` resolves the SQL a view ran against the release's
  URLs for *Copy code* and the bundle · `src/state.ts` is the URL selection model
  (`fromUrl` / `toUrl`), the stage/denominator defaults and the denominator formulas · `src/App.tsx` the
  shell · `src/map.tsx` the layers and the lens-to-lens morph · `src/contour.ts` + `src/contour.worker.ts` the Contours lens's interpolators, isolines and bitmap · `src/ramps.ts` the colour ramps · `src/lenspicker.tsx` the lens picker · `src/charts.tsx` the Plotly panels ·
  `src/picker.tsx` the organism / variable / cruise picker (tree + flat list) · `src/panels.tsx` the
  rails, floating cards and phone sheet · `src/export.ts` per-panel PNG/SVG/CSV and the footer stamp ·
  `src/capture.ts` the whole-view figure (one `html-to-image` composite; MapLibre runs with
  `preserveDrawingBuffer` so its canvas can be read) · `src/annotate.tsx` + `src/feedback.tsx` the
  feedback dialog (and *Register a product*, its second kind) · `src/bundle.ts` the download ·
  `src/cite.ts` the citation builders every attribution surface shares · `src/sources.tsx` the Sources line
  and the Data Sources &amp; Attribution modal · `src/tour.ts` the guided tour over `data-tour`
  anchors · `src/help.tsx` the welcome (with the agreement) and About dialogs.
- **Layout rule:** nothing re-lays out on a selection change — only a fold, maximize, drag, lens change
  or breakpoint moves panels. Card positions and the rail width live in `localStorage`; folds and
  maximize live in the URL.
- **Escape hatches:** `?native=1` swaps the pickers for plain `<select>`s; *SQL & timing* (in Export)
  opens a card with every timing mark and the last SQL (`window.__marks` is the same list).
