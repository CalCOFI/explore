-- the cruise reference (ship per cruise): the Gantt's lanes are ships, and no two cruises of one ship overlap
-- month is the cruise's month: month_median on a release that carries it ({{cs_month}}, v2026.11+), the key's MM before
SELECT cruise_key, ship_key, ship_name, ship_nodc, date_min, date_max, {{cs_month}} AS month FROM {{src}}
