-- shared filter fragment, inlined into every lens template by engine.ts as {{where}}.
-- every template filters on qual_ok, the year range (month-resolved, D20: {{ym0}}/{{ym1}} = year*100 + month;
-- a row without a datetime counts as mid-year so a whole-year range keeps it), the season ({{quarter_filter}}
-- is TRUE or quarter IN (...)), the depth band and — for bio — one life stage and one denominator
-- ({{val}} = density_per_10m2 | density_per_1000m3 | value).
-- {{dataset_filter}} is TRUE or dataset_key IN (...) — the dataset pills (rule 4: the picker filters to datasets).
-- a NULL {{val}} is a row the chosen denominator cannot be derived for (e.g. manta tows per 10 m2):
-- it is excluded here and COUNTED per dataset by picker.sql for the pills (D8 rule 4).
qual_ok
  AND COALESCE(year::INTEGER * 100 + month(datetime), year::INTEGER * 100 + 6) BETWEEN {{ym0}} AND {{ym1}}  -- year is a SMALLINT in the release: * 100 overflows INT16 without the cast
  AND {{quarter_filter}}
  AND (depth_bin IS NULL OR depth_bin BETWEEN {{d0}} AND {{d1}})
  AND ({{stage}} IS NULL OR life_stage = {{stage}})
  AND {{val}} IS NOT NULL
  AND {{dataset_filter}}
