-- the track: every root sampling event of the cruise (casts, tows, sites, underway) in datetime order
SELECT root_id, grid_key, sample_type, latitude, longitude, epoch(datetime) AS t
FROM {{root_src}}
WHERE cruise_key = {{cruise}} AND datetime IS NOT NULL
  AND latitude IS NOT NULL AND longitude IS NOT NULL AND NOT isnan(latitude) AND NOT isnan(longitude)
ORDER BY datetime
