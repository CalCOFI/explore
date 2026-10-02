// regression (2026-10-02): the Biology Sections lens died with `Binder Error: Referenced column "site_key" not
// found` — section_cruises.sql (shared by both realms) counted site_key, which slice_env.sql builds and
// slice_bio.sql did not (since 16a9083). The rule this guards: BOTH slice templates build the same columns in the
// same order, so a lens template written against one runs against the other.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = (f: string) => readFileSync(new URL(`../sql/${f}`, import.meta.url), "utf8").replace(/--.*$/gm, "");

// the output names of one SELECT list: split on top-level commas, keep the alias (after AS) or the bare column
function columns(selectList: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of selectList) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim()).filter(Boolean).map((c) => {
    const as = c.match(/\bAS\s+([a-z_0-9]+)\s*$/i);
    return (as ? as[1] : c.replace(/^[a-z]\./i, "")).trim();
  });
}
const listOf = (text: string, re: RegExp) => { const m = text.match(re); if (!m) throw new Error(`no SELECT matched ${re}`); return columns(m[1]); };

const env = listOf(sql("slice_env.sql"), /CREATE OR REPLACE TABLE slice AS\s+SELECT([\s\S]*?)\bFROM \{\{src\}\}/);
const bio = sql("slice_bio.sql");
const bioPos = listOf(bio, /WITH pos AS \(\s*SELECT([\s\S]*?)\bFROM \{\{src\}\}/);
const bioZero = listOf(bio, /UNION ALL\s+SELECT([\s\S]*?)\bFROM tow t/);

describe("slice columns", () => {
  it("slice_bio builds exactly the columns slice_env builds, in the same order", () => {
    expect(bioPos).toEqual(env);
  });
  it("slice_bio's zero-filled rows carry the same columns as its positive rows", () => {
    expect(bioZero).toEqual(bioPos);
  });
  it("both slices carry site_key (the Biology Sections lens binder error)", () => {
    expect(env).toContain("site_key");
    expect(bioPos).toContain("site_key");
  });
  it("every slice column a shared section template names exists in both slices", () => {
    for (const f of ["section_cruises.sql", "section_bio.sql"]) {
      const named = [...sql(f).matchAll(/\b(site_key|grid_key|cruise_key|obs_id|year|station|line)\b/g)].map((m) => m[1]);
      for (const c of new Set(named)) { expect(env, `${f}: ${c} in slice_env`).toContain(c); expect(bioPos, `${f}: ${c} in slice_bio`).toContain(c); }
    }
  });
});
