-- exact per-root-sample membership (sample_spatial), one layer at a time because layers overlap
SELECT sp.spatial_key, any_value(sp.spatial_name) AS spatial_name, count(*) AS n, count(DISTINCT s.root_id) AS n_samples,
       avg({{val}}) AS mean, median({{val}}) AS med, min(year) AS y0, max(year) AS y1
FROM slice s JOIN {{spatial_src}} sp USING (root_id)
WHERE sp.layer = {{layer}} AND {{where}}
GROUP BY sp.spatial_key
