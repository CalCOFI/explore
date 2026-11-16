-- rank every cruise by its layer-mean anomaly over ONE fixed set of stations: the footprint of the November 2026 cruise
-- (table footprint). A cruise counts when it occupied at least 60 % of the footprint stations that 2026-11 has for that layer.
CREATE OR REPLACE TABLE cruise_layer AS
WITH n26 AS (
  SELECT layer, count(anom) AS n_ref, count(anom_season) AS n_ref_season FROM station_layer
  WHERE cruise_key = '2026-11-33P4' GROUP BY layer),
x AS (
  SELECT s.dataset_key, s.cruise_key, s.layer,
         count(s.anom) AS n_sta, avg(s.anom) AS anom, max(s.anom) AS anom_max_station,
         count(s.anom_season) AS n_sta_season, avg(s.anom_season) AS anom_season, max(s.anom_season) AS anom_season_max_station,
         avg(s.temp) AS temp
  FROM station_layer s SEMI JOIN footprint f USING (site_key)
  GROUP BY ALL)
SELECT x.*, n26.n_ref, n26.n_ref_season,
       x.n_sta >= 0.6 * n26.n_ref AS covered, x.n_sta_season >= 0.6 * n26.n_ref_season AS covered_season,
       c.year, c.month_median AS cruise_month, c.date_min, c.date_max
FROM x JOIN n26 USING (layer) LEFT JOIN cruise_ref c USING (cruise_key);
