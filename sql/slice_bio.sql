-- the working slice: one taxon of the bio realm (release object obs_bio; same columns as obs_env), zero-filled.
-- a positive-only dataset (no zero-valued row anywhere in the release: ichthyo, euphausiids, bird-mammal,
-- mesopelagic-fish) records a tow only when it caught the taxon, so its "mean per 10 m2" was the mean over
-- POSITIVE tows and a surveyed year with no catch drew like a year with no survey. here every tow such a
-- dataset sampled (a root sample with >= 1 row of any taxon; the effort it can standardize by is what its
-- rows carry) gets a zero row per life stage the dataset records this taxon at, unless it has a row already.
-- a dataset that ships its own zeros (cufes, zooscan, zoodb, phyllosoma) is left as it is. zero rows have
-- obs_id NULL and qual_ok TRUE.
CREATE OR REPLACE TABLE slice AS
WITH pos AS (
  SELECT obs_id, dataset_key, root_id, grid_key,
         regexp_extract(grid_key, 'ln([0-9.]+)', 1)::DOUBLE AS line, regexp_extract(grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station,
         cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m, depth_bin,
         taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok,
         tow_type, std_haul_factor, prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7
  FROM {{src}}
  WHERE taxon_key = {{taxon}}),
positive_only AS (
  SELECT dataset_key FROM {{src}}
  WHERE dataset_key IN (SELECT DISTINCT dataset_key FROM pos)
  GROUP BY dataset_key HAVING count(*) FILTER (WHERE value = 0) = 0),
tow AS (
  SELECT dataset_key, root_id, any_value(grid_key) AS grid_key, any_value(cruise_key) AS cruise_key,
         any_value(latitude) AS latitude, any_value(longitude) AS longitude, any_value(datetime) AS datetime,
         any_value(year) AS year, any_value(quarter) AS quarter, any_value(depth_min_m) AS depth_min_m,
         any_value(depth_max_m) AS depth_max_m, any_value(depth_bin) AS depth_bin, any_value(tow_type) AS tow_type,
         any_value(effort_class) AS effort_class, any_value(hex7) AS hex7,
         bool_or(density_per_10m2 IS NOT NULL) AS has_10m2, bool_or(density_per_1000m3 IS NOT NULL) AS has_1000m3
  FROM {{src}}
  WHERE dataset_key IN (SELECT dataset_key FROM positive_only)
  GROUP BY dataset_key, root_id),
stage AS (
  SELECT dataset_key, life_stage, any_value(measurement_type) AS measurement_type, any_value(units) AS units
  FROM pos GROUP BY dataset_key, life_stage)
SELECT * FROM pos
UNION ALL
SELECT NULL AS obs_id, t.dataset_key, t.root_id, t.grid_key,
       regexp_extract(t.grid_key, 'ln([0-9.]+)', 1)::DOUBLE AS line, regexp_extract(t.grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station,
       t.cruise_key, t.latitude, t.longitude, t.datetime, t.year, t.quarter, t.depth_min_m, t.depth_max_m, t.depth_bin,
       {{taxon}} AS taxon_key, s.life_stage, s.measurement_type, s.units, 0.0 AS value, NULL AS measurement_qual, TRUE AS qual_ok,
       t.tow_type, NULL AS std_haul_factor, NULL AS prop_sorted, NULL AS volume_sampled_m3,
       CASE WHEN t.has_10m2 THEN 0.0 END AS density_per_10m2, CASE WHEN t.has_1000m3 THEN 0.0 END AS density_per_1000m3,
       t.effort_class, t.hex7
FROM tow t JOIN stage s USING (dataset_key)
WHERE NOT EXISTS (SELECT 1 FROM pos p WHERE p.dataset_key = t.dataset_key AND p.root_id = t.root_id AND p.life_stage IS NOT DISTINCT FROM s.life_stage)
