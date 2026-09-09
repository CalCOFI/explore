-- the working slice: one env VARIABLE = the union of its member measurement types' objects (src/variables.ts);
-- a hive object carries no measurement_type column (it is the partition PATH), so {{src}} adds it per object
CREATE OR REPLACE TABLE slice AS
-- line / station are the REAL station (sample.site_key, denormalised onto obs_env since v2026.09.2x), not the
-- grid cell: the inshore cells hold 2–4 stations occupied every cruise (st30-ln90 = 90.30, 90.28, 90.27.7,
-- 88.5/30.1), so a section keyed on the cell averaged casts 15–30 km apart. grid_key stays for hexes and maps.
SELECT obs_id, dataset_key, root_id, grid_key, site_key,
       TRY_CAST(split_part(site_key, ' ', 1) AS DOUBLE) AS line, TRY_CAST(split_part(site_key, ' ', 2) AS DOUBLE) AS station,
       cruise_key, latitude, longitude, datetime, year, quarter, depth_min_m, depth_max_m, depth_bin,
       taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok,
       tow_type, std_haul_factor, prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7
FROM {{src}}
