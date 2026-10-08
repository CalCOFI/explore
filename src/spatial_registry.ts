// the spatial-layers registry's pure rules (no maplibre, no DOM — tests/spatial_registry.test.ts asserts them):
// where a row's PMTiles come from, what its vector layer is called, how the bundled snapshot merges into a release's
// sidecar, and what the hover popup says. basemap.ts draws with these; App.tsx merges and words the tooltip with them.
import type { SpatialLayerDef, SpatialLayers } from "./basemap";

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
  const layers = sidecar.layers.map((x) => (!x.source_url && ext.has(x.id) ? ext.get(x.id)! : x));
  const have = new Set(layers.map((d) => d.id));
  const extra = bundled.layers.filter((d) => !have.has(d.id) && (d.role === "reference" || isExternalPmtiles(d)));
  return { ...sidecar, layers: [...layers, ...extra] };
}

/** the draw list's entries that exist in the registry: an unknown slug (an older link after a rename) draws nothing (D26) */
export const resolveSlug = (defs: SpatialLayerDef[], slug: string): SpatialLayerDef | null => defs.find((d) => d.id === slug) ?? null;

/** the hover popup for a boundary feature: "{name} · {layer}" then one `Label: value` line per `popup_fields` entry the
 *  feature carries (empty values are skipped) */
export function boundaryTooltip(props: Record<string, any> | null | undefined, d: SpatialLayerDef | undefined): string {
  const nm = props?.name;
  const head = nm && d ? `${nm} · ${d.name}` : (nm ?? d?.name ?? "");
  const lines = (d?.popup_fields ?? []).flatMap((k) => {
    const v = props?.[k];
    return v == null || v === "" ? [] : [`${k.charAt(0).toUpperCase()}${k.slice(1).replace(/_/g, " ")}: ${v}`];
  });
  return [head, ...lines].filter(Boolean).join("\n");
}
