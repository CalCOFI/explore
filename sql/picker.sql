-- D8 rule 4: dataset x life stage x effort class x gear, with how many RECORDS each denominator can serve
-- (n_filled: the zero-filled tows of slice_bio.sql beside them, never counted as observations)
SELECT dataset_key, life_stage, effort_class, tow_type, any_value(units) AS units,
       count(obs_id) AS n, count(density_per_10m2) FILTER (WHERE obs_id IS NOT NULL) AS n_10m2, count(density_per_1000m3) FILTER (WHERE obs_id IS NOT NULL) AS n_1000m3,
       count(*) FILTER (WHERE obs_id IS NULL) AS n_filled,
       count(*) FILTER (WHERE NOT qual_ok) AS n_flagged
FROM slice GROUP BY ALL ORDER BY 1, 2, 3, 4
