-- the working slice: one env VARIABLE = the union of its member measurement types' objects (src/variables.ts);
-- a hive object carries no measurement_type column (it is the partition PATH), so {{src}} adds it per object
CREATE OR REPLACE TABLE slice AS
-- line / station are the REAL station (sample.site_key, denormalised onto obs_env since v2026.09.2x), not the
-- grid cell: the inshore cells hold 2–4 stations occupied every cruise (st30-ln90 = 90.30, 90.28, 90.27.7,
-- 88.5/30.1), so a section keyed on the cell averaged casts 15–30 km apart. grid_key stays for hexes and maps.
-- year / quarter / cruise_month / season_year are the CRUISE's: its median cast month and year from the release's cruise
-- table ({{cruise_src}}: month_median / date_median, v2026.11+, calcofi4db 4.33.0), the YYYY-MM of the cruise_key
-- ({{key_month}} / {{key_year}}) where the table does not carry them, the release's own column only where the key is
-- missing or malformed. quarter is the season, 1 = DJF … 4 = SON; season_year counts December toward the next winter.
-- The season filter keeps a July cruise's 30 June stations in JJA (explore#17). The same rule as the release's own columns.
SELECT obs_id, dataset_key, root_id, grid_key, site_key,
       TRY_CAST(split_part(site_key, ' ', 1) AS DOUBLE) AS line, TRY_CAST(split_part(site_key, ' ', 2) AS DOUBLE) AS station,
       cruise_key, latitude, longitude, datetime, COALESCE(COALESCE(year(cz.date_median), {{key_year}}), year)::SMALLINT AS year, COALESCE((CASE WHEN COALESCE(cz.month_median, {{key_month}}) IN (12, 1, 2) THEN 1 WHEN COALESCE(cz.month_median, {{key_month}}) IN (3, 4, 5) THEN 2 WHEN COALESCE(cz.month_median, {{key_month}}) IN (6, 7, 8) THEN 3 WHEN COALESCE(cz.month_median, {{key_month}}) IN (9, 10, 11) THEN 4 END), quarter)::TINYINT AS quarter,
       depth_min_m, depth_max_m, depth_bin,
       taxon_key, life_stage, measurement_type, units, value, measurement_qual, qual_ok,
       tow_type, std_haul_factor, prop_sorted, volume_sampled_m3, density_per_10m2, density_per_1000m3, effort_class, hex7,
       COALESCE(cz.month_median, {{key_month}})::TINYINT AS cruise_month, (CASE WHEN COALESCE(cz.month_median, {{key_month}}) = 12 THEN COALESCE(year(cz.date_median), {{key_year}}) + 1 ELSE COALESCE(year(cz.date_median), {{key_year}}) END)::SMALLINT AS season_year
FROM {{src}} o LEFT JOIN {{cruise_src}} cz USING (cruise_key)
