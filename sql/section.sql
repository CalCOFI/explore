-- one CalCOFI line x depth_bin for one cruise (env: profiles / bottles); line/station are slice columns
SELECT grid_key, station, depth_bin,
       avg({{val}}) AS v, count(*) AS n
FROM slice
WHERE cruise_key = {{cruise}} AND depth_bin IS NOT NULL
  AND line = {{line}} AND {{where}}
GROUP BY ALL ORDER BY station, depth_bin
