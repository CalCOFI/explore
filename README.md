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
- **A section is laid out like the map, and carries both rulers.** *Sections* draws **offshore on the left,
  the coast on the right** — a CalCOFI line runs west-south-west off the coast — and labels the x-axis
  **station number above, distance offshore below**. The two are one ruler: `+proj=calcofi` is equidistant
  along a line at **7.386 km = 3.99 nmi (4 nautical miles) per station unit**, measured constant to 0.02 %
  over the 665 km of line 90, so the axis is linear in both at once. It is linear rather than categorical
  for that reason: spacing stations evenly by index drew 80 → 90 (74 km) as wide as 30 → 35 (37 km).
  [ctd-transects](https://calcofi.io/ctd-transects/) draws the same section the same way.
- **A section's anomaly is a departure from one fixed baseline.** In the *Sections* lens, *anomaly vs
  1993–2013 monthly climatology* subtracts the release's own `climatology` table
  (`calcofi4db::build_climatology()`): the mean for that station, the cast's **own calendar month** and
  its 10 m depth bin over 1993–2013, kept only where at least 3 cruises contribute — the same table
  [ctd-transects](https://calcofi.io/ctd-transects/) subtracts, so the two products cannot disagree. The
  year, season and depth filters do not touch the baseline (that is what makes anomalies comparable
  across cruises); the datasets in view are pooled weighted by their observation counts. Red is above
  normal, blue below, the scale symmetric about zero; a cell with no baseline is blank, never zero.
- **The URL is the whole view.** Lens, organism or variable, stage, denominator, years, season, depth,
  dataset filter, region, line, cruise, summary statistic, theme, the sea floor (`bathy=`, `bathyo=`), which panels are folded or maximized,
  and the **map extent** (`map=lon,lat,zoom`) are all in it — so *Share → Copy link*, a bookmark and a
  feedback report all reopen at exactly the same place. `?tour=off` suppresses the welcome card and tour
  (and opens no modal at all); `?modal=sources` opens *Data Sources &amp; Attribution*, the one modal the URL
  carries, so an attribution link is shareable;
  `?theme=dark|light` sets the theme. The **sea floor** under every lens is GEBCO 2025 (shaded relief +
depth colour + isobaths), drawn from terrain-RGB PMTiles at
`storage.calcofi.io/calcofi-db/bathymetry/` (override with `VITE_BATHY_URL`); the layers button on the
map toggles its parts and opacity, `?bathy=off` reproduces the plain basemap, `bathy=relief,contours`
keeps a subset, `bathyo=0.5` sets its opacity. The style is COMPOSED (CARTO ⊕ sea floor, one object,
`setStyle(diff)`), so a theme flip can never drop the layers — see the 2026-08-31 map-layers plan in
CalCOFI/workflows for how the tiles are built.
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

## Attribution

These are sixteen datasets that people collected, curated and depend on being cited for, and a view
usually **pools several of them** — the statistic is averaged across the datasets that share the chosen
life stage and denominator (never across denominators or life stages). Pooling is exactly why each of
those datasets has to be named, so the app names them everywhere a number can leave it:

- **The welcome card asks for the promise.** Its primary button is *"I will cite the datasets I use"*;
  pressing it stores `explore_cite_ack` beside `explore_welcome`. It is **not a gate** — *Take the tour*,
  Esc and the close box all still enter the app. `?tour=on` shows the card again, `?tour=off` never shows
  it (the brand contract's deterministic screenshot).
- **The Sources line** sits in the SELECT rail directly under the dataset pills: one chip per dataset the
  view pools — `provider · dataset · licence` — that opens that dataset's citation with a copy button.
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
node scripts/verify.mjs http://localhost:5178/ shots/dev --only=<regex>   # drive the app through its states
node scripts/verify.mjs http://localhost:5179/ shots/prod --timing        # + cold/warm lens timings
node scripts/bundle_check.mjs http://localhost:5178/ shots/bundle          # download two bundles and list them
node scripts/card_shots.mjs ~/Github/CalCOFI/CalCOFI.github.io/images     # the two themed card screenshots
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
  strip, section and cruise series · `h3-js` · the brand from `calcofi.io/brand/<VITE_BRAND>/` — v2, the SIO look
  (light default, Source Sans 3, the lockup at 28 px, `data-cc-scale="app"`), since the flip on
  2026-09-04; `VITE_BRAND=v1` still builds the superseded dark-default look. `vite.config.ts` injects
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
  calcofi4py) · `src/engine.ts` renders and times them · `src/state.ts` is the URL selection model
  (`fromUrl` / `toUrl`), the stage/denominator defaults and the denominator formulas · `src/App.tsx` the
  shell · `src/map.tsx` the layers and the lens-to-lens morph · `src/charts.tsx` the Plotly panels ·
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
