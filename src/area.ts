// the Area filter (explore#20): confine every lens, strip and download to one part of the ocean, so a comparison
// across years is like with like. Three kinds, one `area=` token in the URL:
//   area=std          the standard station pattern (lines 76.7–93.3: the stations every cruise occupies since 1984)
//   area=std,ext      the standard pattern plus the extended lines (60–73.3) — the grid's `pattern` column
//   area=box:w,s,e,n  a lon/lat box (the map view when it was frozen), to 0.001°
//   area=in:L|N       inside region N of boundary layer L — the release's own sample_spatial membership, exact per
//                     sample, the same layers (and their names) the Regions lens and the Layers card list
// Pure rules (no React, no engine) so tests/area.test.ts asserts them; App.tsx turns the SQL into {{area_filter}}.
import { lit } from "./sqltpl";

export type Area =
  | { kind: "pattern"; patterns: string[] }
  | { kind: "box"; bbox: [number, number, number, number] }
  | { kind: "region"; layer: string; name: string };

export const PATTERN_WORD: Record<string, string> = { standard: "the standard station pattern", extended: "the extended lines" };
const PATTERN_CODE: Record<string, string> = { std: "standard", ext: "extended" };
const CODE_OF: Record<string, string> = { standard: "std", extended: "ext" };

export function parseArea(s: string | null | undefined): Area | null {
  if (!s) return null;
  if (s.startsWith("box:")) {
    const v = s.slice(4).split(",").map(Number);
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) return null;
    const [w, so, e, n] = v;
    if (w >= e || so >= n || so < -90 || n > 90) return null;
    return { kind: "box", bbox: [w, so, e, n] };
  }
  if (s.startsWith("in:")) {
    const [layer, ...rest] = s.slice(3).split("|");
    const name = rest.join("|");
    return layer && name ? { kind: "region", layer, name } : null;
  }
  const patterns = [...new Set(s.split(",").map((x) => PATTERN_CODE[x.trim()]).filter(Boolean))];
  return patterns.length ? { kind: "pattern", patterns: ["standard", "extended"].filter((p) => patterns.includes(p)) } : null;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export function areaToUrl(a: Area | null): string | null {
  if (!a) return null;
  if (a.kind === "box") return `box:${a.bbox.map(r3).join(",")}`;
  if (a.kind === "region") return `in:${a.layer}|${a.name}`;
  return a.patterns.map((p) => CODE_OF[p]).join(",");
}

/** the predicate on `slice` rows (columns grid_key, root_id, latitude, longitude). `gridKeys` are the grid's cells
 *  by pattern (grid.geojson); `spatialSrc` is the sample_spatial relation. null = not computable yet (the grid has not
 *  loaded) — the caller waits rather than draw unfiltered. A pattern with no cells matches nothing, never everything. */
export function areaSql(a: Area | null, ctx: { gridKeys: Map<string, string[]> | null; spatialSrc: string }): string | null {
  if (!a) return "TRUE";
  if (a.kind === "box") {
    const [w, s, e, n] = a.bbox;
    return `(latitude BETWEEN ${s} AND ${n} AND longitude BETWEEN ${w} AND ${e})`;
  }
  if (a.kind === "region")
    return `root_id IN (SELECT root_id FROM ${ctx.spatialSrc} WHERE layer = ${lit(a.layer)} AND spatial_name = ${lit(a.name)})`;
  if (!ctx.gridKeys) return null;
  const keys = a.patterns.flatMap((p) => ctx.gridKeys!.get(p) ?? []);
  return keys.length ? `grid_key IN (${keys.map((k) => lit(k)).join(", ")})` : "FALSE";
}

/** the title sentence's clause: "within the standard station pattern", "within Channel Islands (National Marine
 *  Sanctuaries)", "within 121.5°W–117°W, 32°N–35°N" */
export function areaWord(a: Area | null): string {
  if (!a) return "everywhere";
  if (a.kind === "region") return `within ${a.name} (${a.layer})`;
  if (a.kind === "pattern") return `within ${a.patterns.map((p) => PATTERN_WORD[p]).join(" and ")}`;
  const [w, s, e, n] = a.bbox, lon = (x: number) => `${Math.abs(r3(x))}°${x < 0 ? "W" : "E"}`, lat = (y: number) => `${Math.abs(r3(y))}°${y < 0 ? "S" : "N"}`;
  return `within ${lon(w)}–${lon(e)}, ${lat(s)}–${lat(n)}`;
}

/** the box as a GeoJSON polygon, for the map's outline */
export const boxFeature = (b: [number, number, number, number]) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } });
