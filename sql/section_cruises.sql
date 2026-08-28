-- cruises that sampled this line, most stations first (the section's default cruise)
SELECT cruise_key, count(DISTINCT grid_key) AS n_sta, count(*) AS n, min(year) AS year
FROM slice
WHERE cruise_key IS NOT NULL AND line = {{line}} AND {{where}}
GROUP BY cruise_key ORDER BY n_sta DESC, cruise_key DESC
