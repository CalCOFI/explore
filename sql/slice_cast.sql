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
--   · site_key / line / station / hex7 are NULL: sample_root carries no site_key and no H3 cell, so Sections and
--     Hexagons do not draw a per-cast value from this slice
--   · units is a scalar lookup in the registry, not a join: a repeated registry row cannot double a cast
-- a value whose sample has no sample_root row has no position and is not in the slice; cast_list.sql counts those.
CREATE OR REPLACE TABLE slice AS
SELECT sm.sample_measurement_id AS obs_id, sm.dataset_key, r.root_id, r.grid_key, NULL::VARCHAR AS site_key,
       NULL::DOUBLE AS line, NULL::DOUBLE AS station,
       r.cruise_key, r.latitude, r.longitude, r.datetime,
       year(r.datetime)::SMALLINT AS year, quarter(r.datetime)::TINYINT AS quarter,
       NULL::DOUBLE AS depth_min_m, NULL::DOUBLE AS depth_max_m, NULL::INTEGER AS depth_bin,
       NULL::VARCHAR AS taxon_key, NULL::VARCHAR AS life_stage, sm.measurement_type,
       (SELECT any_value(m.units) FROM {{mt_src}} m WHERE m.measurement_type = {{type}}) AS units,
       sm.measurement_value AS value, sm.measurement_qual, {{qual_ok}} AS qual_ok,
       NULL::VARCHAR AS tow_type, NULL::DOUBLE AS std_haul_factor, NULL::DOUBLE AS prop_sorted, NULL::DOUBLE AS volume_sampled_m3,
       NULL::DOUBLE AS density_per_10m2, NULL::DOUBLE AS density_per_1000m3, NULL::VARCHAR AS effort_class, NULL::UBIGINT AS hex7,
       sm.sample_key
FROM {{sm_src}} sm
JOIN {{root_src}} r ON r.root_sample_key = sm.sample_key
WHERE sm.measurement_type = {{type}}
