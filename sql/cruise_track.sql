-- the track: one point per STATION VISIT of the cruise, in the order the ship reached them.
-- the root samples of one station arrive from several datasets whose clocks disagree — net-tow times are local,
-- casts are UTC, so a tow can sort 7 h before its own station's cast and after the next station's — and the
-- underway series can sit on a stale fix in port for hours. ordering every event by datetime drew the ship
-- darting between stations (2019-04: 2,719 events, 858 changes of station, ~80,000 km of track for a 3,800 km
-- cruise). a visit is one grid cell (or one rounded position off the grid): its position is the median of its
-- events, its time the median of its casts (the ship's own clock), else of every event; the underway series is
-- used only when a cruise has nothing else.
WITH ev AS (
  SELECT grid_key, sample_type, latitude, longitude, datetime
  FROM {{root_src}}
  WHERE cruise_key = {{cruise}} AND datetime IS NOT NULL
    AND latitude IS NOT NULL AND longitude IS NOT NULL AND NOT isnan(latitude) AND NOT isnan(longitude)
), ev_sta AS (
  SELECT * FROM ev WHERE sample_type <> 'underway' OR (SELECT count(*) FROM ev WHERE sample_type <> 'underway') = 0
), visit AS (
  SELECT coalesce(grid_key, printf('%.2f,%.2f', latitude, longitude)) AS grid_key,
         count(*) AS n_events,
         median(latitude) AS latitude, median(longitude) AS longitude,
         coalesce(median(datetime) FILTER (WHERE sample_type = 'cast'), median(datetime)) AS datetime
  FROM ev_sta
  GROUP BY 1
)
SELECT grid_key, n_events, latitude, longitude, epoch(datetime) AS t
FROM visit
ORDER BY datetime
