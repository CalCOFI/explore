-- the data stage of each cruise's samples, per dataset: the release's `data_stage` (final · preliminary_with_bottle ·
-- preliminary_without_bottle on the CTD casts, NULL on every dataset that records none), the column ctd-transects badges a
-- cruise by. {{src}} is the release's `sample_root`, and only on a release whose sample_root carries data_stage (calcofi4db
-- 4.37.0+): App.tsx probes the registered object first (src/stage.ts stageProbeSql()) and never runs this where the column
-- is absent. One row per distinct stage: a cruise carries exactly one per dataset in v2026.11.09 (143 cruises, none
-- mixed), and where one ever carries two src/stage.ts keeps the least final.
SELECT cruise_key, dataset_key, data_stage, count(*) AS n
FROM {{src}}
WHERE data_stage IS NOT NULL AND cruise_key IS NOT NULL AND dataset_key IS NOT NULL
GROUP BY cruise_key, dataset_key, data_stage
ORDER BY cruise_key, dataset_key, data_stage
