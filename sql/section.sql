-- one CalCOFI line x depth_bin for one cruise (env: profiles / bottles); line/station are slice columns.
-- `month` is the calendar month the station was occupied in: the anomaly subtracts the climatology of THAT month
-- (section_clim.sql), never a mean over all months — that would be a map of the seasonal cycle, not a departure
SELECT grid_key, station, depth_bin,
       avg({{val}}) AS v, count(*) AS n, mode(month(datetime)) AS month
FROM slice
WHERE cruise_key = {{cruise}} AND depth_bin IS NOT NULL
  AND line = {{line}} AND {{where}}
GROUP BY ALL ORDER BY station, depth_bin
