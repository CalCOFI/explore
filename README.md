# CalCOFI Explorer — Phase-0 spike

One browser-native app across station, hexagon, cruise, region and section grains, over the
integrated CalCOFI database (release v2026.08.25). This is the **Phase-0 spike** from
`workflows/.claude/plans/2026-08-28 CalCOFI Explorer …` — a demo of the grain morph and a
measurement of the D4 cold-start budget, not Phase 2. Ugly is fine; slow is a finding.

- Vite + React 18 + TypeScript · MapLibre GL (keyless CARTO style, swapped on `cc:theme`) ·
  deck.gl `MapboxOverlay` (`ScatterplotLayer` as the morph carrier, `H3HexagonLayer`,
  `GeoJsonLayer`, `TripsLayer`) · DuckDB-WASM **self-hosted in a Web Worker, no extensions**,
  objects fetched whole and registered as buffers · Plotly (depth strip, year strip, section,
  cruise series) · `h3-js` · brand v1 from `calcofi.io/brand/v1/` (dark default).
- `sql/*.sql` are the lens templates the browser runs (`{{named}}` params, the shared filter in
  `_filters.sql`); `src/engine.ts` renders + times them; `src/state.ts` is the URL selection model;
  `src/map.tsx` builds the layers and the morph; `src/charts.tsx` the Plotly panels; `src/App.tsx`
  the shell. The D8 picker (taxon × life stage × denominator, dataset pills, excluded counts) lives
  in `App.tsx` + `state.ts::defaultStage/defaultDen`.

```sh
ln -s ~/_big/calcofi/explore-spike/data public/data   # the hand-cut objects (see the plan)
npm install
npm run dev            # http://localhost:5178/  (+ --host for a phone)
npm run build && npx vite preview --host --port 5179   # the numbers are taken here
node scripts/verify.mjs http://localhost:5179/ shots/prod   # headed Chrome, fresh profile → screenshots + results.json
```

URL state: `lens · res · taxon|var · stage · den · years · depth · layer · region · line · cruise ·
stat · anom · theme · tour=off`. The timing panel (bottom-right of the map) lists every mark;
`window.__marks` is the same list.
