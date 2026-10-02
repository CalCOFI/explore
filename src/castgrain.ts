// The per-cast grain (plan 2026-10-02 D2, explore#13, docs/cast-grain.md).
//
// A release publishes two shapes of environmental value. A PER-BIN value is a depth observation (temperature at 40 m):
// it lives in obs_env, one object per measurement type, and every lens already reads it. A PER-CAST value is one number
// for a whole cast (the mixed-layer depth, the depth of the chlorophyll maximum): it has no depth, so the release keeps
// it in `sample_measurement` on the cast's `sample` and does NOT project it into obs_env. The Explorer reads it with a
// consumer-side join — sample_measurement ⋈ sample_root (sql/slice_cast.sql) — into the same `slice` every lens runs on.
//
// Everything here is keyed on the release's measurement_type registry (`grain`, `description`, `units`, `derivation`,
// `category`) and on WHICH DATASET publishes the rows. No measurement_type name appears in the app: the headline MLD is
// renamed and the chlorophyll-maximum definition changes at the next release (workflows#101, #102).

/** the grain of a variable in the Explorer: a depth observation, or one value for the whole cast */
export type VarGrain = "bin" | "cast";

/** the registry's word for a per-sample measurement type (`measurement_type.grain`; the others are obs, attribute) */
export const REGISTRY_CAST_GRAIN = "sample";

/** the derived-product datasets. The family is "the measurement types these datasets publish", whatever they are called;
 *  the release says a dataset is derived only in prose (its name and description), so this one key is the single thing
 *  the app states that the registry cannot yet (docs/cast-grain.md asks the release for a `derived_from` column). */
export const DERIVED_DATASETS: readonly string[] = ["calcofi_ctd-derived"];
export const DERIVED_FAMILY = "Derived (hydrographic)";

/** a row of the release's measurement_type registry, the columns the per-cast grain reads */
export interface RegistryRow {
  measurement_type: string; description: string | null; units: string | null; derivation: string | null;
  grain: string | null; category: string | null;
}
/** sql/cast_census.sql (n) or sql/cast_list.sql (+ n_placed, y0, y1): sample_measurement per dataset × type */
export interface CastCensusRow { dataset_key: string; measurement_type: string; n: number; n_placed?: number | null; y0?: number | null; y1?: number | null }
/** one per-cast variable as the picker lists it */
export interface CastVariable {
  key: string; label: string; units: string | null; derivation: string | null; category: string | null;
  datasets: string[];       // the derived datasets that publish it, most values first
  n: number;                // values in the release (one per cast)
  n_placed: number | null;  // of them, on a cast with a sample_root row (a position); null until sample_root is loaded
  y0: number | null; y1: number | null;
}

/** the family a variable belongs to, from the datasets that publish it: a variable is derived when any of them is */
export function derivedFamily(datasets: readonly string[]): string | null {
  return datasets.some((d) => DERIVED_DATASETS.includes(d)) ? DERIVED_FAMILY : null;
}

/** the per-cast variables the picker lists: a measurement type the registry calls per-sample AND a derived dataset
 *  publishes. A type the registry does not describe is not listed (never a fallback to its name); a per-sample type of
 *  another dataset (the bottle casts' weather, a tow's effort) is not in this family. */
export function castVariables(registry: ReadonlyMap<string, RegistryRow>, census: readonly CastCensusRow[]): CastVariable[] {
  const by = new Map<string, CastCensusRow[]>();
  for (const c of census) {
    if (!DERIVED_DATASETS.includes(c.dataset_key)) continue;
    if (registry.get(c.measurement_type)?.grain !== REGISTRY_CAST_GRAIN) continue;
    (by.get(c.measurement_type) ?? by.set(c.measurement_type, []).get(c.measurement_type)!).push(c);
  }
  const span = (xs: (number | null | undefined)[], f: (...v: number[]) => number) => { const v = xs.filter((x): x is number => x != null); return v.length ? f(...v) : null; };
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, rows]) => {
    const r = registry.get(key)!;
    return {
      key, label: r.description ?? key, units: r.units, derivation: r.derivation, category: r.category,
      datasets: rows.slice().sort((a, b) => b.n - a.n).map((x) => x.dataset_key),
      n: rows.reduce((a, x) => a + x.n, 0),
      n_placed: rows.every((x) => x.n_placed != null) ? rows.reduce((a, x) => a + (x.n_placed as number), 0) : null,
      y0: span(rows.map((x) => x.y0), Math.min), y1: span(rows.map((x) => x.y1), Math.max),
    };
  });
}

/** which slice a `var=` builds. A variable with an obs_env object is per-bin — the path every release before the
 *  per-cast grain took, unchanged whatever the registry says; one without, whose registry row says per-sample, is
 *  per-cast; anything else is unknown and the caller says so (it does not guess). */
export function variableGrain(key: string, hasBinObject: boolean, registry: ReadonlyMap<string, RegistryRow> | null): VarGrain | null {
  if (hasBinObject) return "bin";
  return registry?.get(key)?.grain === REGISTRY_CAST_GRAIN ? "cast" : null;
}

/** what one value stands for */
export const grainWord = (g: VarGrain) => (g === "cast" ? "one value per cast" : "one value per depth bin");
/** what the count counts: a per-cast variable has one value per cast, so its "observations" are casts */
export const grainCount = (g: VarGrain, n: number) => `${n.toLocaleString("en-US")} ${g === "cast" ? (n === 1 ? "cast" : "casts") : "observations"}`;

/** the definition a hover shows for a derived variable: the registry's description and derivation, verbatim — the app
 *  never writes a formula of its own, so a changed definition in the release is a changed hover */
export function derivedTip(v: { label: string; units: string | null; derivation: string | null }, grain: VarGrain, datasetName?: string | null): string {
  const lines = [`${v.label}${v.units ? ` (${v.units})` : ""}`, `Derived, not measured — ${grainWord(grain)}${datasetName ? ` · ${datasetName}` : ""}`];
  if (v.derivation) lines.push(`How: ${v.derivation}`);
  return lines.join("\n");
}
