// "+ Add a variable" in every view (src/addvar.ts): which views show the button, what it says, what a press sets, and
// what closing the picker without a choice puts back. scripts/lean_check.mjs add_variable presses it in Chrome.
import { describe, expect, it } from "vitest";
import { addVarButton, addVarClose, addVarPress, var2Shows, ADD_VAR } from "../src/addvar";
import type { Lens } from "../src/state";

const LENSES: Lens[] = ["station", "hex", "contour", "cruise", "region", "section"];

describe("the button", () => {
  it("is offered in EVERY view (it was drawn in the Hexagon view only, and the default view is Stations)", () => {
    for (const l of LENSES) { expect(var2Shows(l, null)).toBe("add"); expect(addVarButton(l).text).toBe(ADD_VAR); }
  });
  it("in the Hexagon view it is as before: no parenthetical, no switch", () => {
    expect(addVarButton("hex")).toEqual({ text: "+ Add a variable", note: null, toHex: false, title: "compare with a water measurement, hexagon by hexagon", aria: "Add a variable" });
  });
  it("in any other view it carries a quiet parenthetical, and its title and name say it switches the map to hexagons", () => {
    for (const l of LENSES.filter((x) => x !== "hex")) {
      const b = addVarButton(l);
      expect(b.note).toBe("(Hexagon view)"); expect(b.toHex).toBe(true);
      expect(b.title).toMatch(/switches the map to the Hexagon view/); expect(b.aria).toBe("Add a variable: switches the map to the Hexagon view");
    }
  });
});

describe("a press, and the picker closing", () => {
  it("in the Hexagon view a press sets nothing and there is nothing to go back to", () => {
    expect(addVarPress("hex")).toEqual({ set: null, back: null });
  });
  it("in another view a press sets lens=hex and remembers the view", () => {
    expect(addVarPress("station")).toEqual({ set: { lens: "hex" }, back: "station" });
    expect(addVarPress("region")).toEqual({ set: { lens: "hex" }, back: "region" });
    expect(addVarPress("section")).toEqual({ set: { lens: "hex" }, back: "section" });
  });
  it("closing without a choice puts the view back; a choice keeps the Hexagon view", () => {
    expect(addVarClose("station", false)).toEqual({ lens: "station" });
    expect(addVarClose("station", true)).toBeNull();
    expect(addVarClose(null, false)).toBeNull();          // opened from the Hexagon view (or by Change)
    expect(addVarClose("hex", false)).toBeNull();
  });
});

describe("a variable already added, in another view", () => {
  it("its card stays, saying where it is shown; it is not dropped", () => {
    expect(var2Shows("hex", "temperature")).toBe("card");
    for (const l of LENSES.filter((x) => x !== "hex")) expect(var2Shows(l, "temperature")).toBe("elsewhere");
  });
});
