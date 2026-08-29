// the category vocabulary (plan D14, Appendix A) — the registry the release will carry as
// metadata/category.csv (+ measurement_type.category, coverage.json variables[].category). Until a
// release ships those columns, env variables are classified by the keyword rule ported VERBATIM from
// db-viz-station's contentKeywordGroup() (public/app.js), which has already paid for its false
// positives ("dic" in Dictyochophyceae, "par" in Bonaparte's Gull). Bio taxa take their dataset's
// `category` from the release's dataset table (every ingest declares one), with the station app's
// map as the pre-engine fallback. DELETE the keyword rule when coverage.json carries `category`.
import type { IconName } from "./icons";

export const CATEGORY_ORDER = [
  "Physical Oceanography", "Nutrients & Chemistry", "Carbonate System", "Productivity & Pigments", "Meteorology & Sea State",
  "Phytoplankton", "Picoplankton & Bacteria", "Zooplankton", "Euphausiids (Krill)", "Fish Eggs & Larvae", "Mesopelagic Fish", "Seabirds & Marine Mammals",
] as const;
export type Category = (typeof CATEGORY_ORDER)[number] | "Other";
export const CATEGORY_ICON: Record<string, IconName> = {
  "Physical Oceanography": "cat-physical", "Nutrients & Chemistry": "cat-nutrients", "Carbonate System": "cat-carbonate",
  "Productivity & Pigments": "cat-productivity", "Meteorology & Sea State": "cat-meteorology", "Phytoplankton": "cat-phytoplankton",
  "Picoplankton & Bacteria": "cat-picoplankton", "Zooplankton": "cat-zooplankton", "Euphausiids (Krill)": "cat-krill",
  "Fish Eggs & Larvae": "cat-ichthyo", "Mesopelagic Fish": "cat-fish", "Seabirds & Marine Mammals": "cat-birds-mammals", Other: "cat-other",
};
export const categoryRank = (c: string) => { const i = (CATEGORY_ORDER as readonly string[]).indexOf(c); return i === -1 ? 99 : i; };
export const categoryIcon = (c: string | null | undefined): IconName => CATEGORY_ICON[c ?? ""] ?? "cat-other";

// the pre-engine fallback for a dataset's category (the release's dataset.category wins once loaded)
export const DATASET_CATEGORY_FALLBACK: Record<string, string> = {
  swfsc_ichthyo: "Fish Eggs & Larvae", swfsc_cufes: "Fish Eggs & Larvae",
  "cce-lter_zoodb": "Zooplankton", "cce-lter_zooscan": "Zooplankton", "sio_pic-zooplankton": "Zooplankton", calcofi_phyllosoma: "Zooplankton",
  "cce-lter_euphausiids": "Euphausiids (Krill)", "farallon_bird-mammal": "Seabirds & Marine Mammals",
  calcofi_phytoplankton: "Phytoplankton", calcofi_mets: "Meteorology & Sea State", "sio_mesopelagic-fish": "Mesopelagic Fish",
  "cce-lter_picoplankton-bacteria": "Picoplankton & Bacteria", "cdfw_dungeness-crab": "Zooplankton",
  calcofi_bottle: "Physical Oceanography", "calcofi_ctd-cast": "Physical Oceanography", calcofi_dic: "Carbonate System",
};

/** an env variable's category from its name/description — db-viz-station's contentKeywordGroup(), verbatim */
export function envCategory(name: string, description?: string | null): Category {
  const kg = contentKeywordGroup(name) ?? (description ? contentKeywordGroup(description) : null);
  return (kg as Category) ?? "Physical Oceanography";
}
function contentKeywordGroup(raw: string): string | null {
  const n = raw.toLowerCase();
  if (n === "sw_ph") return "Carbonate System";
  if (n.startsWith("tsg")) return "Physical Oceanography";
  if (n === "chl_fluor" || n === "par_surf" || n === "pred_chl") return "Productivity & Pigments";
  if (n === "pred_sal_psu") return "Physical Oceanography";
  if (n === "ph" || n.startsWith("ph ") || n.startsWith("ph_") || n.includes("ph replicate")) return "Carbonate System";
  // "dic" as a bare substring false-positives on Dictyochophyceae and Appendicularia: match the real names
  if (["alkalinity", "dissolved inorganic carbon", "carbonate", "pco2"].some((k) => n.includes(k)) || n === "dic" || n.startsWith("dic_") || n.startsWith("dic ")) return "Carbonate System";
  if (n === "isus_v") return "Nutrients & Chemistry";
  if (["phosphate", "silicate", "nitrate", "nitrite", "ammoni"].some((k) => n.includes(k))) return "Nutrients & Chemistry";
  // "par"/"spar"/"light_pct" pair with chlorophyll and C14 on the same cast; exact names, since "par"
  // as a substring false-positives on species names (Bonaparte's Gull, Parakeet Auklet…)
  if (["chlorophyll", "phaeopigment", "c14", "productivity", "pigment", "fluorescence", "light_pct"].some((k) => n.includes(k))
    || n === "par" || n === "spar" || n.startsWith("par ") || n.startsWith("spar ")) return "Productivity & Pigments";
  if (["wind", "wave", "weather", "cloud", "visibility", "bulb", "atmospheric", "barometric", "secchi", "forel"].some((k) => n.includes(k)) || n === "water_color") return "Meteorology & Sea State";
  if (["temperature", "salinity", "density", "sigma", "oxygen", "o2", "pressure", "depth", "dynamic height"].some((k) => n.includes(k))) return "Physical Oceanography";
  return null;
}
