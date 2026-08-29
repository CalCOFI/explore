-- shared filter fragment, inlined into every lens template by engine.ts as {{where}}.
-- every template filters on qual_ok, the year range, the depth band and — for bio —
-- one life stage and one denominator ({{val}} = density_per_10m2 | density_per_1000m3 | value).
-- {{dataset_filter}} is TRUE or dataset_key IN (...) — the dataset pills (rule 4: the picker filters to datasets).
-- a NULL {{val}} is a row the chosen denominator cannot be derived for (e.g. manta tows per 10 m2):
-- it is excluded here and COUNTED per dataset by picker.sql for the pills (D8 rule 4).
qual_ok
  AND year BETWEEN {{y0}} AND {{y1}}
  AND (depth_bin IS NULL OR depth_bin BETWEEN {{d0}} AND {{d1}})
  AND ({{stage}} IS NULL OR life_stage = {{stage}})
  AND {{val}} IS NOT NULL
  AND {{dataset_filter}}
