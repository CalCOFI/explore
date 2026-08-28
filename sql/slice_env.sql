-- the working slice: one env variable — one hive object of obs_env, whose partition key (measurement_type)
-- lives in the object's PATH, not its columns, so the template supplies it as a literal
CREATE OR REPLACE TABLE slice AS
SELECT obs_id, dataset_key, root_id, grid_key,
       regexp_extract(grid_key, 'ln([0-9.]+)', 1)::DOUBLE AS line, regexp_extract(grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station,
       cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m, depth_bin,
       taxon_key, life_stage, {{var}} AS measurement_type, units, value, measurement_qual, qual_ok,
       tow_type, std_haul_factor, prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7
FROM {{src}}
