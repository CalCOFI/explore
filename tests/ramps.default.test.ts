// WS-R6 (plan 2026-09-15 D4 · Q3): "cmocean by the Explorer's rules + the R6 audit" — the ramp a lens draws with
// no ramp= in the URL is ramps.ts's rule and NOTHING ELSE. Before this change the section heatmap (charts.tsx
// SectionPlot), the section's 3-D curtain (curtain.tsx Curtain3D) and the year strip's cruise calendar
// (charts.tsx YearStrip) each carried their own colour logic — Plotly's "Viridis" string, a hand-rolled
// RAMP_DIV/divergingAt (not "balance"), or colorScale() called with NO ramp id at all (silently viridis) — so a
// lens could disagree with the map/legend for the same variable. They now all resolve through lensRamp() /
// seriesRamp() below, which are the same functions App.tsx calls, so this file is the regression guard for the
// wiring, not just the per-variable regex table.
import { describe, expect, it } from "vitest";
import { defaultRamp, lensRamp, RAMPS, rampPlotly, seriesRamp } from "../src/ramps";

// one representative variable per cmocean group (plan D4's list) + a bio variable (no per-taxon convention: the
// bio realm always draws viridis) — this is the "before/after" table's row set in the WS-R6 hand-back
const GROUPS: { group: string; realm: "bio" | "env"; v: string; want: string }[] = [
  { group: "temperature", realm: "env", v: "temperature", want: "thermal" },
  { group: "salinity", realm: "env", v: "salinity", want: "haline" },
  { group: "oxygen", realm: "env", v: "oxygen_ml_l", want: "ice" },
  { group: "chlorophyll/fluorescence", realm: "env", v: "chlorophyll_a", want: "algae" },
  { group: "density", realm: "env", v: "sigma_t", want: "dense" },
  { group: "nutrients", realm: "env", v: "nitrate_ugat_l", want: "tempo" },
  { group: "PAR/light", realm: "env", v: "par", want: "solar" },
  { group: "a bio variable", realm: "bio", v: "worms:172759", want: "viridis" },
];

describe("defaultRamp() — the one variable -> ramp rule", () => {
  for (const g of GROUPS) it(`${g.group} (${g.v}) -> ${g.want}`, () => expect(defaultRamp(g.realm, g.v, false)).toBe(g.want));
  it("an anomaly is always balance, for every group, regardless of realm", () => {
    for (const g of GROUPS) expect(defaultRamp(g.realm, g.v, true)).toBe("balance");
  });

  // WS-R2 parity check (2026-09-16): RAMP_OF on the landing site copies defaultRamp() verbatim, and found these
  // two regex-order bugs by exercising real column names, not the one-per-group table above
  it("sigma_theta (potential density) is dense, not thermal — density is tested before temperature", () => {
    expect(defaultRamp("env", "sigma_theta", false)).toBe("dense");
  });
  it("wind_dir_deg is a direction, not a speed — falls to the default ramp, not speed", () => {
    expect(defaultRamp("env", "wind_dir_deg", false)).toBe("viridis");
  });
  it("a true wind speed still gets the speed ramp", () => {
    expect(defaultRamp("env", "wind_speed_kt", false)).toBe("speed");
  });
});

// map / hex / region / cruise dots, the contour surface, the section heatmap and the section's 3-D curtain all
// draw lensRamp(sel) — one call site, so this is the table for all four at once
describe("lensRamp() — map · contour · section (2-D + 3-D)", () => {
  for (const g of GROUPS) it(`${g.group}: no anomaly -> ${g.want}, in every lens`, () => {
    for (const lens of ["station", "hex", "region", "cruise", "contour", "section"]) {
      expect(lensRamp({ ramp: null, realm: g.realm, var: g.v, anom: false, lens })).toBe(g.want);
    }
  });

  it("anom=1 on the section lens (env realm) is balance, for every env group", () => {
    for (const g of GROUPS.filter((g) => g.realm === "env")) {
      expect(lensRamp({ ramp: null, realm: "env", var: g.v, anom: true, lens: "section" })).toBe("balance");
    }
  });
  it("anom has no effect off the section lens — the map and contour never draw an anomaly", () => {
    for (const lens of ["station", "hex", "region", "cruise", "contour"]) {
      expect(lensRamp({ ramp: null, realm: "env", var: "temperature", anom: true, lens })).toBe("thermal");
    }
  });
  it("anom on a bio section stays viridis — a bio section has no climatology to diff against", () => {
    expect(lensRamp({ ramp: null, realm: "bio", var: "worms:172759", anom: true, lens: "section" })).toBe("viridis");
  });
  it("a manual ramp= always wins, anomaly or not", () => {
    expect(lensRamp({ ramp: "matter", realm: "env", var: "temperature", anom: true, lens: "section" })).toBe("matter");
    expect(lensRamp({ ramp: "matter", realm: "env", var: "temperature", anom: false, lens: "station" })).toBe("matter");
  });
});

// the year strip's cruise calendar (the "time series" lens in the plan): it colours a cruise's own summary stat,
// never a difference from climatology, so it carries no anomaly argument at all and never turns balance
describe("seriesRamp() — the year strip's cruise calendar", () => {
  for (const g of GROUPS) it(`${g.group} -> ${g.want}`, () => expect(seriesRamp({ ramp: null, realm: g.realm, var: g.v })).toBe(g.want));
  it("a manual ramp= wins here too", () => expect(seriesRamp({ ramp: "gray", realm: "env", var: "temperature" })).toBe("gray"));
});

describe("rampPlotly() — the Plotly colorscale a section heatmap/curtain draws (never Plotly's own named scales)", () => {
  it("balance stays diverging end to end: navy at 0, maroon at 1", () => {
    const cs = rampPlotly("balance");
    expect(cs[0]).toEqual([0, "rgb(24,28,67)"]);
    expect(cs[cs.length - 1]).toEqual([1, "rgb(60,9,18)"]);
  });
  it("every ramp's Plotly stops match its own stop count, evenly spaced 0..1", () => {
    for (const id of Object.keys(RAMPS)) {
      const cs = rampPlotly(id);
      expect(cs.length).toBe(RAMPS[id].stops.length);
      expect(cs[0][0]).toBe(0);
      expect(cs[cs.length - 1][0]).toBe(1);
    }
  });
});

// the per-cast grain (plan 2026-10-02 D2, explore#13): a per-cast type's NAME encodes its criterion, not its quantity —
// mld_sigma_theta_002 is a depth in metres, not a density; mld_temperature_02 is not a temperature; chl_max_depth is not
// a chlorophyll. The name regex above gets five of v2026.10.01's seven per-cast types wrong, so a per-cast variable
// hands the rule its REGISTRY units: metres is a depth and draws `deep`. A per-bin variable passes no registry hint
// and keeps the name rule, unchanged.
describe("defaultRamp() with the registry's units — per-cast variables", () => {
  const cast = (units: string | null) => ({ grain: "cast" as const, units });
  it("the name alone is wrong for a per-cast depth (why the hint exists)", () => {
    expect(defaultRamp("env", "mld_sigma_theta_002", false)).toBe("dense");
    expect(defaultRamp("env", "mld_temperature_02", false)).toBe("thermal");
    expect(defaultRamp("env", "chl_max_depth", false)).toBe("algae");
  });
  it("a per-cast value in metres is a depth: deep, whatever its name says", () => {
    for (const v of ["mld_sigma_theta_002", "mld_sigma_theta_0125", "mld_temperature_02", "chl_max_depth", "chl_integrated_depth", "a_type_renamed_next_release"])
      expect(defaultRamp("env", v, false, cast("m"))).toBe("deep");
  });
  it("a per-cast value in any other unit keeps the name rule (chlorophyll at its maximum, integrated chlorophyll)", () => {
    expect(defaultRamp("env", "chl_max", false, cast("ug/L"))).toBe("algae");
    expect(defaultRamp("env", "chl_integrated", false, cast("mg/m2"))).toBe("algae");
    expect(defaultRamp("env", "mld_sigma_theta_002", false, cast(null))).toBe("dense"); // no units in the registry = no hint
  });
  it("a per-bin variable is untouched by the units rule, even in metres", () => {
    expect(defaultRamp("env", "sigma_theta", false, { grain: "bin", units: "m" })).toBe("dense");
  });
  it("lensRamp() and seriesRamp() pass the hint through; a manual ramp= still wins", () => {
    for (const lens of ["station", "hex", "region", "cruise", "contour", "section"])
      expect(lensRamp({ ramp: null, realm: "env", var: "mld_sigma_theta_002", anom: false, lens }, cast("m"))).toBe("deep");
    expect(seriesRamp({ ramp: null, realm: "env", var: "mld_temperature_02" }, cast("m"))).toBe("deep");
    expect(lensRamp({ ramp: "matter", realm: "env", var: "mld_sigma_theta_002", anom: false, lens: "station" }, cast("m"))).toBe("matter");
  });
});
