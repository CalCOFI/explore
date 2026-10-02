// quality flags: which measurement_qual codes a consumer excludes. `measurement_qual` is each dataset's OWN vocabulary,
// uninterpreted (workflows metadata/measurement_qual.csv), and a flag reaches a user only if the consumer applies the
// predicate. obs_bio / obs_env arrive with `qual_ok` stamped by the release (calcofi4db::build_obs_slim()); a table read
// raw — sample_measurement, for the per-cast grain (sql/slice_cast.sql) — needs the predicate itself. This is the twin
// of calcofi4r::cc_qual_ok_sql() / calcofi4py.qual_ok_sql() / db-query's qualOkSQL(): the SAME string, byte for byte
// (tests/qual.test.ts pins it), so the SQL "Copy code" hands to R and Python is the predicate their package builds.
export const QUAL_EXCLUDE: Record<string, string[]> = {
  calcofi_bottle: ["8", "9"],        // 8 suspect, 9 missing (6 = ok-from-CTD is kept)
  "calcofi_ctd-cast": ["8", "9"],    // 8 questionable, 9 bad or missing (1 / 2 = use the primary / secondary sensor)
  calcofi_dic: ["3", "4", "9"],      // WOCE: 3 questionable, 4 bad, 9 missing (2 = good)
};

/** a boolean SQL fragment over `dataset_key` + `measurement_qual`: TRUE for an unflagged row (NULL), for a dataset with no
 *  flag vocabulary and for a code that is not excluded; FALSE for suspect / bad / missing. Bottle codes were written
 *  "8.0" through v2026.08.14, so a trailing `.0` is stripped first. */
export function qualOkSQL(alias?: string | null): string {
  const p = alias ? `${alias}.` : "";
  const q = `regexp_replace(${p}measurement_qual, '\\.0+$', '')`;
  const arms = Object.entries(QUAL_EXCLUDE).map(([dk, codes]) => `(${p}dataset_key = '${dk}' AND ${q} IN (${codes.map((c) => `'${c}'`).join(", ")}))`);
  // COALESCE: a NULL flag must KEEP the row, and NOT(NULL) is NULL
  return `COALESCE(NOT (${arms.join(" OR ")}), TRUE)`;
}
