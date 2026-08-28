-- the working slice: one env variable (one hive object), uniform columns shared with slice_bio.sql
CREATE OR REPLACE TABLE slice AS
SELECT root_id, dataset_key, grid_key,
       regexp_extract(grid_key, 'ln([0-9.]+)', 1)::DOUBLE AS line, regexp_extract(grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station,
       cruise_key, latitude, longitude, datetime, year, quarter,
       depth_min_m, depth_max_m, depth_bin, life_stage, NULL::VARCHAR AS tow_type, unit, value,
       NULL::DOUBLE AS density_per_10m2, NULL::DOUBLE AS density_per_1000m3, 'env' AS effort_class, qual_ok,
       hex_r3, hex_r4, hex_r5, hex_r6, hex_r7
FROM {{env_file}}
