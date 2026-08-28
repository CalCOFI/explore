-- the year strip / time series (all years, so the brush has context): n, mean and its standard error
SELECT year, count(*) AS n, count(DISTINCT root_id) AS n_samples, avg({{val}}) AS mean,
       stddev_samp({{val}}) / sqrt(count(*)) AS se
FROM slice
WHERE {{where_noyear}}
GROUP BY year ORDER BY year
