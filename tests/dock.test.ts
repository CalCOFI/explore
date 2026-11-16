// the bottom docks (Time, Section / Cruise, the depth × time card) never sit over the open Find data panel (src/dock.ts):
// they start just right of it, take the full width when it is folded, and a dragged / resized dock steps clear of it
import { describe, expect, it } from "vitest";
import { clearOf, dockBand, DOCK_EDGE, DOCK_RIGHT } from "../src/dock";

const box = { width: 1400, height: 790 };
const lean = { left: 10, top: 10, right: 332, bottom: 780 }; // the lean panel: full height, 320 px wide (+ its border)

describe("dockBand", () => {
  it("runs right of the open panel, 8 px clear (the old fixed 340 for the default panel)", () => {
    expect(dockBand(lean, box, 178)).toEqual({ left: 340, right: DOCK_RIGHT });
  });
  it("takes the full width when the panel is folded or maximized (null)", () => {
    expect(dockBand(null, box, 178)).toEqual({ left: DOCK_EDGE, right: DOCK_RIGHT });
  });
  it("follows a panel resized wider", () => {
    expect(dockBand({ ...lean, right: 492 }, box, 178).left).toBe(500);
  });
  it("takes the full width when the panel stops above the dock (classic: the panel ends where the Time panel starts)", () => {
    expect(dockBand({ ...lean, bottom: box.height - 160 }, box, 160)).toEqual({ left: DOCK_EDGE, right: DOCK_RIGHT });
    expect(dockBand({ ...lean, bottom: box.height - 159 }, box, 160).left).toBe(DOCK_EDGE); // a pixel of rounding is not an overlap
    expect(dockBand({ ...lean, bottom: box.height - 150 }, box, 160).left).toBe(340);
  });
  it("goes left of a panel dragged so far right that the room on its right is too narrow", () => {
    const right = { left: 1100, top: 10, right: 1300, bottom: 780 };
    expect(dockBand(right, box, 178)).toEqual({ left: DOCK_EDGE, right: box.width - 1100 + 8 });
  });
  it("keeps a custom right inset", () => {
    expect(dockBand(lean, box, box.height, 230)).toEqual({ left: 340, right: 230 });
  });
});

describe("clearOf", () => {
  it("moves a full-width Time panel (stored from a folded panel or classic) right of the open panel, keeping its right edge", () => {
    expect(clearOf({ left: 10, top: 612, width: 1330, height: 168 }, lean, 180)).toEqual({ left: 340, width: 1000 });
  });
  it("leaves a dock that does not overlap the panel alone", () => {
    expect(clearOf({ left: 400, top: 612, width: 900, height: 168 }, lean, 180)).toEqual({ left: 400, width: 900 });
    expect(clearOf({ left: 10, top: 612, width: 1330, height: 168 }, { ...lean, bottom: 600 }, 180)).toEqual({ left: 10, width: 1330 });
    expect(clearOf({ left: 10, top: 612, width: 1330, height: 168 }, null, 180)).toEqual({ left: 10, width: 1330 });
  });
  it("keeps the minimum width when the dock lay wholly under the panel", () => {
    expect(clearOf({ left: 20, top: 612, width: 200, height: 168 }, lean, 180)).toEqual({ left: 340, width: 180 });
  });
  it("ends just left of a panel dragged over the dock's right half", () => {
    expect(clearOf({ left: 10, top: 612, width: 1330, height: 168 }, { left: 1000, top: 10, right: 1320, bottom: 780 }, 180)).toEqual({ left: 10, width: 982 });
  });
});
