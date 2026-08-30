-- bio has no depth axis in this cut (tows are depth-integrated): the section is line x year
SELECT station, year,
       avg({{val}}) AS v, count(obs_id) AS n
FROM slice
WHERE line = {{line}} AND {{where}}
GROUP BY ALL ORDER BY station, year
