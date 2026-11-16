// human-readable names, the way the dataset finder (CalCOFI/db-viz-station public/app.js) shows them — ported, not invented:
// a common name in Title Case with the scientific name beside it, a measurement named from its type key with the QC /
// sensor / unit suffixes folded away. When the release carries a finished `display_name` (upstream, in the workflows registry)
// these helpers become the fallback; until then they are the single place the casing is decided.

const MINOR = new Set(["of", "and", "the", "a", "an", "in", "on", "at", "for", "to", "from", "with", "by", "per"]);

/** "northern anchovy" → "Northern Anchovy"; "jack mackerel" → "Jack Mackerel"; minor words stay lower after the first. Words that
 *  already carry capitals or digits (pH, DECODR, σθ) are left alone. */
export function titleCaseCommonName(str: string | null | undefined): string | null {
  if (!str) return null;
  // a name stored ALL CAPS ("AMPHIPODA GAMMARIDEA", "APPENDICULARIA") is shouting, not acronyms: fold it to Title Case first
  if (!/[a-z]/.test(str) && (str.length > 4 || /\s/.test(str))) str = str.toLowerCase(); // a lone short all-caps word (PAR, CTD) is an acronym, not shouting
  let first = true;
  return str.replace(/[^\s()/,;-]+/g, (w) => {
    const keep = /[A-Z0-9]/.test(w.slice(1)) || /^[^A-Za-z]/.test(w);
    const lower = w.toLowerCase();
    const isMinor = MINOR.has(lower) && !first;
    first = false;
    if (keep) return w;
    return isMinor ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}


// registry keys are lab shorthand ("chl_fluor", "est_chlorophyll_a", "c14_dark"): spell them out once, here, so no row reads as code.
// (Upstream, a finished display_name column in the registry would replace this list.)
const PHRASES: Record<string, string> = {
  "c14": "Primary Productivity (14C)", "c14 dark": "Primary Productivity, Dark Bottle (14C)",
  "hypoxic depth 14": "Hypoxic Depth (1.4 mL/L)", "hypoxic depth 24": "Hypoxic Depth, Mild (2.4 mL/L)",
  "mld sigma theta 002": "Mixed-Layer Depth (σθ +0.02)", "mld sigma theta 0125": "Mixed-Layer Depth (σθ +0.125)",
  "mld temperature 02": "Mixed-Layer Depth (Temperature −0.2 °C)",
  "maximum buoyancy frequency squared n2": "Maximum Buoyancy Frequency (N²)", "buoyancy n2": "Buoyancy Frequency (N²)",
  "chl max": "Maximum Chlorophyll", "chl integrated": "Integrated Chlorophyll", "chl fluor": "Chlorophyll Fluorescence",
};
const WORDS: Record<string, string> = {
  chl: "Chlorophyll", fluor: "Fluorescence", est: "Estimated", temp: "Temperature", sal: "Salinity", conc: "Concentration",
  integ: "Integrated", mld: "Mixed-Layer Depth", btl: "Bottle", avg: "Average", max: "Maximum", min: "Minimum", dcm: "DCM", phaeo: "Phaeopigment",
};
export function polishName(name: string): string {
  const s = name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const hit = PHRASES[s.toLowerCase()];
  if (hit) return hit;
  let first = true;
  const out = s.split(" ").map((w) => {
    const lw = w.toLowerCase();
    const r = WORDS[lw] ?? (MINOR.has(lw) && !first ? lw : /^[a-z][a-z0-9]*$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w);
    first = false;
    return r;
  }).join(" ");
  return out.replace(/(?<!\()\bPAR\b(?!\))/g, "Photosynthetically Active Radiation (PAR)").replace(/Photosynthetically Active Radiation(?! \(PAR\))/gi, "Photosynthetically Active Radiation (PAR)").replace(/\bPH\b/g, "pH").replace(/\bChlorophyll ([abcABC])\b/g, (_m, l: string) => "Chlorophyll-" + l.toLowerCase());
}

const FIXES: Record<string, string> = {
  ph: "pH", "ph replicate": "pH Replicate", erddap: "ERDDAP", ucsd: "UCSD", oceaninformatics: "Ocean Informatics",
  "phaeopigment concentratio": "Phaeopigment Concentration", dic: "DIC", ctd: "CTD", do: "Dissolved Oxygen", par: "PAR", c14: "C14",
};
const toTitle = (s: string) => s.replace(/(^|[\s\-/])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());

/** a measurement type key as a name: "r_dissolved_oxygen_sta_corr" → "Reported Dissolved Oxygen" (finder's fixDisplayName) */
export function fixDisplayName(name: string): string {
  const raw = name.toLowerCase();
  const reported = /^r_/.test(raw);
  const bottle = /(^|_)btl(_|$)/.test(raw);
  const base = canonicalBase(name);
  const noBtl = base.replace(/(^|_)btl(_|$)/, "$1").replace(/_$/, "");
  let cleaned = (noBtl.includes("_") ? noBtl.replace(/_/g, " ") : noBtl).replace(/\s+of\s*$/i, "").trim();
  let out = FIXES[cleaned] ?? FIXES[cleaned.toLowerCase()] ?? toTitle(cleaned);
  if (bottle) out = "Bottle " + out;
  if (reported) out = "Reported " + out;
  return polishName(out);
}

/** the key with the QC stage, sensor number, replicate and unit variants folded away — the finder's canonicalBase:
 *  rows that share it are one measurement ("one entry per real measurement, not per sensor / correction stage / unit") */
export function canonicalBase(name: string): string {
  let n = (name || "").toLowerCase();
  n = n.replace(/^r_/, "");
  n = n.replace(/_(ave_sta_corr|sta_corr|cruise_corr|corr)$/, "");
  n = n.replace(/_(1|2|ave)$/, "");
  n = n.replace(/_?rep(?:licate)?\d+$/, "");
  if (n === "c14_mean") n = "c14";
  if (n === "oxygen_ml_l" || n === "oxygen_umol_kg") n = "oxygen";
  if (n === "oxygen_btl_ml_l" || n === "oxygen_btl_umol_kg") n = "oxygen_btl";
  if (n === "ammonium") n = "ammonia";
  return n;
}
/** which variant stands for the group (lowest wins): the plain reading over a pre-QC, second-sensor or corrected one */
export function repScore(name: string, description?: string | null): number {
  const n = (name || "").toLowerCase();
  let score = 0;
  if (n.startsWith("r_")) score += 10;
  if (/_(1|2)(_|$)/.test(n)) score += 5;
  if (/corr/.test(n) && !/ave/.test(n)) score += 2;
  if ((description ?? "").includes("QC'd")) score -= 3;
  if (n.includes("umol_kg")) score += 0.5;
  return score + n.length * 0.01;
}
/** a registry description used as a label: its first clause with the parenthetical detail dropped, in Title Case
 *  ("Spice (spiciness at 0 dbar…); positive spicy…" → "Spice"; "Sea surface salinity (raw)" → "Sea Surface Salinity (Raw)";
 *  "Buoyancy (Brunt-Vaisala) frequency squared N2 (TEOS-10…)" → "Buoyancy Frequency Squared N2") */
export function shortName(label: string, key: string): string {
  const keep = /\(raw\)/i.test(label);
  const head = label.split(/\s*[;:]/)[0].replace(/,\s*legacy.*$/i, "").replace(/\s*\([^)]*\)?/g, "").replace(/\s+/g, " ").trim();
  if (!head || head.length > 44) return fixDisplayName(key);
  return polishName((titleCaseCommonName(head) ?? head) + (keep ? " (Raw)" : ""));
}
/** a hand-written name for a key whose description is not specific enough (hypoxic depth, mixed-layer depth …), or null */
export function knownName(key: string): string | null {
  return PHRASES[(key || "").toLowerCase().replace(/^r_/, "").replace(/_+/g, " ")] ?? null;
}

const ABBR: Record<string, string> = { het: "Heterotrophic" };
/** a dataset-local class code as a name: "het_bacteria" → "Heterotrophic Bacteria" (abbreviations spelled out; upstream names would be better) */
export function humanizeCode(code: string): string {
  return (titleCaseCommonName(code.replace(/[_-]+/g, " ")) ?? code).split(" ").map((w) => ABBR[w.toLowerCase()] ?? w).join(" ");
}
