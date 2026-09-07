-- the site grain for the Contours lens (plan 2026-09-07 § D40): one point per SITE — every cast, tow or site at its
-- own position, rounded to 0.01° (≈ 1 km), with the same summary the station table carries. The surface then sees
-- every position the ship occupied rather than one cell that lumps 2–4 stations (the grid_key caveat); repeat
-- occupations of a site pool into one point (their spread is the kriging nugget), which also keeps the local
-- systems non-singular — 52,376 sardine tows at ~2,000 positions made every 24-nearest system singular
SELECT round(any_value(longitude), 2) AS longitude, round(any_value(latitude), 2) AS latitude,
       count(DISTINCT root_id) AS n_samples, count(obs_id) AS n, avg({{val}}) AS mean, median({{val}}) AS med,
       min(year) AS y0, max(year) AS y1, quantile_cont({{val}}, 0.05) AS p05, quantile_cont({{val}}, 0.95) AS p95
FROM slice
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND NOT isnan(latitude) AND NOT isnan(longitude) AND {{where}}
GROUP BY round(longitude, 2), round(latitude, 2)
