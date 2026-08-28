-- the year strip (all years, so the brush has context)
SELECT year, count(*) AS n, count(DISTINCT root_id) AS n_samples, avg({{val}}) AS mean
FROM slice
WHERE {{where_noyear}}
GROUP BY year ORDER BY year
