-- the depth × time anomaly card (explore#28): one cell per cruise season (the cruise's year and quarter, the slice's own
-- `year` / `quarter`) × 10 m depth bin (floor bins labelled by their shallow edge, 50 = 50–60 m), coloured by the mean
-- departure from the normal over the observations in the cell. It reads slice_anom (sql/anom_slice.sql): the SAME
-- per-observation subtraction Hexagons and Contours pool — each value minus the baseline of its own station × cruise month
-- (or quarter, base=season) × depth bin × type — so no baseline is re-derived here. Every filter in force applies through
-- the shared filter (_filters.sql: years, months, season, depth band, datasets, quality, Area), with val = value so an observation WITHOUT a
-- baseline stays in the cell's n_obs; `anom` is NULL for it, so avg() and count() leave it out (never a 0) and a cell where
-- none had a baseline comes back with anom NULL and is drawn blank. n = observations with a baseline, the mean's weight.
SELECT year::INTEGER AS year, quarter::INTEGER AS quarter, depth_bin::INTEGER AS depth_bin,
       avg(anom) AS anom, count(anom) AS n, count(*) AS n_obs,
       string_agg(DISTINCT cruise_key, ', ' ORDER BY cruise_key) AS cruises
FROM slice_anom
WHERE depth_bin IS NOT NULL AND year IS NOT NULL AND quarter IS NOT NULL AND {{where}}
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
