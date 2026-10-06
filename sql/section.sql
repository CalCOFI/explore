-- one CalCOFI line x depth_bin for one cruise (env: profiles / bottles); line/station are slice columns parsed
-- from site_key (the real station), so two stations sharing a grid cell are two columns, never one bar.
-- `month` is the CRUISE's month — the MM of its YYYY-MM-NODC cruise_key, the month SWFSC designates — never the calendar
-- month a station was occupied in: a cruise starting on a month's last days works its first stations in the month
-- before (2026-07-3322 occupied line 93.3 26.4–45 on 2026-06-30). The anomaly subtracts the climatology of THAT month
-- (section_clim.sql, src/anomaly.ts), never a mean over all months — that would be a map of the seasonal cycle
SELECT site_key, mode(grid_key) AS grid_key, station, depth_bin,
       avg({{val}}) AS v, count(*) AS n, mode(TRY_CAST(substr(cruise_key, 6, 2) AS INTEGER)) AS month
FROM slice
WHERE cruise_key = {{cruise}} AND depth_bin IS NOT NULL
  AND line = {{line}} AND {{where}}
GROUP BY site_key, station, depth_bin ORDER BY station, depth_bin
