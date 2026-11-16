// the downloads' file names say which subset they hold (review 2026-11-16: every CSV was calcofi_<taxon>_<release>.csv, so
// two downloads of one species under different filters could not be told apart, and the second overwrote the first).
// The name lists what is in force and only that: the pick (and its life stage and units), the years, seasons, depth band,
// area, cruises, dataset, the view, the added variable, then the release and the date. Pure, so tests/filename.test.ts
// pins it.
import { parseArea, type Area } from "./area";

export interface NameParts {
  what: string;                    // the pick's label ("Pacific Sardine (Pilchard)") or key
  realm: "bio" | "env";
  stage?: string | null; den?: string | null; zeros?: boolean;
  years: [number, number]; months?: [number, number] | null; yearOpen: number;   // years[1] >= yearOpen = "to now"
  q?: number[] | null;
  depth?: [number, number] | null; depthDefault?: [number, number];              // depth only for a pick with a depth axis
  area?: string | null;            // the URL token (area.ts)
  cruises?: string[] | null;
  datasets?: string[] | null; pool?: boolean; dsShort?: (dk: string) => string; nDatasets?: number;
  lens: string; res?: number; layer?: string | null; cruise?: string | null; line?: number;
  var2?: string | null;
  release: string; date?: string;  // yyyymmdd
}
const SEASON = ["winter", "spring", "summer", "fall"];
const DEN: Record<string, string> = { per_10m2: "per10m2", per_1000m3: "per1000m3", raw: "raw" };
/** lower case, a-z 0-9 and single dashes; a dot only inside a number (line 76.7) */
export const slug = (s: string, max = 40) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)/g, " ").replace(/(\d)\.(\d)/g, "$1·$2").replace(/[^a-z0-9·]+/g, "-").replace(/·/g, ".").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
const two = (n: number) => String(n).padStart(2, "0");

// the long official names, short (as the Where list shows them): "Monterey Bay National Marine Sanctuary" → "Monterey Bay"
const shortRegion = (n: string) => n.replace(/\s*National Marine Sanctuary/i, "").replace(/\s*Marine Protected Area/i, "").trim() || n;
export function areaPart(a: Area | null): string | null {
  if (!a) return null;
  switch (a.kind) {
    case "pattern": return a.patterns.includes("extended") ? "113-station-grid" : "75-station-grid";
    case "box": return "box";
    case "poly": return "drawn-area";
    case "hex": return `hex-${a.cell}`;
    case "line": return `line${a.line}${a.station != null ? `-st${a.station}` : ""}`;
    case "lines": return a.items.length <= 2 ? a.items.map((i) => `line${i.line}${i.station != null ? `-st${i.station}` : ""}`).join("_") : `${a.items.length}-lines`;
    case "region": {
      const layer = slug(a.layer, 30);
      if (!a.names) return layer;
      return a.names.length === 1 ? `${layer}-${slug(shortRegion(a.names[0]), 30)}` : `${layer}-${a.names.length}-regions`;
    }
  }
}

/** calcofi_<pick>[_stage][_units]_<filters…>_<view>_<release>_<date>.<ext> */
export function subsetName(p: NameParts, ext: string): string {
  const out: string[] = ["calcofi", slug(p.what) || "data"];
  if (p.realm === "bio") {
    if (p.stage) out.push(slug(p.stage));
    if (p.den && DEN[p.den]) out.push(DEN[p.den]);
    if (p.zeros === false) out.push("positive-only");
  }
  if (p.years[0] > 1949 || p.years[1] < p.yearOpen || p.months) {
    const hi = p.years[1] >= p.yearOpen ? "now" : String(p.years[1]);
    out.push(p.months ? `${p.years[0]}-${two(p.months[0])}-to-${hi}-${two(p.months[1])}` : `${p.years[0]}-${hi}`);
  }
  if (p.q?.length && p.q.length < 4) out.push([...p.q].sort().map((x) => SEASON[x - 1]).join("-"));
  if (p.depth && p.depthDefault && (p.depth[0] !== p.depthDefault[0] || p.depth[1] !== p.depthDefault[1])) out.push(`${p.depth[0]}-${p.depth[1]}m`);
  const ar = areaPart(parseArea(p.area ?? null));
  if (ar) out.push(ar);
  if (p.cruises?.length) out.push(p.cruises.length === 1 ? slug(p.cruises[0]) : `${p.cruises.length}-cruises`);
  if (p.pool && (p.nDatasets ?? 2) > 1) out.push(p.datasets?.length ? `${p.datasets.length}-datasets` : "all-datasets");
  else if (p.datasets?.length === 1 && (p.nDatasets ?? 2) > 1) out.push(slug(p.dsShort?.(p.datasets[0]) ?? p.datasets[0], 24));
  const view = p.lens === "hex" ? `hex${p.res ?? ""}` : p.lens === "region" && p.layer ? `by-${slug(p.layer, 30)}`
    : p.lens === "cruise" ? (p.cruise ? `cruise-${slug(p.cruise)}` : "cruise") : p.lens === "section" ? `section-line${p.line}${p.realm === "env" && p.cruise ? `-${slug(p.cruise)}` : ""}` : p.lens;
  out.push(view);
  if (p.var2) out.push(`with-${slug(p.var2, 24)}`);
  out.push(p.release);
  if (p.date) out.push(p.date);
  return `${out.join("_")}.${ext}`;
}
