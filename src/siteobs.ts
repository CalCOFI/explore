// the Observations layer's click card (`obs=`) and the Station card's datasets — pure, so tests/siteobs.test.ts asserts them.
//
// A dot of the Observations layer is one SITE (sql/contour_cast.sql: every sample at one 0.01° point). A click reads what
// was recorded there (sql/site_obs.sql for a species, which reads each sample back from the release with every taxon it
// holds; sql/site_obs_env.sql for a measurement) and groupSiteObs() turns the rows into one entry per sample — a sighting,
// a net, a cast — with when it was taken and what it recorded, in the order the SQL sorted them (by time).

export interface SiteObsRow {
  dataset_key: string; sample_id: string; cruise_key: string | null; t: number | null;
  taxon_key?: string | null; life_stage?: string | null; depth_bin?: number | null;
  measurement_type: string | null; units: string | null; value: number | null; in_slice?: boolean | null;
}
export interface SiteObsItem { label: string; value: number | null; units: string | null; mtype: string | null; in_slice: boolean; depth_bin: number | null }
export interface SiteObsSample { dataset_key: string; sample_id: string; cruise_key: string | null; t: number | null; items: SiteObsItem[] }

/** one entry per sample, its items in the SQL's order; `label` names the taxon (nameOf) or, for water, the depth bin */
export function groupSiteObs(rows: readonly SiteObsRow[], nameOf: (taxonKey: string) => string): SiteObsSample[] {
  const out: SiteObsSample[] = [];
  const at = new Map<string, SiteObsSample>();
  for (const r of rows) {
    const k = `${r.dataset_key}\u0000${r.sample_id}`;
    let s = at.get(k);
    if (!s) { s = { dataset_key: r.dataset_key, sample_id: r.sample_id, cruise_key: r.cruise_key ?? null, t: r.t ?? null, items: [] }; at.set(k, s); out.push(s); }
    const depth = r.depth_bin == null ? null : Number(r.depth_bin);
    const label = r.taxon_key ? `${nameOf(r.taxon_key)}${r.life_stage ? ` (${r.life_stage})` : ""}` : depth != null ? `${depth} m` : (r.measurement_type ?? "value");
    s.items.push({ label, value: r.value == null ? null : Number(r.value), units: r.units ?? null, mtype: r.measurement_type ?? null, in_slice: !!r.in_slice, depth_bin: depth });
  }
  return out;
}

/** a taxon's name for the card: the common name beside the scientific one when both exist, else whichever does, else the key */
export function taxonLabel(t: { scientific_name?: string | null; common_name?: string | null } | undefined, key: string): string {
  const sci = t?.scientific_name?.trim(), com = t?.common_name?.trim();
  return sci && com && com.toLowerCase() !== sci.toLowerCase() ? `${com} · ${sci}` : sci || com || key;
}

/** when a sample was taken, as the survey's clock reads it: the Pacific date and time with its zone (PST / PDT); the
 * release stores UTC (epoch seconds here), which the card's title gives in full */
export function pacificTime(t: number | null): string {
  if (t == null || !Number.isFinite(t)) return "no time";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short",
  }).formatToParts(new Date(t * 1000));
  const p = (k: string) => parts.find((x) => x.type === k)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")} ${p("timeZoneName")}`;
}
export const utcTime = (t: number | null): string => (t == null || !Number.isFinite(t) ? "no time" : `${new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`);

/** the Station card's datasets: those in the view (the datasets picked, else the ones holding the pick) and how many
 * others sampled the station. With no view known (inView null or empty) every dataset is shown, as before. */
export function stationDatasets<D extends { dataset_key: string }>(ds: readonly D[], inView: readonly string[] | null | undefined): { shown: D[]; others: string[] } {
  if (!inView?.length) return { shown: [...ds], others: [] };
  const keep = new Set(inView);
  return { shown: ds.filter((d) => keep.has(d.dataset_key)), others: ds.filter((d) => !keep.has(d.dataset_key)).map((d) => d.dataset_key) };
}
