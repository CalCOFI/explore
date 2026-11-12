-- the hex column is printf('%x', parent(hex7, res)): an H3 parent is bit arithmetic on the res-7 cell
-- (calcofi4db::h3_parent_sql), rendered as the standard H3 string deck.gl / h3-js take directly.
-- the table is the slice, or slice_anom with val = anom when the lens draws the difference from a normal (anom_slice.sql;
-- station.sql and contour_cast.sql likewise)
SELECT {{hex}} AS hex, count(obs_id) AS n, count(DISTINCT root_id) AS n_samples, count(DISTINCT CASE WHEN obs_id IS NOT NULL THEN root_id END) AS n_found,
       avg({{val}}) AS mean, median({{val}}) AS med,
       min({{val}}) AS lo, max({{val}}) AS hi, min(year) AS y0, max(year) AS y1, count(DISTINCT grid_key) AS n_st
FROM {{tbl}}
WHERE hex7 IS NOT NULL AND {{where}}
GROUP BY {{hex}}
