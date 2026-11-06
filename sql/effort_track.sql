-- the Effort layer (`effort=on`): every path in sample_track (calcofi4db 4.35.0+) — a survey's on-effort segments
-- (track_type effort_segment) and the observer's line of sight to each sighted animal (sight_line) — for the selected
-- datasets in the time window and, in the cruise lens, for one cruise. It never reads the taxon or the slice: effort
-- is where the observers looked, whatever was or was not seen. It never reads geom either (the WASM engine loads no
-- spatial extension): the path is the six lon/lat columns, beginning · middle · end (src/effort.ts effortPaths()).
-- sample_track has no cruise_key, so each path takes its root sample's row in sample_root (cruise_key, grid_key,
-- root_id): an effort segment is a root sample itself; a sight line is the child of its segment (sample.parent_sample_key,
-- which sample_root does not carry), so it takes the row of the same dataset's segment whose time span contains it.
-- The time window is then the CRUISE's month and season, the same rule as the slice (slice_env.sql, explore#17): the
-- cruise table's median cast month ({{cruise_src}}, v2026.11+), the key's YYYY-MM where the table lacks it ({{key_month}} /
-- {{key_year}}); a path with no cruise (a misdated segment given none, a sight line off effort) falls back to the calendar
-- month of datetime_beg, and one with no time either is not drawn. quarter is the season 1 = DJF … 4 = SON.
-- {{area_filter}} reads grid_key / root_id / latitude / longitude: the path's midpoint and its root row. {{cruise}} is
-- NULL outside the cruise lens.
WITH seg AS (
  SELECT t.sample_key, t.dataset_key, t.datetime_beg, t.datetime_end, r.root_id, r.grid_key, r.cruise_key
  FROM {{track_src}} t JOIN {{root_src}} r ON r.root_sample_key = t.sample_key
  WHERE t.track_type = 'effort_segment'
), within AS (  -- a path that is not a root sample: the segment it falls in (the first by key, if spans overlap)
  SELECT t.sample_key, min(s.sample_key) AS seg_key
  FROM {{track_src}} t JOIN seg s ON s.dataset_key = t.dataset_key AND t.datetime_beg BETWEEN s.datetime_beg AND s.datetime_end
  WHERE NOT EXISTS (SELECT 1 FROM {{root_src}} r WHERE r.root_sample_key = t.sample_key)
  GROUP BY t.sample_key
), placed AS (
  SELECT t.sample_key, t.dataset_key, t.track_type, t.datetime_beg, t.length_km,
         t.longitude_beg, t.latitude_beg, t.longitude_mid, t.latitude_mid, t.longitude_end, t.latitude_end,
         t.longitude_mid AS longitude, t.latitude_mid AS latitude,
         coalesce(r.root_id, s.root_id) AS root_id, coalesce(r.grid_key, s.grid_key) AS grid_key,
         coalesce(r.cruise_key, s.cruise_key) AS cruise_key
  FROM {{track_src}} t
  LEFT JOIN {{root_src}} r ON r.root_sample_key = t.sample_key
  LEFT JOIN within w ON w.sample_key = t.sample_key
  LEFT JOIN seg s ON s.sample_key = w.seg_key
), dated AS (
  SELECT p.*,
         COALESCE(COALESCE(year(cz.date_median), {{key_year}}), year(datetime_beg)) AS c_year,
         COALESCE(COALESCE(cz.month_median, {{key_month}}), month(datetime_beg)) AS c_month,
         COALESCE((CASE WHEN COALESCE(cz.month_median, {{key_month}}) IN (12, 1, 2) THEN 1 WHEN COALESCE(cz.month_median, {{key_month}}) IN (3, 4, 5) THEN 2 WHEN COALESCE(cz.month_median, {{key_month}}) IN (6, 7, 8) THEN 3 WHEN COALESCE(cz.month_median, {{key_month}}) IN (9, 10, 11) THEN 4 END),
                  (CASE WHEN month(datetime_beg) IN (12, 1, 2) THEN 1 WHEN month(datetime_beg) IN (3, 4, 5) THEN 2 WHEN month(datetime_beg) IN (6, 7, 8) THEN 3 WHEN month(datetime_beg) IN (9, 10, 11) THEN 4 END)) AS quarter
  FROM placed p LEFT JOIN {{cruise_src}} cz USING (cruise_key)
)
SELECT sample_key, dataset_key, track_type, cruise_key, epoch(datetime_beg) AS t, length_km,
       longitude_beg, latitude_beg, longitude_mid, latitude_mid, longitude_end, latitude_end
FROM dated
WHERE c_year * 100 + c_month BETWEEN {{ym0}} AND {{ym1}}
  AND {{quarter_filter}}
  AND {{dataset_filter}}
  AND {{area_filter}}
  AND ({{cruise}} IS NULL OR cruise_key = {{cruise}})
ORDER BY track_type, sample_key
