-- cruises that sampled this line, newest first (a YYYY-MM-NODC key sorts chronologically by itself);
-- n_sta is the picker's bar; App.tsx defaults to the NEWEST cruise (this order's first row), n_sta only a tiebreak
SELECT cruise_key, count(DISTINCT grid_key) AS n_sta, count(obs_id) AS n, min(year) AS year
FROM slice
WHERE cruise_key IS NOT NULL AND line = {{line}} AND {{where}}
GROUP BY cruise_key ORDER BY cruise_key DESC
