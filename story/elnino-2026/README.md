# The 2026 warm water off Southern California, in 30 seconds

The rendered film is under the summary of <https://calcofi.io/workflows/2026-11_temperature-anomaly.html>, whose
Code section lists these files at the commit the film was rendered from. It was first rendered from release
v2026.11.09 (that render is at <https://www.youtube.com/watch?v=5ReTP7iafkc>) and again from v2026.11.12 on
2026-11-13, when the page's data came out byte for byte the same: only `page/data/release.json`, and so the credit
line, changed.

A story page of its own in this repo: one fixed 1920 × 1080 stage driven by **one clock** (`t`, 0 to 30 s), so the
same page plays live in a browser and is stepped frame by frame into a video. It is not part of the Explorer: it has
its own Vite root and its own `tsconfig.json` here, `npm run build` and `npm test` never see it, and nothing in `src/`
changed.

What it draws is the Explorer's own, imported rather than copied:

| piece | from |
|---|---|
| colour ramps (cmocean *thermal* for temperature, *balance* for the difference from normal) | `src/ramps.ts` |
| the interpolated maps and their isolines (thin-plate spline, blank beyond 60 km of a station, land clipped) | `src/contour.ts` + `src/contour.worker.ts` |
| the sea floor (GEBCO 2025 terrain PMTiles, decoded in the page) and its depth ramp | `src/basemap.ts` (`BATHY_URL`, `BATHY_RAMP`); the decode is `src/curtain.tsx`'s `loadMosaic()`, repeated in `page/terrain.ts` because that module is React |
| the 3-D section (a curtain along the line, the floor as a mesh, vertical exaggeration baked in) | the recipe of `src/curtain.tsx`, as a smaller deck.gl scene in `page/main.ts` |
| fonts and tokens | the brand's own files, copied verbatim into `page/brand/` (calcofi.io/brand/v2: `fonts.css`, `theme.css`, Source Sans 3, Teko), dark |

## Two scales, fixed for the whole film

| | ramp | range | legend ticks |
|---|---|---|---|
| temperature at the surface | cmocean *thermal* | 11 to 26 °C | 12, 16, 20, 24 |
| difference from normal (maps, year bars and the section) | cmocean *balance* | −13 to +13 °C | −12, −6, 0, +6, +12 |

Neither is ever rescaled: a redder frame is a warmer ocean. The consequence is intended and is the story: ordinary
years are pale, 2014–15 pink, 2026 red, and the darkest red appears only under the surface in the last beat.

## The beats

| t (s) | beat | words on screen |
|---|---|---|
| 0 – 5.2 | The nine November cruises of the 1993–2013 baseline, one after another: the ship's track, each station at the surface (0–10 m) coloured by its temperature. The first is on screen from the first frame and holds 1.2 s; the others 0.5 s each. | "November" · the year · "Every fall, a ship measures the ocean off California" · the ship and its station count (stations with a 0–10 m CTD value on that cruise: the dots on screen) |
| 5.2 – 8.2 | All of them together: each station's values close into one, the release's own November normal there (a station with fewer than five cruises has none, and its dots leave). | "1993–2013" · "All of them together: the normal" · "Normal = the 1993–2013 average for November (9 cruises)" |
| 8.2 – 11 | The normal interpolated: first on a coarse regular grid, drawn as its cells, then the map with its isotherms. | "The normal, mapped between the stations" · "Normal = the 1993–2013 average for November" |
| 11 – 15 | The next year, 2014: its track, its stations, its grid, its map. | "2014" · "The next year: one cruise, its stations, its map" · "75 stations" |
| 15 – 17 | The same cruise as its difference from the normal. | "The same cruise, as its difference from normal" · "Red is warmer than normal, blue is cooler" |
| 17 – 24 | Each November since, 2015 to 2026, against the same normal; 2026 holds two seconds. | the year · "Each November since, against the same normal" · the station count; on 2026: "At the surface: 5 to 8 °C warmer than normal near the coast" |
| 24 – 30 | The camera tilts. The map splits along line 93.3: the half behind stays as the sea surface, the half in front leaves, and the section hangs below it: the difference from normal, surface to 200 m, all seven stations, vertical exaggeration × 300. | "Line 93.3, off San Diego" · "2026" · "+12.8 °C" · "at 40–50 m depth: the largest departure in CalCOFI's record, 1949–2026" · "25 °C water down to 55 m" |

Throughout: a *preliminary data* pill on any cruise whose CTD casts are not `final` in the release (2021 onward); the
credit "CalCOFI · calcofi.io · CTD casts · release v2026.11.12".

**The strip** along the bottom says which cruise, out of all of them. Every November cruise is a dot on the years'
line (the other months' CTD cruises a faint texture behind it); the one on screen is yellow with its year under it;
2018 and 2020, whose fall cruise ran in October, are two empty dashed slots marked "no November cruise" (found from
the data, not listed). From 2014 on each cruise the film has played keeps a bar: its mean surface difference from normal **over the
stations the 2026 cruise occupied** (`cruises.json` `mean_anom_fp`), so the bars compare the same stations every year.

## Where each number on screen comes from

No number is typed in `page/main.ts`. `build_data.sql` writes them, and stops the build if one cannot be said.

| on screen | field of `page/data/` | what it is |
|---|---|---|
| "+12.8 °C" | `facts.json` `max_anom` | the largest departure of any cell of the cruise (station × 10 m bin) from the release's November normal |
| "at 40–50 m depth" | `facts.json` `max_anom_bin` (and `max_anom_station` for the ring on the section) | that cell's bin and station |
| "CalCOFI's record, 1949–2026" | `facts.json` `record_from`, `record_to` | the first and last cruise year in the CTD and bottle series |
| "25 °C water down to 55 m" | `facts.json` `layer_temp`, `layer_depth` | at the core stations (28 and 30) the mean of the 1 m bins of the upper 50 m, rounded; and the deepest 1 m bin, counted down from the surface without a break, still within 0.5 °C of it |
| "5 to 8 °C warmer than normal near the coast" | `facts.json` `coast_min`, `coast_max`, rounded | the 0–10 m departures at the 17 stations of the inner Southern California Bight ((line ≥ 88 and station ≤ 37) or (line < 88 and station ≤ 51)). The other 18 stations run `offshore_min` to `offshore_max`; the build fails if the two ranges overlap |
| the year bars and "+4.3 °C" over the current one | `cruises.json` `mean_anom_fp` | the mean 0–10 m departure over the 2026 cruise's stations |
| "9 cruises", "75 stations", the ship | `cruises.json` (`n_stations`, `ship`) | counted from the release: the baseline's November cruises; the stations of a cruise that have a 0–10 m CTD value (the dots on screen, which can be fewer than the cruise occupied) |
| the empty slots, "no November cruise" | derived in the page | the years from 2014 with no November cruise in `strip.json` |
| "release v2026.11.12" | `release.json` | the release the analysis database was built from |

That the largest departure of the cruise is also the largest "in CalCOFI's record" is the finding of
`analysis/` (out/findings.md); the page only repeats it.

## Files

| file | what it is |
|---|---|
| `build_data.sh`, `build_data.sql` | Derive `page/data/*.json` from the analysis database (`analysis/01`–`04`, which read release objects through the catalog). Deterministic: no timestamp, no network. |
| `page/data/*.json` | `cruises` (the 20 November cruises and their roles), `stations` (cruise × station at 0–10 m: position, time, temperature, normal, difference), `normal` (the November climatology at 0–10 m), `strip` (every CTD cruise), `section` (line 93.3, November 2026, every 10 m bin), `facts`, `release`. Committed, so the page builds without the database. |
| `page/index.html`, `page/style.css` | The stage: the canvas, the column of words, the two legends, the strip. |
| `page/main.ts` | The clock, the beats, the deck.gl scene, the words. `layersAt(t)`, `camAt(t)`, `wordsAt(t)`, `stripSvg(t)` are pure functions of `t`. `selfCheck()` verifies that the section stays in the frame through the whole camera move. |
| `page/terrain.ts` | The terrain mosaic, the flat shaded sea floor of the bird's-eye beats, and the 3-D floor mesh: the terrain itself beside the section's line, low-passed away from it (an island at × 300 is a needle otherwise), fading into the ground with distance. |
| `page/brand/` | The brand's fonts and tokens as files (see its README). |
| `vite.config.ts`, `tsconfig.json` | The page's own Vite root (dev 5180, preview 5181, `dist/` here, git-ignored) and type check. |
| `capture.mjs` | Headless Chrome (puppeteer-core): waits for `window.__story.ready`, stops if the page's check fails, steps `setT(k / 30)`, screenshots each frame, encodes with ffmpeg. `--shots 3.2,12.5` writes single frames instead; `--query cam3=8.84,66,-32,1270,452` tries another 3-D camera. |
| `capture/webgl_probe.mjs` | Proves that headless Chrome draws WebGL2 on this machine (it does: ANGLE on Metal, default flags). |
| `capture/strings.mjs` | Lists every string the page's DOM puts on screen, beat by beat, with the second it first appears: the audit to check against the findings. |
| `render.sh` | All of it in one command. |
| `analysis/` | The findings (Job 1): owned by that work, not by the page. |

## Re-render

Needs: the analysis database (`analysis/`, see `analysis/findings.template.md`), `npm ci`, Google Chrome, `ffmpeg`
(`brew install ffmpeg`).

```sh
# from the repo root, on branch story-elnino-2026
story/elnino-2026/render.sh                              # the deliverables, about 2.5 minutes
story/elnino-2026/render.sh try_v3 --from 24 --to 30     # a rough cut of part of it → $JOB/out/rough/try_v3.mp4
```

`render.sh` with no argument rebuilds `page/data/*.json`, type-checks and builds the page, serves the build on port
5182, captures 900 frames and writes, under `JOB` (default `~/_big/calcofi/story_elnino_2026-11`):

- `out/calcofi_elnino_2026_30s.mp4`: 1920 × 1080, 30 fps, H.264 `yuv420p`, `+faststart`, no audio, 30.0 s;
- `out/calcofi_elnino_2026_poster.png`: the last captured frame, lossless;
- `out/frames/`: a frame per beat pulled from the MP4 (two for beats 6 and 7), five of them also at 390 px wide.

The same, step by step:

```sh
JOB=~/_big/calcofi/story_elnino_2026-11
story/elnino-2026/build_data.sh $JOB                                   # 1. page/data/*.json from $JOB/work/elnino.duckdb
npx tsc -p story/elnino-2026/tsconfig.json                             # 2. type-check the page
npx vite build --config story/elnino-2026/vite.config.ts               # 3. the static page, story/elnino-2026/dist/
npx vite preview --config story/elnino-2026/vite.config.ts &           # 4. serve it on http://localhost:5181/
node story/elnino-2026/capture.mjs --url http://localhost:5181/ --out $JOB/work/frames/final \
  --mp4 $JOB/out/calcofi_elnino_2026_30s.mp4 --poster $JOB/out/calcofi_elnino_2026_poster.png
```

Look at single moments without rendering everything:

```sh
node story/elnino-2026/capture.mjs --url http://localhost:5181/ --out $JOB/work/shots --shots 0,10.6,23.5,26.2,29.9
```

Every string on screen, in order (run it after a change to the words, and check the list against the findings):

```sh
node story/elnino-2026/capture/strings.mjs http://localhost:5181/
```

It reads the DOM: the column, the pill, the legends, the strip, beat 7's callout, tag and record label. The labels drawn
inside the scene are not DOM text: the four place names, the isoline values (even isotherms as "16°", every degree of
difference as "+2"), the section's "+4" and "+8", and its depth marks "50 m", "100 m", "150 m".

Live, with hot reload: `npx vite --config story/elnino-2026/vite.config.ts`, then <http://localhost:5180/>. Space
pauses, ← → step a second, `?t=12.5` holds one moment.

The page fetches one thing from the network when it starts, and waits for it before the first frame: 24 terrain tiles
by range request from the GEBCO archive on `storage.googleapis.com/calcofi-db/bathymetry/`. Fonts, tokens and data are
in the bundle. After the page is ready a capture touches no network.
