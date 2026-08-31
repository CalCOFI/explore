# add the release's `climatology` table to the explore-dev catalog — the catalog-shaped copy of the
# v2026.08.25 objects that calcofi.io/explore reads until a release ships them (pages.yml). Built by
# the SAME calcofi4db::build_climatology() release_database.qmd runs, from the local release's obs,
# then exported, hashed, placed at its content-addressed path and catalogued exactly as the release
# does — so the app is written against the true shape and the next release changes nothing for it.
#   <R with calcofi4db's deps> --vanilla -f scripts/dev_climatology.R
suppressPackageStartupMessages({
  devtools::load_all("~/Github/CalCOFI/calcofi4db", quiet = TRUE)
  library(DBI); library(glue); library(dplyr) })
rel      <- path.expand("~/_big/calcofi/releases/v2026.08.25/parquet"); version <- "v2026.08.25"
prefix   <- "explore-dev/releases"; tprefix <- "explore-dev/tables"
dev_root <- path.expand("~/_big/calcofi/explore-spike/data2")   # the local bucket root (README: public/data2)
gcs_root <- "gs://calcofi-db/explore-dev-root"
setwd(dev_root)

con <- get_duckdb_con(":memory:"); dbExecute(con, "SET threads = 6; SET memory_limit = '10GB'")
dbExecute(con, glue("CREATE VIEW obs AS SELECT * FROM read_parquet('{rel}/obs/*/*.parquet', hive_partitioning = true)"))
t0 <- Sys.time()
n  <- build_climatology(con, qual_ok_sql = calcofi4r::cc_qual_ok_sql("o"))
cat(glue("climatology: {format(n, big.mark = ',')} cells in {round(as.numeric(Sys.time() - t0, units = 'secs'))} s\n"))
print(dbGetQuery(con, "SELECT dataset_key, count(*) AS n_cells, count(DISTINCT measurement_type) AS n_types,
                        count(DISTINCT grid_key) AS n_sta, min(clim_yr_min) AS yr0, max(clim_yr_max) AS yr1
                       FROM climatology GROUP BY 1 ORDER BY 1"))
# the line-90 / July / station-60 cell the audit was about, as a smoke check
print(dbGetQuery(con, "SELECT dataset_key, depth_bin, round(clim_mean, 2) AS clim_mean, clim_n, n_cruises FROM climatology
                       WHERE grid_key = 'st60-ln90' AND month = 7 AND measurement_type IN ('temperature', 'temperature_ave')
                         AND depth_bin IN (0, 50, 100) ORDER BY 1, 2"))

# export + hash + place + catalogue, the release's way
sk   <- release_sort_keys()$climatology
out  <- file.path(tempdir(), "export"); unlink(out, recursive = TRUE); dir.create(out)
f    <- export_release_parquet(con, "climatology", file.path(out, "climatology"), sk$order_by, partition_by = sk$partition_by)
objs <- release_objects(con, "climatology", out, f, version, partition_by = sk$partition_by)
plan <- freeze_plan(objs, NULL, version, layout = "canonical", release_prefix = prefix)
plan$path <- sub(paste0("^", CC_TABLES_PREFIX, "/"), paste0(tprefix, "/"), plan$path)
for (i in seq_len(nrow(plan))) {
  dir.create(dirname(plan$path[i]), recursive = TRUE, showWarnings = FALSE)
  file.copy(plan$local_path[i], plan$path[i], overwrite = TRUE)
}
tables_df <- tibble(name = "climatology", rows = as.numeric(n), partitioned = TRUE, supplemental = FALSE)
entry     <- build_release_catalog(version, tables_df, plan, layout = "canonical")$tables[[1]]

cat_path <- file.path(prefix, version, "catalog.json")
cat_json <- jsonlite::read_json(cat_path)
cat_json$tables     <- c(Filter(function(t) t$name != "climatology", cat_json$tables), list(entry))
cat_json$total_rows <- sum(vapply(cat_json$tables, function(t) as.numeric(t$rows), numeric(1)))
cat_json$total_size <- sum(vapply(cat_json$tables, function(t) as.numeric(t$bytes %||% 0), numeric(1)))
jsonlite::write_json(cat_json, cat_path, auto_unbox = TRUE, pretty = TRUE, digits = NA)

# upload the objects first, the catalog last, so a reader never sees an entry before its bytes
for (p in plan$path) system2("gsutil", c("-q", "cp", shQuote(p), shQuote(file.path(gcs_root, p))))
system2("gsutil", c("-q", "cp", shQuote(cat_path), shQuote(file.path(gcs_root, cat_path))))
# the bucket's default Cache-Control is public, max-age=3600, and storage.googleapis.com honours it: a browser
# (and the Pages site) kept reading the pre-upload catalog for up to an hour. A dev catalog is mutable, so say so.
system2("gsutil", c("-q", "setmeta", "-h", shQuote("Cache-Control:no-cache"), shQuote(file.path(gcs_root, cat_path))))
cat(glue("uploaded {nrow(plan)} objects ({round(sum(plan$bytes) / 1e6, 1)} MB) + {cat_path} to {gcs_root}\n"))
