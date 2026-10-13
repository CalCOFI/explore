-- what "N observations in view" counts: the observations (or casts) under EVERY filter in force — years (month-resolved),
-- season, depth band, life stage, standardization, datasets and the Area — so the legend, the Select card and the phone
-- sheet say how much data the map summarizes. The picker's per-dataset totals (picker.sql) stay what the pills count.
SELECT count(obs_id) AS n, count(DISTINCT root_id) AS n_samples
FROM slice
WHERE {{where}}
