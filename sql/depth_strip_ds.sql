-- the maximized water-column profile: the per-dataset median per 10 m bin (one dotted line per dataset,
-- beside the all-dataset median + IQR of depth_strip.sql)
SELECT dataset_key, depth_bin, count(obs_id) AS n, median({{val}}) AS med,
       quantile_cont({{val}}, 0.25) AS q1, quantile_cont({{val}}, 0.75) AS q3
FROM slice
WHERE depth_bin IS NOT NULL AND {{where_nodepth}}
GROUP BY dataset_key, depth_bin ORDER BY dataset_key, depth_bin
