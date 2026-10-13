-- what share of the observations in view had a baseline (sql/anom_slice.sql): n under the lens's filters with the value
-- itself (val = value), n_base of them with an anomaly. The map lenses say it under the title ("82 % had a July normal").
SELECT count(*) AS n, count(anom) AS n_base
FROM slice_anom
WHERE {{where}}
