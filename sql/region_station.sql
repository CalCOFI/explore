-- where each station's dot travels in the Regions morph: the polygon most of its root samples fall in
SELECT grid_key, arg_max(spatial_key, n) AS spatial_key FROM (
  SELECT r.grid_key, sp.spatial_key, count(*) AS n
  FROM 'sample_root.parquet' r JOIN 'sample_spatial.parquet' sp USING (root_id)
  WHERE sp.layer = {{layer}} AND r.grid_key IS NOT NULL
  GROUP BY ALL)
GROUP BY grid_key
