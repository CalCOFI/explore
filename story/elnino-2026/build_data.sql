.bail on
-- the story page's data, derived from the analysis database (analysis/01-04 *.sql over release objects mirrored
-- through the catalog by analysis/fetch_release.py). Run by build_data.sh, which substitutes __OUT__.
-- Everything is the CTD series (calcofi_ctd-cast, temperature_ave, quality-ok), the 0-10 m bin for the maps, and the
-- release's own climatology (month 11) for the normal: no number here is computed any other way than the app computes it.

-- the November cruises: cruise.month_median = 11 (obs_env.cruise_month), CTD
CREATE OR REPLACE TEMP TABLE nov AS
SELECT c.cruise_key, any_value(r.year) AS year, any_value(r.date_min) AS date_min, any_value(r.date_max) AS date_max,
       any_value(r.ship_name) AS ship, any_value(s.data_stage) AS data_stage
FROM cell c JOIN cruise_ref r USING (cruise_key)
LEFT JOIN cruise_stage s ON s.cruise_key = c.cruise_key AND s.dataset_key = 'calcofi_ctd-cast'
WHERE c.dataset_key = 'calcofi_ctd-cast' AND c.cruise_month = 11 AND c.depth_bin = 0
GROUP BY c.cruise_key;

-- one row per cruise x station at the surface (the 0-10 m bin), in the order the ship worked them
COPY (
  SELECT c.cruise_key, c.site_key, c.line, c.station, round(c.longitude, 4) AS lon, round(c.latitude, 4) AS lat,
         epoch(c.datetime)::BIGINT AS t, round(c.v, 3) AS temp, round(c.clim_mean, 3) AS clim, c.n_cruises,
         round(c.anom, 3) AS anom
  FROM cell c SEMI JOIN nov USING (cruise_key)
  WHERE c.dataset_key = 'calcofi_ctd-cast' AND c.depth_bin = 0
  ORDER BY c.cruise_key, c.datetime
) TO '__OUT__/stations.json' (FORMAT json, ARRAY true);

-- the cruises, with their role in the story and two station means of the surface anomaly:
-- over every station the cruise occupied that has a normal, and over the stations the November 2026 cruise occupied
COPY (
  WITH a AS (
    SELECT c.cruise_key, count(*) AS n_stations, count(c.anom) AS n_anom, avg(c.anom) AS mean_anom,
           count(c.anom) FILTER (WHERE f.site_key IS NOT NULL) AS n_anom_fp, avg(c.anom) FILTER (WHERE f.site_key IS NOT NULL) AS mean_anom_fp,
           min(c.v) AS temp_min, max(c.v) AS temp_max, min(c.anom) AS anom_min, max(c.anom) AS anom_max
    FROM cell c LEFT JOIN footprint f USING (site_key)
    WHERE c.dataset_key = 'calcofi_ctd-cast' AND c.depth_bin = 0 GROUP BY c.cruise_key)
  SELECT n.cruise_key, n.year, n.date_min, n.date_max, n.ship, n.data_stage,
         CASE WHEN n.year BETWEEN 1993 AND 2013 THEN 'baseline' WHEN n.year = 2014 THEN 'first' ELSE 'series' END AS role,
         a.n_stations, a.n_anom, round(a.mean_anom, 3) AS mean_anom, a.n_anom_fp, round(a.mean_anom_fp, 3) AS mean_anom_fp,
         round(a.temp_min, 2) AS temp_min, round(a.temp_max, 2) AS temp_max, round(a.anom_min, 2) AS anom_min, round(a.anom_max, 2) AS anom_max
  FROM nov n JOIN a USING (cruise_key) ORDER BY n.cruise_key
) TO '__OUT__/cruises.json' (FORMAT json, ARRAY true);

-- the November normal at the surface: the climatology rows (month 11, 0-10 m) with a monthly mean, at each station's
-- mean position over the November casts made there
COPY (
  WITH pos AS (
    SELECT site_key, avg(longitude) AS lon, avg(latitude) AS lat, any_value(line) AS line, any_value(station) AS station
    FROM cell WHERE dataset_key = 'calcofi_ctd-cast' AND cruise_month = 11 AND depth_bin = 0 GROUP BY site_key)
  SELECT k.site_key, p.line, p.station, round(p.lon, 4) AS lon, round(p.lat, 4) AS lat, round(k.clim_mean, 3) AS clim,
         round(k.clim_sd, 3) AS sd, k.n_cruises, k.clim_n AS n_obs
  FROM clim k JOIN pos p USING (site_key)
  WHERE k.dataset_key = 'calcofi_ctd-cast' AND k.measurement_type = 'temperature_ave' AND k.month = 11 AND k.depth_bin = 0
    AND k.clim_mean IS NOT NULL
  ORDER BY p.line, p.station
) TO '__OUT__/normal.json' (FORMAT json, ARRAY true);

-- every CTD cruise, for the time strip ("which cruise, out of all cruises")
COPY (
  SELECT r.cruise_key, r.year, r.month_median AS month, r.date_median, r.month_median = 11 AS november
  FROM cruise_ref r SEMI JOIN (SELECT DISTINCT cruise_key FROM cell WHERE dataset_key = 'calcofi_ctd-cast') c USING (cruise_key)
  ORDER BY r.date_median
) TO '__OUT__/strip.json' (FORMAT json, ARRAY true);

-- the section: line 93.3 on the November 2026 cruise, every measured 10 m bin, with its normal and its departure
COPY (
  SELECT c.site_key, c.station, round(c.longitude, 4) AS lon, round(c.latitude, 4) AS lat, c.depth_bin,
         round(c.v, 3) AS temp, round(c.clim_mean, 3) AS clim, c.n_cruises, round(c.anom, 3) AS anom
  FROM cell c
  WHERE c.cruise_key = '2026-11-33P4' AND c.dataset_key = 'calcofi_ctd-cast' AND c.line = 93.3
  ORDER BY c.station, c.depth_bin
) TO '__OUT__/section.json' (FORMAT json, ARRAY true);

-- the numbers the captions quote, so the page states nothing it did not read here (page/data/facts.json)
--   max_anom, max_anom_station, max_anom_bin   the hero of beat 7: the largest departure of the cruise, its station and 10 m bin
--   record_from, record_to                     the years the record spans (every CTD and bottle cruise in the release)
--   layer_temp, layer_depth, layer_site        "25 C water down to 55 m": at the core stations (28 and 30) the mean of the
--                                              1 m bins of the upper 50 m, rounded; and the deepest 1 m bin, counted down
--                                              from the surface without a break, still within 0.5 C of it
--   coast_*, offshore_*                        the 2026 map's caption: the 0-10 m departures of the inner Southern California
--                                              Bight ((line >= 88 and station <= 37) or (line < 88 and station <= 51)) and
--                                              of the other stations. The caption says "N to M C near the coast", so the
--                                              two groups must not overlap: the build stops if they do.
CREATE OR REPLACE TEMP TABLE surf26 AS
SELECT site_key, line, station, anom, ((line >= 88 AND station <= 37) OR (line < 88 AND station <= 51)) AS coast
FROM cell WHERE cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast' AND depth_bin = 0 AND anom IS NOT NULL;
SELECT CASE WHEN max(anom) FILTER (WHERE NOT coast) >= min(anom) FILTER (WHERE coast)
            THEN error('the coast and offshore station groups overlap: "N to M C warmer near the coast" would not hold')
            ELSE 'station groups do not overlap' END AS check_groups
FROM surf26;

COPY (
  WITH core AS (
    SELECT site_key, round(avg(value) FILTER (WHERE depth_m <= 50)) AS t0
    FROM cast_1m WHERE measurement_type = 'temperature_ave' AND direction = 'd' AND measurement_qual IS NULL
      AND site_key IN ('093.3 028.0', '093.3 030.0') GROUP BY site_key),
  layer AS (
    SELECT c.site_key, c.t0, min(p.depth_m) FILTER (WHERE p.value < c.t0 - 0.5) - 1 AS depth
    FROM core c JOIN cast_1m p USING (site_key)
    WHERE p.measurement_type = 'temperature_ave' AND p.direction = 'd' AND p.measurement_qual IS NULL GROUP BY c.site_key, c.t0)
  SELECT (SELECT round(max(anom), 1) FROM cell WHERE cruise_key = '2026-11-33P4')                      AS max_anom,
         (SELECT arg_max(site_key, anom) FROM cell WHERE cruise_key = '2026-11-33P4')                  AS max_anom_site,
         (SELECT arg_max(station, anom) FROM cell WHERE cruise_key = '2026-11-33P4')                   AS max_anom_station,
         (SELECT arg_max(depth_bin, anom) FROM cell WHERE cruise_key = '2026-11-33P4')                 AS max_anom_bin,
         (SELECT min(cruise_year) FROM cell)                                                           AS record_from,
         (SELECT max(cruise_year) FROM cell)                                                           AS record_to,
         (SELECT arg_max(t0, depth)::INTEGER FROM layer)                                               AS layer_temp,
         (SELECT max(depth)::INTEGER FROM layer)                                                       AS layer_depth,
         (SELECT arg_max(site_key, depth) FROM layer)                                                  AS layer_site,
         (SELECT count(*) FROM surf26 WHERE coast)                                                     AS coast_n,
         (SELECT round(min(anom), 1) FROM surf26 WHERE coast)                                          AS coast_min,
         (SELECT round(max(anom), 1) FROM surf26 WHERE coast)                                          AS coast_max,
         (SELECT count(*) FROM surf26 WHERE NOT coast)                                                 AS offshore_n,
         (SELECT round(min(anom), 1) FROM surf26 WHERE NOT coast)                                      AS offshore_min,
         (SELECT round(max(anom), 1) FROM surf26 WHERE NOT coast)                                      AS offshore_max
) TO '__OUT__/facts.json' (FORMAT json, ARRAY true);
