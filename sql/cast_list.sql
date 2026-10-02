-- cast_census.sql with the casts' own rows: n values, n_placed of them on a sample that sample_root places (a value on
-- a sample with no root row has no position and never reaches slice_cast.sql — it is counted here, never silently
-- dropped), and the first and last year sampled. scripts/smoke_release.mjs asserts n = n_placed for the type it opens.
SELECT sm.dataset_key, sm.measurement_type, count(*) AS n, count(r.root_id) AS n_placed,
       min(year(r.datetime))::INTEGER AS y0, max(year(r.datetime))::INTEGER AS y1
FROM {{sm_src}} sm
LEFT JOIN {{root_src}} r ON r.root_sample_key = sm.sample_key
GROUP BY ALL ORDER BY 1, 2
