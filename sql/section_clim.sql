-- the climatology the anomaly subtracts: same line, every cruise in the year range
SELECT station, depth_bin,
       avg({{val}}) AS v, count(*) AS n, count(DISTINCT cruise_key) AS n_cruises
FROM slice
WHERE depth_bin IS NOT NULL
  AND line = {{line}} AND {{where}}
GROUP BY ALL ORDER BY station, depth_bin
