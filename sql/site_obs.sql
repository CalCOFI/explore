-- the Observations layer's click card (`obs=`): what was recorded at ONE site of contour_cast.sql — its 0.01° point,
-- lon / lat as that template rounds them — under the selection's own filters (the shared filter fragment, on the slice).
-- (No template token in a comment: the renderer substitutes those too, and the filter fragment spans lines.)
-- The slice holds one taxon, so a sample it holds there may be a zero (a sighting of another species, a net without the
-- pick): each sample (sample_id, the slice's net — sample_key, or root_id on a release without it) is then read back
-- from the release's obs_bio (src) with every taxon it recorded, so a dot names what was seen, when, whatever the pick
-- (a click on a "whales, dolphins and porpoises" dot names the humpback). in_slice says the row is the pick's own.
-- At most `limit` rows: a net can hold hundreds of taxa, the card lists the largest values of each sample first.
WITH here AS (
  SELECT DISTINCT dataset_key, sample_id
  FROM {{tbl}}
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND NOT isnan(latitude) AND NOT isnan(longitude)
    AND abs(round(longitude, 2) - {{lon}}) < 1e-6 AND abs(round(latitude, 2) - {{lat}}) < 1e-6
    AND {{where}}
)
SELECT o.dataset_key, o.{{net_key}}::VARCHAR AS sample_id, o.cruise_key, epoch(o.datetime) AS t,
       o.taxon_key, o.life_stage, o.measurement_type, o.units, o.value, o.taxon_key = {{taxon}} AS in_slice
FROM {{src}} o JOIN here h ON h.dataset_key = o.dataset_key AND h.sample_id = o.{{net_key}}::VARCHAR
ORDER BY o.datetime NULLS LAST, sample_id, o.value DESC NULLS LAST, o.taxon_key
LIMIT {{limit}}
