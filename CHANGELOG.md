# Changelog

## Unreleased

- **the Query Builder can live at its own address, calcofi.io/query/** (Ben, 2026-11-17: "can we move the Query
  Builder to its own dedicated 'query'? And then cross-link"). The code stays in this repo; the thin repo
  CalCOFI/query builds it from here.
  - `npm run build:query` (`VITE_APP=query`) builds the Query Builder alone into `dist-query/` as `index.html`: 700 kB
    of script (208 kB gzipped) against the Explorer's 7,130 kB (2,127 kB), plus the DuckDB-WASM both ship.
  - With `VITE_QUERY_URL` set on the Explorer's build, `builder.html` is a redirect page to that address that
    carries the link's query string and fragment, so every `?pick=…&download=1` link still lands and downloads.
    Unset (the default, and the deploy until the repository variable says otherwise), nothing changes.
  - **The Explorer links to the Query Builder** for the first time: *Build a table across datasets · Query Builder*
    under the downloads, carrying the view's species or measurement (one pick per dataset in view) and its lens.
  - The Query Builder's head says *Prefer to write SQL? db-query*: `/query/` was the SQL console's address first.
  - `src/queryurl.ts`, `src/links.ts`, `tests/queryurl.test.ts`; `old_address` in `scripts/builder_check.mjs`
    (`--builder=<path>` runs every case at the new address), `query_link` in `scripts/lean_check.mjs`.
  - **Deploy order** in README § The Query Builder's own address.

- **Query Builder: every sample is one row per net, with each water dataset's nearest cast beside it** (Ben,
  2026-11-17: "a time, xy distance, z depth filter for matching, and preference for matching by time vs distance,
  and the calculation included in each row"). Under Stations › Every sample with a species picked:
  - **The rule.** One row per net. Each water dataset gives the row one cast: of its casts within ± 12 hours and
    5 km of the net with a value in the depth range, the nearest in time (or in distance; the other breaks a tie).
    Time and distance are the samples' own (UTC, great circle), not station numbers, calendar dates or cruise names.
    A water value is the average of that one cast's values from 0 to 10 m. A net with no cast keeps its row, blank.
  - **The controls**: a group *Match water to each net* in step 2 (time, distance, the water's depth range,
    prefer), shown only when it applies; it replaces the plain Depth row while it shows.
  - **The calculation in each row**: after each water dataset's measurements, `cast_id`, `cast_time`,
    `cast_station`, `cast_hours` (cast minus net), `cast_km`, `cast_depth_min_m`, `cast_depth_max_m`,
    `cast_n_depths`, each ending like that dataset's measurements. The net's own `net_id`, `net_time`, `latitude`,
    `longitude` and `tow_type` open the row. The preview says how many nets found a cast.
  - **What it pairs** (release v2026.11.14, sardine larvae and bottle temperature, standard grid): 16,479 of 25,719
    nets. In the earlier rule's unit, 13,642 of 18,926 rows (72%) against 12,378 (65%): a cast on the other side of
    00:00 UTC, or filed under another station number than the net's grid cell, pairs now. README § How a net is
    matched to a cast has the measurements behind the defaults.
  - **Changed for existing links and downloads**: `&rows=sample` gives one row per net (it was one row per station ×
    date × 10 m step, where a visit's nets were averaged) and its columns are `date, cruise, line, station, net_id,
    net_time, latitude, longitude, tow_type, …` (no `depth_m`). Every sample with water alone is unchanged.
  - The other shapes (yearly, seasonal, monthly, Custom, Hexagons, Regions) keep their rule, and *How rows are
    matched* now says in each that nets are not paired with casts.
  - `netSql()`, `matchOf()`, `ruleLines()`, `matchLine()` in `src/builder/query.ts`; `tests/builder.match.test.ts`
    (29 fixture assertions), `tests/builder.rule.test.ts`; `match_nets` and `task_line_933_spring` in
    `scripts/builder_check.mjs`.
- **fix (Query Builder): a depth range ends before its deeper end.** "0 to 10 m" pooled 0 to 20 m, because the 10 m
  step that starts at the deeper end was included; the page said "so down to 20 m". Now "0 to 10 m" is the first
  step and the default "0 to 500 m" is the fifty steps above 500 m, in every shape. The Explorer's depth filter is
  unchanged.

- **brand v3: the Explorer and the Query Builder wear calcofi.io's header** (Ben, 2026-11-17: one look, the wave,
  the same words everywhere). `VITE_BRAND` takes `v3` and defaults to it; `VITE_BRAND_URL` says where the brand is
  loaded from (default `https://calcofi.io/brand/`; a preview with its own copy of the site sets `/brand/`).
  `src/brandurl.ts`, `tests/brandurl.test.ts`, `brand/v3.head.html`.
  - **Neither page types the header's words.** The brand's `header.js` draws them from `brand/v3/nav.json`, the one
    list every product reads (on 2026-11-17: Data ▾ · Map ▾ · Query · Cite · Learn · Docs · FAQ · News · calcofi.org ↗),
    sentence case. Nothing in this repo names a word or counts them.
  - **The Query Builder** is a page at the reading scale: calcofi.io's bar (lockup, "Query Builder", the words from
    1100 px, the menu button below), and its crumb, h1, one line and release in the navy wave band under it. Its own
    DATA · EXPLORER · DOCS links are gone.
  - **The Explorer** keeps its bar of controls and gains the brand's menu button at every width (the brand's words in
    a panel that drops from the bar), the title in sentence case, and a 15 px wave strip under the bar. The map still
    gets exactly what is left of the window, in the lean and the classic layout and on a phone; `--cc-header-h` is
    the strip's bottom. On a phone the bar holds one more button and stays one row at 375 px.
  - The lockup goes to the preview's own copy of the site when `VITE_SITE_URL` names one.
  - `brand_header` in `scripts/builder_check.mjs` and `scripts/lean_check.mjs` checks all of it.
  - **Deploy order:** the site's `brand/v3/` has to be live before a v3 build of this app is. `pages.yml` deploys
    `v2` until the repository variable `VITE_BRAND` says `v3` (README § Brand).

- **fix: the Find data panel always runs the map's full height.** A resize from its corner stored a height in the
  browser for that window size, and from then on the panel opened short (Ben 2026-11-16: 555 px of an 800 px map), with
  nothing on screen saying why; only a double-click on its bar reset it. In the lean layout its height is never
  remembered now: a resize changes its width only (the top and bottom edges no longer resize it), and a height stored
  by an earlier resize is ignored. Classic and the phone are unchanged.

- **the Table builder is the Query Builder, and its links pick for the reader** (review of PR #58, 2026-11-17).
  `builder.html?pick=bio:<dataset>:<taxon>` (or `env:<dataset>:<measurement>`), repeated or comma-separated, ticks
  those on load, and `&download=1` starts the CSV — what calcofi.io's dataset pages link to; the branch had read only
  `?release=`. A pick the release does not hold shows a notice and nothing downloads. Crumb, heading and page title
  say Query Builder. `src/builder/picks.ts`, `tests/builder.picks.test.ts`.
- **fix (Query Builder): a column is no longer blank because the page's units or life stage do not fit its dataset.**
  One "Species units" and "Life stage" choice (per 10 m², larva) held for the ichthyoplankton tows only: a seabird,
  a CUFES egg count, a phytoplankton cell count, krill came out as an empty column with no word why. Each pick now
  takes what its dataset holds — per 10 m², else per 1000 m³, else as counted; no stage filter where none is
  recorded; its most-recorded stage where it has none of the default — and the column name and a note under Preview
  say so. Once the reader sets the life stages, a pick with none of them stays blank and the note names the ones it has.
- **fix (Query Builder): a depth range below 10 m no longer drops every net tow.** In the release a tow's `depth_bin`
  is 0, not empty, so asking for temperature at 50–100 m emptied the species column beside it. A species sample is
  kept when the depth it sampled reaches into the range.
- **fix (Query Builder): a species added after a water-only table gets the per-net zero-fill.** The probe for
  `sample_key` was remembered from the first build, so the species was zero-filled per station visit and its mean
  differed from the Explorer's and from the same picks made in the other order.
- **fix (Query Builder): the sample date reads as a date.** It reached the CSV as milliseconds (`1554163200000`)
  and the preview as `1.5542e+12`; it is `2019-04-02` now.
- **fix (Query Builder): the first Show preview shows the table.** Clicked before the datasets' names had arrived
  (they name the columns), it built a table that was out of date the moment they did, and nothing appeared until a
  second click. Preview, Download and Copy wait for the names.
- **the Query Builder says how its rows are matched**, under the controls (*How rows are matched*) and in *About
  this table*, a text file saved beside a download: each column with its units and dataset, the rows kept, the rule
  in force, what changed for some columns, and how to cite. "Every sample, as measured" no longer says "Nothing is
  combined": a station visit's nets and casts that share a row are averaged. The statistic *number of samples* is
  *number of values*, which is what it counts. The rule itself is unchanged and still an open decision.
- **fix (Query Builder): errors and limits are said.** No rows: a sentence, not an empty file. A failed build names
  what failed and clears on the next success. More than 40 columns ("Select all" ticks 1,641 species) is refused
  with the limit instead of exhausting the tab's memory; a build's working tables are dropped afterwards; a failed
  fetch is retried on the next build.
- **Query Builder, keyboard and screen reader**: every control has a name, the actions are buttons (they were
  `href="#"` links), the groups say whether they are open, the row count and errors are announced, the three steps
  are headings, and focus is always drawn (the search boxes and the lens cards hid it). Its header links follow
  `VITE_SITE_URL` like the Explorer's dataset links. `scripts/builder_check.mjs` clicks all of it through.

- **a Table builder** (`builder.html`, `src/builder/`; Rasmus Swalethorp: "a gui … that allows you to structure your query from
  the integrated database … think MS Access style … pull several environmental and biological parameters at the same time").
  One page: pick any species and water measurements from the release's coverage sidecar (select all, by group, or search),
  choose Stations / Hexagons / Regions, filter (stations, region, years, season, depth, life stage, units, no catch = 0,
  quality), shape the rows (every sample, yearly / seasonal / monthly averages, or Custom: place × time × depth and the
  statistic), preview, and download one CSV — one column per pick. Each pick is built by the Explorer's own slice templates
  (`slice_bio.sql` with its per-net zero-fill, `slice_env.sql`), so a value matches the Explorer's; a cell is blank when not
  measured, 0 only from the zero-fill. "Copy as SQL" hands over the statements against the release's object URLs. Water
  measurements are those with a per-bin `obs_env` object (a per-cast-only type is not listed yet). `src/builder/query.ts`,
  `tests/builder.sql.test.ts`.

- **a dot of the Observations layer opens what was recorded there, and when** (Ben 2026-11-16, on the cetacean
  sightings preview: a sighting could not be clicked to see the species). A click on a site (`obs=`) opens a card pinned
  to it: each sample there — a sighting, a net, a cast — with its date and time on the Pacific clock (PST / PDT; UTC in
  the hover), its dataset and cruise, then what it recorded. For a species the samples are read back from the release
  with every taxon they hold, so a *whales, dolphins and porpoises* dot names the common dolphins it stands for, the
  pick's own records in bold; for water, the cast's values by depth bin. The selection's filters (years, seasons, depth,
  datasets, area, cruises, zeros) hold; at most 200 records. A station dot under a site dot still takes the click and the
  hover. `sql/site_obs.sql`, `sql/site_obs_env.sql`, `src/siteobs.ts`, `tests/siteobs.test.ts`.
- **fix: the Station card shows the view's datasets, and its rows no longer pile up.** A station clicked in a sightings
  view listed every dataset that ever sampled the cell (the ichthyo tows, the bottles …) from the release's coverage
  files; it now lists the datasets picked, else the ones holding the pick, and names the others in one line. In the
  phone's bottom sheet each dataset's row wore the floating panels' `.card` class and they were drawn on top of one
  another; they have their own classes now. Datasets are named as the title card names them (*Cetacean sightings*).
- **the Effort layer draws behind the data, thin and translucent.** Where several cruises ran the same transect, the 2 px
  amber segments on a dark halo covered every station dot; they are 1 px at half strength with no halo, under the dots,
  a cruise's samples, the Lines and the Observations (over the hexagons, regions and surfaces, which would hide them).

- **the What picker says how its lists are ordered, and the order can be changed.** Each species or measurement row shows
  its observations in this release (*138 k*, *1.6 M*; the exact number and what it counts on hover), By dataset that
  dataset's own. A quiet *Sort by* beside By category / By dataset offers **Suggested** — the order it always had: the
  familiar measurements first (temperature, salinity, oxygen …), measured before derived, then most observations, with
  sensor copies, raw versions and unidentified or unnamed taxa last — **Most observations** and **Name A–Z**. It applies
  inside each category and topic (Temperature, Salinity …; Fish, Squid and octopus …), which stay, and to search results;
  the browser remembers it and the link does not carry it. A category's pill says on hover that it counts what is listed,
  not observations. Classic's Browse tree follows its list's sort buttons (A–Z, most observations, most recent) instead of
  always A–Z. `src/pickersort.ts`, `tests/pickersort.test.ts`, `scripts/lean_check.mjs`.
- **fix: the Time panel never covers the Find data panel.** A Time panel dragged or resized while the panel was folded (or in
  classic, where it runs the full width) came back from the browser's memory at the map's left edge, over the lower half of
  the open panel, its rows showing through the chart. The bottom docks — Time, the Section / Cruise result, the depth ×
  time card and the collapsed pills — now start just right of the panel as it stands (moved, resized wider, opened), step
  clear of it when their own remembered place would cover it, and take the full width when it is folded. In classic, an
  open species or variable list now sits above the Time panel rather than under it; the phone's bottom sheet is
  unchanged. `src/dock.ts`, `tests/dock.test.ts`, `scripts/lean_check.mjs`.
- **fix: a species' counts count the nets its mean divides by.** The zeros are per net (`sample_key`; confirmed by Ben
  2026-11-16), but *found in K of N samples*, the hovers, the Time strip, the Regions list and the download line counted
  station visits (`root_id`), so Pacific sardine larvae per 10 m² read *found in 5,817 of 49,208 samples* under a mean of
  35.9 over 52,780 nets; it now reads *found in 6,273 of 52,780 samples*. Every slice carries `sample_id` (the net for a
  species, `root_id` on a release without `sample_key`; the cast for water, so water counts are unchanged), every
  template counts it, and the CSV carries it with a column-dictionary entry. `tests/zerofill.counts.test.ts`,
  `scripts/lean_check.mjs` (the CSV's samples per station / hexagon / region and the Time strip's against the panel).
- **the lean "Find data" panel is the default (PR #53); `?ui=classic` brings back Select / Refine / Share.** One
  top-down panel: What (one search over species and measurements, by category or by dataset, with the life stage, the
  units, Count zeros and the dataset under it) → When (years, seasons, cruises) → Where (regions, line / station, the
  CalCOFI grids, a drawn area, a box or the map view) → View as (the six views as main's monochrome lens icons, the same
  choice as the header's view menu) → the depth profile and the summary statistic, with the downloads pinned at the
  panel's bottom. `scripts/lean_check.mjs` drives it in Chrome — every What category × view × When × Where, the layers,
  Reset, the link, Back / Forward, classic, light / dark and a 375 px window — and opens every CSV and zip it downloads,
  checking each row against the filters in force and the per-station / hexagon / region numbers against the map.
- **the download area is pinned and complete.** It stays at the bottom of the panel, reachable without scrolling.
  Download CSV is the data behind the view; Zip the package; How to cite and Copy link beside them; More ▾ holds a picture
  of the view (PNG or the clipboard), the numbers the map shows (its table as CSV), the citation as text or BibTeX, the
  SQL / R / Python, and the SQL & timing card — all of which the lean panel had lost.
- **fix: download file names say which subset they hold** (`src/filename.ts`): `calcofi_pacific-sardine_larva_per10m2_
  1990-2005_spring-summer_75-station-grid_hex4_v2026.11.14_20261116.csv`, each part only when in force. Every CSV of a
  species was `calcofi_<taxon>_<release>.csv`, so two subsets overwrote each other. `tests/filename.test.ts`.
- **combining datasets is an explicit choice again, in both layouts.** One dataset (the one with the most data) stays
  the default; the lean dataset list ends with *Combine all N*, classic's Refine pills add and remove again with *all
  datasets* / *one dataset*. The link says `datasets=all` (or the list); the PR had forced one dataset everywhere, so
  classic's *all datasets* could not stick. `tests/pool.url.test.ts`.
- **fix: Where tells the truth.** It opens with the area in force, named (*Area: CalCOFI 75-station grid · Clear*;
  `area.ts areaLabel()`), *Full survey* is ticked only when no area is set (it looked chosen under a region, a line or a
  drawing) and choosing it clears any area, and a line says each choice replaces the one before. Unticking the last region
  drops the area instead of silently meaning every region. The Cruise and Section views (which hide When and Where) and
  the Region view (which hides Where) show the filters still in force, collapsed, with why they apply and a Clear.
- **fix: Draw an area dropped a loop closed exactly on its start point** (`simplifyPath` measured every point as 0 from
  a chord of no length, so the shape fell to two points and read as a click).
- **fix: Reset all kept the filters' leftovers and dropped the pick's.** It keeps the species with its life stage, units
  and zeros (they were reset, so the panel fell back to no stage), and turns the Lines layer and the added variable off
  (they were left on). `state.ts resetPatch()`, `tests/reset.test.ts`.
- **fix: the added variable.** *Color by* it is in the link (`color=var2`; a reload went back to the first pick's
  colours); beside a species the list offers every measurement (it left out the last one viewed); picking it as the main
  measurement drops it as the second. `tests/var2.url.test.ts`.
- **fix: the Effort layer with a one-hexagon area** (`area=hx:`): the effort query filtered on `hex7`, which it had no
  column for, and failed. Each path now takes its `sample_root` row's cell when the release carries one.
  `tests/effort.sql.test.ts`.
- **Back and Forward step through the view** (`state.ts historyMode()`): a change of what is shown — the pick, the view,
  years, seasons, area, cruises, depth band, added variable, hexagon size, line, layer, datasets — is a history entry; the
  map's pan and zoom, folds and the defaults the app fills in replace it. Before, Back left the app. `tests/history.test.ts`.
- **fix: By region kept zooming a close look out to the whole coast**; a map already showing some of the layer's regions
  now stays where it is.
- **fix: the tour in classic** pointed two steps (*Six ways to view it*, *Download and share*) at lean-only anchors.
- **fix: a Section or Cruise view's zip held every line.** Its CSV took the view's own line / cruise on top of the
  filters and the zip's observations did not; both read `reproduce.ts lensOwnSql()` now, and the README says so.
  `tests/lensown.test.ts`.
- **fix: an anomaly section with no baseline drew empty axes under a legend left over from the map.**
  `?lens=section&var=temperature&line=93.3&anom=1&cruise=2025-04-3322`: the cruise's median cast month is March, and no
  March reached 5 cruises in 1993–2013 on line 93.3 (release v2026.11.09 holds no monthly temperature mean there for March,
  May, June, September or December; the Mar–May season has one). Every departure was blank, so the section drew a heatmap of nothing
  and the title's legend fell back to the station summary's range ("8.89 … 15.58 degC"), which this lens never refreshes.
  A section with rows and no baseline for the cruise's period (`anomaly.ts noBaseline()`) is now an empty state that says
  so — *"no 1993–2013 March normal at these stations — try the seasonal normal, or show as measured"*
  (`noBaselineWhy()`; the seasonal normal is offered only from the monthly one, and only where the release carries it) —
  and the legend of a section that draws nothing reads *nothing drawn*, with no range. The baseline is never switched for
  the reader. `tests/anomaly.test.ts` asserts the rule and the words.
- **fix: the legend of a section under the seasonal baseline read another season's range.** `sectionRange()` keyed the
  seasonal baseline on the cruise's month, so a March cruise's legend was its departure from the Jun–Aug normal (period 3)
  and a July cruise's found nothing and kept the map's range, while the section itself drew the right season. It now takes
  the baseline in force, as the plot and the 3-D curtain do.
- **fix: the season filter said "Apr–Jun" for MAM.** The sentence bar's season chip kept the calendar quarters
  (`Q_LABEL = ["Jan–Mar", "Apr–Jun", …]`, buttons Q1–Q4) after release v2026.11 moved `quarter` to DJF / MAM / JJA / SON,
  so a view filtered to spring read three months that were not the ones filtered. `sentence.tsx` now takes its words
  from `anomaly.ts` (`SEASON_WORD`, `SEASON_CODE`), the same as the Time strip's buttons. `tests/season.test.ts` asserts it.
- **fix: a missing space in the feedback dialog** ("nothing else.It goes to the team …").
- **a preliminary cruise says so — once the release tells the app** (a no-op on every release to v2026.11.09). The
  newest cruises are the ship's preliminary CTD series, which [ctd-transects](https://calcofi.io/ctd-transects/) badges
  *Preliminary — CTD & bottle 1 m-binned* and the Explorer showed with no word of it. The status is the release's
  `data_stage`, which today sits only on `sample` (28 MB, not an object the app loads; read by range request it cost 52
  requests and 9 s, so that is not done). The app now reads it from `sample_root` where a release carries it there
  (calcofi4db 4.37.0+): a column probe on the registered object, then `sql/cruise_stage.sql`, only once a lens that shows
  one cruise has drawn and only from a `sample_root` the session already holds. A view of one cruise (a depth section, the
  Cruises lens' shown cruise) whose dataset in view is not `final` on it wears a warn pill beside the cruise in the title
  sentence, in the provider's wording (ctd-transects' own labels; a stage it does not name reads *Preliminary — <the
  release's value>*), the section card's title carries it, and the cruise picker's rows say *preliminary*. A finished
  cruise wears nothing. The stage is the dataset's: a bottle or net-tow series of the same cruise key is not marked.
  `src/stage.ts`, `tests/stage.test.ts` (the probe on a `sample_root` with and without the column, the query, the rule).
- **fix: Environment variables failed with "Binder Error: Ambiguous reference to column name \"year\""** (explore#48,
  feedback e0e72761dc). Release v2026.11.05's `cruise` table carries its own `year`, `month` and `season_year` beside
  `month_median`, and the slice templates joined the whole table as `cz` while reading the slice source's bare `year`.
  `{{cruise_src}}` is now `cruiseSrcSql()` — only `cruise_key`, `date_median`, `month_median` — in `App.tsx` (slices and
  the Effort layer) and in Share › Copy code (`reproduce.ts`). `tests/season.test.ts` joins a full-width cruise fixture and
  asserts the old join throws and the projected one does not.
- **an Effort layer** (`effort=on`, a row in the Layers card beside Lines and Observations). It draws the release's
  `sample_track` (calcofi4db 4.35.0+, first written by the cetacean sightings): each survey's on-effort segments as a
  solid amber path on a dark halo and the line of sight from the ship to each sighted animal thinner and fainter, under
  the Observations dots and over the data. It follows the dataset pills, the years, the season, the Area and, in the
  Cruises lens, the shown cruise, but never the taxon, variable or depth band: effort is where the observers looked,
  whatever they saw (`sql/effort_track.sql`, its own effect in `App.tsx`). Time is the cruise's month, from each path's
  root sample in `sample_root` (a sight line takes the segment whose span contains it); a path with no cruise falls
  back to the calendar month. The path is built from the six lon/lat columns (`src/effort.ts`), never from `geom`. A
  release with no `sample_track` disables the row with a title saying why. Hover a path for its type, time and length;
  the row reads *N segments · X km* when on. `tests/effort.sql.test.ts` runs the template on a fixture.
- **fix: the map's data was hidden under the sea** (explore#39, Rasmus Swalethorp: "The explorer app stopped displaying
  temperature"). CARTO moved its basemap tiles from OpenMapTiles to Protomaps (water polygons now carry `kind`, not
  `class`), so the land mask's inland-water copy, filtered on `class != "ocean"`, matched the whole ocean and repainted
  it over the station dots, hexagons and sea floor (the legend and Time strip still filled; `land=off` showed the data).
  The filter now drops `class` or `kind` = ocean (`basemap.ts INLAND_WATER_FILTER`, `tests/basemap.water.test.ts`
  evaluates it with MapLibre's style-spec against both schemas). Island labels (`place` · `class=island`) find no
  features in the Protomaps tiles and are silent for now.
- **a depth × time anomaly card** (explore#28 part 2, Rasmus Swalethorp: "an anomaly plot with depth on the y and time on
  the x axis"). An *Anomaly · depth × time* pill above the Time panel opens a card (`show=depthtime`, so a permalink
  reproduces it; `max=depthtime` fills the map with it): x is the cruise season (the cruise's year and quarter), y the
  10 m depth bin increasing downward, the colour the mean departure from the 1993–2013 normal over the observations in
  each cell, on the section plot's diverging ramp and window (cmocean *balance*, symmetric about 0 and as wide as the
  largest departure, `ramps.ts anomRange()`, which the section now shares; Ben, 2026-10-14). It reads #22's
  `slice_anom` (`sql/anom_depth_time.sql`), so each observation has its own station × cruise month × depth bin normal
  subtracted before pooling, and no baseline is re-derived; a cell with no baseline is blank, never 0, and its hover says
  so. It follows every filter in force — years, season, depth band, datasets and the Area (the standard grid or a
  region) — and the *month · season* baseline toggle in its header (`base=season`, written whatever the lens while the
  card is open). Hover: the season, the bin ("50–60 m"), the anomaly with its unit, n and the cruise. An organism, a
  per-cast variable or a variable without a climatology gets the reason instead of a plot. Share › Copy code and the
  download bundle add `05_anom_slice.sql` and `06_anom_depth_time.sql` while the card is open, reading the release's
  climatology objects by URL. `src/depthtime.ts`, `tests/depthtime.test.ts`. The bottom-edge pills now sit above an open
  Time panel (they were hidden under it).
- **an Area can be a whole layer or any set of its regions** (explore#20 · explore#16; Ben, 2026-10-14: "allow ALL
  features in a given layer to be used as the filter … a large modal for selecting individual features from a table
  and/or on the map"; `src/area.ts`, `src/regionpicker.tsx`, `tests/area.test.ts`). Refine › Area › region offers
  *all regions (n samples)* (`area=in:layer`, `layer = …` in `{{area_filter}}`, the layer's own distinct count from
  `sql/area_regions.sql`) and *choose on map / table…*: a modal over most of the viewport with the layer's regions in a
  sortable, searchable table (checkbox, name, status, status date, samples; all / none; a count) beside a map of the
  layer's own polygons, drawn from its PMTiles (the CalCOFI bucket or the gazetteer) — a click toggles a region, chosen
  ones are yellow, ones with no sample in the release are grey and dashed and cannot be chosen. Apply writes
  `area=ins:layer|A,B,C` (each name with `%` → `%25` and `,` → `%2C`, so any name round-trips; a set of one is written
  `in:layer|A`, every region is written `in:layer`); Cancel or Esc change nothing. The title sentence reads "within all
  of …" / "within 3 regions of …", and the map's yellow outline covers every chosen region. `area=in:layer|name` links
  parse exactly as before.
- **status beside the name, not in it** (contract 2026-10-14; `src/spatial_registry.ts`, `tests/spatial_registry.test.ts`).
  A layer whose sidecar row has a dated status reads "BOEM Wind Planning Areas (rescinded 2025-07-30)" in the Area
  picker, the Layers card, the legend and the boundary popup (`status_label`, else worded from `status`); a region with
  a `region_status` reads "OCS-P 0561 (relinquished 2026-09-03) (12 samples)"; the modal's status column falls back to
  the gazetteer polygons' own `status` / `status_date`. A layer that cannot be an area says why: "points: no area",
  "lines: no area" or "not in this release's sample index". Every field is optional: v2026.10.13 reads as before. The
  bundled registry drops "(rescinded)" from the planning areas' name and carries the status as data.
- **Chumash Heritage National Marine Sanctuary** (explore#34). *National Marine Sanctuaries* (`noaa_onms_sanctuaries`,
  id and name kept) draws the gazetteer's `noaa_sanctuaries` archive, so the 2024 sanctuary is on the map. Its region
  names are the gazetteer's ("Channel Islands National Marine Sanctuary - Northern Section"): an `in:` link with the old
  short name, once the release has the new ones, opens as every region that name prefixes at a word boundary ("Channel
  Islands" → both sections) and the link is rewritten; the modal maps a polygon to the release's regions by the same
  rule, so v2026.10.13's short names still pick on the new polygons. Monterey Bay's subregions (also asked in #34) are
  not done: no public polygons for them were found.
- **one SoCal Aquaculture AOAs layer.** `noaa_aquaculture_aoas` (id and name kept, regions CN1-A … N2-E unchanged) draws
  the gazetteer's `noaa_aoa_socal` archive with status popups; the duplicate `noaa_aoa_socal` row is gone, a
  `layers=noaa_aoa_socal` link draws the merged layer (`aliasLayers()`), and a release sidecar that still lists both
  shows one. A polygon names its region by the row's `name_field`, else `name`, else the gazetteer's `source_id`
  (the AOA tiles carry "Southern California AOA N2-E" and "N2-E").
- Area › region: changing the layer after opening a region link no longer hides the picker (fix).

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
