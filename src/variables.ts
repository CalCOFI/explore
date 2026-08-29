// One *variable* = the measurement types that measure the same thing and are comparable across
// datasets (plan D8: "the same pills attribute bottle vs CTD temperature, which ARE comparable").
// The release keys the CTD headline series by sensor/correction (temperature_ave, salinity_ave_corr,
// oxygen_ml_l_ave_sta_corr — "the providers state station-corrected data are the best"), the bottle
// series by the bare name; without this crosswalk "temperature" is bottle-only and stops in 2021
// while the CTD runs to 2026. This belongs in metadata/measurement_type.csv as a `variable` column
// (Phase-1 follow-up); until then the explorer carries it. The CTD's `btl_*` types are its own
// bottle samples and would double-count the bottle dataset, so they stay separate variables.
export interface VariableDef { key: string; label: string; members: string[] }
export const UNIFIED: VariableDef[] = [
  { key: "temperature",    label: "Temperature (°C)",                 members: ["temperature", "temperature_ave"] },
  { key: "salinity",       label: "Salinity (PSS-78 / PSU)",          members: ["salinity", "salinity_ave_corr"] },
  { key: "oxygen_ml_l",    label: "Dissolved oxygen (ml/L)",          members: ["oxygen_ml_l", "oxygen_ml_l_ave_sta_corr"] },
  { key: "oxygen_umol_kg", label: "Dissolved oxygen (µmol/kg)",       members: ["oxygen_umol_kg", "oxygen_umol_kg_ave_sta_corr"] },
  { key: "sigma_theta",    label: "Potential density σθ (kg/m³)",     members: ["sigma_theta", "sigma_theta_1"] },
];
let unified: VariableDef[] = UNIFIED;
/** the crosswalk in force: the release's `measurement_type.variable` (coverage.json variables[].variable, D14) when the
 *  release carries it, else the stopgap above. Called once from the boot, before any slice is built. */
export function setUnified(defs: VariableDef[]) { if (defs.length) unified = defs; }
export function unifiedDefs(): VariableDef[] { return unified; }
/** the member measurement types of a variable key (a plain type is its own single member) */
export function members(key: string): string[] {
  return unified.find((v) => v.key === key)?.members ?? [key];
}
