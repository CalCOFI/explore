// the data stage of a cruise's samples: whether what the view draws is the provider's finished series or a preliminary
// one, as posted by the ship. It is the release's own `data_stage`, never a list of cruises kept here: the CTD casts of
// `calcofi_ctd-cast` carry final · preliminary_with_bottle · preliminary_without_bottle, every other dataset carries none.
// ctd-transects badges a cruise by the same column; this module is the Explorer's rule for which views say so, and in
// which words. The app reads it from `sample_root` (sql/cruise_stage.sql), and only on a release whose sample_root carries
// the column (calcofi4db 4.37.0+): release v2026.11.09 has it on `sample` alone, a 28 MB object the app does not load, so
// there nothing is read and no view wears a mark. tests/stage.test.ts pins all of it.
import type { Lens } from "./state";

/** the columns sql/cruise_stage.sql reads */
export const STAGE_COLS = ["cruise_key", "dataset_key", "data_stage"] as const;
/** how many of them a registered object carries: the probe App.tsx runs once on `sample_root` before it reads a stage */
export const stageProbeSql = (src: string) =>
  `SELECT count(*) AS n FROM (DESCRIBE SELECT * FROM ${src}) WHERE column_name IN (${STAGE_COLS.map((c) => `'${c}'`).join(", ")})`;
/** the probe's answer: the object carries all of them */
export const hasStageCols = (probe: { n?: number | bigint | null }[]) => Number(probe[0]?.n ?? 0) === STAGE_COLS.length;

/** one row of sql/cruise_stage.sql */
export interface StageRow { cruise_key: string; dataset_key: string; data_stage: string; n?: number }
/** cruise_key → dataset_key → that dataset's stage on the cruise (the least final, where it carries more than one) */
export type StageIndex = Map<string, Map<string, string>>;

export const STAGE_FINAL = "final";
/** the provider's wording, verbatim from ctd-transects (public/app.js STAGE_LABELS) so the two products say the same thing.
 * `final` has no mark here: a finished cruise is the unmarked case. */
export const STAGE_LABELS: Record<string, string> = {
  preliminary_with_bottle:    "Preliminary — CTD & bottle 1 m-binned",
  preliminary_without_bottle: "Preliminary — CTD only, no bottle merge",
};
// least final first. A stage this app does not know sorts before them all: it cannot vouch for it.
const STAGE_ORDER = ["preliminary_without_bottle", "preliminary_with_bottle", STAGE_FINAL];
const rank = (stage: string) => STAGE_ORDER.indexOf(stage);

/** the least final of two stages */
export const leastFinal = (a: string, b: string): string => (rank(b) < rank(a) ? b : a);

/** the mark a stage wears: null for a final one (and for none), the provider's wording for the two it names, and for a
 * stage it does not name the word and the release's own value — never wording invented here */
export function stageLabel(stage: string | null | undefined): string | null {
  if (!stage || stage === STAGE_FINAL) return null;
  return STAGE_LABELS[stage] ?? `Preliminary — ${stage}`;
}

/** the query's rows as a lookup; a row without a cruise, a dataset or a stage is dropped */
export function stageIndex(rows: Partial<StageRow>[]): StageIndex {
  const idx: StageIndex = new Map();
  for (const r of rows) {
    if (!r.cruise_key || !r.dataset_key || !r.data_stage) continue;
    const ds = idx.get(r.cruise_key) ?? new Map<string, string>();
    ds.set(r.dataset_key, ds.has(r.dataset_key) ? leastFinal(ds.get(r.dataset_key)!, r.data_stage) : r.data_stage);
    idx.set(r.cruise_key, ds);
  }
  return idx;
}

/** a cruise's stage among the datasets a view pools: the least final stage that is NOT final, with the dataset that
 * carries it; null when none of them is preliminary on this cruise. The stage belongs to a dataset: a bottle or net-tow
 * series of a cruise whose CTD casts are preliminary is not preliminary, so a dataset out of view never marks the view. */
export function cruiseStage(idx: StageIndex | null | undefined, cruise: string | null | undefined, datasets: Iterable<string>): { stage: string; dataset_key: string } | null {
  const ds = cruise ? idx?.get(cruise) : null;
  if (!ds) return null;
  let out: { stage: string; dataset_key: string } | null = null;
  for (const dk of datasets) {
    const stage = ds.get(dk);
    if (!stage || stage === STAGE_FINAL) continue;
    if (!out || rank(stage) < rank(out.stage)) out = { stage, dataset_key: dk };
  }
  return out;
}

/** is the view of ONE cruise? The Sections lens cuts depth on one cruise for an ocean variable (an organism's section
 * runs across every cruise), and the Cruises lens shows one. Every other lens pools cruises, and wears no mark. */
export const singleCruise = (v: { lens: Lens; realm: "bio" | "env"; cruise: string | null }): string | null =>
  !v.cruise ? null : v.lens === "cruise" || (v.lens === "section" && v.realm === "env") ? v.cruise : null;

/** the mark a view wears beside its cruise: only a view of one cruise, only for a dataset in view whose stage on that
 * cruise is not final. null = no mark (a finished cruise, a pooled view, a release with no stage, a stage not yet read). */
export function viewStage(v: { lens: Lens; realm: "bio" | "env"; cruise: string | null }, datasets: Iterable<string>, idx: StageIndex | null | undefined): { stage: string; dataset_key: string; label: string } | null {
  const s = cruiseStage(idx, singleCruise(v), datasets);
  return s ? { ...s, label: stageLabel(s.stage)! } : null;
}
