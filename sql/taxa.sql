-- taxon picker list (row counts over the whole bio object)
SELECT o.taxon_key, any_value(t.scientific_name) AS scientific_name, any_value(t.common_name) AS common_name, count(*) AS n
FROM {{src}} o LEFT JOIN {{taxon_src}} t USING (taxon_key)
GROUP BY o.taxon_key ORDER BY n DESC
