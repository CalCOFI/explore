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

### The 28 s cut (`?cut=short`, 2026-11-18)

Rasmus's notes on this minute (same thread, 2026-11-17) make a second cut of the same page, beside it rather than in
place of it: `?cut=short` in the browser, `CUT=short` for `render.sh`. Without the parameter the page is the minute,
frame for frame.

| his note | what the short cut does |
|---|---|
| "20-30 seconds is probably the maximum it should be" | 28 s |
| "only draw the lawnmower pattern in the beginning, without the redrawing of the crisscrossing between stations" | 1993 is sailed station by station (3.5 s); the other 22 baseline cruises draw no tracks, and 2014 goes straight from the baseline map to its change from it, with no track and no temperature map; the coarse grid is dropped too |
| "move quicker through the years, only pausing a bit longer in 2015 - last big el nino, and 2026" | each year 0.55 s; 2015 holds 2.2 s, 2026 2.5 s before the section. The pause years are read from the data: the previous high (`facts.json` `fp_prev_cruise`) and the last cruise |
| "only write out the average anomalies in those years at the bottom" | the value over the bar ("+2.7 °C · +4.8 °F", "+4.5 °C · +8.0 °F") shows on 2015 and 2026 only; every year keeps its bar |

| t (s) | beat |
|---|---|
| 0 – 4.4 | 1993 sailed; "Each fall, a ship samples the same stations" |
| 4.4 – 7.8 | the 1993 colours give way to the baseline at each station, then the baseline map; "1993–2013 baseline" |
| 7.8 – 9.4 | 2014 as its change from the baseline; the baseline years' bars and 2014's come up |
| 9.4 – 19.6 | 2015 (2.2 s), 2016–2025 (0.55 s each), 2026 (2.5 s) |
| 19.6 – 28 | the section, as in the minute: the tilt, the tag, at 23.6 s the record |

It writes `out/calcofi_elnino_2026_short.mp4` (and `_short_F`, `_short_CF`), their posters and `out/frames_short*/`;
the minute's files are never touched.

### The 35 s cut (`?cut=35s`, 2026-11-18)

The notes on the 28 s cut (same thread, 2026-11-18: Mark Gold; Rasmus Swalethorp; Lauren Fimbres Wood and Hallie
Jacobs of Scripps communications) make a third cut, again beside the other two: `?cut=35s`, `CUT=35s` for `render.sh`.
It is the short cut's structure, slower, with the partners and the warm events named. The minute and the 28 s cut are
unchanged: their frames, captured before and after this change at 11 times, match to 2 pixels.

| the note | what the 35 s cut does |
|---|---|
| "Can we get away with 35 seconds. Same content with slower pace? Especially from Blob to present?"; "it moved realllly fast since there are numbers / data on top of it" | 35 s. 2014 holds 2.2 s (1.6), 2015 2.8 s (2.2), 2016 1.4 s (0.55), each later year 0.85 s (0.55), 2026 2.75 s (2.5); a year's map fades in 0.3 s (0.22); the section 8.5 s, the record held 4.5 s |
| "putting SWFSC and SIO-UCSD in there, maybe flashing the logos on the first page of the video" | the first 2 s are a card over the still empty map: the CalCOFI lockup, the UC San Diego Scripps Institution of Oceanography lockup, and the NOAA seal with its names (NOAA Fisheries, Southwest Fisheries Science Center); it leaves as the ship sets out |
| "UCSD, SIO needs to be acknowledged on all. NOAA too" | the credit on every frame: "CalCOFI · Scripps Institution of Oceanography, UC San Diego · NOAA Fisheries · calcofi.io · v2026.11.12" |
| "say the 2014-2016 period was the Blob plus El Nino"; "briefly show the Blob + El Nino in big text on 15-16" | a second line beside the year, in the display face, "THE BLOB + EL NIÑO", on 2014, 2015 and 2016; and a bracket "Blob + El Niño" over those three bars on the strip, which stays to the last frame, so 2026's bar is read against them |
| "emphasize that this is El Nino plus MHW driven" | the same line on 2026: "EL NIÑO + MARINE HEATWAVE" (the posts' wording: NOAA reports a strong El Niño on top of a marine heatwave) |

The event names are editorial labels typed in `page/main.ts` (`BLOB_YEARS`, `BLOB`, `NOW_EVENT`), not data. The
year that pauses as the previous high is read from `cruises.json`: the warmest fall since 2014 before the last (2015).
It is not `facts.json` `fp_prev_cruise`, which ranks every season, so a later release could name a cruise this beat
never plays. v2026.11.18 did: with all 53 casts of cruise 2611, fall 1997 (+2.5 °C) comes out above fall 2015 (+2.3 °C)
over the larger footprint. The 28 s cut read `fp_prev_cruise` until then, and now takes this rule too.

| t (s) | beat |
|---|---|
| 0 – 2.3 | the partners' card; the headline and the strip already up; the year row and the legend come as it leaves |
| 2.1 – 6.1 | 1993 sailed; "Each fall, a ship samples the same stations" |
| 6.1 – 9.7 | the baseline at each station, then its map; "1993–2013 baseline" |
| 9.7 – 11.9 | 2014 as its change from the baseline; at 10.9 "THE BLOB + EL NIÑO" and the bracket |
| 11.9 – 26.5 | 2015 (2.8 s, its value over its bar), 2016 (1.4 s), 2017–2025 (0.85 s each), 2026 (2.75 s, its value, "EL NIÑO + MARINE HEATWAVE") |
| 26.5 – 35 | the section, as in the other cuts: the tilt, the tag, at 30.5 s the record |

**°F leads the record in the both-units 35 s cut** (Ben, 2026-11-18: "+21.3 F to be the prominent number"): the big
number is "+21.3 °F" and the line beside it starts "+11.9 °C, at 50–60 m: …" (`F_FIRST` in `page/main.ts`). The °F
cut already led with °F, and the °C cut has no °F, so neither changes; nor do the minute and the 28 s cut.

**Widescreen** (`?aspect=wide`, `ASPECT=wide` for `render.sh`; 2026-11-18, for broadcast): the same film on a
1920 × 1080 stage, its own layout rather than the square with bars at its sides. The headline runs across the top;
the year, its line, the event line, the pill and the legend stand in a column on the left (690 px, over a scrim of
their own); the map fills the frame right of x = 760 (`MAP_X0`), larger than in the square (708 px of height for the
pattern, 592 in the square); the strip runs the full width (bars 26 px wide). The 3-D section keeps the square's
camera (zoom 8.5, pitch 64, bearing −32) with its middle at (1310, 486): the self-check now also stops a capture whose
section crosses into the column of words (it spans x 798–1682 through the move). The terrain mosaic is loaded wider
for the wider view. It writes `out/calcofi_elnino_2026_35s_wide.mp4` (and `_35s_wide_F`, `_35s_wide_CF`), their
posters and `out/frames_35s_wide*/` (no phone-width frames).

It writes `out/calcofi_elnino_2026_35s.mp4` (and `_35s_F`, `_35s_CF`), their posters and `out/frames_35s*/`. The
logos are copied into `page/logos/`: from calcofi.io `brand/v2/logo_calcofi_h.svg` and `images/partners/noaa.png` (160 px,
shown at 156 px); and Scripps's own lockup, `ucsd-sio_vertical_white.png` (the vertical lockup, full-color globe with the
logotype reversed to white, as the [Scripps brand guidelines](https://scripps.ucsd.edu/portal/employee-resources/scripps-oceanography-brand-guidelines)
ask over a dark ground; rendered from `UCSD-SIO_Vertical-White_RGB.pdf` of the Scripps logo kit, cropped to the artwork,
1200 px wide, shown at 380 px, with no caption since it carries its name).

### The social cut (`?cut=social`, 2026-11-19) and the tall frame (`?aspect=tall`)

Lauren Fimbres Wood (Scripps communications, 2026-11-19): "for social I recommend only doing the logos at the end. You
only have so many seconds to catch people's attention and the video should go straight into it." Ben chose the hook
"77 years of measurements. Nothing like this." and kept the Blob, El Niño and the marine heatwave for later in the
film, where the 35 s cut already names them. The social cut is the 35 s cut with a cold open and its partners' card
moved to the end; `CUT=social` for `render.sh`. The 35 s cut's files (the ones sent to CBS) are untouched.

| v (s, video) | t (s, the film's clock) | what |
|---|---|---|
| 0 – 3.0 | 31.5, held | the hook: the last beat's section under a slow push-in (zoom 8.26 → 8.46, `hookCam`), the record's ring, no tag, legend, headline or strip; "77 years of measurements." (from `facts.json`: `record_to − record_from`), "OFF THE CHARTS." in the record's colour and face, and "+21.3 °F (+11.9 °C) warmer than normal at 50–60 m, off San Diego" with the pill |
| 2.75 – 3.25 | | the dip to the ground (`#dip`), the cut at its darkest, at 3.0 |
| 3.0 – 36.6 | 1.8 – 35.4 | the 35 s cut from just before the ship sets out: its beats 1.2 s later than in the 35 s cut |
| 34.2 – 36.6 | 32.4 – 35.4 | the partners' card over the record (fading in over 0.4 s); the legend, the tag, the ring, the depth marks and San Diego leave under it |

The poster is the first frame (the hook; `capture.mjs --poster-at 0`), which most feeds also show before a video plays.
On a loop the card runs straight back into the hook. The credit stays on every frame, hook included. "Warmer than normal"
in the hook is the film's "change from baseline" in plain words: the normal is the 1993–2013 fall mean (the
baseline).

**Tall** (`?aspect=tall`, `ASPECT=tall`; 2026-11-19, for Instagram Reels): 1080 × 1920. The square's bands are set
318 px lower (`TOP`) and the map is 180 px taller between them (`EXT`); the credit moves above the headline. Everything
that carries meaning sits inside the 4:5 band (y 285–1635) that a feed shows of a Reel, below the top 250 px and above
the bottom 340 px (Reels' own header, caption and name), and the strip's right end and the map stop 130 px short of the
right edge (`RIGHT`), where Reels puts its buttons. The 3-D section's camera is zoom 8.4 (8.5 in the square, whose
section would cross the left edge here) with its middle at (530, 894); it spans x 42–900 through the move.

**The hook's words** (`HOOK_BIG`): "Nothing like this." first (Ben's pick from five options, 2026-11-19), then "Off the
charts." the same day (Mark Gold: "I like 'off the charts!' as a hook. The temps are literally off the charts and it is
a cliche everyone gets"). Each hook has its own file names, so links already sent keep what they showed:
`calcofi_elnino_2026_social*` is "Nothing like this." (release v2026.11.18, workflows `c5e46b3`), and
`calcofi_elnino_2026_offthecharts*` is "Off the charts.". `render.sh` names the social cut's files by `FILECUT`
(`offthecharts` by default): `out/calcofi_elnino_2026_offthecharts.mp4` (and `_F`, `_CF`), `_offthecharts_wide*` and
`_offthecharts_tall*`, their posters and `out/frames_offthecharts*/` (phone-width frames for the square and the tall
frame). A new hook takes a new `FILECUT`.

**All 53 casts of cruise 2611: release v2026.11.18** (2026-11-19; Ben Gire's file of 18 Nov adds 17 casts on lines 80
and 83.3, 7–10 Nov, and its 36 earlier casts are identical in `TempAve`). The analysis database was rebuilt from it
(`analysis/fetch_release.py $JOB/work/release_v2026.11.18 v2026.11.18`, then `01`–`04`, into a fresh
`$JOB/work/elnino.duckdb`; `$JOB/work/release` is now a symlink to `release_v2026.11.18`, and the v2026.11.12 database
is kept as `elnino_v2026.11.12.duckdb`), and every published film was re-rendered from it: the minute, the 28 s, the
35 s (square and wide) and the social cut (square, wide and tall), each in C, F and CF. What moved: 2026's stations
with a 0–50 m mean, 32 → 46; 2026's bar, +4.5 → +4.4 °C (+8.0 → +7.8 °F); 2015's, +2.7 → +2.3 °C (+4.8 → +4.2 °F); the
previous high over the same stations (`fp_prev_cruise`) is now fall 1997, +2.5 °C. The record (+11.9 °C at 50–60 m on
line 93.3 28.0) and the 25 °C layer to 55 m are unchanged. The only code change is the 28 s cut's pause year (above).
The bars are averaged over the stations 2026 occupied, so every bar moved with the larger footprint, not only 2026's.

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
(`calcofi_elnino_2026_square_F.mp4`, `…_F_poster.png`, `out/frames_F/`). `CUT=short` renders the 28 s cut instead, to its own files
(`CUT=short UNITS=CF story/elnino-2026/render.sh` → `calcofi_elnino_2026_short_CF.mp4`, `…_short_CF_poster.png`,
`out/frames_short_CF/`), about 2 minutes each.

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
