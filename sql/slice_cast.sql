-- the working slice for a PER-CAST variable (plan 2026-10-02 D2, explore#13, docs/cast-grain.md): one value for the
-- whole cast — a mixed-layer depth, the depth of the chlorophyll maximum — read from sample_measurement and placed by
-- the cast's own row in sample_root (the release's cut of `sample` to the samples with no parent, with the root_id
-- every browser object joins on). A per-cast value is not a depth observation, so the release does not project it into
-- obs_env; the join is the consumer's. The columns are slice_env.sql's, in its order, so every lens template runs on
-- this slice unchanged:
--   · depth_min_m / depth_max_m / depth_bin are NULL: there is no depth axis. _filters.sql's band passes a NULL bin
--     (the band never filters a per-cast value), depth_strip.sql returns nothing, and so does section.sql
--   · dataset_key is the MEASUREMENT's (calcofi_ctd-derived), never the cast's own (calcofi_ctd-cast): it is what the
--     pills, the Sources line and the citations read. The derived dataset publishes no sample of its own
--   · obs_id is sample_measurement_id; root_id is the cast's (sample_spatial joins on it); sample_key, appended, is
--     the cast — the key back to `sample` and to the cast's profile in obs_env / obs_ctd_full
--   · qual_ok is the quality predicate over the measurement's own dataset_key + measurement_qual: qualOkSQL("sm")
--     (src/qual.ts), the twin of calcofi4r::cc_qual_ok_sql("sm") / calcofi4py.qual_ok_sql("sm")
--   · site_key / line / station are NULL: sample_root carries no site_key, so Sections do not draw a per-cast value
--   · hex7 is the cast's own res-7 H3 cell, {{root_hex7}} = r.hex7 when sample_root carries it (v2026.10.04+), so
--     Hexagons draw a per-cast value; NULL::UBIGINT for an older release, and the Hexagons lens says why it is empty
--   · year / quarter / cruise_month / season_year are the CRUISE's: its median cast month from the release's cruise table
--     ({{cruise_src}}, v2026.11+), the key's YYYY-MM where the table lacks it, the calendar only for a missing or malformed
--     key — never quarter(datetime) alone: a July cruise works its first stations on 30 June, and the season filter dropped
--     them (explore#17). quarter is the season 1 = DJF … 4 = SON. obs_env / obs_bio carry the same at release.
--   · units is a scalar lookup in the registry, not a join: a repeated registry row cannot double a cast
-- a value whose sample has no sample_root row has no position and is not in the slice; cast_list.sql counts those.
CREATE OR REPLACE TABLE slice AS
SELECT sm.sample_measurement_id AS obs_id, sm.dataset_key, r.root_id, r.grid_key, NULL::VARCHAR AS site_key,
       NULL::DOUBLE AS line, NULL::DOUBLE AS station,
       r.cruise_key, r.latitude, r.longitude, r.datetime,
       r.c_year::SMALLINT AS year, r.c_quarter::TINYINT AS quarter,
       NULL::DOUBLE AS depth_min_m, NULL::DOUBLE AS depth_max_m, NULL::INTEGER AS depth_bin,
       NULL::VARCHAR AS taxon_key, NULL::VARCHAR AS life_stage, sm.measurement_type,
       (SELECT any_value(m.units) FROM {{mt_src}} m WHERE m.measurement_type = {{type}}) AS units,
       sm.measurement_value AS value, sm.measurement_qual, {{qual_ok}} AS qual_ok,
       NULL::VARCHAR AS tow_type, NULL::DOUBLE AS std_haul_factor, NULL::DOUBLE AS prop_sorted, NULL::DOUBLE AS volume_sampled_m3,
       NULL::DOUBLE AS density_per_10m2, NULL::DOUBLE AS density_per_1000m3, NULL::VARCHAR AS effort_class, {{root_hex7}} AS hex7,
       r.c_month::TINYINT AS cruise_month, r.c_season_year::SMALLINT AS season_year,
       sm.sample_key
FROM {{sm_src}} sm
JOIN (SELECT r.*, COALESCE(COALESCE(year(cz.date_median), {{key_year}}), year(datetime)) AS c_year, COALESCE((CASE WHEN COALESCE(cz.month_median, {{key_month}}) IN (12, 1, 2) THEN 1 WHEN COALESCE(cz.month_median, {{key_month}}) IN (3, 4, 5) THEN 2 WHEN COALESCE(cz.month_median, {{key_month}}) IN (6, 7, 8) THEN 3 WHEN COALESCE(cz.month_median, {{key_month}}) IN (9, 10, 11) THEN 4 END), (CASE WHEN month(datetime) IN (12, 1, 2) THEN 1 WHEN month(datetime) IN (3, 4, 5) THEN 2 WHEN month(datetime) IN (6, 7, 8) THEN 3 WHEN month(datetime) IN (9, 10, 11) THEN 4 END)) AS c_quarter,
             COALESCE(COALESCE(cz.month_median, {{key_month}}), month(datetime)) AS c_month,
             COALESCE((CASE WHEN COALESCE(cz.month_median, {{key_month}}) = 12 THEN COALESCE(year(cz.date_median), {{key_year}}) + 1 ELSE COALESCE(year(cz.date_median), {{key_year}}) END), CASE WHEN month(datetime) = 12 THEN year(datetime) + 1 ELSE year(datetime) END) AS c_season_year
      FROM {{root_src}} r LEFT JOIN {{cruise_src}} cz USING (cruise_key)) r ON r.root_sample_key = sm.sample_key
WHERE sm.measurement_type = {{type}}
