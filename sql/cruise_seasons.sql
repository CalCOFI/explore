-- every cruise season in the release, whatever it sampled (explore#23): the Time strip marks a season with no cruise
-- at all apart from one where a cruise sailed but the view has nothing. the season is the cruise's own: its season_year
-- and season (1 = DJF … 4 = SON) from the cruise table's median cast month ({{cs_year}} / {{cs_quarter}}, v2026.11+), the
-- key's YYYY-MM on an older release (sqltpl.ts BUILTIN)
SELECT {{cs_year}} AS year, {{cs_quarter}} AS quarter,
       string_agg(cruise_key, ', ' ORDER BY cruise_key) AS cruises
FROM {{src}}
WHERE {{cs_quarter}} BETWEEN 1 AND 4 AND {{cs_year}} IS NOT NULL
GROUP BY 1, 2 ORDER BY 1, 2
