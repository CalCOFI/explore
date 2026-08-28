-- the chosen cruise's sampled values, one dot per root sample
SELECT root_id, any_value(latitude) AS latitude, any_value(longitude) AS longitude, any_value(grid_key) AS grid_key,
       count(*) AS n, avg({{val}}) AS mean, median({{val}}) AS med, epoch(min(datetime)) AS t
FROM slice
WHERE cruise_key = {{cruise}} AND latitude IS NOT NULL AND {{where}}
GROUP BY root_id
