-- the year strip / time series (all years, so the brush has context): n, mean and its standard error per bin.
-- {{bin}} is `year` (one bar per year) or `year + (month(datetime) - 0.5) / 12.0` (month bins as fractional
-- years, drawn when the strip is zoomed to <= 15 years — D20 level of detail)
SELECT {{bin}} AS year, count(*) AS n, count(DISTINCT root_id) AS n_samples, avg({{val}}) AS mean,
       stddev_samp({{val}}) / sqrt(count(*)) AS se
FROM slice
WHERE {{where_noyear}} AND {{bin}} IS NOT NULL
GROUP BY 1 ORDER BY 1
