-- the baseline the anomaly subtracts: the release's `climatology` table (calcofi4db::build_climatology()) — a plain mean
-- per dataset x station (site_key, since calcofi4db 4.8.0; grid_key rides along) x the cruise's designated month x 10 m
-- depth_bin x measurement type over 1993-2013, kept where >= 5 cruises (min_cruises = 5L at release) contribute; the SAME
-- table ctd-transects subtracts, so the two products cannot disagree. From calcofi4db 4.24.0 each row also carries its
-- quarter's SEASONAL baseline (season_mean / season_n / season_n_cruises, >= 5 cruises in the quarter).
-- clim_src is anomaly.ts climBaseSql(): the variable's member types' objects with the chosen baseline's columns as
-- `mean` / `n` / `n_cruises`, keyed by `period` (the cruise month, or its quarter under the seasonal baseline), and only
-- the rows that HAVE a mean under it — a NULL clim_mean is "no monthly baseline", exactly like an absent row (the month
-- missed the floor while its quarter passed). The datasets in view are pooled weighted by n, which is exactly the mean over
-- their observations. `month` here is the PERIOD (anomaly.ts climLookup()). The year / season / depth filters
-- deliberately do NOT apply: the baseline is fixed by construction, and that is what makes an anomaly comparable.
SELECT TRY_CAST(split_part(site_key, ' ', 2) AS DOUBLE) AS station, period AS month, depth_bin,
       sum(mean * n) / sum(n) AS v, sum(n) AS n, max(n_cruises) AS n_cruises,
       min(yr_min) AS yr_min, max(yr_max) AS yr_max
FROM {{clim_src}}
WHERE TRY_CAST(split_part(site_key, ' ', 1) AS DOUBLE) = {{line}} AND {{dataset_filter}}
GROUP BY ALL ORDER BY station, month, depth_bin
