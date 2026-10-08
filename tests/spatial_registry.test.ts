// the spatial-layers registry's gazetteer rules (plan 2026-10-08): a pmtiles row honours its own `source_url` and
// `source_layer` and falls back to the CalCOFI bucket layout (`${base}${source}.pmtiles`, layer = source) when they are
// absent; the old `boem_wind_planning` slug keeps resolving, now to the gazetteer; an unknown slug draws nothing; the
// Oct 2 permalink parses and draws a wind layer from the gazetteer URL; the popup lists status + status_date.
import { afterEach, describe, expect, it, vi } from "vitest";

// basemap.ts registers the pmtiles protocol at import: the draw path is asserted on the style object, not on a map
vi.mock("maplibre-gl", () => ({ addProtocol: () => {} }));
vi.mock("pmtiles", () => ({ Protocol: class { tile() {} } }));

import fallback from "../src/spatial_layers.fallback";
import { boundaryTooltip, isExternalPmtiles, mergeRegistry, pmtilesSource, resolveSlug, sourceLayerOf } from "../src/spatial_registry";
import { composeStyle, type BathyState, type SpatialLayerDef, type SpatialLayers } from "../src/basemap";
import { fromUrl } from "../src/state";

const BUNDLED = fallback as unknown as SpatialLayers;
const BASE = "https://example.test/_spatial/";
const WIND = "https://storage.oceanmetrics.io/gazetteer/boem_wind_leases/places.pmtiles";
const PERMALINK = "?lens=contour&inputs=on&var=temperature&map=-121.3568,35.4164,7.68&layers=gebco_gazetteer,boem_wind_planning,data&ramp=balance";

const row = (o: Partial<SpatialLayerDef> & { id: string }): SpatialLayerDef => ({
  group: "g", name: o.id, source: o.id, geom: "polygon", role: "boundary", source_type: "pmtiles", source_url: null,
  filter: null, line_color: "#111111", fill_color: "#222222", line_width: 1, fill_opacity: 0.2, default_visible: false,
  name_field: "name", description: null, attribution: "A", n_features: 0, bbox: null, names: null, n_memberships: 0, ...o });

/** the old release sidecar's boem row: CalCOFI archive, no source_url, 809 memberships */
const OLD_SIDECAR: SpatialLayers = { version: "v2026.08.25", pmtiles_base: BASE, built: null, layers: [
  row({ id: "noaa_maritime_ts", source: "noaa_maritime_boundaries" }),
  row({ id: "boem_wind_planning", name: "BOEM Wind Planning Areas", n_memberships: 809, n_features: 9833 })] };

const bathy: BathyState = { parts: [], opacity: null, land: false, baseLabels: true, baseLabelOpacity: null };
const baseStyle = () => ({ version: 8, sources: {}, layers: [{ id: "background", type: "background" }, { id: "water", type: "fill", source: "x" }] });
const draw = (defs: SpatialLayerDef[], slugs: string[]) => composeStyle(baseStyle(), "light", { ...bathy, parts: ["relief"] }, true,
  { base: BASE, defs, styles: slugs.map((id) => ({ id, color: null, fillOpacity: null, lineWidth: null })), regionOutline: null });

afterEach(() => vi.unstubAllGlobals());

describe("pmtilesSource — source_url / source_layer honoured, the CalCOFI bucket layout as the fallback", () => {
  it("a row without source_url or source_layer: ${base}${source}.pmtiles, layer = source, source shared by `source`", () => {
    const d = row({ id: "noaa_maritime_cz", source: "noaa_maritime_boundaries" });
    expect(pmtilesSource(d, BASE)).toEqual({ srcId: "sp-noaa_maritime_boundaries", url: `pmtiles://${BASE}noaa_maritime_boundaries.pmtiles`, layer: "noaa_maritime_boundaries" });
    expect(isExternalPmtiles(d)).toBe(false);
  });
  it("a row with source_url + source_layer: the absolute URL (not the base), the named layer, its own source id", () => {
    const d = row({ id: "boem_wind_planning", source: "boem_wind_leases", source_url: WIND, source_layer: "boem_wind_leases" });
    expect(pmtilesSource(d, BASE)).toEqual({ srcId: "sp-boem_wind_planning", url: `pmtiles://${WIND}`, layer: "boem_wind_leases" });
    expect(isExternalPmtiles(d)).toBe(true);
  });
  it("source_layer alone (CalCOFI archive, layer name differs) changes the layer, not the URL; source_url alone keeps layer = source", () => {
    expect(pmtilesSource(row({ id: "a", source: "grp", source_layer: "lyr" }), BASE)).toMatchObject({ url: `pmtiles://${BASE}grp.pmtiles`, layer: "lyr" });
    expect(pmtilesSource(row({ id: "a", source: "grp", source_url: "https://h/x.pmtiles" }), BASE)).toMatchObject({ url: "pmtiles://https://h/x.pmtiles", layer: "grp" });
    expect(sourceLayerOf(row({ id: "a", source: "grp", source_layer: "" }))).toBe("grp");
  });
  it("a raster row's source_url is a tile template, never a pmtiles archive", () => {
    expect(isExternalPmtiles(row({ id: "esri", geom: "raster", source_type: "raster", source_url: "https://t/{z}/{y}/{x}" }))).toBe(false);
  });
  it("the composed style draws the row from source_url / source_layer, and a fallback row from the base", () => {
    const s = draw([...BUNDLED.layers, row({ id: "plain", source: "plain_grp" })], ["plain", "boem_wind_planning"]);
    expect(s.sources["sp-boem_wind_planning"]).toMatchObject({ type: "vector", url: `pmtiles://${WIND}`, attribution: "BOEM" });
    expect(s.sources["sp-plain_grp"].url).toBe(`pmtiles://${BASE}plain_grp.pmtiles`);
    const wind = s.layers.filter((l: any) => l.source === "sp-boem_wind_planning");
    expect(wind.map((l: any) => l.id).sort()).toEqual(["sp-boem_wind_planning-fill", "sp-boem_wind_planning-line"]);
    expect(wind.every((l: any) => l["source-layer"] === "boem_wind_leases")).toBe(true);
    expect(s.layers.find((l: any) => l.id === "sp-plain-fill")["source-layer"]).toBe("plain_grp");
  });
});

describe("the bundled registry — gazetteer rows", () => {
  const ids = ["boem_wind_planning", "boem_wind_planning_rescinded", "boem_ocs_planning", "boem_program_11_draft", "boem_pacific_og_leases", "noaa_aoa_socal"];
  it("boem_wind_planning is BOEM Wind Leases on the gazetteer archive, popup = name + status + status_date", () => {
    const d = resolveSlug(BUNDLED.layers, "boem_wind_planning")!;
    expect(d).toMatchObject({ name: "BOEM Wind Leases", role: "boundary", group: "Energy & Industry", source_type: "pmtiles", source_url: WIND, source_layer: "boem_wind_leases", attribution: "BOEM" });
    expect(d.popup_fields).toEqual(expect.arrayContaining(["status", "status_date"]));
  });
  it("the five new boundary rows: gazetteer/<slug>/places.pmtiles, source_layer = slug, BOEM or NOAA Fisheries", () => {
    for (const id of ids.slice(1)) {
      const d = resolveSlug(BUNDLED.layers, id)!;
      expect(d, id).toMatchObject({ role: "boundary", source_type: "pmtiles", source_url: `https://storage.oceanmetrics.io/gazetteer/${id}/places.pmtiles`, source_layer: id });
      expect(["BOEM", "NOAA Fisheries"]).toContain(d.attribution);
    }
    expect(resolveSlug(BUNDLED.layers, "noaa_aoa_socal")!.attribution).toBe("NOAA Fisheries");
  });
  it("every row id is unique, so no slug resolves two ways", () => {
    expect(new Set(BUNDLED.layers.map((d) => d.id)).size).toBe(BUNDLED.layers.length);
  });
});

describe("slug resolution — unknown vs the kept boem_wind_planning slug", () => {
  it("an old release sidecar's boem_wind_planning is replaced by the gazetteer row; other sidecar rows are untouched", () => {
    const m = mergeRegistry(OLD_SIDECAR, BUNDLED);
    const d = resolveSlug(m.layers, "boem_wind_planning")!;
    expect(d.source_url).toBe(WIND);
    expect(d.name).toBe("BOEM Wind Leases");
    expect(m.layers.filter((x) => x.id === "boem_wind_planning")).toHaveLength(1);
    expect(resolveSlug(m.layers, "noaa_maritime_ts")).toBe(OLD_SIDECAR.layers[0]);
    expect(m.layers.map((x) => x.id)).toEqual(expect.arrayContaining(["boem_ocs_planning", "noaa_aoa_socal", "gebco_gazetteer", "osm_land"]));
  });
  it("a sidecar row that already carries its own source_url wins (the external registry has caught up)", () => {
    const own = row({ id: "boem_wind_planning", source_url: "https://elsewhere/x.pmtiles", source_layer: "x" });
    expect(resolveSlug(mergeRegistry({ ...OLD_SIDECAR, layers: [own] }, BUNDLED).layers, "boem_wind_planning")).toBe(own);
  });
  it("an unknown slug resolves to nothing and draws nothing; the known one still draws (D26)", () => {
    const m = mergeRegistry(OLD_SIDECAR, BUNDLED);
    expect(resolveSlug(m.layers, "boem_wind_planing")).toBeNull();
    const s = draw(m.layers, ["no_such_layer", "boem_wind_planning"]);
    expect(Object.keys(s.sources).filter((k) => k.startsWith("sp-"))).toEqual(["sp-boem_wind_planning"]);
  });
});

describe("the Oct 2 permalink", () => {
  it("parses, keeps boem_wind_planning in the list and draws it from the gazetteer URL", () => {
    vi.stubGlobal("location", { search: PERMALINK, pathname: "/explore/" });
    const sel = fromUrl();
    expect(sel.layers!.map((l) => l.id)).toEqual(["gebco_gazetteer", "boem_wind_planning", "data"]);
    expect(sel.ramp).toBe("balance");
    const m = mergeRegistry(OLD_SIDECAR, BUNDLED);
    const s = draw(m.layers, sel.layers!.map((l) => l.id));
    expect(s.sources["sp-boem_wind_planning"].url).toBe(`pmtiles://${WIND}`);
    expect(s.layers.some((l: any) => l.id === "sp-boem_wind_planning-fill")).toBe(true);
  });
});

describe("boundaryTooltip — name, layer, then the popup_fields the feature carries", () => {
  const wind = resolveSlug(BUNDLED.layers, "boem_wind_planning")!;
  it("OCS-P 0561: lease name + status + status_date", () => {
    expect(boundaryTooltip({ name: "OCS-P 0561", status: "relinquished", status_date: "2026-09-03" }, wind))
      .toBe("OCS-P 0561 · BOEM Wind Leases\nStatus: relinquished\nStatus date: 2026-09-03");
  });
  it("a missing or empty field is skipped; a row without popup_fields keeps the old 'name · layer' line", () => {
    expect(boundaryTooltip({ name: "OCS-P 0561", status: "active", status_date: "" }, wind)).toBe("OCS-P 0561 · BOEM Wind Leases\nStatus: active");
    expect(boundaryTooltip({ name: "Alaska", status: "x" }, row({ id: "t", name: "12NM Territorial Sea" }))).toBe("Alaska · 12NM Territorial Sea");
    expect(boundaryTooltip({}, row({ id: "t", name: "T" }))).toBe("T");
  });
});
