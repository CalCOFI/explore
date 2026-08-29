-- the working slice: one env VARIABLE = the union of its member measurement types' objects (src/variables.ts);
-- a hive object carries no measurement_type column (it is the partition PATH), so {{src}} adds it per object
CREATE OR REPLACE TABLE slice AS
SELECT obs_id, dataset_key, root_id, grid_key,
       regexp_extract(grid_key, 'ln([0-9.]+)', 1)::DOUBLE AS line, regexp_extract(grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station,
       cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m, depth_bin,
       taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok,
       tow_type, std_haul_factor, prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7
FROM {{src}}
