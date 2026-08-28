-- D8 rule 4: dataset x life stage x effort class x gear, with how many rows each denominator can serve
SELECT dataset_key, life_stage, effort_class, tow_type, any_value(unit) AS unit,
       count(*) AS n, count(density_per_10m2) AS n_10m2, count(density_per_1000m3) AS n_1000m3,
       count(*) FILTER (WHERE NOT qual_ok) AS n_flagged
FROM slice GROUP BY ALL ORDER BY 1, 2, 3, 4
