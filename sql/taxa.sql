-- organism picker list: every taxon of the bio object (untruncated), its class (taxon.class, the
-- taxonomic grouping), its datasets by observation count (colour dots; the first sets the category)
-- and its latest year ("most recent" sort). the client sorts A-Z by default (D13).
WITH d AS (SELECT taxon_key, dataset_key, count(*) AS n, min(year) AS y0, max(year) AS y1 FROM {{src}} WHERE taxon_key IS NOT NULL GROUP BY 1, 2)
SELECT d.taxon_key, any_value(t.scientific_name) AS scientific_name, any_value(t.common_name) AS common_name,
       any_value(t.class) AS class, any_value(t.rank) AS rank,
       sum(d.n)::BIGINT AS n, min(d.y0) AS y0, max(d.y1) AS y1, string_agg(d.dataset_key, ',' ORDER BY d.n DESC) AS datasets
FROM d LEFT JOIN {{taxon_src}} t USING (taxon_key)
GROUP BY d.taxon_key ORDER BY n DESC
