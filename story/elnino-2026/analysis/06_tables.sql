-- the tables of out/findings.md, one CSV each. Run after 01-04 from the repo root with the output folder substituted:
--   sed "s|__OUT__|$OUT/tables|g" 06_tables.sql | duckdb -readonly work/elnino.duckdb
-- every number in the findings' tables is a cell of one of these files.

-- T1. the screenshot, bin by bin: line 93.3, stations 26.7-35, the measured 10 m bins to 100 m
COPY (
  SELECT site_key AS station, depth_bin || '-' || (depth_bin + 10) AS depth_m, n_obs,
         round(v, 2) AS observed_C, round(clim_mean, 2) AS normal_C, round(clim_sd, 2) AS normal_sd, n_cruises AS baseline_cruises,
         round(anom, 2) AS anomaly_C, round(season_mean, 2) AS season_normal_C, season_n_cruises AS season_cruises, round(anom_season, 2) AS anomaly_vs_season_C
  FROM cell
  WHERE cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast' AND line = 93.3 AND station <= 35 AND depth_bin <= 100
  ORDER BY station, depth_bin
) TO '__OUT__/t1_line93_bins.csv' (HEADER);

-- T2. the record cell's own history: station 93.3 30.0, 40-50 m, every cruise whose month is November
COPY (
  SELECT cruise_key, CASE dataset_key WHEN 'calcofi_bottle' THEN 'bottle' ELSE 'CTD' END AS series, datetime::DATE AS date, round(v, 2) AS observed_C,
         round(clim_mean, 2) AS normal_C, round(anom, 2) AS anomaly_C, CASE WHEN cruise_year BETWEEN 1993 AND 2013 THEN 'yes' ELSE '' END AS in_baseline
  FROM cell
  WHERE site_key = '093.3 030.0' AND depth_bin = 40 AND cruise_month = 11 AND (dataset_key = 'calcofi_ctd-cast' OR cruise_year < 1993)
  ORDER BY cruise_key
) TO '__OUT__/t2_record_cell_history.csv' (HEADER);

-- T3. the largest single departures in the record outside November 2026 (both series, any depth)
COPY (
  SELECT * FROM (
    SELECT row_number() OVER (ORDER BY anom DESC) AS rank_without_2026, cruise_key, CASE dataset_key WHEN 'calcofi_bottle' THEN 'bottle' ELSE 'CTD' END AS series,
           site_key AS station, depth_bin || '-' || (depth_bin + 10) AS depth_m, datetime::DATE AS date,
           round(v, 2) AS observed_C, round(clim_mean, 2) AS normal_C, n_cruises AS baseline_cruises, round(anom, 2) AS anomaly_C
    FROM cell WHERE anom IS NOT NULL AND cruise_key <> '2026-11-33P4')
  WHERE rank_without_2026 <= 15 ORDER BY rank_without_2026
) TO '__OUT__/t3_top_cells_before_2026.csv' (HEADER);

-- T3b. how much of the top of the ranking November 2026 holds
COPY (
  WITH r AS (SELECT cruise_key, anom, row_number() OVER (ORDER BY anom DESC) AS rk FROM cell WHERE anom IS NOT NULL),
       prev AS (SELECT max(anom) AS a FROM cell WHERE cruise_key <> '2026-11-33P4')
  SELECT count(*) AS cells_with_baseline, count(DISTINCT cruise_key) AS cruises_with_baseline,
         count(*) FILTER (WHERE cruise_key = '2026-11-33P4') AS cells_2026_11,
         round(max(anom) FILTER (WHERE cruise_key = '2026-11-33P4'), 2) AS max_2026_11, round((SELECT a FROM prev), 2) AS max_before,
         count(*) FILTER (WHERE cruise_key = '2026-11-33P4' AND anom > (SELECT a FROM prev)) AS cells_2026_11_above_previous_record,
         count(*) FILTER (WHERE rk <= 10 AND cruise_key = '2026-11-33P4') AS of_top_10, count(*) FILTER (WHERE rk <= 50 AND cruise_key = '2026-11-33P4') AS of_top_50,
         count(*) FILTER (WHERE rk <= 100 AND cruise_key = '2026-11-33P4') AS of_top_100
  FROM r
) TO '__OUT__/t3b_top_share.csv' (HEADER);

-- T4. cruises ranked by the layer mean over the November 2026 footprint (monthly baseline; >= 60 % of its stations)
COPY (
  SELECT * FROM (
    SELECT layer, CASE dataset_key WHEN 'calcofi_bottle' THEN 'bottle' ELSE 'CTD' END AS series,
           row_number() OVER (PARTITION BY layer, dataset_key ORDER BY anom DESC) AS rank, count(*) OVER (PARTITION BY layer, dataset_key) AS of_cruises,
           cruise_key, n_sta AS stations, n_ref AS stations_2026, round(anom, 2) AS anomaly_C, round(anom_max_station, 2) AS warmest_station_C, round(temp, 2) AS mean_temp_C
    FROM cruise_layer WHERE covered)
  WHERE rank <= 8 ORDER BY CASE layer WHEN 'surface (0-10 m)' THEN 0 WHEN '0-50 m' THEN 1 WHEN '50-200 m' THEN 2 ELSE 3 END, series DESC, rank
) TO '__OUT__/t4_layer_rank.csv' (HEADER);

-- T4-all. every cruise x layer (the figure's data)
COPY (
  SELECT layer, dataset_key, cruise_key, year, cruise_month, date_min, date_max, n_sta, n_ref, covered, round(anom, 3) AS anom,
         n_sta_season, n_ref_season, covered_season, round(anom_season, 3) AS anom_season, round(temp, 3) AS temp
  FROM cruise_layer ORDER BY layer, dataset_key, cruise_key
) TO '__OUT__/t4_layer_all_cruises.csv' (HEADER);

-- T5. the earlier warm events: each event's warmest cruise for each layer, under the monthly and the seasonal baseline
COPY (
  WITH ev AS (SELECT * FROM (VALUES ('1957-59', 1957, 1959), ('1982-83', 1982, 1984), ('1997-98', 1997, 1998), ('2014-16', 2014, 2016), ('2026', 2026, 2026)) t(event, y0, y1)),
  x AS (
    SELECT ev.event, l.layer, l.dataset_key, l.cruise_key, l.n_sta, l.anom, l.n_sta_season, l.anom_season, l.n_ref
    FROM cruise_layer l JOIN cruise_ref c USING (cruise_key) JOIN ev ON c.year BETWEEN ev.y0 AND ev.y1
    WHERE l.layer IN ('0-50 m', '50-200 m')),
  m AS (SELECT event, layer, arg_max(cruise_key, anom) AS cruise_month_base, arg_max(n_sta, anom) AS n_m, max(anom) AS anom_m FROM x WHERE n_sta >= 7 GROUP BY ALL),
  s AS (SELECT event, layer, arg_max(cruise_key, anom_season) AS cruise_season_base, arg_max(n_sta_season, anom_season) AS n_s, max(anom_season) AS anom_s FROM x WHERE n_sta_season >= 7 GROUP BY ALL)
  SELECT event, layer, cruise_month_base AS warmest_cruise_monthly_normal, n_m AS stations, round(anom_m, 2) AS anomaly_C,
         cruise_season_base AS warmest_cruise_seasonal_normal, n_s AS stations_seasonal, round(anom_s, 2) AS anomaly_vs_season_C
  FROM m FULL JOIN s USING (event, layer) ORDER BY layer, event
) TO '__OUT__/t5_events.csv' (HEADER);

-- T6. November 2026 against every other cruise on the stations they share (at least 10)
COPY (
  WITH y AS (
    SELECT layer, 'monthly normal' AS yardstick, cruise_key, dataset_key, n_month AS n, anom_other AS other, anom_2026 AS y26 FROM paired WHERE n_month >= 10
    UNION ALL SELECT layer, 'seasonal normal', cruise_key, dataset_key, n_season, season_other, season_2026 FROM paired WHERE n_season >= 10
    UNION ALL SELECT layer, 'temperature itself', cruise_key, dataset_key, n_temp, temp_other, temp_2026 FROM paired WHERE n_temp >= 10)
  SELECT layer, yardstick, count(DISTINCT cruise_key) AS cruises_compared, count(DISTINCT cruise_key) FILTER (WHERE other >= y26) AS cruises_at_or_above_2026,
         arg_min(cruise_key, y26 - other) AS closest_cruise, arg_min(n, y26 - other) AS shared_stations,
         round(arg_min(other, y26 - other), 2) AS closest_value, round(arg_min(y26, y26 - other), 2) AS nov_2026_same_stations, round(min(y26 - other), 2) AS margin_C
  FROM y WHERE layer <> '0-200 m' GROUP BY layer, yardstick
  ORDER BY CASE layer WHEN 'surface (0-10 m)' THEN 0 WHEN '0-50 m' THEN 1 ELSE 2 END, yardstick
) TO '__OUT__/t6_paired.csv' (HEADER);

-- T7. baseline-free: the warmest water ever measured per 10 m bin on the core grid (lines 76.7-93.3, stations <= 120)
COPY (
  WITH r AS (SELECT * FROM cell WHERE line BETWEEN 76.7 AND 93.4 AND station <= 120 AND depth_bin <= 150 AND v < 35)
  SELECT depth_bin || '-' || (depth_bin + 10) AS depth_m, count(DISTINCT cruise_key) AS cruises,
         round(max(v) FILTER (WHERE cruise_key = '2026-11-33P4'), 2) AS warmest_nov_2026_C,
         round(max(v) FILTER (WHERE cruise_key <> '2026-11-33P4'), 2) AS warmest_before_C,
         arg_max(cruise_key, v) FILTER (WHERE cruise_key <> '2026-11-33P4') AS cruise_before,
         arg_max(site_key, v) FILTER (WHERE cruise_key <> '2026-11-33P4') AS station_before,
         round(max(v) FILTER (WHERE cruise_key = '2026-11-33P4') - max(v) FILTER (WHERE cruise_key <> '2026-11-33P4'), 2) AS margin_C
  FROM r GROUP BY depth_bin ORDER BY depth_bin
) TO '__OUT__/t7_warmest_ever_by_depth.csv' (HEADER);

-- T8. November 2026 station by station: layer anomalies and layer temperatures
COPY (
  SELECT site_key AS station,
         max(CASE WHEN layer = 'surface (0-10 m)' THEN round(temp, 2) END) AS surface_C, max(CASE WHEN layer = 'surface (0-10 m)' THEN round(anom, 2) END) AS surface_anom,
         max(CASE WHEN layer = '0-50 m' THEN round(temp, 2) END) AS t_0_50, max(CASE WHEN layer = '0-50 m' THEN round(anom, 2) END) AS anom_0_50,
         max(CASE WHEN layer = '50-200 m' THEN round(temp, 2) END) AS t_50_200, max(CASE WHEN layer = '50-200 m' THEN round(anom, 2) END) AS anom_50_200
  FROM station_layer WHERE cruise_key = '2026-11-33P4' GROUP BY site_key, line, station ORDER BY line DESC, station
) TO '__OUT__/t8_stations_2026-11.csv' (HEADER);

-- T9. the meeting's "8 degrees at 0-50 m, 6 degrees at 50-200 m": which stations it describes
COPY (
  WITH g AS (
    SELECT 1 AS o, 'line 93.3, stations 28 and 30' AS stations, * FROM station_layer WHERE cruise_key = '2026-11-33P4' AND line = 93.3 AND station IN (28, 30)
    UNION ALL SELECT 2, 'line 93.3, stations 26.7 to 35 (the screenshot)', * FROM station_layer WHERE cruise_key = '2026-11-33P4' AND line = 93.3 AND station <= 35
    UNION ALL SELECT 3, 'inshore: stations 45 and below on lines 86.7, 90.0, 93.3', * FROM station_layer WHERE cruise_key = '2026-11-33P4' AND line IN (86.7, 90.0, 93.3) AND station <= 45
    UNION ALL SELECT 4, 'offshore: stations beyond 45 on lines 86.7, 90.0, 93.3', * FROM station_layer WHERE cruise_key = '2026-11-33P4' AND line IN (86.7, 90.0, 93.3) AND station > 45
    UNION ALL SELECT 5, 'every station the cruise occupied', * FROM station_layer WHERE cruise_key = '2026-11-33P4')
  SELECT stations,
         count(anom) FILTER (WHERE layer = '0-50 m') AS n_0_50, round(avg(anom) FILTER (WHERE layer = '0-50 m'), 2) AS anom_0_50_C,
         count(anom) FILTER (WHERE layer = '50-200 m') AS n_50_200, round(avg(anom) FILTER (WHERE layer = '50-200 m'), 2) AS anom_50_200_C,
         count(anom) FILTER (WHERE layer = 'surface (0-10 m)') AS n_surface, round(avg(anom) FILTER (WHERE layer = 'surface (0-10 m)'), 2) AS anom_surface_C
  FROM g GROUP BY o, stations ORDER BY o
) TO '__OUT__/t9_meeting_numbers.csv' (HEADER);

-- T10. which part of the record has a baseline at all, by decade
COPY (
  SELECT CASE dataset_key WHEN 'calcofi_bottle' THEN 'bottle' ELSE 'CTD' END AS series, ((cruise_year // 10) * 10)::INTEGER || 's' AS decade,
         count(DISTINCT cruise_key) AS cruises, count(DISTINCT cruise_key) FILTER (WHERE anom IS NOT NULL) AS cruises_with_monthly_normal,
         count(DISTINCT cruise_key) FILTER (WHERE anom_season IS NOT NULL) AS cruises_with_seasonal_normal,
         round(100.0 * count(anom) / count(*))::INTEGER AS pct_cells_monthly, round(100.0 * count(anom_season) / count(*))::INTEGER AS pct_cells_seasonal
  FROM cell GROUP BY ALL ORDER BY series DESC, decade
) TO '__OUT__/t10_baseline_coverage.csv' (HEADER);

-- T11. the fall cruises of the CTD era: the month each one is compared with
COPY (
  SELECT c.year, c.cruise_key, c.ship_name, c.date_min, c.date_max, c.month_median AS cruise_month,
         count(DISTINCT x.site_key) AS ctd_stations, CASE WHEN c.year BETWEEN 1993 AND 2013 THEN 'yes' ELSE '' END AS in_baseline,
         max(s.data_stage) AS data_stage
  FROM cruise_ref c JOIN cell x USING (cruise_key) LEFT JOIN cruise_stage s ON s.cruise_key = c.cruise_key AND s.dataset_key = 'calcofi_ctd-cast'
  WHERE x.dataset_key = 'calcofi_ctd-cast' AND c.month_median IN (10, 11)
  GROUP BY ALL ORDER BY c.cruise_key
) TO '__OUT__/t11_fall_cruises.csv' (HEADER);

-- T12. every November cruise at the surface: over its own stations, and over the stations the fall 2026 cruise
-- occupied (the bars of the film's time strip), with the station counts the film shows
COPY (
  WITH own AS (
    SELECT cruise_key, count(*) AS stations_surface, count(anom) AS with_normal, round(avg(anom), 2) AS anom_own_C
    FROM cell WHERE dataset_key = 'calcofi_ctd-cast' AND cruise_month = 11 AND depth_bin = 0 GROUP BY cruise_key)
  SELECT r.year, o.cruise_key, r.ship_name, o.stations_surface, o.with_normal, o.anom_own_C,
         l.n_sta AS of_2026_stations, round(l.anom, 2) AS anom_2026_stations_C
  FROM own o JOIN cruise_ref r USING (cruise_key)
  LEFT JOIN cruise_layer l ON l.cruise_key = o.cruise_key AND l.dataset_key = 'calcofi_ctd-cast' AND l.layer = 'surface (0-10 m)'
  ORDER BY r.year
) TO '__OUT__/t12_november_surface.csv' (HEADER);
