-- n counts RECORDS (obs_id IS NOT NULL: a zero-filled tow of slice_bio.sql is not one); the statistics run over every row
-- n_samples / n_found count samples (sample_id: a species' nets, a variable's casts), the unit the mean runs over
SELECT grid_key, count(obs_id) AS n, count(DISTINCT sample_id) AS n_samples, count(DISTINCT CASE WHEN obs_id IS NOT NULL THEN sample_id END) AS n_found,
       avg({{val}}) AS mean, median({{val}}) AS med, min(year) AS y0, max(year) AS y1,
       quantile_cont({{val}}, 0.05) AS p05, quantile_cont({{val}}, 0.95) AS p95
FROM {{tbl}}
WHERE grid_key IS NOT NULL AND {{where}}
GROUP BY grid_key
