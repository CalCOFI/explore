# CalCOFI Explorer

One browser-native app across station, hexagon, cruise, region and section grains, over the
integrated CalCOFI database release — live at **https://calcofi.io/explore/**. Plan:
`workflows/.claude/plans/2026-08-28 CalCOFI Explorer …` (Phase 0 spike → Phases 1–2 shipped 2026-08-28).

What it does: every lens is SQL over the release's browser-shaped objects (`obs_bio`, one `obs_env`
variable, `sample_root`, `sample_spatial` — cut by `calcofi4db::build_*` at release time), run in
DuckDB-WASM in a worker and drawn with deck.gl; the picker is taxon × life stage × denominator with
dataset pills and excluded counts (plan D8 — nothing is averaged across denominators, datasets or
stages); the water-column and year strips are linked brushes; a station click opens its coverage card;
**⬇ download bundle** hands over the bytes, the exact SQL against the release's content-addressed
object URLs, citations and `reproduce.R`/`.py` (plan D10).

- Vite + React 18 + TypeScript · MapLibre GL (keyless CARTO style, swapped on `cc:theme`) ·
  deck.gl `MapboxOverlay` (`ScatterplotLayer` as the morph carrier, `H3HexagonLayer`,
  `GeoJsonLayer`, `TripsLayer`) · DuckDB-WASM **self-hosted in a Web Worker, no extensions**,
  objects fetched whole and registered as buffers · Plotly (depth strip, year strip, section,
  cruise series) · `h3-js` · brand v1 from `calcofi.io/brand/v1/` (dark default).
- `sql/*.sql` are the lens templates the browser runs (`{{named}}` params, the shared filter in
  `_filters.sql`, `density.sql` = the fixture shared with calcofi4r/calcofi4py); `src/engine.ts`
  renders + times them; `src/release.ts` resolves objects through the catalog (port of
  `cc_release_sources`); `src/state.ts` is the URL selection model (`lens · res · taxon|var · stage ·
  den · years · depth · layer · region · line · cruise · stat · anom · station · release · theme ·
  tour`); `src/map.tsx` the layers and the morph; `src/charts.tsx` the Plotly panels; `src/bundle.ts`
  the download; `src/App.tsx` the shell. The D8 defaults are `state.ts::defaultStage/defaultDen`
  (= `calcofi4r::cc_default_stage()/cc_default_denominator()`).

```sh
npm install
# data comes from a release catalog: VITE_DATA_URL is the bucket root, VITE_RELEASE_PREFIX the releases
# prefix under it (default https://storage.googleapis.com/calcofi-db/ + ducklake/releases). for dev,
# a catalog-shaped local copy of the Phase-1 objects (built by ~/_big/calcofi/explore-spike/data2/build_dev_catalog.R):
ln -s ~/_big/calcofi/explore-spike/data2 public/data2
VITE_DATA_URL=data2/ VITE_RELEASE_PREFIX=explore-dev/releases npm run dev   # http://localhost:5178/
npm run build && npx vite preview --host --port 5179   # the numbers are taken here
node scripts/verify.mjs http://localhost:5179/ shots/prod --timing   # headed Chrome, fresh profile → state screenshots + lens timings + results.json
node scripts/bundle_check.mjs http://localhost:5178/ shots/bundle  # download two bundles and list them
node scripts/card_shots.mjs ~/Github/CalCOFI/CalCOFI.github.io/images  # the two themed card screenshots
```

Deploy: `.github/workflows/pages.yml` builds with `VITE_DATA_URL` (bucket root) + `VITE_RELEASE_PREFIX`
(releases prefix under it) + `VITE_BASE=/explore/` and publishes `dist/` to GitHub Pages. The page
reads `{prefix}/latest.txt` → `{prefix}/{version}/catalog.json` (+ `coverage.json`,
`coverage_stations.json`, `grid.geojson`, `spatial.geojson` sidecars) and every object by its catalog
path — never a hand-built `releases/{v}/parquet/` path.

URL state: `lens · res · taxon|var · stage · den · years · depth · layer · region · line · cruise ·
stat · anom · theme · tour=off`, plus the panel folds and maximize (`hide=depth,years` · `max=section`,
absent when they are the viewport default). *SQL & timing* (EXPORT) opens the timing card, which lists
every mark; `window.__marks` is the same list. `?native=1` swaps the comboboxes for plain `<select>`s.

Layout (UI plan D11 · D18): the map is the page; the select / depth / years rails fold into state pills
and maximize into the box; section, cruise, station and timing are floating cards (minimize to a pill,
drag; position in `localStorage`); under 900 px the select rail is a bottom sheet with three detents and
the strips are pills on the map's edge. Nothing re-lays out on a selection change.
`scripts/verify.mjs --only=<regex>` screenshots every state at 1280 × 800 and 390 × 844 and asserts no
overflow and every control in view; `--timing` adds the cold/warm lens runs.

Figures and feedback (UI plan D17 · D19): every panel header has ⬇ PNG · SVG · CSV (`src/export.ts`, the
selection · release · URL stamped in a footer); Share ▾ copies the link, copies or downloads the whole view
as a PNG (`src/capture.ts`: one `html-to-image` composite of the app — MapLibre runs with
`preserveDrawingBuffer`); 💬 captures the view, lets you mark it up (`src/annotate.tsx`) and posts it with
the text, URL, release, viewport and theme to the endpoint `calcofi4r::cc_feedback_script()` generates
(`src/feedback.tsx`). The endpoint is `VITE_FEEDBACK_URL` at build time — a repository variable in
`pages.yml`; unset, the dialog offers the prefilled public GitHub issue only. Setup, once: a Sheet with
`feedback` (header = `calcofi4r::cc_feedback_header()`) and `recipients` tabs, the script deployed as a web
app ("execute as me", "anyone"), `GITHUB_TOKEN` (contents + issues on this repo) as a script property for
the public issue, the `/exec` URL in the variable. Usage events go through the fleet's GA4 snippet in
`index.html` (`calcofi4r::cc_ga_html("public/ga.html", "explore")`); a webdriver browser is never counted.
