-- every temperature cell in the record with its departure from the release's own climatology.
-- run from the release mirror (fetch_release.py):  duckdb work/elnino.duckdb < 01_anomaly_cells.sql   (after .read views.sql)
--
-- a CELL is one cruise x station (site_key) x 10 m depth bin of one dataset: the mean of its quality-ok observations,
-- exactly what sql/section.sql draws. Its baseline is the climatology row of the SAME dataset, station, depth bin and
-- measurement type for the CRUISE's month (obs_env.cruise_month = cruise.month_median) - the rule of src/anomaly.ts and
-- sql/anom_slice.sql. A cell whose month has no monthly baseline (clim_mean NULL or no row) keeps anom NULL: never 0.
-- the seasonal baseline (season_mean, the cruise's DJF/MAM/JJA/SON season) rides along as anom_season.
CREATE OR REPLACE TABLE cell AS
WITH o AS (
  SELECT dataset_key, measurement_type, cruise_key, site_key, depth_bin,
         any_value(cruise_month) AS cruise_month, any_value(year) AS cruise_year, any_value(quarter) AS season,
         mode(grid_key) AS grid_key,
         avg(value) AS v, min(value) AS v_min, max(value) AS v_max, count(*) AS n_obs,
         avg(latitude) AS latitude, avg(longitude) AS longitude, min(datetime) AS datetime,
         avg((depth_min_m + depth_max_m) / 2) AS depth_m
  FROM obs_env
  WHERE measurement_type IN ('temperature_ave', 'temperature')          -- CTD sensor-pair average; bottle (QC'd)
    AND dataset_key IN ('calcofi_ctd-cast', 'calcofi_bottle')
    AND qual_ok AND value IS NOT NULL AND depth_bin IS NOT NULL AND site_key IS NOT NULL
  GROUP BY ALL)
SELECT o.*,
       TRY_CAST(split_part(o.site_key, ' ', 1) AS DOUBLE) AS line,
       TRY_CAST(split_part(o.site_key, ' ', 2) AS DOUBLE) AS station,
       c.clim_mean, c.clim_sd, c.clim_n, c.n_cruises, c.season_mean, c.season_sd, c.season_n_cruises,
       o.v - c.clim_mean   AS anom,
       o.v - c.season_mean AS anom_season
FROM o
LEFT JOIN climatology c
  ON c.dataset_key = o.dataset_key AND c.measurement_type = o.measurement_type AND c.site_key = o.site_key
 AND c.month = o.cruise_month AND c.depth_bin = o.depth_bin;

CREATE OR REPLACE TABLE cruise_ref AS
SELECT cruise_key, year, month, month_median, date_min, date_max, date_median, ship_name, season, season_year FROM cruise;

-- the stage of each cruise's CTD casts (preliminary / final), from the release's sample table
CREATE OR REPLACE TABLE cruise_stage AS
SELECT cruise_key, dataset_key, string_agg(DISTINCT data_stage, ', ' ORDER BY data_stage) AS data_stage, count(*) AS n_casts
FROM sample WHERE sample_type = 'cast' GROUP BY ALL;

-- the November 2026 casts at the CTD's full 1 m resolution (obs_ctd_full, supplemental), with their station
CREATE OR REPLACE TABLE cast_1m AS
SELECT s.site_key, f.sample_key, right(f.sample_key, 1) AS direction, f.depth_min_m AS depth_m,
       f.measurement_type, f.measurement_value AS value, f.measurement_qual, f.datetime
FROM obs_ctd_full f JOIN sample s USING (sample_key)
WHERE f.cruise_key = '2026-11-33P4'
  AND f.measurement_type IN ('temperature_ave', 'temperature_1', 'temperature_2', 'salinity_1', 'salinity_2', 'salinity_ave_corr',
                             'sigma_theta_1', 'salinity_btl', 'oxygen_btl_ml_l', 'oxygen_ml_l_1', 'btl_temperature');

-- the baseline rows themselves, for plotting a normal profile
CREATE OR REPLACE TABLE clim AS
SELECT * FROM climatology WHERE measurement_type IN ('temperature_ave', 'temperature', 'salinity_ave_corr', 'salinity')
  AND dataset_key IN ('calcofi_ctd-cast', 'calcofi_bottle');
