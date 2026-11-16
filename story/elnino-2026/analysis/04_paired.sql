-- the strictest comparison: November 2026 against every other cruise ON THE STATIONS THEY SHARE.
-- For each cruise x layer: the stations where both it and 2026-11 have a complete layer mean (at least 5 of them),
-- the two means over exactly those stations, and the margin. Done for the monthly and the seasonal baseline and,
-- baseline-free, for the layer's mean temperature itself.
CREATE OR REPLACE TABLE paired AS
WITH ref AS (SELECT site_key, layer, anom AS a26, anom_season AS s26, temp AS t26 FROM station_layer WHERE cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast')
SELECT s.dataset_key, s.cruise_key, s.layer,
       count(*) FILTER (WHERE s.anom IS NOT NULL AND r.a26 IS NOT NULL)               AS n_month,
       avg(s.anom) FILTER (WHERE s.anom IS NOT NULL AND r.a26 IS NOT NULL)            AS anom_other,
       avg(r.a26)  FILTER (WHERE s.anom IS NOT NULL AND r.a26 IS NOT NULL)            AS anom_2026,
       count(*) FILTER (WHERE s.anom_season IS NOT NULL AND r.s26 IS NOT NULL)        AS n_season,
       avg(s.anom_season) FILTER (WHERE s.anom_season IS NOT NULL AND r.s26 IS NOT NULL) AS season_other,
       avg(r.s26)         FILTER (WHERE s.anom_season IS NOT NULL AND r.s26 IS NOT NULL) AS season_2026,
       count(*) FILTER (WHERE s.temp IS NOT NULL AND r.t26 IS NOT NULL)               AS n_temp,
       avg(s.temp) FILTER (WHERE s.temp IS NOT NULL AND r.t26 IS NOT NULL)            AS temp_other,
       avg(r.t26)  FILTER (WHERE s.temp IS NOT NULL AND r.t26 IS NOT NULL)            AS temp_2026
FROM station_layer s JOIN ref r USING (site_key, layer)
WHERE s.cruise_key <> '2026-11-33P4'
GROUP BY ALL;
