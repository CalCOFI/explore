// the Area filter (explore#20): confine every lens, strip and download to one part of the ocean, so a comparison
// across years is like with like. Three kinds, one `area=` token in the URL:
//   area=std          the standard station pattern (lines 76.7–93.3: the stations every cruise occupies since 1984)
//   area=std,ext      the standard pattern plus the extended lines (60–73.3) — the grid's `pattern` column
//   area=box:w,s,e,n  a lon/lat box (the map view when it was frozen), to 0.001°
//   area=in:L|N       inside region N of boundary layer L — the release's own sample_spatial membership, exact per
//                     sample, the same layers (and their names) the Regions lens and the Layers card list. Everything
//                     after the FIRST `|` is the name, verbatim (a name may hold `|`, `,` or `%`): the permalink form
//                     since explore#20, parsed exactly as before
//   area=in:L         every region of layer L (no `|`: the whole layer; Ben, 2026-10-14)
//   area=ins:L|A,B,C  any of a set of regions of L (two or more). Each name is escaped so the comma cannot occur in
//                     it: `%` -> `%25`, `,` -> `%2C`, nothing else ("Channel Islands,Monterey Bay"). A set of one is
//                     written in the single form, so a link never has two spellings
// A single name that is not a region of the release but a word-boundary prefix of some (an `in:` link from before the
// sanctuaries came from the gazetteer, explore#34: "Channel Islands" -> its Northern and Santa Barbara sections) is
// widened to that set by resolveArea() once the release's region names are known.
// Pure rules (no React, no engine) so tests/area.test.ts asserts them; App.tsx turns the SQL into {{area_filter}}.
import { lit } from "./sqltpl";

/** a region area: `names` null = every region of the layer; otherwise one or more names */
export type RegionArea = { kind: "region"; layer: string; names: string[] | null };
export type Area =
  | { kind: "pattern"; patterns: string[] }
  | { kind: "box"; bbox: [number, number, number, number] }
  | RegionArea;

export const PATTERN_WORD: Record<string, string> = { standard: "the standard station pattern", extended: "the extended lines" };
const PATTERN_CODE: Record<string, string> = { std: "standard", ext: "extended" };
const CODE_OF: Record<string, string> = { standard: "std", extended: "ext" };

const escName = (n: string) => n.replace(/[%,]/g, (c) => (c === "%" ? "%25" : "%2C"));
const unescName = (n: string) => n.replace(/%(25|2C)/gi, (_, h) => (h === "25" ? "%" : ","));

export function parseArea(s: string | null | undefined): Area | null {
  if (!s) return null;
  if (s.startsWith("box:")) {
    const v = s.slice(4).split(",").map(Number);
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) return null;
    const [w, so, e, n] = v;
    if (w >= e || so >= n || so < -90 || n > 90) return null;
    return { kind: "box", bbox: [w, so, e, n] };
  }
  if (s.startsWith("ins:")) {
    const at = s.indexOf("|", 4);
    const layer = s.slice(4, at < 0 ? undefined : at);
    const names = at < 0 ? [] : [...new Set(s.slice(at + 1).split(",").map(unescName).filter(Boolean))];
    return layer && names.length ? { kind: "region", layer, names } : null;
  }
  if (s.startsWith("in:")) {
    const [layer, ...rest] = s.slice(3).split("|");
    if (!layer) return null;
    if (!rest.length) return { kind: "region", layer, names: null };
    const name = rest.join("|");
    return name ? { kind: "region", layer, names: [name] } : null;
  }
  const patterns = [...new Set(s.split(",").map((x) => PATTERN_CODE[x.trim()]).filter(Boolean))];
  return patterns.length ? { kind: "pattern", patterns: ["standard", "extended"].filter((p) => patterns.includes(p)) } : null;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export function areaToUrl(a: Area | null): string | null {
  if (!a) return null;
  if (a.kind === "box") return `box:${a.bbox.map(r3).join(",")}`;
  if (a.kind === "region") {
    if (a.names == null) return `in:${a.layer}`;
    if (!a.names.length) return null;
    return a.names.length === 1 ? `in:${a.layer}|${a.names[0]}` : `ins:${a.layer}|${a.names.map(escName).join(",")}`;
  }
  return a.patterns.map((p) => CODE_OF[p]).join(",");
}

/** the area the region modal applies: nothing picked = no area (null); every region the release has in the layer = the
 *  whole layer (`in:L`, the same samples and the shorter link); otherwise the picked names, in the release's order */
export function pickedArea(layer: string, picked: Iterable<string>, available: string[]): RegionArea | null {
  const p = new Set(picked);
  const names = available.filter((n) => p.has(n));
  if (!names.length) return null;
  return names.length === available.length ? { kind: "region", layer, names: null } : { kind: "region", layer, names };
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
  if (a.kind === "region") {
    const names = a.names == null ? "" : a.names.length === 1 ? ` AND spatial_name = ${lit(a.names[0])}`
      : a.names.length ? ` AND spatial_name IN (${a.names.map((n) => lit(n)).join(", ")})` : null;
    return names == null ? "FALSE" : `root_id IN (SELECT root_id FROM ${ctx.spatialSrc} WHERE layer = ${lit(a.layer)}${names})`;
  }
  if (!ctx.gridKeys) return null;
  const keys = a.patterns.flatMap((p) => ctx.gridKeys!.get(p) ?? []);
  return keys.length ? `grid_key IN (${keys.map((k) => lit(k)).join(", ")})` : "FALSE";
}

/** the title sentence's clause: "within the standard station pattern", "within Channel Islands (National Marine
 *  Sanctuaries)", "within all of National Marine Sanctuaries", "within 3 regions of CA Counties",
 *  "within 121.5°W–117°W, 32°N–35°N" */
export function areaWord(a: Area | null): string {
  if (!a) return "everywhere";
  if (a.kind === "region") {
    if (a.names == null) return `within all of ${a.layer}`;
    return a.names.length === 1 ? `within ${a.names[0]} (${a.layer})` : `within ${a.names.length} regions of ${a.layer}`;
  }
  if (a.kind === "pattern") return `within ${a.patterns.map((p) => PATTERN_WORD[p]).join(" and ")}`;
  const [w, s, e, n] = a.bbox, lon = (x: number) => `${Math.abs(r3(x))}°${x < 0 ? "W" : "E"}`, lat = (y: number) => `${Math.abs(r3(y))}°${y < 0 ? "S" : "N"}`;
  return `within ${lon(w)}–${lon(e)}, ${lat(s)}–${lat(n)}`;
}

/** `prefix` names `full` up to a word boundary, case-insensitively: "Channel Islands" names "Channel Islands National
 *  Marine Sanctuary - Northern Section", not "Channel Islandsx"; equal strings count */
export function prefixNames(prefix: string, full: string): boolean {
  const p = prefix.trim().toLowerCase(), f = full.toLowerCase();
  if (!p || !f.startsWith(p)) return false;
  if (f.length === p.length) return true;
  return !/[\p{L}\p{N}]/u.test(f[p.length]) || !/[\p{L}\p{N}]/u.test(p[p.length - 1]);
}

/** an old single name against the release's region names: itself when it is one; else every region it is a
 *  word-boundary prefix of (explore#34: the short ONMS names of v2026.10.13 against the gazetteer's full ones); [] none */
export function resolveRegionNames(name: string, available: string[]): string[] {
  if (available.includes(name)) return [name];
  return available.filter((n) => prefixNames(name, n));
}

/** the area a link means in this release: a single region name that is not there but prefixes some is widened to
 *  that set (or kept, if it is one); everything else is unchanged. `available` null = not known yet (unchanged). */
export function resolveArea(a: Area | null, available: string[] | null): Area | null {
  if (!a || a.kind !== "region" || a.names?.length !== 1 || !available) return a;
  const got = resolveRegionNames(a.names[0], available);
  return !got.length || (got.length === 1 && got[0] === a.names[0]) ? a : { kind: "region", layer: a.layer, names: got };
}

/** the release's region names a boundary feature stands for (the modal map): its own name when it is one, else the
 *  regions whose name prefixes it — v2026.10.13's "Channel Islands" covers both gazetteer sections drawn on the map */
export function regionsOfFeature(featureName: string | null | undefined, available: string[]): string[] {
  if (!featureName) return [];
  if (available.includes(featureName)) return [featureName];
  return available.filter((n) => prefixNames(n, featureName));
}

/** the properties a boundary feature may name its region by, in order: the registry row's `name_field` (the column the
 *  release's sample_spatial names regions by: `AOA` = "N2-E"), then `name` (CalCOFI archives carry it beside their
 *  name_field; the gazetteer's display name, "Southern California AOA N2-E"), then the gazetteer's `source_id` (the
 *  upstream's own key, "N2-E" — gazetteer tiles do not carry native columns such as AOA) */
export const featureNameFields = (nameField: string | null | undefined): string[] => [...new Set([nameField || "name", "name", "source_id"])];

/** the release's regions a feature stands for: the first of its name properties that matches any (regionsOfFeature) */
export function regionsOfFeatureProps(props: Record<string, any> | null | undefined, nameField: string | null | undefined, available: string[]): string[] {
  for (const k of featureNameFields(nameField)) {
    const v = props?.[k];
    const got = v == null || v === "" ? [] : regionsOfFeature(String(v), available);
    if (got.length) return got;
  }
  return [];
}

/** nameMatchExpr over every name property a feature may carry (featureNameFields) */
export const regionMatchExpr = (names: string[], available: string[], nameField: string | null | undefined): any =>
  names.length ? ["any", ...featureNameFields(nameField).map((f) => nameMatchExpr(names, available, f))] : false;

/** a MapLibre expression: the feature's `field` names one of `names` — exactly, or, for a feature that is not itself
 *  one of `available`, one of `names` is a word-boundary prefix of it, case-insensitively (regionsOfFeature's rule,
 *  with a space as the boundary) */
export function nameMatchExpr(names: string[], available: string[], field = "name"): any {
  if (!names.length) return false;
  const get = ["to-string", ["get", field]];
  return ["any", ["in", get, ["literal", names]],
    ["all", ["!", ["in", get, ["literal", available]]],
      ["any", ...names.map((n) => ["==", ["slice", ["downcase", get], 0, n.length + 1], `${n.toLowerCase()} `])]]];
}

/** the modal's table: filter by a case-insensitive substring of name or status, then sort by a column (name, status,
 *  status date or n), ties by name; missing values sort last whatever the direction */
export interface RegionRow { name: string; n: number; status: string | null; status_date: string | null }
export type RegionSort = "name" | "status" | "status_date" | "n";
export function filterSortRegions(rows: RegionRow[], q: string, by: RegionSort, desc: boolean): RegionRow[] {
  const t = q.trim().toLowerCase();
  const kept = t ? rows.filter((r) => r.name.toLowerCase().includes(t) || (r.status ?? "").toLowerCase().includes(t)) : rows.slice();
  const cmp = (a: RegionRow, b: RegionRow) => {
    const x = a[by], y = b[by];
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    const c = typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y));
    return desc ? -c : c;
  };
  return kept.sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
}

/** the box as a GeoJSON polygon, for the map's outline */
export const boxFeature = (b: [number, number, number, number]) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } });

/** the lon/lat box around some GeoJSON features ([w, s, e, n]), null for none — where the region modal's map opens.
 *  A set that straddles the antimeridian (Papahānaumokuākea beside the California sanctuaries) is boxed across the
 *  Pacific (east longitudes as lon − 360) when that box is the narrower one, so the map does not open on the world */
export function featuresBbox(features: { geometry?: { coordinates?: any } | null }[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, w2 = Infinity, e2 = -Infinity;
  const walk = (c: any) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [x, y] = c;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
      const x2 = x > 0 ? x - 360 : x; w2 = Math.min(w2, x2); e2 = Math.max(e2, x2);
      return;
    }
    for (const x of c) walk(x);
  };
  for (const f of features) walk(f.geometry?.coordinates);
  if (!(w <= e && s <= n)) return null;
  return e2 - w2 < e - w ? [w2, s, e2, n] : [w, s, e, n];
}

/** the map's outline of a region area:the release's own polygons (spatial.geojson) of the layer, all of them or the
 *  chosen names */
export const regionOutline = <F extends { properties: { layer: string; name: string } }>(a: RegionArea, features: F[]): F[] =>
  features.filter((f) => f.properties.layer === a.layer && (a.names == null || a.names.includes(f.properties.name)));
