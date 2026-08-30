# CalCOFI Explorer

Live at **https://calcofi.io/explore/**.

One web app for looking at the integrated CalCOFI database through five *lenses* — **stations**,
**hexagons**, **cruises**, **regions** and **sections** — for one **organism** (a taxon, from the net tows
and censuses) or one **ocean variable** (from the bottle, CTD, carbonate and weather series) at a time.
Everything runs in your browser: the SQL executes in DuckDB-WASM against the frozen release, so there is
no server between you and the data, and the same bytes `calcofi4r` / `calcofi4py` read.

The design history lives in two planning documents in the `workflows` repo
(`.claude/plans/2026-08-28 CalCOFI Explorer …` and `2026-08-29 CalCOFI Explorer UI …`); this README
says what the app does and how to work on it without needing them.

## Using it

- **The map is the page.** The *Select* rail on the left picks the lens and the data; the *Depth* rail
  (right) and the *Years* strip (bottom) are brushes — drag on them to filter the map to a depth band or a
  span of years. Either rail folds into a labelled pill, or maximizes into the map's box. Under 900 px
  (a phone) the rail becomes a bottom sheet and the strips become pills on the map's edge.
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
- **The URL is the whole view.** Lens, organism or variable, stage, denominator, years, season, depth,
  dataset filter, region, line, cruise, summary statistic, theme, which panels are folded or maximized,
  and the **map extent** (`map=lon,lat,zoom`) are all in it — so *Share → Copy link*, a bookmark and a
  feedback report all reopen at exactly the same place. `?tour=off` suppresses the welcome card and tour;
  `?theme=dark|light` sets the theme.
- **Taking it with you** (the *Export* group, folded by default): **Download data (zip)** hands over the
  bytes shown, the exact SQL against the release's content-addressed object URLs, per-dataset citations
  and `reproduce.R` / `reproduce.py` that run the same query; **Copy code** gives that SQL, or R or
  Python; **Share** copies the link, or the whole view as a PNG with the selection, release and URL
  stamped in a footer. Every panel's header has its own ⬇ (PNG · SVG · CSV), and the map's ⬇ beside the
  status chip exports the map with its legend (PNG) or the table the lens draws (CSV) — the map is WebGL,
  so it has no SVG.
- **Feedback** (💬 in the header) captures the view, lets you mark it up (arrow, circle, rectangle, pen,
  text; yellow, blue or hot pink) and sends it with your note, the view URL, release, viewport and theme
  to the team — by mail with the screenshot inline, to a Sheet, and as a public issue in this repo
  *without* your email. Without a configured endpoint the dialog offers a prefilled GitHub issue instead.
- **Keyboard:** `?` replays the tour · `Esc` closes a dialog or restores a maximized panel · `↑ ↓ Enter`
  in the lists · `A`–`Z` strip to jump in the flat list.

## Run it locally

```sh
npm install
```

### Preview locally (before pushing)

The app needs a release catalog to read. For development, use the catalog-shaped local copy of the
release objects (built once by `~/_big/calcofi/explore-spike/data2/build_dev_catalog.R`; the same
content is on GCS under `explore-dev`, which the deployed site reads):

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
node scripts/verify.mjs http://localhost:5178/ shots/dev --only=<regex>   # drive the app through its states
node scripts/verify.mjs http://localhost:5179/ shots/prod --timing        # + cold/warm lens timings
node scripts/bundle_check.mjs http://localhost:5178/ shots/bundle          # download two bundles and list them
node scripts/card_shots.mjs ~/Github/CalCOFI/CalCOFI.github.io/images     # the two themed card screenshots
node scripts/card_shots.mjs shots/v2 https://calcofi.io/explore/v2/ explore_v2   # the brand v2 preview, for the meeting
```

`verify.mjs` opens the installed Chrome (headed, fresh profile) at 1280 × 800 and 390 × 844, walks every
named state, screenshots each, asserts no horizontal overflow and every control in view, and writes
`results.json`. It is the only reliable way to see the app under automation; `--only` picks states by
regex. `npm run build` also type-checks (`tsc --noEmit`).

## Deploy

`.github/workflows/pages.yml` builds with `VITE_DATA_URL` + `VITE_RELEASE_PREFIX` + `VITE_BASE=/explore/`
(and `VITE_FEEDBACK_URL`, see below) and publishes `dist/` to GitHub Pages on every push to `main`. The
page reads `{prefix}/latest.txt` → `{prefix}/{version}/catalog.json` (plus the `coverage.json`,
`coverage_stations.json`, `grid.geojson` and `spatial.geojson` sidecars) and every object by its catalog
path — never a hand-built `releases/{v}/parquet/` path.

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
  lenses, `H3HexagonLayer`, `GeoJsonLayer`, `TripsLayer`) · DuckDB-WASM self-hosted in a Web Worker,
  no extensions, objects fetched whole and registered as buffers · Plotly for the depth strip, year
  strip, section and cruise series · `h3-js` · the brand from `calcofi.io/brand/<VITE_BRAND>/` — v1 (dark
  default) until the flip; `VITE_BRAND=v2` builds the SIO look (light default, Source Sans 3, the lockup at
  28 px, `data-cc-scale="app"`), which `pages.yml` also publishes at `calcofi.io/explore/v2/` as the preview
  for the 9/8 decision. `vite.config.ts` injects `brand/<v>.head.html`; `src/brand.ts` carries the same
  choice into the header and the capture (v2 embeds the woff2 files so the feedback PNG is set in Source
  Sans 3). `verify.mjs`'s `v2_*` states check a v2 dev server (`VITE_BRAND=v2 npm run dev`) and skip on v1.
- **Data:** the release's browser-shaped objects — `obs_bio`, one `obs_env` partition per variable,
  `sample_root`, `sample_spatial`, `taxon`, `dataset`, `measurement_type`, `cruise` — cut by
  `calcofi4db::build_*` at release time, resolved through the catalog by `src/release.ts` (a port of
  `calcofi4r::cc_release_sources()`). The category tree comes from `coverage.json` (`taxa[]` and
  `variables[].category`, calcofi4db ≥ 3.25.0; `src/categories.ts` keeps a keyword fallback for an
  older release); the categories themselves are `workflows/metadata/category.csv` and the icons
  `calcofi.io/brand/v1/icons/` (`scripts/build_icons.mjs` regenerates that sprite from
  `src/icon-paths.ts`, and the app renders the same paths inline).
- **Code map:** `sql/*.sql` are the lens queries the browser runs (`{{named}}` params, the shared
  filter in `_filters.sql`; `density.sql` is the denominator fixture shared with calcofi4r /
  calcofi4py) · `src/engine.ts` renders and times them · `src/state.ts` is the URL selection model
  (`fromUrl` / `toUrl`), the stage/denominator defaults and the denominator formulas · `src/App.tsx` the
  shell · `src/map.tsx` the layers and the lens-to-lens morph · `src/charts.tsx` the Plotly panels ·
  `src/picker.tsx` the organism / variable / cruise picker (tree + flat list) · `src/panels.tsx` the
  rails, floating cards and phone sheet · `src/export.ts` per-panel PNG/SVG/CSV and the footer stamp ·
  `src/capture.ts` the whole-view figure (one `html-to-image` composite; MapLibre runs with
  `preserveDrawingBuffer` so its canvas can be read) · `src/annotate.tsx` + `src/feedback.tsx` the
  feedback dialog · `src/bundle.ts` the download · `src/tour.ts` the guided tour over `data-tour`
  anchors · `src/help.tsx` the welcome and About dialogs.
- **Layout rule:** nothing re-lays out on a selection change — only a fold, maximize, drag, lens change
  or breakpoint moves panels. Card positions and the rail width live in `localStorage`; folds and
  maximize live in the URL.
- **Escape hatches:** `?native=1` swaps the pickers for plain `<select>`s; *SQL & timing* (in Export)
  opens a card with every timing mark and the last SQL (`window.__marks` is the same list).
