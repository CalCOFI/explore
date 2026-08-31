-- the baseline the anomaly subtracts: the release's `climatology` table (calcofi4db::build_climatology()) — a plain mean
-- per dataset x station x calendar month x 10 m depth_bin x measurement type over 1993-2013, kept where >= 3 cruises
-- contribute; the SAME table ctd-transects subtracts, so the two products cannot disagree. {{clim_src}} unions the
-- variable's member types' objects (one hive object per type, like obs_env). The datasets in view are pooled weighted
-- by n, which is exactly the mean over their observations. The year / season / depth filters deliberately do NOT
-- apply: the baseline is fixed by construction, and that is what makes an anomaly comparable across cruises.
SELECT regexp_extract(grid_key, 'st(-?[0-9.]+)', 1)::DOUBLE AS station, month, depth_bin,
       sum(clim_mean * clim_n) / sum(clim_n) AS v, sum(clim_n) AS n, max(n_cruises) AS n_cruises,
       any_value(clim_yr_min) AS yr_min, any_value(clim_yr_max) AS yr_max
FROM {{clim_src}}
WHERE regexp_extract(grid_key, 'ln([0-9.]+)', 1)::DOUBLE = {{line}} AND {{dataset_filter}}
GROUP BY ALL ORDER BY station, month, depth_bin
