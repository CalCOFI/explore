// attribution (WS-A3): the one place the app turns `dataset` rows + the catalog into citation text.
// Erin's ask (2026-09-02) is that a query knows which datasets it touched and can hand back their
// citations plus the integrated one — so every surface here (the Sources line, the figure footer's
// third line, Cite this data, the Sources modal, the download bundle's CITATION.md) reads the SAME
// builders, and a dataset that gains a `doi` or a `contact` shows it everywhere at once.
//
// The release's `dataset` table is the only source: no network fetch. WS-A0 adds `doi`,
// `license_url`, `acknowledgement`, `contact`, `source_accessed` and the catalog's own `citation`;
// until the release carrying them ships (WS-F) the app runs on the dev catalog, where they are
// ABSENT and 8 of 16 `citation_main` are empty. Every function below degrades on a missing field
// rather than printing "undefined" — see `DEGRADES_WITHOUT` for the list.
import type { Row } from "./engine";
import type { Catalog } from "./release";

/** the columns this module reads; each is optional and each has a stated fallback (README § Attribution) */
export const DEGRADES_WITHOUT = [
  "doi", "license_url", "acknowledgement", "contact", "source_accessed", "provider_short", "catalog.citation",
] as const;

// ── the vocabulary ───────────────────────────────────────────────────────────
// the curating organizations (metadata/provider.csv). A release that ships a `provider` table wins:
// `providerShort()` takes it when the caller passes one, so this map is the pre-table fallback only.
export const PROVIDER_SHORT: Record<string, string> = {
  calcofi: "CalCOFI", swfsc: "NOAA SWFSC", "cce-lter": "CCE LTER",
  sio: "Scripps Institution of Oceanography", farallon: "Farallon Institute", cdfw: "CDFW",
};
/** the display label for a provider: the release's `provider` table first, then the map, then the slug */
export const providerShort = (provider: string | null | undefined, table?: Map<string, string> | null) =>
  (provider ? table?.get(provider) : null) ?? PROVIDER_SHORT[provider ?? ""] ?? provider ?? "—";

// SPDX ids from metadata/license.csv (WS-A0) -> a chip label a reader understands. A release that still
// carries the free-text license ("CC BY 4.0") shows that string verbatim: an unknown id is not an error.
export const LICENSE_LABEL: Record<string, string> = {
  "CC-BY-4.0": "CC BY 4.0", "CC0-1.0": "CC0 1.0", "CC-BY-NC-4.0": "CC BY-NC 4.0", "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "US-PD": "US public domain", custom: "provider terms", unknown: "licence not stated",
};
export const LICENSE_URL: Record<string, string> = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-NC-4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "US-PD": "https://www.usa.gov/government-works",
};
const s = (v: any): string => (v == null ? "" : String(v).trim());
export const licenseLabel = (d: Row) => { const l = s(d.license); return l ? LICENSE_LABEL[l] ?? l : ""; };
/** the licence's own page: the dataset's `license_url` (WS-A0) first, else the registry's for a known id */
export const licenseUrl = (d: Row) => s(d.license_url) || LICENSE_URL[s(d.license)] || "";
export const doiUrl = (d: Row) => { const x = s(d.doi); return !x ? "" : /^https?:/.test(x) ? x : `https://doi.org/${x.replace(/^doi:/i, "")}`; };
/** a contact is a URL or an email; both reach the provider, so both become an href */
export const contactHref = (d: Row) => { const c = s(d.contact); return !c ? "" : /^(https?:|mailto:)/.test(c) ? c : c.includes("@") ? `mailto:${c}` : `https://${c}`; };

export const dsName = (d: Row) => s(d.dataset_name_short) || s(d.dataset_name) || s(d.dataset_key);
export const dsLongName = (d: Row) => s(d.dataset_name) || s(d.dataset_name_short) || s(d.dataset_key);

/** the calcofi.io dataset-catalog page (plan 2026-09-05 D-4) — built from the key alone, so it
 *  degrades correctly on the dev catalog (no `datasets.json` there) exactly like every other
 *  citation surface here: never a lookup, never conditional on a field the row may not carry. */
export const datasetPageUrl = (dataset_key: string) => `https://calcofi.io/datasets/${dataset_key}/`;

// ── the release cites itself ─────────────────────────────────────────────────
/** calcofi4db::release_citation()'s wording, so the app and the release notes cannot disagree */
export const CC_RELEASE_PUBLISHER =
  "Scripps Institution of Oceanography, NOAA Fisheries, and California Department of Fish and Wildlife";
export const CC_DB_SCHEMA_URL = "https://calcofi.io/db-schema/";
/** the CalCOFI front door — one place to reach the program behind every dataset here (Q3, 2026-09-03) */
export const CC_FRONT_DOOR = "https://calcofi.io/";

/** the integrated database's citation: the catalog's own string when the release carries it (WS-A0),
 *  else the same wording built from the version, its date and its DOI if one is minted */
export function releaseCitation(catalog: Catalog | null, version: string): string {
  const fromCatalog = s((catalog as any)?.citation);
  if (fromCatalog) return fromCatalog;
  const year = catalog?.release_date ? String(catalog.release_date).slice(0, 4) : version.slice(1, 5);
  const doi = s((catalog as any)?.doi);
  const locator = doi ? `https://doi.org/${doi.replace(/^doi:/i, "")}` : `${CC_DB_SCHEMA_URL}?v=${version}`;
  return `CalCOFI (${year}). CalCOFI Integrated Database, release ${version} [Data set]. ${CC_RELEASE_PUBLISHER}. ${locator}`;
}

// ── per dataset ──────────────────────────────────────────────────────────────
/** what the app shows where one line has to stand for the dataset; empty when the release has none */
export const citationOf = (d: Row) => s(d.citation_main);
export const NO_CITATION = "no citation in this release — the dataset's provider question is open";

/** one dataset's block in the download bundle's CITATION.md — the shape bundle.ts has always written
 *  (WS-A3 must not change it), lifted here so every other surface reuses it. */
export function citationMd(d: Row): string {
  return `## ${d.dataset_name ?? d.dataset_key} (\`${d.dataset_key}\`)\n\n${d.citation_main ? `${d.citation_main}\n\n` : ""}${d.citation_others ? `Also cite: ${d.citation_others}\n\n` : ""}${d.license ? `License: ${d.license}  \n` : ""}${d.pi_names ? `PIs: ${d.pi_names}  \n` : ""}${d.link_data_source ? `Source: ${d.link_data_source}  \n` : ""}${d.link_calcofi_org ? `CalCOFI: ${d.link_calcofi_org}\n` : ""}Page: ${datasetPageUrl(String(d.dataset_key))}\n`;
}

/** one dataset as plain text for the clipboard: the citation first, then only the fields that exist */
export function citationText(d: Row): string {
  const out = [`${dsLongName(d)} (${d.dataset_key})`];
  out.push(`  ${citationOf(d) || NO_CITATION}`);
  if (s(d.citation_others)) out.push(`  Also cite: ${s(d.citation_others)}`);
  if (s(d.doi)) out.push(`  DOI: ${doiUrl(d)}`);
  const lic = licenseLabel(d);
  if (lic) out.push(`  Licence: ${lic}${licenseUrl(d) ? ` (${licenseUrl(d)})` : ""}`);
  if (s(d.pi_names)) out.push(`  PIs: ${s(d.pi_names)}`);
  if (s(d.acknowledgement)) out.push(`  Acknowledgement: ${s(d.acknowledgement)}`);
  if (s(d.contact)) out.push(`  Contact: ${s(d.contact)}`);
  if (s(d.source_accessed)) out.push(`  Accessed: ${String(d.source_accessed).slice(0, 10)}`);
  if (s(d.link_data_source)) out.push(`  Source: ${s(d.link_data_source)}`);
  if (s(d.link_calcofi_org)) out.push(`  CalCOFI: ${s(d.link_calcofi_org)}`);
  out.push(`  Page: ${datasetPageUrl(String(d.dataset_key))}`);
  return out.join("\n");
}

/** the whole clipboard payload for "Cite this data": the release, then every dataset in view */
export function citeText(datasets: Row[], catalog: Catalog | null, version: string, url?: string): string {
  const head = [
    "Cite the CalCOFI integrated database AND every dataset the view pools.",
    "",
    "The integrated database:",
    `  ${releaseCitation(catalog, version)}`,
    "",
    !datasets.length ? "No dataset is in this view." : datasets.length === 1 ? "The dataset in this view:" : `The ${datasets.length} datasets in this view:`,
  ];
  const body = datasets.length ? datasets.map(citationText) : [];
  const tail = url ? ["", `View: ${url}`] : [];
  return [...head, ...body, ...tail].join("\n") + "\n";
}

// ── BibTeX ───────────────────────────────────────────────────────────────────
// @misc from the release's own fields — never a doi.org content negotiation, because the app must not
// fetch to cite (the whole point of a frozen release is that the bytes already say it).
const bibEscape = (v: string) => v.replace(/[{}]/g, "").replace(/\\/g, "");
const bibKey = (k: string) => `calcofi_${k.replace(/[^A-Za-z0-9]+/g, "_")}`;
/** the year in a citation string, when the row has no year column of its own */
const yearOf = (d: Row) => (citationOf(d).match(/\((\d{4})\)/)?.[1] ?? String(d.coverage_temporal ?? "").match(/(\d{4})/)?.[1] ?? "");
const bibField = (k: string, v: string) => (v ? `  ${k} = {${bibEscape(v)}},\n` : "");

export function bibtexOf(d: Row): string {
  const authors = s(d.pi_names) ? s(d.pi_names).split(/\s*;\s*/).join(" and ") : "CalCOFI";
  return `@misc{${bibKey(String(d.dataset_key))},\n` +
    bibField("title", dsLongName(d)) +
    bibField("author", authors) +
    bibField("year", yearOf(d)) +
    bibField("howpublished", citationOf(d)) +
    bibField("doi", s(d.doi).replace(/^https?:\/\/doi\.org\//, "")) +
    bibField("url", s(d.link_data_source) || s(d.link_calcofi_org)) +
    bibField("note", [licenseLabel(d) && `Licence: ${licenseLabel(d)}`, s(d.source_accessed) && `accessed ${String(d.source_accessed).slice(0, 10)}`, `dataset_key: ${d.dataset_key}`].filter(Boolean).join("; ")) +
    "}";
}

export function bibtexRelease(catalog: Catalog | null, version: string): string {
  const year = catalog?.release_date ? String(catalog.release_date).slice(0, 4) : version.slice(1, 5);
  const doi = s((catalog as any)?.doi);
  return `@misc{calcofi_integrated_database_${version.replace(/[^0-9]/g, "")},\n` +
    bibField("title", `CalCOFI Integrated Database, release ${version}`) +
    bibField("author", "{CalCOFI}") +
    bibField("year", year) +
    bibField("publisher", CC_RELEASE_PUBLISHER) +
    bibField("doi", doi.replace(/^https?:\/\/doi\.org\//, "")) +
    bibField("url", doi ? `https://doi.org/${doi}` : `${CC_DB_SCHEMA_URL}?v=${version}`) +
    bibField("note", "Data set") +
    "}";
}

export function citeBibtex(datasets: Row[], catalog: Catalog | null, version: string): string {
  return [bibtexRelease(catalog, version), ...datasets.map(bibtexOf)].join("\n\n") + "\n";
}

// ── the figure footer's third line ───────────────────────────────────────────
/** "Data: a, b · cite: calcofi.io/explore → Cite this data" — the datasets by key, so the line is
 *  joinable to `dataset_key` in any CSV the same view exported */
export function footerDataLine(datasets: string[]): string {
  return `${datasets.length ? `Data: ${datasets.join(", ")} · ` : ""}cite: calcofi.io/explore → Cite this data`;
}
