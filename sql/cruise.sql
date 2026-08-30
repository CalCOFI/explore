SELECT cruise_key, count(obs_id) AS n, count(DISTINCT root_id) AS n_samples, count(DISTINCT grid_key) AS n_sta,
       avg({{val}}) AS mean, median({{val}}) AS med, epoch(min(datetime)) AS t0, epoch(max(datetime)) AS t1
FROM slice
WHERE cruise_key IS NOT NULL AND {{where}}
GROUP BY cruise_key ORDER BY t0
