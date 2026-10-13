-- the anomaly a MAP lens draws (Hexagons, Contours): every observation of the slice minus the baseline of ITS OWN cell —
-- its dataset, its station (clim_loc: site_key for a per-bin value, grid_key for a per-cast one, anomaly.ts anomLoc()),
-- its cruise's month (or quarter, under the seasonal baseline), its 10 m depth bin (NULL = NULL for a per-cast value: the
-- per-cast types' climatology rows carry depth_bin NULL) and its measurement type — BEFORE anything is aggregated, so a hex
-- or a contour site pools departures, never a mean of values minus a mean of normals. An observation with no baseline
-- keeps anom NULL: _filters.sql's `val IS NOT NULL` (val = anom) drops it from every statistic — never a 0 — and
-- sql/anom_share.sql counts what share had one. clim_src is anomaly.ts climBaseSql() (rows with a mean only); rows
-- of one cell are pooled weighted by n (several datasets' or stations' rows on one grid_key).
-- slice_anom is the slice's columns + `anom`, so every map template runs on it with tbl = slice_anom.
CREATE OR REPLACE TABLE slice_anom AS
WITH base AS (
  SELECT dataset_key, {{clim_loc}} AS loc, period, depth_bin, measurement_type, sum(mean * n) / sum(n) AS base
  FROM {{clim_src}}
  GROUP BY ALL),
s AS (
  SELECT *, {{clim_period}} AS anom_period FROM slice)
SELECT s.* EXCLUDE (anom_period), s.value - b.base AS anom
FROM s
LEFT JOIN base b
  ON b.dataset_key = s.dataset_key AND b.loc = s.{{clim_loc}} AND b.measurement_type = s.measurement_type
 AND b.period = s.anom_period AND b.depth_bin IS NOT DISTINCT FROM s.depth_bin
