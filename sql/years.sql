-- the year strip / time series (all years, so the brush has context): n records, n_samples tows (zero-filled ones
-- included), n_cruises, and the mean ± se per bin. {{bin}} is `year` (one bar per year), a season
-- (`year + (quarter - 0.5) / 4.0`, four points a year — the default of mean ± se, explore#21) or a month
-- (`year + (month(datetime) - 0.5) / 12.0`, drawn when the strip is zoomed to <= 15 years — D20 level of detail).
-- the mean and its se are taken over STATION means (explore#21): each station's mean in the bin, then the mean and
-- the standard error across stations, so the band shows how the stations differ, not a se that shrinks with every
-- bottle in the bin. a station is the grid cell (grid_key); a cast off the grid is its own 0.1° point.
WITH s AS (
  SELECT {{bin}} AS year, COALESCE(grid_key, round(latitude, 1)::VARCHAR || ',' || round(longitude, 1)::VARCHAR) AS station,
         count(obs_id) AS n, avg({{val}}) AS m
  FROM slice
  WHERE {{where_noyear}} AND {{bin}} IS NOT NULL
  GROUP BY 1, 2
), b AS (
  SELECT {{bin}} AS year, count(DISTINCT root_id) AS n_samples, count(DISTINCT cruise_key) AS n_cruises
  FROM slice
  WHERE {{where_noyear}} AND {{bin}} IS NOT NULL
  GROUP BY 1
)
SELECT s.year, sum(s.n)::BIGINT AS n, any_value(b.n_samples) AS n_samples, any_value(b.n_cruises) AS n_cruises,
       count(*) AS n_stations, avg(s.m) AS mean, stddev_samp(s.m) / sqrt(count(s.m)) AS se
FROM s JOIN b USING (year)
GROUP BY 1 ORDER BY 1
