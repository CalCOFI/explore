// "+ Add a variable" in every view (Ben, 2026-11-17: "switch Add Variable to every view, perhaps with a parenthetical of
// '(hex only)' or similar"). The comparison itself is by hexagon: the second variable is averaged into the same
// hexagons as the first (`lens=hex&var2=…`). Until now the button was drawn only in the Hexagon view, and the default
// view is Stations, so a reader could not find it. Pure rules, pinned by tests/addvar.test.ts; App.tsx draws them.
import type { Lens } from "./state";

export const ADD_VAR = "+ Add a variable";
/** the quiet parenthetical the button carries outside the Hexagon view */
export const ADD_VAR_NOTE = "(Hexagon view)";

/** the button of step 1, in any view: in Hexagons as before; elsewhere it says the comparison is by hexagon, and a press
 *  switches the map there */
export function addVarButton(lens: Lens): { text: string; note: string | null; title: string; aria: string; toHex: boolean } {
  const toHex = lens !== "hex";
  return {
    text: ADD_VAR, note: toHex ? ADD_VAR_NOTE : null, toHex,
    title: toHex ? "compare with a water measurement, hexagon by hexagon — this switches the map to the Hexagon view" : "compare with a water measurement, hexagon by hexagon",
    aria: toHex ? "Add a variable: switches the map to the Hexagon view" : "Add a variable",
  };
}

/** what a press sets, and the view to go back to if the picker is closed without a choice (null = stay) */
export function addVarPress(lens: Lens): { set: { lens: "hex" } | null; back: Lens | null } {
  return lens === "hex" ? { set: null, back: null } : { set: { lens: "hex" }, back: lens };
}

/** the picker closed: a choice keeps the Hexagon view; none puts the view back where the press found it */
export function addVarClose(back: Lens | null, picked: boolean): { lens: Lens } | null {
  return !picked && back && back !== "hex" ? { lens: back } : null;
}

/** what step 1 shows for the added variable: the button, its card (Hexagon view), or — in another view with one already
 *  added — the card with a line saying where it is shown. It is never dropped by a change of view: `var2` stays in the link. */
export function var2Shows(lens: Lens, var2: string | null): "add" | "card" | "elsewhere" {
  return !var2 ? "add" : lens === "hex" ? "card" : "elsewhere";
}
