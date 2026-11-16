-- exact per-root-sample membership (sample_spatial), one layer at a time because layers overlap
SELECT sp.spatial_key, any_value(sp.spatial_name) AS spatial_name, count(s.obs_id) AS n, count(DISTINCT s.root_id) AS n_samples, count(DISTINCT CASE WHEN s.obs_id IS NOT NULL THEN s.root_id END) AS n_found,
       avg({{val}}) AS mean, count({{val}}) AS n_rows, median({{val}}) AS med, min({{val}}) AS lo, max({{val}}) AS hi, min(year) AS y0, max(year) AS y1
FROM slice s JOIN {{spatial_src}} sp USING (root_id)
WHERE sp.layer = {{layer}} AND {{where}}
GROUP BY sp.spatial_key
