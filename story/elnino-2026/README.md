# The 2026 warm water off Southern California, in a minute (square, for social feeds)

**This cut** (2026-11-13) is the square, 60 s film for social feeds. It follows Rasmus Swalethorp's notes on the 30 s
cut (email "hot off the press", 2026-11-13):

| his note | what the film does now |
|---|---|
| "switching to the seasonal climatology rather than the monthly" | every departure is from the release's **fall** normal: September–November, 1993–2013 (`climatology.season_mean`), so the series has a cruise every year (2018 and 2020 ran in October) |
| "use the 0–50m average instead as we are the only program that has high spatial resolution of deeper temperatures" | every map and every bar is the **0–50 m layer mean** of each CTD cast; the section still shows every 10 m bin to 200 m |
| "would add more years so the clip would have to be a bit longer or you just make a summary plot of the cruise track (the full track)" | one baseline cruise is sailed station by station; the other 22 then draw their full tracks in about three seconds; 60 s in all |
| "slowing down the frame rate when the text changes and/or maybe reduce text to just … '1993-2013 baseline' and maybe 'Change from baseline'" | one short line per beat, held at least 4 s; each year since 2014 holds 1.4 s (0.55 s before); the words are "1993–2013 baseline" and "Change from baseline" |
| "a headline at the top saying something like 'Fall ocean temperatures at 0-50m'" | that headline, on every frame of the maps; "… at 0–200 m" once the section comes up |

The earlier cut, 1920 × 1080 and 30 s against the November normal at the surface, is the page at commit `ec730cc`
(rendered from releases v2026.11.09 and v2026.11.12; <https://www.youtube.com/watch?v=5ReTP7iafkc>). It is linked
under the summary of <https://calcofi.io/workflows/2026-11_temperature-anomaly.html>.

A story page of its own in this repo: one fixed 1080 × 1080 stage driven by **one clock** (`t`, 0 to 60 s), so the
same page plays live in a browser and is stepped frame by frame into a video. It is not part of the Explorer: it has
its own Vite root and its own `tsconfig.json` here, `npm run build` and `npm test` never see it, and nothing in `src/`
changed.

What it draws is the Explorer's own, imported rather than copied:

| piece | from |
|---|---|
| colour ramps (cmocean *thermal* for temperature, *balance* for the change from baseline) | `src/ramps.ts` |
| the interpolated maps and their isolines (thin-plate spline, blank beyond 60 km of a station, land clipped) | `src/contour.ts` + `src/contour.worker.ts` |
| the sea floor (GEBCO 2025 terrain PMTiles, decoded in the page) and its depth ramp | `src/basemap.ts` (`BATHY_URL`, `BATHY_RAMP`); the decode is `src/curtain.tsx`'s `loadMosaic()`, repeated in `page/terrain.ts` because that module is React |
| the 3-D section (a curtain along the line, the floor as a mesh, vertical exaggeration baked in) | the recipe of `src/curtain.tsx`, as a smaller deck.gl scene in `page/main.ts` |
| the seasons (DJF / MAM / JJA / SON by the cruise's median month) | `src/anomaly.ts` (`seasonOf`, `SEASON_WORD`), the release's `quarter` |
| fonts and tokens | the brand's own files, copied verbatim into `page/brand/` (calcofi.io/brand/v2: `fonts.css`, `theme.css`, Source Sans 3, Teko), dark |

## The frame

Words never sit on the data. Top to bottom: the headline; a row with the year (or, at the end, the record) and one
short line beside it; the map; the strip of years; the credit. The legend sits in the open ocean north-west of the
pattern, on a backdrop of its own. Type is sized for a phone, where the frame is about 390 px wide: the line beside the
year is 42 px here, about 15 px there.

## Two scales, fixed for the whole film

| | ramp | range | legend ticks |
|---|---|---|---|
| temperature, 0–50 m mean | cmocean *thermal* | 11 to 26 °C | 12, 16, 20, 24 |
| change from baseline (maps, year bars and the section) | cmocean *balance* | −13 to +13 °C | −12, −6, 0, +6, +12 |

Neither is ever rescaled: a redder frame is a warmer ocean. The 0–50 m changes of ordinary years are pale against a
±13 °C scale; 2015 is pink, 2026 red, and the darkest red appears only under the surface in the last beat.

## Three cuts: °C, °F, both

The same page renders three films (`?units=`, or `UNITS=` for `render.sh`). The data stay in °C and every colour is
the same in all three; only the words and the isolines change.

| | `C` (default): scientific | `F`: a general US audience | `CF`: both, for a mixed feed |
|---|---|---|---|
| legends | 12 … 24 °C; −12 … +12 °C | 55 … 75 °F; −20 … +20 °F | the °C ticks, with a quieter °F row under them |
| map isolines | every 1 °C (even ones heavier; isotherms labelled every 2 °C) | every 2 °F (every 4 °F heavier; isotherms labelled every 4 °F) | as `C` |
| section isolines | +4, +8 °C | +8, +16 °F | as `C` |
| the bar on screen | "+4.5 °C" | "+8.0 °F" | "+4.5 °C · +8.0 °F" |
| the record | "+11.9 °C" | "+21.3 °F" | "+11.9 °C", and "+21.3 °F, at 50–60 m: …" beside it |
| the tag | "25 °C water down to 55 m" | "77 °F water down to 55 m" | "25 °C (77 °F) water down to 55 m" |

A change converts without the 32: +11.9 °C of change is +21.3 °F, not 53 °F. Every °F figure is converted from the
unrounded value (`facts.json` `max_anom_raw`, `layer_temp_raw`; `cruises.json` `mean_fp` to 3 decimals), never from a
figure already rounded in °C: 11.856 °C is 21.3 °F, where the rounded 11.9 would give 21.4. Depths stay in metres in
every cut.

## The beats

| t (s) | beat | words on screen (besides the headline) |
|---|---|---|
| 0 – 7 | One fall cruise, 1993: the ship sails its track, each station coloured by its 0–50 m mean temperature as the ship reaches it. The faint grid is every station that has a fall baseline. | "1993" · "Each fall, a ship samples the same stations" |
| 7 – 12 | The other 22 baseline cruises (1994–2013; 1998 had three) draw their full tracks one after another, the strip lighting each; then the 1993 colours give way to the baseline at each station. | "1993–2013" · "baseline" |
| 12 – 17 | The baseline interpolated: first on a coarse regular grid, drawn as its cells, then the map with its isotherms. | (the same) |
| 17 – 23 | The next year, 2014: its track, its stations, its grid, its map. | "2014" |
| 23 – 27.5 | The same cruise as its change from the baseline. Every baseline year's bar comes up on the strip, and 2014's. | "2014" · "Change from baseline" |
| 27.5 – 47.5 | Each fall since, 2015 to 2026, 1.4 s each against the same baseline; 2026 holds 4.6 s. | the year · "Change from baseline" · *preliminary data* from 2021 |
| 47.5 – 60 | The camera tilts. The map splits along line 93.3: the half behind stays as the sea surface, the half in front leaves, and the section hangs below it: the change from baseline, surface to 200 m, all seven stations, vertical exaggeration × 300. At 51.5 s the year gives way to the record, and a ring marks its cell. | "2026" · "Line 93.3, off San Diego" · "25 °C water down to 55 m" · "+11.9 °C" · "at 50–60 m: the largest change from baseline in CalCOFI's record, 1949–2026" |

Throughout: a *preliminary data* pill on any cruise whose CTD casts are not `final` in the release (2021 onward); the
credit "CalCOFI · calcofi.io · CTD casts · release v2026.11.12".

**The strip** along the bottom says which cruise, out of all of them. Every fall cruise from 1993 is a dot on the
years' line (the other seasons' CTD cruises a faint texture behind it); the one on screen is yellow with its year
under it. From the moment the change from baseline is on screen every year has a bar: its mean 0–50 m change **over
the stations the 2026 cruise occupied** (`cruises.json` `mean_fp`), so the bars compare the same stations every year.
A cruise that occupied fewer than 60 % of them has no bar (1998's two small cruises). The baseline years' bars come
up together; each year since as the film plays it.

## Where each number on screen comes from

No number is typed in `page/main.ts`. `build_data.sql` writes them, and stops the build if a claim cannot be said.

| on screen | field of `page/data/` | what it is |
|---|---|---|
| "+11.9 °C" | `facts.json` `max_anom` | the largest departure of any cell of the 2026 cruise (station × 10 m bin) from the release's fall normal. The build stops unless it is larger than every other cruise's, CTD or bottle (`prev_max_anom`, +6.9 °C) |
| "at 50–60 m" | `facts.json` `max_anom_bin` (and `max_anom_station`, 93.3 28.0, for the ring) | that cell's bin and station |
| "CalCOFI's record, 1949–2026" | `facts.json` `record_from`, `record_to` | the first and last cruise year in the CTD and bottle series |
| "25 °C water down to 55 m" | `facts.json` `layer_temp`, `layer_depth` | at the core stations (28 and 30) the mean of the 1 m bins of the upper 50 m, rounded; and the deepest 1 m bin, counted down from the surface without a break, still within 0.5 °C of it |
| the year bars and "+4.5 °C" over the current one | `cruises.json` `mean_fp` | the mean 0–50 m change over the 2026 cruise's stations (`analysis/03_rank_layers.sql` `cruise_layer`). The build stops unless 2026's is the highest of any cruise in any season (`facts.json` `fp_prev`: +2.7 °C, fall 2015) |
| the maps' colours | `stations.json` `temp`, `anom`; `normal.json` `clim` | each cast's 0–50 m mean (`analysis/02_layers.sql` `station_layer`: the 10 m bins 0–40, put on every bin by interpolation in depth, kept only where the layer is complete) and its change from the fall normal; the normal's 0–50 m mean at each station (the five bins' `season_mean`, all five required) |
| the cruises, "1998 had three" | `cruises.json` (`role`, `primary`) | every CTD cruise from 1993 whose season is SON; a year with more than one plays its fullest (`primary`); all of them feed the normal |
| "release v2026.11.12" | `release.json` | the release the analysis database was built from |

The station means agree with "the 0–50 m temperature minus the 0–50 m normal" to 0.0002 °C on average (at most
0.23 °C, at a cast whose layer was interpolated). That 2026's departures are the largest "in CalCOFI's record" under
the seasonal normal too is also the finding of `analysis/` (out/findings.md: "+11.86 °C" against the seasonal normal;
on shared stations, +4.69 against +2.72 for November 2015 at 0–50 m); the page only repeats it.

## Files

| file | what it is |
|---|---|
| `build_data.sh`, `build_data.sql` | Derive `page/data/*.json` from the analysis database (`analysis/01`–`04`, which read release objects through the catalog). Deterministic: no timestamp, no network. |
| `page/data/*.json` | `cruises` (the 36 fall cruises and their roles), `stations` (cruise × station: position, time, 0–50 m temperature and change), `normal` (the fall baseline's 0–50 m mean at each station), `strip` (every CTD cruise from 1993), `section` (line 93.3, fall 2026, every 10 m bin), `facts`, `release`. Committed, so the page builds without the database. |
| `page/index.html`, `page/style.css` | The stage: the canvas, the headline, the row of words, the legends, the strip. |
| `page/main.ts` | The clock, the beats, the deck.gl scene, the words. `layersAt(t)`, `camAt(t)`, `wordsAt(t)`, `stripSvg(t)` are pure functions of `t`. `selfCheck()` verifies that the section stays in the frame, between the words and the strip, through the whole camera move, and that the record's cell is one the section draws. |
| `page/terrain.ts` | The terrain mosaic, the flat shaded sea floor of the bird's-eye beats, and the 3-D floor mesh. |
| `page/brand/` | The brand's fonts and tokens as files (see its README). |
| `vite.config.ts`, `tsconfig.json` | The page's own Vite root (dev 5180, preview 5181, `dist/` here, git-ignored) and type check. |
| `capture.mjs` | Headless Chrome (puppeteer-core): waits for `window.__story.ready`, stops if the page's check fails or its stage is not the capture's size (`--size`, default 1080x1080), steps `setT(k / 30)`, screenshots each frame, encodes with ffmpeg. `--shots 3.2,12.5` writes single frames instead; `--query units=F` (or `CF`) captures another cut; `--query cam3=8.5,64,-32,546,486` tries another 3-D camera (and only then is the frame check advisory). |
| `capture/webgl_probe.mjs` | Proves that headless Chrome draws WebGL2 on this machine (it does: ANGLE on Metal, default flags). |
| `capture/strings.mjs` | Lists every string the page's DOM puts on screen, beat by beat, with the second it first appears: the audit to check against the findings. |
| `render.sh` | All of it in one command. |
| `analysis/` | The findings (Job 1): owned by that work, not by the page. |

## Re-render

Needs: the analysis database (`analysis/`, see `analysis/findings.template.md`), `npm ci`, Google Chrome, `ffmpeg`
(`brew install ffmpeg`; the Mac mini has none, so render on the laptop: copy `work/elnino.duckdb` and `work/release/`
from the mini's job folder).

```sh
# from the repo root
story/elnino-2026/render.sh                              # the deliverables, about 5 minutes
story/elnino-2026/render.sh try_v3 --from 47 --to 60     # a rough cut of part of it → $JOB/out/rough/try_v3.mp4
```

`render.sh` with no argument rebuilds `page/data/*.json`, type-checks and builds the page, serves the build on port
5182, captures 1800 frames and writes, under `JOB` (default `~/_big/calcofi/story_elnino_2026-11`):

- `out/calcofi_elnino_2026_square.mp4`: 1080 × 1080, 30 fps, H.264 `yuv420p`, `+faststart`, no audio, 60.0 s;
- `out/calcofi_elnino_2026_square_poster.png`: the last captured frame, lossless;
- `out/frames/`: a frame per beat pulled from the MP4 (two for beats 6 and 7), five of them also at 390 px wide.

`UNITS=F story/elnino-2026/render.sh` and `UNITS=CF …` write the other two cuts beside it, suffixed `_F` and `_CF`
(`calcofi_elnino_2026_square_F.mp4`, `…_F_poster.png`, `out/frames_F/`).

The same, step by step:

```sh
JOB=~/_big/calcofi/story_elnino_2026-11
story/elnino-2026/build_data.sh $JOB                                   # 1. page/data/*.json from $JOB/work/elnino.duckdb
npx tsc -p story/elnino-2026/tsconfig.json                             # 2. type-check the page
npx vite build --config story/elnino-2026/vite.config.ts               # 3. the static page, story/elnino-2026/dist/
npx vite preview --config story/elnino-2026/vite.config.ts &           # 4. serve it on http://localhost:5181/
node story/elnino-2026/capture.mjs --url http://localhost:5181/ --out $JOB/work/frames/final \
  --mp4 $JOB/out/calcofi_elnino_2026_square.mp4 --poster $JOB/out/calcofi_elnino_2026_square_poster.png
```

Look at single moments without rendering everything:

```sh
node story/elnino-2026/capture.mjs --url http://localhost:5181/ --out $JOB/work/shots --shots 3,11.6,16.5,46,59.9
```

Every string on screen, in order (run it after a change to the words, and check the list against the findings):

```sh
node story/elnino-2026/capture/strings.mjs http://localhost:5181/            # the °C cut
node story/elnino-2026/capture/strings.mjs http://localhost:5181/ units=CF   # another
```

It reads the DOM: the headline, the year and its line, the pill, the legends, the strip, the tag. The labels drawn
inside the scene are not DOM text: the three place names, the isoline values (even isotherms as "16°", every degree of
change as "+2"), the section's "+4" and "+8", and its depth marks "50 m", "100 m", "150 m".

If headless Chrome cannot write its profile (`EACCES … mkdtemp`, as in a sandboxed shell), point `TMPDIR` at a writable
folder first.

Live, with hot reload: `npx vite --config story/elnino-2026/vite.config.ts`, then <http://localhost:5180/>. Space
pauses, ← → step a second, `?t=12.5` holds one moment.

The page fetches one thing from the network when it starts, and waits for it before the first frame: 24 terrain tiles
by range request from the GEBCO archive on `storage.googleapis.com/calcofi-db/bathymetry/`. Fonts, tokens and data are
in the bundle. After the page is ready a capture touches no network.
