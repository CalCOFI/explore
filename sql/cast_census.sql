-- what sample_measurement holds, per dataset × measurement type: the count the variable picker shows for a per-cast
-- variable (src/castgrain.ts castVariables() keeps the registry's per-sample types of the derived datasets). It reads
-- sample_measurement alone (2.6 MB in v2026.10.01), so the picker can list the family without fetching sample_root;
-- cast_list.sql adds the years and how many values a root sample places once sample_root is loaded.
SELECT dataset_key, measurement_type, count(*) AS n
FROM {{sm_src}}
GROUP BY ALL ORDER BY 1, 2
