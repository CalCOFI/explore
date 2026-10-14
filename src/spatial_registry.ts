// the spatial-layers registry's pure rules (no maplibre, no DOM — tests/spatial_registry.test.ts asserts them):
// where a row's PMTiles come from, what its vector layer is called, how the bundled snapshot merges into a release's
// sidecar, and what the hover popup says. basemap.ts draws with these; App.tsx merges and words the tooltip with them.
import type { RegionStatus, SpatialLayerDef, SpatialLayers } from "./basemap";

/** a row that points at its own absolute PMTiles URL (the oceanmetrics gazetteer, plan 2026-10-08) instead of
 *  `${pmtiles_base}${source}.pmtiles` in the CalCOFI bucket */
export const isExternalPmtiles = (d: SpatialLayerDef): boolean =>
  d.geom !== "raster" && (d.source_type ?? "pmtiles") === "pmtiles" && !!d.source_url;

/** the vector layer inside the archive: the row's `source_layer`, else `source` (the dataset_group the CalCOFI
 *  archives are named and layered by) */
export const sourceLayerOf = (d: SpatialLayerDef): string => d.source_layer || d.source;

/** the MapLibre vector source a PMTiles row draws from. An external row owns its source (keyed by id, since two
 *  gazetteer rows never share an archive); a CalCOFI row shares one per `source` (the maritime-zone rows share
 *  `noaa_maritime_boundaries`). `base` is only the fallback host. */
export function pmtilesSource(d: SpatialLayerDef, base: string): { srcId: string; url: string; layer: string } {
  const ext = isExternalPmtiles(d);
  return { srcId: ext ? `sp-${d.id}` : `sp-${d.source}`, url: `pmtiles://${ext ? d.source_url : `${base}${d.source}.pmtiles`}`, layer: sourceLayerOf(d) };
}

/** the release sidecar's registry plus what the bundled snapshot owns outside a release: the reference rows a sidecar
 *  predates (D52), and the external (gazetteer-backed) rows — which REPLACE a same-id sidecar row that has no
 *  `source_url` (boem_wind_planning in v2026.08.25 points at the old CalCOFI archive), so a link's slug keeps working
 *  and now draws the gazetteer tiles. A sidecar row that already carries its own `source_url` wins (the external
 *  registry has caught up). Ids the sidecar does not know are appended. */
export function mergeRegistry(sidecar: SpatialLayers, bundled: SpatialLayers): SpatialLayers {
  const ext = new Map(bundled.layers.filter(isExternalPmtiles).map((d) => [d.id, d]));
  const ids = new Set(sidecar.layers.map((d) => d.id));
  // a retired row a release still lists (noaa_aoa_socal in v2026.10.13) goes when its successor is there: one layer, once
  const layers = sidecar.layers.filter((x) => !(SLUG_ALIAS[x.id] && ids.has(SLUG_ALIAS[x.id])))
    .map((x) => (!x.source_url && ext.has(x.id) ? ext.get(x.id)! : x));
  const have = new Set(layers.map((d) => d.id));
  const extra = bundled.layers.filter((d) => !have.has(d.id) && (d.role === "reference" || isExternalPmtiles(d)));
  return { ...sidecar, layers: [...layers, ...extra] };
}

/** retired slugs that live on in links: `noaa_aoa_socal` (the gazetteer AOA row added in explore#16) merged into
 *  `noaa_aquaculture_aoas` (2026-10-14: one row, drawn from the gazetteer, region names CN1-A … N2-E unchanged) */
export const SLUG_ALIAS: Record<string, string> = { noaa_aoa_socal: "noaa_aquaculture_aoas" };
export const aliasSlug = (slug: string): string => SLUG_ALIAS[slug] ?? slug;

/** a `layers=` list with retired slugs renamed to their successor; a successor already in the list keeps its own
 *  entry (and place), so the merged layer is drawn once */
export function aliasLayers<T extends { id: string }>(ls: T[] | null): T[] | null {
  if (!ls) return ls;
  const seen = new Set<string>();
  return ls.flatMap((l) => {
    const id = aliasSlug(l.id);
    if (seen.has(id)) return [];
    seen.add(id);
    return [id === l.id ? l : { ...l, id }];
  });
}

/** the draw list's entries that exist in the registry: an unknown slug (an older link after a rename) draws nothing
 *  (D26); a retired slug resolves to its successor */
export const resolveSlug = (defs: SpatialLayerDef[], slug: string): SpatialLayerDef | null =>
  defs.find((d) => d.id === aliasSlug(slug)) ?? defs.find((d) => d.id === slug) ?? null;

/** the hover popup for a boundary feature: "{name} · {layer (status)}" then one `Label: value` line per `popup_fields`
 *  entry the feature carries (empty values are skipped) */
export function boundaryTooltip(props: Record<string, any> | null | undefined, d: SpatialLayerDef | undefined): string {
  const nm = props?.name, ln = layerLabel(d);
  const head = nm && d ? `${nm} · ${ln}` : (nm ?? ln);
  const lines = (d?.popup_fields ?? []).flatMap((k) => {
    const v = props?.[k];
    return v == null || v === "" ? [] : [`${k.charAt(0).toUpperCase()}${k.slice(1).replace(/_/g, " ")}: ${v}`];
  });
  return [head, ...lines].filter(Boolean).join("\n");
}

// ── dated status (contract 2026-10-14): the gazetteer documents a layer's status and date instead of baking them into
// its title ("BOEM Wind Planning Areas", status rescinded 2025-07-30), and the release lists each region's own status
// (`region_status`). The app words them; every field is optional, so a v2026.10.13 sidecar reads exactly as before.

/** "rescinded 2025-07-30": the value with `_` -> space, then the date when there is one; "" for no status */
export const statusWord = (value: string | null | undefined, date?: string | null): string =>
  value ? [value.replace(/_/g, " "), date || ""].filter(Boolean).join(" ") : "";

/** the layer as every list names it: "BOEM Wind Planning Areas (rescinded 2025-07-30)" — the sidecar's
 *  `status_label`, else one worded from `status`, else the plain name */
export function layerLabel(d: Pick<SpatialLayerDef, "name" | "status" | "status_label"> | undefined | null): string {
  if (!d) return "";
  const s = d.status_label || statusWord(d.status?.value, d.status?.date);
  return s ? `${d.name} (${s})` : d.name;
}

/** the region option: "OCS-P 0561 (relinquished 2026-09-03) (12 samples)"; without a status "Monterey Bay (812 samples)" */
export function regionLabel(name: string, rs: Pick<RegionStatus, "status" | "status_date"> | null | undefined, n: number | null,
  fmtN: (x: number) => string = (x) => x.toLocaleString()): string {
  const s = statusWord(rs?.status, rs?.status_date);
  return `${name}${s ? ` (${s})` : ""}${n != null ? ` (${fmtN(n)} samples)` : ""}`;
}

/** the release's per-region status, by name (empty without `region_status`) */
export const regionStatusMap = (d: Pick<SpatialLayerDef, "region_status"> | undefined | null): Map<string, RegionStatus> =>
  new Map((d?.region_status ?? []).filter((r) => r && r.name).map((r) => [r.name, r]));

/** a row the Area picker lists at all: a boundary layer of areas, lines or points (rasters, label sets and the
 *  reference layers are not regions and are not listed) */
export const isAreaCandidate = (d: SpatialLayerDef): boolean => d.role !== "reference" && d.geom !== "raster" && d.geom !== "label";

/** why a listed layer cannot be picked: null when it can (the release intersected it with its samples — membership
 *  wins over the registry's geometry); points and lines enclose nothing; otherwise the release did not intersect it */
export function areaLayerReason(d: Pick<SpatialLayerDef, "geom">, inSampleIndex: boolean): string | null {
  if (inSampleIndex) return null;
  if (d.geom === "point") return "points: no area";
  if (d.geom === "line") return "lines: no area";
  return "not in this release's sample index";
}
