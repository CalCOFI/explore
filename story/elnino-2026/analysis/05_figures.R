# figures for out/findings.md, drawn from the analysis database (01–04 *.sql)
# usage: Rscript 05_figures.R <elnino.duckdb> <out_dir>
librarian::shelf(DBI, duckdb, dplyr, ggplot2, glue, patchwork, tidyr, quiet = T)

args    <- commandArgs(trailingOnly = TRUE)
path_db <- args[1]
dir_out <- args[2]
stopifnot(file.exists(path_db), dir.exists(dir_out))

con <- dbConnect(duckdb(), path_db, read_only = TRUE)

# brand v2 inks (calcofi.io/brand/v2/theme.css); the three series colours pass the dataviz validator together
INK      <- "#182b49"
MUTED    <- "#66686a"
GRID     <- "#e4e4e4"
COL_2026 <- "#b3261e"
COL_2015 <- "#c69214"
COL_NORM <- "#00629b"
COL_REST <- "#b6b1a9"
CRUISE   <- "2026-11-33P4"

theme_story <- function(base_size = 13) {
  theme_minimal(base_size = base_size) +
    theme(
      text               = element_text(colour = INK),
      axis.text          = element_text(colour = MUTED),
      panel.grid.major   = element_line(colour = GRID, linewidth = 0.3),
      panel.grid.minor   = element_blank(),
      plot.title         = element_text(face = "bold", size = rel(1.15)),
      plot.subtitle      = element_text(colour = MUTED, size = rel(0.9), margin = margin(b = 10)),
      plot.caption       = element_text(colour = MUTED, size = rel(0.72), hjust = 0, lineheight = 1.15),
      plot.title.position   = "plot",
      plot.caption.position = "plot",
      strip.text         = element_text(face = "bold", colour = INK, hjust = 0),
      legend.position    = "none")}

# figure 1: the raw profiles beside the November normal ----
sites <- c("093.3 026.7", "093.3 028.0", "093.3 030.0", "093.3 035.0")
lab_site <- function(x) glue("station {as.numeric(sub('.* ', '', x))}")

d_2026 <- dbGetQuery(con, glue_sql(
  "SELECT site_key, depth_m, value AS temp FROM cast_1m
   WHERE measurement_type = 'temperature_ave' AND direction = 'd' AND measurement_qual IS NULL AND site_key IN ({sites*})
   ORDER BY site_key, depth_m", .con = con))
d_norm <- dbGetQuery(con, glue_sql(
  "SELECT site_key, depth_bin + 5 AS depth_m, clim_mean AS temp, clim_sd AS sd, n_cruises FROM clim
   WHERE measurement_type = 'temperature_ave' AND dataset_key = 'calcofi_ctd-cast' AND month = 11 AND clim_mean IS NOT NULL
     AND site_key IN ({sites*}) ORDER BY site_key, depth_bin", .con = con))
d_prev <- dbGetQuery(con, glue_sql(
  "SELECT site_key, cruise_key, cruise_year AS yr, depth_bin + 5 AS depth_m, v AS temp FROM cell
   WHERE dataset_key = 'calcofi_ctd-cast' AND cruise_month = 11 AND cruise_key <> {CRUISE} AND site_key IN ({sites*})
   ORDER BY site_key, cruise_key, depth_bin", .con = con))
zmax   <- 160
d_2026 <- filter(d_2026, depth_m <= zmax)
d_norm <- filter(d_norm, depth_m <= zmax)
d_prev <- filter(d_prev, depth_m <= zmax)
lab  <- tibble(
  site_key = sites[1], temp = 15.2, depth_m = c(96, 108, 120, 138),
  label    = c("November 2026", "November 2015", "November normal, 1993–2013\n(band: ± 1 sd)", "every other November"),
  col      = c(COL_2026, COL_2015, COL_NORM, COL_REST))
peak <- dbGetQuery(con, glue_sql(
  "SELECT site_key, depth_bin + 5 AS depth_m, v, clim_mean, anom FROM cell
   WHERE cruise_key = {CRUISE} AND site_key IN ({sites*}) AND anom IS NOT NULL
   QUALIFY row_number() OVER (PARTITION BY site_key ORDER BY anom DESC) = 1", .con = con))

p1 <- ggplot(mapping = aes(temp, depth_m)) +
  geom_ribbon(data = d_norm, aes(xmin = temp - sd, xmax = temp + sd), fill = COL_NORM, alpha = 0.15, orientation = "y") +
  geom_path(data = filter(d_prev, yr != 2015), aes(group = cruise_key), colour = COL_REST, linewidth = 0.35) +
  geom_path(data = filter(d_prev, yr == 2015), aes(group = cruise_key), colour = COL_2015, linewidth = 0.8) +
  geom_path(data = d_norm, colour = COL_NORM, linewidth = 0.9) +
  geom_path(data = d_2026, colour = COL_2026, linewidth = 1.1) +
  geom_segment(data = peak, aes(x = clim_mean, xend = v, y = depth_m, yend = depth_m), colour = INK, linewidth = 0.4,
               arrow = arrow(length = unit(4, "pt"), ends = "both")) +
  geom_text(data = peak, aes(x = (clim_mean + v) / 2, y = depth_m - 5, label = sprintf("+%.1f °C", anom)), colour = INK, size = 3.6, fontface = "bold") +
  geom_text(data = lab, aes(label = label), colour = INK, size = 3.3, hjust = 0, vjust = 0.8, lineheight = 0.9) +
  geom_segment(data = lab, aes(x = temp - 3.4, xend = temp - 0.6, yend = depth_m), colour = lab$col, linewidth = c(1.1, 0.8, 0.9, 0.35)) +
  facet_wrap(~ site_key, nrow = 1, labeller = as_labeller(lab_site)) +
  scale_y_reverse(limits = c(zmax, 0), expand = c(0, 0), breaks = seq(0, zmax, 20)) +
  scale_x_continuous(limits = c(9, 27.5), breaks = seq(10, 26, 4), position = "top") +
  labs(
    title    = "Line 93.3, 31 October – 1 November 2026: the warm layer reaches 55 m, where the thermocline normally sits",
    subtitle = glue("Temperature (°C) against depth (m). Grey: every other November cruise with a CTD cast at the station, {min(d_prev$yr)}–{max(d_prev$yr)}."),
    x = NULL, y = "Depth (m)",
    caption  = glue(
      "CalCOFI CTD, release {readLines(file.path(dirname(path_db), 'release', 'VERSION'))}; cruise 2026-11-33P4 is preliminary. Red: the downcast at 1 m resolution (sensor-pair average). ",
      "Blue: the release's climatology, the 1993–2013 mean per 10 m bin\nfor cruises whose month is November ({min(d_norm$n_cruises)}–{max(d_norm$n_cruises)} cruises at these stations). ",
      "The arrow marks each station's largest measured departure from that normal.")) +
  theme_story() +
  theme(panel.spacing = unit(14, "pt"))
ggsave(file.path(dir_out, "fig_profiles_line93.png"), p1, width = 13, height = 6.2, dpi = 160, bg = "white")

# figure 2: every cruise's layer mean over the stations the November 2026 cruise occupied ----
d_l <- dbGetQuery(con,
  "SELECT dataset_key, cruise_key, layer, anom, n_sta, n_ref, covered, date_min + CAST((date_max - date_min) // 2 AS INTEGER) AS date_mid
   FROM cruise_layer WHERE layer IN ('0-50 m', '50-200 m') AND covered") |>
  mutate(
    date_mid = as.Date(date_mid),
    series   = if_else(dataset_key == "calcofi_bottle", "bottle", "CTD"),
    layer    = factor(layer, c("0-50 m", "50-200 m"), c("0–50 m", "50–200 m")))
events <- tibble(
  event = c("1957–59", "1982–83", "1997–98", "2014–16"),
  x0    = as.Date(c("1957-04-01", "1982-07-01", "1997-05-01", "2014-01-01")),
  x1    = as.Date(c("1959-12-31", "1983-12-31", "1998-08-31", "2016-06-30")))
top <- d_l |> filter(cruise_key == CRUISE)
runner <- d_l |> filter(cruise_key != CRUISE) |> group_by(layer) |> slice_max(anom, n = 1, with_ties = FALSE) |> ungroup()

p2 <- ggplot(d_l, aes(date_mid, anom)) +
  geom_rect(data = events, aes(xmin = x0, xmax = x1, ymin = -Inf, ymax = Inf), inherit.aes = FALSE, fill = "#f5f0e6") +
  geom_text(data = mutate(events, layer = factor("0–50 m", levels(d_l$layer))), aes(x = x0 + (x1 - x0) / 2, y = 5.75, label = event),
            inherit.aes = FALSE, colour = MUTED, size = 3.1) +
  geom_hline(yintercept = 0, colour = INK, linewidth = 0.3) +
  geom_point(aes(shape = series, colour = series), size = 1.9, stroke = 0.7) +
  geom_point(data = top, colour = COL_2026, size = 3.2) +
  geom_text(data = top, aes(label = sprintf("Nov 2026  %+.1f °C", anom)), colour = INK, fontface = "bold", size = 3.7, hjust = 1, nudge_x = -500) +
  geom_text(data = runner, aes(label = sprintf("%s  %+.1f", format(date_mid, "%b %Y"), anom)), colour = INK, size = 3.2, hjust = 1, nudge_x = -400, nudge_y = 0.12) +
  facet_wrap(~ layer, ncol = 1, scales = "free_y") +
  scale_shape_manual(values = c(bottle = 1, CTD = 16)) +
  scale_colour_manual(values = c(bottle = INK, CTD = COL_NORM)) +
  scale_x_date(breaks = as.Date(paste0(seq(1950, 2020, 10), "-01-01")), date_labels = "%Y", expand = expansion(mult = c(0.01, 0.03))) +
  scale_y_continuous(labels = \(x) sprintf("%+.0f", x)) +
  labs(
    title    = "Every CalCOFI cruise since 1950, averaged over the stations the November 2026 cruise occupied",
    subtitle = "Layer-mean temperature departure (°C) from the 1993–2013 normal of the cruise's month. Open circles: bottle casts (1950–2021). Filled: CTD (1993–2026).",
    x = NULL, y = NULL,
    caption  = glue(
      "One point per cruise that occupied at least 60 % of those stations ({max(top$n_ref[top$layer == '0–50 m'])} for 0–50 m, {max(top$n_ref[top$layer == '50–200 m'])} for 50–200 m) in a month that has a monthly normal (Jan, Feb, Apr, Jul, Aug, Oct, Nov).\n",
      "Each station's anomaly profile is averaged over the layer's 10 m bins, then the stations are averaged. Shaded: the earlier warm events;\nthe 1982–83 cruises occupied too few of these stations to appear here (they are in the events table). 2026 is preliminary.")) +
  theme_story() +
  theme(panel.spacing = unit(12, "pt"))
ggsave(file.path(dir_out, "fig_layer_rank.png"), p2, width = 13, height = 7.4, dpi = 160, bg = "white")

dbDisconnect(con, shutdown = TRUE)
cat("wrote", file.path(dir_out, c("fig_profiles_line93.png", "fig_layer_rank.png")), sep = "\n")
