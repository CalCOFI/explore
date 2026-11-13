.bail on
-- the story page's data, derived from the analysis database (analysis/01-04 *.sql over release objects mirrored
-- through the catalog by analysis/fetch_release.py). Run by build_data.sh, which substitutes __OUT__.
-- Everything is the CTD series (calcofi_ctd-cast, temperature_ave, quality-ok) against the release's own SEASONAL
-- climatology: the fall normal, September-November 1993-2013 (climatology.season_mean, the rows of months 9-11;
-- src/anomaly.ts SEASON_WORD). The maps are the 0-50 m layer (analysis/02_layers.sql station_layer: the cast's 10 m bins
-- 0-40 put on every bin by interpolation in depth, the layer kept only where it is complete); the section is every
-- 10 m bin of line 93.3 on the 2026 cruise. No number here is computed any other way than the analysis computes it.
-- (Rasmus Swalethorp, 2026-11-13: "switching to the seasonal climatology rather than the monthly, and maybe use the
-- 0-50m average instead as we are the only program that has high spatial resolution of deeper temperatures".)

-- the fall cruises: the cruise's season (obs_env.quarter, from cruise.month_median) is SON, CTD, 1993 on. A year with
-- more than one (1998: September, October, November) plays its fullest one (`primary`); the normal pools them all.
CREATE OR REPLACE TEMP TABLE fall AS
WITH f AS (
  SELECT c.cruise_key, any_value(c.cruise_year) AS year, any_value(c.cruise_month) AS month, count(*) AS n_track
  FROM cell c
  WHERE c.dataset_key = 'calcofi_ctd-cast' AND c.season = 4 AND c.depth_bin = 0 AND c.cruise_year >= 1993
  GROUP BY c.cruise_key),
l AS (
  SELECT cruise_key, count(temp) AS n_stations, count(anom_season) AS n_anom
  FROM station_layer WHERE dataset_key = 'calcofi_ctd-cast' AND layer = '0-50 m' GROUP BY cruise_key)
SELECT f.*, coalesce(l.n_stations, 0) AS n_stations, coalesce(l.n_anom, 0) AS n_anom,
       r.date_min, r.date_max, r.date_median, r.ship_name AS ship, s.data_stage,
       row_number() OVER (PARTITION BY f.year ORDER BY l.n_stations DESC NULLS LAST, f.cruise_key) = 1 AS "primary"
FROM f LEFT JOIN l USING (cruise_key) JOIN cruise_ref r USING (cruise_key)
LEFT JOIN cruise_stage s ON s.cruise_key = f.cruise_key AND s.dataset_key = 'calcofi_ctd-cast';

-- one row per cruise x station, in the order the ship worked them: every station with a 0-10 m CTD value (the
-- ship's track), with its 0-50 m mean temperature and that mean's departure from the fall normal (NULL where the
-- layer is incomplete, e.g. a cast shallower than 50 m, or the station has no fall normal)
COPY (
  SELECT c.cruise_key, c.site_key, c.line, c.station, round(c.longitude, 4) AS lon, round(c.latitude, 4) AS lat,
         epoch(c.datetime)::BIGINT AS t, round(l.temp, 3) AS temp, round(l.anom_season, 3) AS anom
  FROM cell c SEMI JOIN fall USING (cruise_key)
  LEFT JOIN station_layer l ON l.dataset_key = c.dataset_key AND l.cruise_key = c.cruise_key AND l.site_key = c.site_key AND l.layer = '0-50 m'
  WHERE c.dataset_key = 'calcofi_ctd-cast' AND c.depth_bin = 0
  ORDER BY c.cruise_key, c.datetime
) TO '__OUT__/stations.json' (FORMAT json, ARRAY true);

-- the cruises, with their role in the story and the strip's bar: the mean 0-50 m departure from the fall normal over
-- the stations the 2026 cruise occupied (analysis/03_rank_layers.sql cruise_layer, the same stations every year; NULL
-- when the cruise occupied fewer than 60 % of them)
COPY (
  SELECT f.cruise_key, f.year, f.month, f.date_min, f.date_max, f.ship, f.data_stage, f.primary,
         CASE WHEN f.year BETWEEN 1993 AND 2013 THEN 'baseline' WHEN f.year = 2014 THEN 'first' ELSE 'series' END AS role,
         f.n_stations, f.n_anom,
         CASE WHEN k.covered_season THEN k.n_sta_season END AS n_fp, CASE WHEN k.covered_season THEN round(k.anom_season, 3) END AS mean_fp
  FROM fall f
  LEFT JOIN cruise_layer k ON k.cruise_key = f.cruise_key AND k.dataset_key = 'calcofi_ctd-cast' AND k.layer = '0-50 m'
  ORDER BY f.date_median
) TO '__OUT__/cruises.json' (FORMAT json, ARRAY true);

-- the fall normal of the 0-50 m layer: at each station the mean of its five 10 m bins' season_mean (0-40; all five, so
-- the layer is complete), at the station's mean position over the fall casts made there. n_cruises is the fewest
-- baseline cruises behind any of the five bins.
COPY (
  WITH pos AS (
    SELECT site_key, avg(longitude) AS lon, avg(latitude) AS lat, any_value(line) AS line, any_value(station) AS station
    FROM cell WHERE dataset_key = 'calcofi_ctd-cast' AND season = 4 AND depth_bin = 0 GROUP BY site_key),
  n AS (
    SELECT site_key, avg(season_mean) AS clim, min(season_n_cruises) AS n_cruises
    FROM clim WHERE dataset_key = 'calcofi_ctd-cast' AND measurement_type = 'temperature_ave' AND month = 10
      AND depth_bin BETWEEN 0 AND 40 AND season_mean IS NOT NULL
    GROUP BY site_key HAVING count(*) = 5)
  SELECT n.site_key, p.line, p.station, round(p.lon, 4) AS lon, round(p.lat, 4) AS lat, round(n.clim, 3) AS clim, n.n_cruises
  FROM n JOIN pos p USING (site_key)
  ORDER BY p.line, p.station
) TO '__OUT__/normal.json' (FORMAT json, ARRAY true);

-- every CTD cruise from 1993, for the time strip ("which cruise, out of all cruises")
COPY (
  SELECT r.cruise_key, r.year, r.month_median AS month, r.date_median, r.season = 'SON' AS fall
  FROM cruise_ref r SEMI JOIN (SELECT DISTINCT cruise_key FROM cell WHERE dataset_key = 'calcofi_ctd-cast') c USING (cruise_key)
  WHERE r.year >= 1993
  ORDER BY r.date_median
) TO '__OUT__/strip.json' (FORMAT json, ARRAY true);

-- the section: line 93.3 on the 2026 cruise, every measured 10 m bin, with its fall normal and its departure
COPY (
  SELECT c.site_key, c.station, round(c.longitude, 4) AS lon, round(c.latitude, 4) AS lat, c.depth_bin,
         round(c.v, 3) AS temp, round(c.season_mean, 3) AS clim, c.season_n_cruises AS n_cruises, round(c.anom_season, 3) AS anom
  FROM cell c
  WHERE c.cruise_key = '2026-11-33P4' AND c.dataset_key = 'calcofi_ctd-cast' AND c.line = 93.3
  ORDER BY c.station, c.depth_bin
) TO '__OUT__/section.json' (FORMAT json, ARRAY true);

-- the numbers the captions quote, so the page states nothing it did not read here (page/data/facts.json)
--   max_anom, max_anom_site/station/bin   the hero of the last beat: the largest departure of any cell of the 2026 cruise
--                                         (station x 10 m bin) from the fall normal, and where it is
--   *_raw                                 the same numbers unrounded (3 decimals), so the page's Fahrenheit is converted
--                                         from the measurement and not from a figure already rounded in Celsius
--   prev_max_anom, prev_max_cruise        the largest of any OTHER cruise's cell, CTD or bottle, against the same normal:
--                                         the build stops unless 2026's is larger ("the largest in CalCOFI's record")
--   record_from, record_to                the years the record spans (every CTD and bottle cruise in the release)
--   layer_temp, layer_depth, layer_site   "25 C water down to 55 m": at the core stations (28 and 30) the mean of the
--                                         1 m bins of the upper 50 m, rounded; and the deepest 1 m bin, counted down
--                                         from the surface without a break, still within 0.5 C of it
--   fp_2026, fp_prev, fp_prev_cruise      the strip's last bar and the highest bar of any other cruise (any season, CTD or
--                                         bottle, at least 60 % of 2026's stations): the build stops unless 2026's is higher
SELECT CASE WHEN (SELECT max(anom_season) FROM cell WHERE cruise_key <> '2026-11-33P4')
              >= (SELECT max(anom_season) FROM cell WHERE cruise_key = '2026-11-33P4')
            THEN error('another cruise has a cell as far above the fall normal as 2026: "the largest in the record" would not hold')
            ELSE 'the 2026 cell is the largest departure from the seasonal normal in the record' END AS check_record;
SELECT CASE WHEN (SELECT max(anom_season) FROM cruise_layer WHERE layer = '0-50 m' AND covered_season AND cruise_key <> '2026-11-33P4')
              >= (SELECT anom_season FROM cruise_layer WHERE layer = '0-50 m' AND cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast')
            THEN error('another cruise is as warm over the 2026 stations at 0-50 m: the last bar would not be the highest')
            ELSE 'the 2026 0-50 m bar is the highest of any cruise' END AS check_bar;

COPY (
  WITH core AS (
    SELECT site_key, round(avg(value) FILTER (WHERE depth_m <= 50)) AS t0, avg(value) FILTER (WHERE depth_m <= 50) AS t_raw
    FROM cast_1m WHERE measurement_type = 'temperature_ave' AND direction = 'd' AND measurement_qual IS NULL
      AND site_key IN ('093.3 028.0', '093.3 030.0') GROUP BY site_key),
  layer AS (
    SELECT c.site_key, c.t0, c.t_raw, min(p.depth_m) FILTER (WHERE p.value < c.t0 - 0.5) - 1 AS depth
    FROM core c JOIN cast_1m p USING (site_key)
    WHERE p.measurement_type = 'temperature_ave' AND p.direction = 'd' AND p.measurement_qual IS NULL GROUP BY c.site_key, c.t0, c.t_raw),
  c26 AS (SELECT * FROM cell WHERE cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast' AND anom_season IS NOT NULL),
  oth AS (SELECT * FROM cell WHERE cruise_key <> '2026-11-33P4' AND anom_season IS NOT NULL),
  fp  AS (SELECT * FROM cruise_layer WHERE layer = '0-50 m' AND covered_season)
  SELECT (SELECT round(max(anom_season), 1) FROM c26)                                    AS max_anom,
         (SELECT round(max(anom_season), 3) FROM c26)                                    AS max_anom_raw,
         (SELECT arg_max(site_key, anom_season) FROM c26)                                AS max_anom_site,
         (SELECT arg_max(station, anom_season) FROM c26)                                 AS max_anom_station,
         (SELECT arg_max(depth_bin, anom_season) FROM c26)                               AS max_anom_bin,
         (SELECT round(max(anom_season), 1) FROM oth)                                    AS prev_max_anom,
         (SELECT arg_max(cruise_key, anom_season) FROM oth)                              AS prev_max_cruise,
         (SELECT min(cruise_year) FROM cell)                                             AS record_from,
         (SELECT max(cruise_year) FROM cell)                                             AS record_to,
         (SELECT arg_max(t0, depth)::INTEGER FROM layer)                                 AS layer_temp,
         (SELECT round(arg_max(t_raw, depth), 3) FROM layer)                             AS layer_temp_raw,
         (SELECT max(depth)::INTEGER FROM layer)                                         AS layer_depth,
         (SELECT arg_max(site_key, depth) FROM layer)                                    AS layer_site,
         (SELECT round(anom_season, 1) FROM fp WHERE cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast') AS fp_2026,
         (SELECT round(max(anom_season), 1) FROM fp WHERE cruise_key <> '2026-11-33P4')  AS fp_prev,
         (SELECT arg_max(cruise_key, anom_season) FROM fp WHERE cruise_key <> '2026-11-33P4') AS fp_prev_cruise
) TO '__OUT__/facts.json' (FORMAT json, ARRAY true);
