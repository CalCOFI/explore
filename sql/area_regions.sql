-- the regions the Area filter offers (explore#20): every layer the release intersected with its samples
-- (sample_spatial) and each region's name, with how many root samples fall inside it — the same layers and names
-- the Regions lens summarizes and the Layers card draws
SELECT layer, spatial_name, count(DISTINCT root_id) AS n
FROM {{spatial_src}}
GROUP BY 1, 2 ORDER BY 1, 2
