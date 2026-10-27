// explore#39 (2026-10-27): CARTO's basemap moved from OpenMapTiles (`class`) to Protomaps (`kind`) and the land mask's
// inland-water copy, filtered on `class != "ocean"`, matched the whole sea — the station dots and hexagons drew under
// it. The filter is evaluated here by MapLibre's own style-spec, against a water feature of each schema.
import { describe, expect, it, vi } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";

vi.mock("maplibre-gl", () => ({ addProtocol: () => {} }));
vi.mock("pmtiles", () => ({ Protocol: class { tile() {} } }));

import { INLAND_WATER_FILTER } from "../src/basemap";

const keep = featureFilter(INLAND_WATER_FILTER);
const poly = (properties: Record<string, unknown>) => ({ type: 3 as const, properties, geometry: [] as any });
const ok = (f: ReturnType<typeof poly>) => keep.filter({ zoom: 6 } as any, f as any);

describe("inland water (land mask copy of CARTO's water)", () => {
  it("drops the ocean in the Protomaps schema (kind)", () => expect(ok(poly({ kind: "ocean" }))).toBe(false));
  it("drops the ocean in the OpenMapTiles schema (class)", () => expect(ok(poly({ class: "ocean" }))).toBe(false));
  it("keeps a Protomaps lake", () => expect(ok(poly({ kind: "lake" }))).toBe(true));
  it("keeps an OpenMapTiles lake", () => expect(ok(poly({ class: "lake" }))).toBe(true));
  it("keeps a water polygon with neither property", () => expect(ok(poly({}))).toBe(true));
  it("drops lines (waterways have their own layer)", () =>
    expect(keep.filter({ zoom: 6 } as any, { type: 2, properties: { kind: "river" }, geometry: [] } as any)).toBe(false));
});
