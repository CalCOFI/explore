-- layer means, comparable between the CTD (a value in every 10 m bin) and the bottle series (standard depths only).
-- For each cast (dataset x cruise x station) the anomaly profile is put on every 10 m bin from 0 to 190 m by linear
-- interpolation IN DEPTH between the bins that were sampled (never across more than 60 m, never beyond the deepest or
-- above the shallowest sampled bin, never in time or between stations). A station's layer mean needs every bin of the layer.
CREATE OR REPLACE MACRO interp_profile(col) AS TABLE
WITH a AS (SELECT dataset_key, cruise_key, site_key, depth_bin, col AS a FROM cell WHERE col IS NOT NULL AND depth_bin < 260),
casts AS (SELECT DISTINCT dataset_key, cruise_key, site_key FROM a),
t AS (SELECT c.*, b.depth_bin FROM casts c, (SELECT unnest(range(0, 200, 10)) AS depth_bin) b)
SELECT t.dataset_key, t.cruise_key, t.site_key, t.depth_bin,
       CASE WHEN lo.depth_bin = hi.depth_bin THEN lo.a
            WHEN hi.depth_bin - lo.depth_bin <= 60 THEN lo.a + (hi.a - lo.a) * (t.depth_bin - lo.depth_bin) / (hi.depth_bin - lo.depth_bin) END AS a,
       lo.depth_bin = hi.depth_bin AS measured
FROM t
ASOF LEFT JOIN a lo ON lo.dataset_key = t.dataset_key AND lo.cruise_key = t.cruise_key AND lo.site_key = t.site_key AND lo.depth_bin <= t.depth_bin
ASOF LEFT JOIN a hi ON hi.dataset_key = t.dataset_key AND hi.cruise_key = t.cruise_key AND hi.site_key = t.site_key AND hi.depth_bin >= t.depth_bin;

CREATE OR REPLACE TABLE prof AS
-- the key columns are the USING columns (coalesced over the three sides): a cruise in a month with no monthly normal
-- (Sep 1997, Dec 1997) has no row on the anom side and must not lose its keys
SELECT dataset_key, cruise_key, site_key, depth_bin, m.a AS anom, s.a AS anom_season, v.a AS temp, v.measured
FROM interp_profile(anom) m
FULL JOIN interp_profile(anom_season) s USING (dataset_key, cruise_key, site_key, depth_bin)
FULL JOIN interp_profile(v) v USING (dataset_key, cruise_key, site_key, depth_bin);

-- one row per cast x layer: the depth-mean anomaly where the layer is complete
CREATE OR REPLACE TABLE station_layer AS
WITH l AS (SELECT * FROM (VALUES ('0-50 m', 0, 40), ('50-200 m', 50, 190), ('0-200 m', 0, 190), ('surface (0-10 m)', 0, 0)) AS t(layer, b0, b1))
SELECT p.dataset_key, p.cruise_key, p.site_key, l.layer,
       TRY_CAST(split_part(p.site_key, ' ', 1) AS DOUBLE) AS line, TRY_CAST(split_part(p.site_key, ' ', 2) AS DOUBLE) AS station,
       CASE WHEN count(p.anom)        = (l.b1 - l.b0) / 10 + 1 THEN avg(p.anom) END        AS anom,
       CASE WHEN count(p.anom_season) = (l.b1 - l.b0) / 10 + 1 THEN avg(p.anom_season) END AS anom_season,
       CASE WHEN count(p.temp)        = (l.b1 - l.b0) / 10 + 1 THEN avg(p.temp) END        AS temp
FROM prof p JOIN l ON p.depth_bin BETWEEN l.b0 AND l.b1
GROUP BY p.dataset_key, p.cruise_key, p.site_key, l.layer, l.b0, l.b1;

-- the footprint of the November 2026 cruise: the stations it occupied
CREATE OR REPLACE TABLE footprint AS
SELECT DISTINCT site_key, line, station FROM cell WHERE cruise_key = '2026-11-33P4' AND dataset_key = 'calcofi_ctd-cast';
