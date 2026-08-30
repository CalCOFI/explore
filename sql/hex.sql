-- the hex column is printf('%x', parent(hex7, res)): an H3 parent is bit arithmetic on the res-7 cell
-- (calcofi4db::h3_parent_sql), rendered as the standard H3 string deck.gl / h3-js take directly
SELECT {{hex}} AS hex, count(obs_id) AS n, count(DISTINCT root_id) AS n_samples,
       avg({{val}}) AS mean, median({{val}}) AS med
FROM slice
WHERE hex7 IS NOT NULL AND {{where}}
GROUP BY {{hex}}
