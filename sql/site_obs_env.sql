-- the Observations layer's click card for water (`obs=` with a measurement): the slice's own rows at ONE site of
-- contour_cast.sql — its 0.01° point, lon / lat as that template rounds them — under the selection's filters (the
-- shared fragment: the years, season, depth band, datasets, area, cruises), each cast's value per depth bin, at most `limit`.
-- The bio card reads the release back for every taxon a sample holds (site_obs.sql); a water slice is one measurement,
-- so its own rows already say what was measured, when and at what depth.
SELECT dataset_key, sample_id, cruise_key, epoch(datetime) AS t, depth_bin, measurement_type, units, {{val}} AS value
FROM {{tbl}}
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND NOT isnan(latitude) AND NOT isnan(longitude)
  AND abs(round(longitude, 2) - {{lon}}) < 1e-6 AND abs(round(latitude, 2) - {{lat}}) < 1e-6
  AND {{where}}
ORDER BY datetime NULLS LAST, sample_id, depth_bin NULLS FIRST
LIMIT {{limit}}
