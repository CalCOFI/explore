-- the working slice: one taxon of the bio realm, uniform columns shared with slice_env.sql
CREATE OR REPLACE TABLE slice AS
SELECT root_id, dataset_key, grid_key,
       regexp_extract(grid_key, 'ln([0-9.]+)', 1)::DOUBLE AS line, regexp_extract(grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station,
       cruise_key, latitude, longitude, datetime, year, quarter,
       depth_min_m, depth_max_m, depth_bin, life_stage, tow_type, unit, value,
       density_per_10m2, density_per_1000m3, effort_class, qual_ok,
       hex_r3, hex_r4, hex_r5, hex_r6, hex_r7
FROM 'obs_bio.parquet'
WHERE taxon_key = {{taxon}}
