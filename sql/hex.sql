SELECT {{hex}} AS hex, count(*) AS n, count(DISTINCT root_id) AS n_samples,
       avg({{val}}) AS mean, median({{val}}) AS med
FROM slice
WHERE {{hex}} IS NOT NULL AND {{where}}
GROUP BY {{hex}}
