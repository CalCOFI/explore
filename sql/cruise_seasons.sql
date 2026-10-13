-- every cruise season in the release, whatever it sampled (explore#23): the Time strip marks a season with no cruise
-- at all apart from one where a cruise sailed but the view has nothing. the season is the cruise's own: the
-- year and month SWFSC designates in the `YYYY-MM-NODC` cruise_key
SELECT TRY_CAST(substr(cruise_key, 1, 4) AS INTEGER) AS year, (TRY_CAST(substr(cruise_key, 6, 2) AS INTEGER) + 2) // 3 AS quarter,
       string_agg(cruise_key, ', ' ORDER BY cruise_key) AS cruises
FROM {{src}}
WHERE TRY_CAST(substr(cruise_key, 6, 2) AS INTEGER) BETWEEN 1 AND 12
GROUP BY 1, 2 ORDER BY 1, 2
