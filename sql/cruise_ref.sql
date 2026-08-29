-- the cruise reference (ship per cruise): the Gantt's lanes are ships, and no two cruises of one ship overlap
SELECT cruise_key, ship_key, ship_name, ship_nodc, date_min, date_max FROM {{src}}
