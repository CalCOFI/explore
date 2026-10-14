-- the regions the Area filter offers (explore#20): every layer the release intersected with its samples
-- (sample_spatial) and each region's name, with how many root samples fall inside it — the same layers and names
-- the Regions lens summarizes and the Layers card draws. One more row per layer (whole = 1): the layer's own
-- distinct count, for "all regions (n samples)" (regions may overlap, so it is not the sum)
SELECT layer, spatial_name, count(DISTINCT root_id) AS n, grouping(spatial_name) AS whole
FROM {{spatial_src}}
GROUP BY GROUPING SETS ((layer, spatial_name), (layer))
ORDER BY 1, 2 NULLS FIRST
