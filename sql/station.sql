SELECT grid_key, count(*) AS n, count(DISTINCT root_id) AS n_samples,
       avg({{val}}) AS mean, median({{val}}) AS med, min(year) AS y0, max(year) AS y1
FROM slice
WHERE grid_key IS NOT NULL AND {{where}}
GROUP BY grid_key
