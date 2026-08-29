# rebuild the dev catalog's coverage.json with the current calcofi4db::build_coverage() (taxa[] + the registry's
# category / variable, plan D14) and push it to the explore-dev prefix on GCS — the release does the same at
# release time; this is the dev copy the Pages build reads until a release ships it.
#   Rscript scripts/dev_coverage.R
suppressPackageStartupMessages({ devtools::load_all("~/Github/CalCOFI/calcofi4db", quiet = TRUE); library(DBI); library(glue) })
p1 <- "/private/tmp/claude-501/-Users-bbest-Github-CalCOFI-workflows/2f75db1f-48b1-4707-b31a-04d42736475e/scratchpad/p1"
rel <- "~/_big/calcofi/releases/v2026.08.25/parquet"; version <- "v2026.08.25"
dev <- "~/_big/calcofi/explore-spike/data2/explore-dev/releases/v2026.08.25"
con <- get_duckdb_con(":memory:"); dbExecute(con, "SET threads = 6; SET memory_limit = '10GB'")
dbExecute(con, glue("CREATE VIEW obs AS SELECT * FROM read_parquet('{rel}/obs/*/*.parquet', hive_partitioning = true)"))
dbExecute(con, glue("CREATE TABLE sample AS SELECT * FROM '{rel}/sample.parquet'"))
dbExecute(con, glue("CREATE TABLE sample_root AS SELECT * FROM '{p1}/sample_root.parquet'"))
dbExecute(con, glue("CREATE TABLE taxon AS SELECT * FROM '{rel}/taxon.parquet'"))
# the registry with its new columns (the release's measurement_type.parquet predates them)
mt <- read_measurement_type("~/Github/CalCOFI/workflows/metadata/measurement_type.csv")
dbWriteTable(con, "measurement_type", as.data.frame(mt), overwrite = TRUE)
t0 <- Sys.time(); cov <- build_coverage(con, version)
cat(glue("coverage: {nrow(cov$datasets)} datasets · {nrow(cov$variables)} variables ({sum(!is.na(cov$variables$category))} with category, {sum(!is.na(cov$variables$variable))} with variable) · {length(cov$taxa)} taxa · {round(as.numeric(Sys.time() - t0, units = 'secs'))} s\n"))
f <- file.path(path.expand(dev), "coverage.json")
jsonlite::write_json(cov, f, auto_unbox = TRUE, digits = NA)
cat(glue("wrote {f} ({round(file.size(f) / 1e3)} KB)\n"))
system2("gsutil", c("-q", "cp", shQuote(f), "gs://calcofi-db/explore-dev-root/explore-dev/releases/v2026.08.25/coverage.json"))
cat("uploaded to gs://calcofi-db/explore-dev-root/explore-dev/releases/v2026.08.25/coverage.json\n")
