# Is November 2026 the hottest anomaly in the history of CalCOFI sampling?

Prepared 2026-11-13 for Ben Best from release **{{release}}** of the CalCOFI integrated database, for internal
review. The November 2026 cruise is **preliminary** data. Nothing here has been reviewed by the CTD team, and what may
go to the press is not settled.

The public write-up of the same analysis is the notebook `2026-11_temperature-anomaly.qmd` (draft PR
<https://github.com/CalCOFI/workflows/pull/263>): press summary, figures, every check with its code, and every data
source by URL. This file is the internal companion: the same numbers, plus the meeting's figures and the storyboard
readings for the video.

**Added in the notebook after this file was written, and only there** (live at
<https://calcofi.io/workflows/2026-11_temperature-anomaly.html> once CalCOFI/workflows#265 is merged):

- the scope of "the record": the release's normal exists only at today's stations, and a second yardstick that
  reaches every station ever occupied (each value against the mean of the other cruises at its station, month and
  depth, the lines off Baja California included) also puts fall 2026 first, +12.0 °C against +8.8 °C;
- how large earlier events were in the literature, with baselines; the largest published value is 8 to 8.7 °C off
  Baja California in October 1997 (IMECOCAL, not in the CalCOFI database);
- salinity across events: fall 2026 is the saltiest cruise on record in the inner Bight (+0.65 through the upper
  50 m against +0.38 in February 1998); November 2015 was not salty at all;
- the density surfaces on every station of the cruise, and why a one-metre bin mean reads 0.1 to 0.2 °C cooler than
  the thinned series in stratified water;
- the `obs_ctd_full` export defect of v2026.11.05 and v2026.11.09, which changes no result here.

The video is at <https://www.youtube.com/watch?v=5ReTP7iafkc> (posted by Ben, 13 November 2026).

## The answer

**Yes.** By every measure this release supports, the November 2026 cruise (2026-11-33P4, R/V *Sally Ride*,
31 October to 7 November) recorded the largest warm departure in the CalCOFI record, and the measurement is real.

Sentences that can be quoted as they stand:

> On 31 October 2026, at CalCOFI station 93.3 30.0, about 27 km off northern San Diego County, the water between
> 40 and 50 m deep was 25.0 °C. The 1993–2013 November average at that station and depth is 12.2 °C.
>
> That departure of 12.8 °C is the largest in the CalCOFI record that can be compared with a baseline: 581,071
> cells (one cruise, one station, one 10 m depth bin) from 340 cruises between 1950 and 2026. The previous largest
> was 7.1 °C, on the same line in November 2015.
>
> Averaged over the upper 50 m at the 32 stations the cruise sampled, the ocean was 5.1 °C warmer than normal.
> The previous high over those same stations was 3.4 °C, also in November 2015. In February 1998, at the peak of
> the 1997–98 El Niño, it was 2.1 °C.
>
> At the sea surface the departure was 5 to 8 °C at the 17 stations of the inner Southern California Bight and
> 1 to 4 °C at the 18 stations seaward of them.
>
> From the surface down to 130 m, the cruise measured the warmest water CalCOFI has recorded on its core station
> grid at each depth, in any month, in 494 cruises since 1949.
>
> These data are preliminary.

What the number is, and is not:

- **12.8 °C is a subsurface number.** It belongs to 40–50 m depth at one station, and 12.4–12.5 °C to 40–60 m at
  the next station inshore. It is not the warming of the sea surface (about 7 °C there) and not the average of the
  region (5.1 °C over the upper 50 m). "12 °C hotter than normal" needs "at 40 to 50 m depth" beside it.
- **It is that large because of where the warm water is, as much as how warm it is.** A 25 °C mixed layer reached
  55 m. In a normal November the mixed layer there ends near 15 m and the water at 40–50 m is 12 °C. The surface
  itself was about 7 °C above normal; the layer's thickness adds the rest.
- **It describes the inshore Southern California Bight.** The cruise occupied 36 stations on the three southern
  lines in eight days. It says nothing about the grid north of line 83.3.
- **The CTD shows the water, not the cause.** The water is warm, salty (34.4, a full unit above normal) and low in
  chlorophyll, which is what water carried up from the south looks like. Attributing it to El Niño is the
  headlines' inference, and a reasonable one, but it is not something this dataset demonstrates by itself.

## 1. The screenshot, bin by bin

The plot is <https://calcofi.io/ctd-transects/?line=93.3&cruise=2026-11-33P4&var=temperature_ave&mode=anomaly>.
Its contours are interpolated between stations; the table is the measured 10 m bins behind it. `observed` is the
mean of the cruise's quality-ok CTD values in the bin (sensor-pair average, `temperature_ave`); `normal` is the
release's `climatology` row for that station, depth bin and cruise month (November), with the number of 1993–2013
cruises it averages; the last column is the same departure against the September–November seasonal normal.

{{table:t1_line93_bins|station,depth_m,observed_C,normal_C,normal_sd,baseline_cruises,anomaly_C,anomaly_vs_season_C}}

- **The largest measured departure is +12.81 °C** (station 30, 40–50 m: 25.00 °C against 12.19 °C). Station 28
  reaches +12.51 °C at 50–60 m and +12.39 °C at 40–50 m. The "12" contour in the screenshot is measured, not an
  artifact of interpolation.
- The baseline is **6 to 8 November cruises** per cell, as the page header says.
- Against the seasonal normal (19–20 cruises, September to November) the peak is **+11.86 °C**.

![Temperature profiles on line 93.3 beside the November normal](fig_profiles_line93.png)

### What kind of anomaly this is

Read the profiles before the numbers. At stations 26.7, 28 and 30 the cruise found a **mixed layer of about
25 °C reaching 55 m** (55–57 m by the 0.125 kg m⁻³ density criterion; the November normal there is 15–17 m). Below
it the temperature falls steeply and is still 6.6–8.1 °C above normal at 100 m at stations 28 and 30. The anomaly
peaks at 40–60 m because that is where a normal November has already dropped into the thermocline.

The water is also a different water mass: salinity in the layer is **34.43–34.48** at stations 28 and 30, against
a November normal of 33.34–33.50 (0.94 to 1.10 above, where the baseline's standard deviation is about 0.1).
This is not the local surface layer warmed in place.

On surfaces of equal density (the 1 m down casts at station 93.3 30.0, against the six November baseline casts):
the top 80 m is lighter than the lightest baseline sea surface, so it has no counterpart in the normal column;
beneath it the surfaces σθ 24.5 to 26.5 lie 79 to 113 m deeper than normal, and on them the water is 0.3 to 1.0 °C
warmer and 0.05 to 0.29 saltier. At 150 m the +2.9 °C departure is +2.0 °C of displacement and +0.9 °C of changed
water. So the depressed pycnocline accounts for most of the departure below about 80 m, and the layer above it is
different water (notebook section "Displaced water, or different water?").

The history of the record cell itself (station 93.3 30.0, 40–50 m, every cruise whose month is November):

{{table:t2_record_cell_history}}

Across all months, 265 cruises since 1950 have sampled that cell. The warmest before this cruise was 18.11 °C
(November 2015).

## 2. Is it real?

| check | result |
|---|---|
| Data stage | `sample.data_stage` is `preliminary_with_bottle` for all 72 casts (36 stations, down and up). Every CTD cruise since July 2021 is at a preliminary stage in this release. |
| Quality flags | No temperature value on line 93.3 is flagged. The cruise's only temperature flag is the primary sensor on one upcast (cast 007, top 24 m), which the sensor-pair average already excludes. |
| The two temperature sensors | Never differ by more than 0.006 °C through the warm layer at stations 28 and 30. Over every cast, top 100 m: mean difference 0.0025 °C. |
| Bottle salinity (salinometer, on water samples) | Matches the CTD's salinity within 0.002 at every sampled depth in the warm layer at stations 28 and 30 (up cast). CTD salinity is computed from conductivity *and* temperature: a temperature error of 0.1 °C would shift it by 0.08 and break that agreement. |
| Bottle oxygen (Winkler titration) | 4.8–4.9 mL/L through the layer, saturation for 25 °C water (4.75 mL/L); water at the normal temperature of those depths would hold about 5.7. |
| Scripps Pier (SCCOOS automated shore station, daily means 2013–2026) | 24.14 °C on 5 November, where the highest for that calendar day in 13 earlier years was 19.85 °C; salinity 33.60 six days before the cruise and 34.24 by 5 November. 13 of the 20 saltiest days in that record are from 31 October 2026 onward. The table is `tables/pier_daily.csv`. |
| Buoys | See below: the buoy nearest each of seven casts (2–13 km away) reads within 0.6 °C of the CTD, four of them within 0.2 °C, including the cool offshore side (19.1 °C at San Nicolas Island against the CTD's 19.08 °C). |
| Satellite analyses | See below. |
| Argo floats | Five floats profiled around the outer grid during the cruise: 18.5–21.0 °C surface layers with salinity near 33.5, like the cruise's seaward stations. None came within 30 km of a station or sampled the inner Bight, so the subsurface of the warm pool rests on the CTD's own redundancy (sensors, two passes, salinity, oxygen). The profiles are `tables/argo_profiles.csv`. |

Buoy water temperature nearest in time to each cast, for buoys within 15 km (NDBC realtime files; the buoys report
to 0.1 °C):

{{table:buoys_at_casts|site_key,cast_time_utc,ctd_t_top3m,buoy,buoy_name,km_apart,buoy_wtmp,buoy_minus_ctd,buoy_24h_min,buoy_24h_max}}

The closest pair is 2.3 km and 6 minutes apart: the Torrey Pines Outer buoy read 25.1 °C when the CTD read
25.00 °C at station 93.3 28.0.

Satellite sea-surface temperature at each cast's position on the cast's day (NOAA OISST v2.1 near-real-time, 0.25°,
anomaly against 1971–2000; JPL MUR v4.1, anomaly against its 2003–2014 climatology):

{{table:satellite_at_casts|site_key,cast_time_utc,ctd_t_top3m,oisst_sst,oisst_anom,mur_sst,mur_anom}}

OISST follows the CTD across the grid (correlation 0.96 over the 36 casts) and is smoother than a point
measurement inside a warm pool with sharp edges. It puts the surface off San Diego about 5.5 °C above its own
normal where the CTD reads +6.6 to +6.9 °C against the CalCOFI one. An empty MUR cell is a request NOAA's ERDDAP
server answered with 503 on 2026-11-13; two MUR values read by hand earlier that night at station 93.3 28.0 were
23.37 °C and +4.8 °C.

**Conclusion: not an artifact.** The baseline is the right one (same station, same depth bin, the cruise's own
month), the sensors agree with each other and with the bottles, and four kinds of independent surface data match.

## 3. Where it ranks

The same anomaly was computed for every cruise × station × 10 m depth bin in the release: the CTD series
(`temperature_ave`, 1993–2026, 143 cruises) and the bottle series (`temperature`, 1949–2021, 657 cruises), each
against its own climatology.

### Single cells

{{table:t3b_top_share}}

All of the 50 largest departures in the record, and 98 of the largest 100, are from this cruise. Eighty-one of its
cells exceed the previous record. The largest departures outside November 2026:

{{table:t3_top_cells_before_2026}}

Two of these are bad data rather than warm water, which is the weakness of ranking single cells. The January 1994
value is 13.90 °C in the last bin of a cast that reads 6.61 °C ten metres above it. The October 1959 cast at
station 93.3 35.0 is a straight line from 19.0 °C at 30 m to 6.9 °C at 430 m (0.74 °C per 25 m throughout): values
interpolated across a gap in the source, not measurements. Neither is flagged. Without them the largest departure
before 1993 is 6.06 °C (November 1983).

### Layer means over the same stations (the fairer claim)

Each cruise is averaged over one fixed set of stations, the ones the November 2026 cruise occupied. A station's
anomaly profile is averaged over the layer's 10 m bins (bottle profiles are interpolated in depth onto the same
bins), then the stations are averaged. A cruise is ranked if it occupied at least 60 % of those stations.

{{table:t4_layer_rank|layer,series,rank,of_cruises,cruise_key,stations,anomaly_C,warmest_station_C,mean_temp_C}}

![Layer-mean anomaly of every cruise since 1950](fig_layer_rank.png)

- **Upper 50 m: +5.10 °C**, first of 122 CTD cruises. The previous high is November 2015: +3.35 °C in the CTD
  series and +3.33 °C in the bottle series (149 cruises since 1950), so +3.4 °C at one decimal.
- **50–200 m: +2.73 °C**, first; the previous high is +1.9 °C (February 1998). The lead is narrower at depth.
- The CTD and the bottles agree where they overlap: over the 102 cruises both cover, their upper-50 m means differ
  by 0.06 °C on average and never by more than 0.18 °C (November 2015: 3.35 and 3.33). The bottle series is a fair
  stand-in for the years before 1993.

### The earlier warm events

Each event's warmest cruise over those stations, with at least 7 of them occupied. The seasonal normal also covers
months that have no monthly normal (September and December 1997, for instance).

{{table:t5_events}}

The 1982–83 row runs through 1984, when the warmth at depth persisted. Its cruises occupied only 7–8 of these
stations (lines 90 and 93.3 inshore), so they are compared again below on exactly the stations they share.

### On the stations two cruises share

The strictest test: November 2026 against each other cruise on exactly the stations both occupied (at least 10),
by three yardsticks. The third needs no baseline at all.

{{table:t6_paired}}

No cruise in the record equals November 2026 on shared stations, in any layer, by any yardstick. The margin is
about 2 °C in the upper 50 m (over November 2015) and 0.4–0.8 °C at 50–200 m (over February 1998). With fewer than
10 shared stations the picture holds in the upper 50 m and gets close at depth: on the 7 offshore stations it
shares with the February 1984 cruise, 50–200 m is a tie (1.47 against 1.48 °C).

### Without any baseline

The warmest water ever measured in each 10 m bin on the core grid (lines 76.7–93.3, stations to 120), in any
month, both series:

{{table:t7_warmest_ever_by_depth}}

From the surface to 130 m the record now belongs to November 2026, by 1 °C at the surface and by 2.5–3.8 °C
between 20 and 70 m. Below 130 m, July 1998 and earlier cruises were warmer.

## 4. The numbers from the meeting

"8 °C at 0–50 m and 6 °C at 50–200 m, pretty much in the southern part of the grid", "11 degrees", "12 °C":

{{table:t9_meeting_numbers}}

- **"8 and 6" describe the inshore end of line 93.3**, not the southern grid: +8.8 and +5.1 °C over stations
  26.7–35, +9.75 and +6.05 °C at stations 28 and 30. Over every station the cruise occupied the figures are
  **+5.1 and +2.7 °C**; over the inshore stations of all three lines, +7.3 and +4.3 °C.
- **"11" and "12"** are both right for single bins: 12.8 °C is the largest measured, and 81 cells exceed 7.1 °C.
  The per-station breakdown is in `tables/t8_stations_2026-11.csv`.

## 5. What the comparison can and cannot support

- **Which part of the record has a baseline.** A normal exists for 81 stations of the present grid (lines 66.7 to
  93.4) and for the months with at least five cruises in 1993–2013: January, February, April, July, August,
  October and November. Earlier decades sampled other months and other stations far more often:

{{table:t10_baseline_coverage}}

  So "the largest in the record" means the largest among 340 of the 681 cruises (474 with the seasonal normal), on
  the present grid. Cruises in March, May, June, September and December are compared only through the seasonal
  normal, which mixes in part of the seasonal cycle (a September cruise against a September–November mean reads
  warm).
- **The baseline is thin.** Six to eight November cruises per cell on line 93.3. With a standard deviation near
  0.7–1.5 °C in the thermocline, the normal itself is uncertain by roughly 0.3–0.6 °C. That does not touch a
  12.8 °C departure, but it is why the second decimal should not be quoted.
- **Timing within the season.** The cruise worked the inshore end of line 93.3 on 31 October and 1 November. The
  eight baseline cruises behind the November normal there were on station between 25 October and 11 November
  (median 4 November), so the cruise sits inside their range, about four days ahead of its middle. The surface
  normal falls by roughly 2 °C from October to November, so the calendar is worth a few tenths of a degree at the
  surface, not more. The seasonal normal is the conservative bound: still +11.9 °C at depth and +4.9 to +5.8 °C at
  the surface on these four stations.
- **Coverage.** 36 stations in 8 days, against the usual 65–75 in about 16. The layer means are over those
  stations only. A full-grid mean would be lower, and cannot be computed for this cruise.
- **Two datasets.** The bottle series ends in May 2021 in this release, so 2026 is CTD only, and everything before
  August 1993 is bottles only: about 20 standard depths per cast against a value every 10 m, and in the early
  decades some of those values are interpolated in the source. The two agree closely on layer means wherever both
  exist (above).
- **Preliminary.** The cast files are 1 m-binned field processing, before final calibration. Two sensors that
  agree within 0.006 °C, and bottle salinities that agree within 0.002, leave little for calibration to change.
- **The normal holds up from the full profiles.** Recomputed from the six baseline cruises' one-metre casts
  (not the thinned series), the normal at the record cell is 12.18 °C against the release's 12.19 °C. Under eight
  definitions of normal the departure there stays between 11.4 and 13.0 °C.
- **A flaw found on the way, not part of the anomaly.** The CTD salinity normal at station 93.3 30.0 is inflated
  at 90–120 m in November (34.06 where the bottles give 33.72) by one unflagged cast of cruise 2007-11-32NM with
  salinities up to 35.35. It does not touch temperature or the warm layer above 60 m. Similar unflagged
  `salinity_ave_corr` spikes exist elsewhere (2022-08-39C2 at 93.3 28.0, 73 values up to 37.29).
- **Single cells or layer means?** A single-cell ranking rewards the thermocline, where a displaced layer makes the
  largest numbers, and it is where bad values in old data surface. The layer mean over a fixed set of stations is
  the fairer claim and the one to lead with for a general audience: *5 °C warmer than normal through the upper
  50 m; the previous record was 3.4 °C.* The 12.8 °C is true and striking and should carry its depth.

## 6. The storyboard's three readings, checked

- **"The next year" is 2014.** The baseline is 1993–2013 and cruise 2014-11-32NM occupied 75 stations.
- **"November" is the cruises whose month is November**, by the release's rule (the cruise's median cast month,
  `cruise.month_median`). Nine fall in the baseline: 2001, 2002, 2004, 2005, 2007, 2009, 2010, 2013 and a
  19-station cruise in 1998. In the other baseline years the fall cruise ran in October or September, which is why
  a November cell averages 6–9 cruises, not 21. After the baseline there is a November cruise in every
  year from 2014 to 2026 **except 2018 and 2020**, when the fall cruise ran in October. The video shows the
  November cruises only and leaves those two years empty on its time strip.
- **"At the surface" is the 0–10 m bin** for the map beats; depth appears only in the final section view.
- **The years do not warm steadily "until the last year".** Station-mean surface departure of the November
  cruises: 2014 +2.0, 2015 +2.7, 2016 +1.2, 2017 +1.0, 2019 +0.9, 2021 +0.1, 2022 −0.3, 2023 +1.3, 2024 −1.2,
  2025 +1.6, 2026 +4.3 °C (the last on 35 stations of the southern lines). The video shows that as it is.

{{table:t11_fall_cruises|year,cruise_key,ship_name,date_min,date_max,cruise_month,ctd_stations,in_baseline,data_stage}}

- **The film's year bars compare the same stations every year.** Each bar is the cruise's mean surface departure
  over the stations the fall 2026 cruise occupied (`anom_2026_stations_C` below, with how many of the 35 the cruise
  had), not over the cruise's own grid (`anom_own_C`): 2015 reads +3.2 °C on those stations against +2.7 °C over
  its whole grid. The station count the film gives under a year is `stations_surface`, the stations with a 0–10 m
  CTD value on that cruise (the dots drawn), which can be one or two fewer than the stations the cruise occupied
  with a CTD (`ctd_stations` above) and is more than the stations that have a normal (`with_normal`).

{{table:t12_november_surface|year,cruise_key,ship_name,stations_surface,with_normal,anom_own_C,of_2026_stations,anom_2026_stations_C}}

## 7. How this was computed

Everything is in `story/elnino-2026/analysis/` on branch `story-elnino-2026` of `CalCOFI/explore`:

| step | file | what it does |
|---|---|---|
| 0 | `fetch_release.py` | Mirrors the release objects it needs, resolved through `catalog.json` (never a hand-built path), and writes DuckDB views over them. |
| 1 | `01_anomaly_cells.sql` | One row per dataset × cruise × station × 10 m bin: the mean of quality-ok values, joined to the `climatology` row of the same dataset, station, bin and **cruise month** (`sql/anom_slice.sql`'s rule). No baseline, no anomaly, never zero. |
| 2 | `02_layers.sql` | Anomaly profiles on every 10 m bin (interpolated in depth only), then station layer means. |
| 3 | `03_rank_layers.sql` | Each cruise's layer mean over the November 2026 footprint. |
| 4 | `04_paired.sql` | November 2026 against each cruise on shared stations. |
| 5 | `05_figures.R` | The two figures. |
| 6 | `06_tables.sql` | Every table above, as `tables/*.csv`. |
| – | `scripts/temperature_anomaly_outside_sources.py` (in workflows) | Buoys (NDBC), satellite analyses (NOAA CoastWatch ERDDAP) and Argo (Ifremer ERDDAP) for each cast; its tables are copied into `tables/`. |
| – | `build_findings.py` | Assembles this file: authored prose, generated tables. |

```sh
JOB=~/_big/calcofi/story_elnino_2026-11; A=story/elnino-2026/analysis
python3 $A/fetch_release.py $JOB/work/release latest
duckdb $JOB/work/elnino.duckdb -c ".read $JOB/work/release/views.sql" \
  -c ".read $A/01_anomaly_cells.sql" -c ".read $A/02_layers.sql" -c ".read $A/03_rank_layers.sql" -c ".read $A/04_paired.sql"
sed "s|__OUT__|$JOB/out/tables|g" $A/06_tables.sql | duckdb -readonly $JOB/work/elnino.duckdb
W=~/Github/CalCOFI/workflows-temperature-anomaly      # branch temperature-anomaly-2026-11
python3 $W/scripts/temperature_anomaly_outside_sources.py $W/data/2026-11_temperature-anomaly/casts.csv $JOB/work/outside $JOB/out/tables
Rscript $A/05_figures.R $JOB/work/elnino.duckdb $JOB/out
python3 $A/build_findings.py $A/findings.template.md $JOB/out $(cat $JOB/work/release/VERSION)
```

The core of step 1, which is the whole definition of the anomaly:

```sql
SELECT o.*, o.v - c.clim_mean AS anom, o.v - c.season_mean AS anom_season
FROM (SELECT dataset_key, measurement_type, cruise_key, site_key, depth_bin,
             any_value(cruise_month) AS cruise_month, avg(value) AS v
      FROM obs_env
      WHERE measurement_type IN ('temperature_ave', 'temperature') AND qual_ok
      GROUP BY ALL) o
LEFT JOIN climatology c
  ON  c.dataset_key = o.dataset_key AND c.measurement_type = o.measurement_type
  AND c.site_key    = o.site_key    AND c.depth_bin        = o.depth_bin
  AND c.month       = o.cruise_month;
```

Data: CalCOFI (2026). CalCOFI Integrated Database, release {{release}}. <https://doi.org/10.5281/zenodo.24083894>.
Buoys: NOAA National Data Buoy Center and the Coastal Data Information Program (Scripps). Satellite: NOAA OISST
v2.1; JPL MUR v4.1, both through NOAA CoastWatch West Coast ERDDAP. Argo: the International Argo Program, through
the Ifremer ERDDAP.
