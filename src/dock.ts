// where the panels docked along the map's bottom (Time, the Section / Cruise result, the depth × time card, the bottom
// pills) run, so they never sit over the Find data panel. Pure geometry in px of the map's box: App.tsx measures the
// panel (panels.tsx reports its rectangle) and lays the bottom docks out from it; tests/dock.test.ts holds the rules.

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Band { left: number; right: number } // insets from the box's left and right edges
export const DOCK_EDGE = 10;   // the docks' inset from the box's left edge when nothing is in the way
export const DOCK_RIGHT = 60;  // and from its right edge (the map's buttons)
export const DOCK_GAP = 8;     // between the panel's edge and a dock beside it
export const DOCK_MIN = 360;   // narrower than this right of the panel, a dock goes to the panel's left instead (if that is wider)

/** the band a bottom dock runs in: the full width when the panel is closed or does not reach down into the dock's
 *  height (`reach`, px up from the box's bottom), else right of the panel — or left of it, when the panel was dragged so
 *  far right that the room on its left is wider and the room on its right is under DOCK_MIN */
export function dockBand(panel: Rect | null, box: { width: number; height: number }, reach: number, right = DOCK_RIGHT): Band {
  const full: Band = { left: DOCK_EDGE, right };
  if (!panel) return full;
  const bandTop = box.height - reach, bandL = DOCK_EDGE, bandR = box.width - right;
  if (panel.bottom <= bandTop + 1 || panel.top >= box.height || panel.right <= bandL || panel.left >= bandR) return full;
  const roomR = bandR - (panel.right + DOCK_GAP), roomL = panel.left - DOCK_GAP - bandL;
  if (roomR >= DOCK_MIN || roomR >= roomL) return { left: Math.round(panel.right + DOCK_GAP), right };
  return { left: DOCK_EDGE, right: Math.round(box.width - panel.left + DOCK_GAP) };
}

/** a docked panel's own (dragged or resized) rectangle, moved clear of the panel it would cover: its left edge goes
 *  just right of `avoid` and it keeps its right edge (at least `minW` wide) — or, when `avoid` sits over its right half,
 *  it ends just left of it, when that leaves it `minW` wide. Untouched when the two do not overlap. */
export function clearOf(g: { left: number; top: number; width: number; height: number }, avoid: Rect | null, minW: number): { left: number; width: number } {
  const same = { left: g.left, width: g.width };
  if (!avoid) return same;
  const overlaps = g.left < avoid.right && g.left + g.width > avoid.left && g.top < avoid.bottom && g.top + g.height > avoid.top;
  if (!overlaps) return same;
  // the panel sits over the dock's right half (dragged there): the dock ends just left of it instead
  if ((avoid.left + avoid.right) / 2 > g.left + g.width / 2 && avoid.left - DOCK_GAP - g.left >= minW) return { left: g.left, width: Math.max(minW, Math.round(avoid.left - DOCK_GAP - g.left)) };
  const left = Math.round(avoid.right + DOCK_GAP);
  return { left, width: Math.max(minW, Math.round(g.left + g.width - left)) };
}
