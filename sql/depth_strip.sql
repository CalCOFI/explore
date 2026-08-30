-- the water-column strip: median / IQR per 10 m bin over the current selection (all depths, so the brush has context)
SELECT depth_bin, count(obs_id) AS n, median({{val}}) AS med,
       quantile_cont({{val}}, 0.25) AS q1, quantile_cont({{val}}, 0.75) AS q3
FROM slice
WHERE depth_bin IS NOT NULL AND {{where_nodepth}}
GROUP BY depth_bin ORDER BY depth_bin
