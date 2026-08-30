-- n counts RECORDS (obs_id IS NOT NULL: a zero-filled tow of slice_bio.sql is not one); the statistics run over every row
SELECT grid_key, count(obs_id) AS n, count(DISTINCT root_id) AS n_samples,
       avg({{val}}) AS mean, median({{val}}) AS med, min(year) AS y0, max(year) AS y1
FROM slice
WHERE grid_key IS NOT NULL AND {{where}}
GROUP BY grid_key
