# D10 parity: run a downloaded bundle's query/*.sql in R and compare the lens table to the CSV the browser wrote.
# usage: Rscript scripts/parity/parity.R <unzipped bundle dir>
args <- commandArgs(TRUE); dir <- if (length(args)) args[1] else "."
setwd(dir); suppressPackageStartupMessages(library(DBI))
con <- dbConnect(duckdb::duckdb()); dbExecute(con, "INSTALL httpfs; LOAD httpfs")
run <- function(f) { sql <- paste(readLines(file.path("query", f)), collapse = "\n"); if (grepl("^\\s*(--.*\\n)*\\s*CREATE", sql)) dbExecute(con, sql) else dbGetQuery(con, sql) }
fs <- sort(list.files("query", pattern = "\\.sql$")); run(fs[1]); r <- run(fs[2])
app_csv <- list.files("data/summary", pattern = "\\.csv$", full.names = TRUE)[1]; app <- read.csv(app_csv)
key <- intersect(names(r), names(app))[1]
m <- merge(r, app, by = key, suffixes = c(".r", ".app"))
num <- intersect(names(r)[sapply(r, is.numeric)], names(app)[sapply(app, is.numeric)]); num <- setdiff(num, key)
maxd <- max(sapply(num, function(c) max(abs(m[[paste0(c, ".r")]] - m[[paste0(c, ".app")]]), na.rm = TRUE)))
ok <- nrow(r) == nrow(app) && nrow(m) == nrow(r) && maxd < 1e-9
cat(sprintf("%s: R rows %d · app rows %d · matched %d on %s · max |diff| over %s = %.3g → %s\n", fs[2], nrow(r), nrow(app), nrow(m), key, paste(num, collapse = ","), maxd, if (ok) "PARITY" else "MISMATCH"))
quit(status = if (ok) 0 else 1)
