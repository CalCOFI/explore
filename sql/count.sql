-- what "N observations in view" counts: the observations (or casts) under EVERY filter in force — years (month-resolved),
-- season, depth band, life stage, standardization, datasets and the Area — so the legend, the Select card and the phone
-- sheet say how much data the map summarizes. The picker's per-dataset totals (picker.sql) stay what the pills count.
-- n = records, n_samples = samples (tows / casts, the zero-filled ones included), n_found = samples with a record — a
-- tow can hold two records of one taxon and stage, so n and n_found can differ (31 records in 30 tows). No filter keyword
-- above the real one, in the comments or the SELECT list (a CASE, not FILTER): src/reproduce.ts whereSql() and App.tsx
-- read this template's filter as everything after its first one
SELECT count(obs_id) AS n, count(DISTINCT root_id) AS n_samples, count(DISTINCT CASE WHEN obs_id IS NOT NULL THEN root_id END) AS n_found
FROM slice
WHERE {{where}}
