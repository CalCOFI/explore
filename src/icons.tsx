// the explorer's glyphs, rendered inline the way the header renders brand v1's theme-toggle pair
// (plan D15): Material Design Icons (Pictogrammers, Apache-2.0) on the 24-px grid, filled in
// currentColor — the idiom the fleet's shared sun / moon-in-sun toggle fixed on 2026-08-29. The
// names are the brand sprite's ids (cat-* · lens-* · realm-* · ui-*), so when brand/v1/icons/ ships
// (slice U2) this map becomes <use href> over the same ids. @mdi/js is tree-shaken: only the paths
// named here reach the bundle. Bespoke marine glyphs (copepod, krill, diatom, whale, the ship on a
// track, the section curtain) are drawn to the same weight; the ones still marked "placeholder"
// take MDI's nearest until U2's redraw.
import {
  mdiDotsGrid, mdiHexagonOutline, mdiVectorPolygon, mdiFerry, mdiFish, mdiWaves,
  mdiHelpCircleOutline, mdiInformationOutline, mdiMessageTextOutline, mdiDownload, mdiArrowExpand, mdiArrowCollapse,
  mdiChevronLeft, mdiChevronRight, mdiChevronUp, mdiChevronDown, mdiClose, mdiCogOutline, mdiShareVariantOutline,
  mdiThermometer, mdiFlaskOutline, mdiMoleculeCo2, mdiWhiteBalanceSunny, mdiWeatherPartlyCloudy, mdiBacteriaOutline,
  mdiEggOutline, mdiBird, mdiMagnify, mdiSortAlphabeticalVariant, mdiSortNumericDescending, mdiSortClockDescending,
  mdiWindowMinimize, mdiDotsHorizontal, mdiDragVertical, mdiContentCopy, mdiLinkVariant, mdiImageOutline, mdiUndo,
  mdiPencil, mdiArrowTopRight, mdiCircleOutline, mdiRectangleOutline, mdiFormatText, mdiEraser, mdiSend, mdiGithub,
  mdiKeyboard, mdiFilterOutline, mdiDatabaseOutline, mdiLayersOutline, mdiCalendarRange, mdiOpenInNew, mdiCheck,
  mdiChartBar, mdiChartLine, mdiChartTimeline, mdiMagnifyMinusOutline, mdiSelectionDrag, mdiFolderOutline, mdiCodeTags,
  mdiTune, mdiCropFree,
} from "@mdi/js";

// bespoke, on the same 24-px grid and ~2 px weight
const CURTAIN = "M3 2h18v2H3V2zm1 3h3v17H4V5zm6.5 0h3v17h-3V5zM17 5h3v17h-3V5z"; // a section: strips hanging from a rod
const COPEPOD = "M12 2a4 4 0 0 1 4 4v3.2c0 1.8-.7 3.3-1.8 4.4L16 21h-2l-1.5-5.3c-.2 0-.3.1-.5.1s-.3 0-.5-.1L10 21H8l1.8-7.4A6 6 0 0 1 8 9.2V6a4 4 0 0 1 4-4zm-2 4v3a2 2 0 1 0 4 0V6a2 2 0 1 0-4 0zM5.5 7 9 5.5v1.7L6.2 8.6zM18.5 7l-3.5-1.5v1.7l2.8 1.4z";
const KRILL = "M4 12c0-2.8 2.2-5 5-5h4l2-3h2l-1.4 3.4C18 8.3 20 10 20 12.5c0 1.6-.6 2.8-1.6 3.7L20 20h-2l-1.3-3h-1.2L17 20h-2l-1.5-3H12l-1.5 3h-2l1.5-3H8.5L7 20H5l1.6-3.6C5 15.5 4 13.9 4 12zm5-3a3 3 0 0 0 0 6h6.5a2.5 2.5 0 0 0 0-5H9v-1z";
const DIATOM = "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 0 0-7.7 6H11V4.1c.3 0 .7-.1 1-.1zm1 .1V10h6.7A8 8 0 0 0 13 4.1zM4.3 13A8 8 0 0 0 11 19.9V13H4.3zm8.7 6.9A8 8 0 0 0 19.7 13H13v6.9z";
const WHALE = "M2 13c1.5 0 2.5-.5 3.5-1.5C7 10 9 9 12 9c3.5 0 6 1 8 3l2-2v6l-2-2c-2 2-4.5 3-8 3-3 0-5-1-6.5-2.5C4.5 15.5 3.5 15 2 15v-2zm14 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM7 7l1.5-3L10 7H7z";
const SHIP_TRACK = "M3 20h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zM6 18l-2-5h16l-2 5H6zm4-11h4v2h3v4H7V9h3V7zm1-3h2v3h-2V4z"; // a ship over a dotted track

export const ICON = {
  // lenses (a lens is a shape: dots, hexagon, track, polygon, curtain)
  "lens-stations": mdiDotsGrid, "lens-hexagons": mdiHexagonOutline, "lens-cruises": SHIP_TRACK, "lens-regions": mdiVectorPolygon, "lens-sections": CURTAIN,
  // realms
  "realm-bio": mdiFish, "realm-env": mdiWaves,
  // categories (Appendix A)
  "cat-physical": mdiThermometer, "cat-nutrients": mdiFlaskOutline, "cat-carbonate": mdiMoleculeCo2, "cat-productivity": mdiWhiteBalanceSunny,
  "cat-meteorology": mdiWeatherPartlyCloudy, "cat-phytoplankton": DIATOM, "cat-picoplankton": mdiBacteriaOutline, "cat-zooplankton": COPEPOD,
  "cat-krill": KRILL, "cat-ichthyo": mdiEggOutline, "cat-fish": mdiFish, "cat-birds-mammals": mdiBird, "cat-whale": WHALE, "cat-other": mdiDatabaseOutline,
  // header + panel actions
  "ui-help": mdiHelpCircleOutline, "ui-about": mdiInformationOutline, "ui-feedback": mdiMessageTextOutline, "ui-download": mdiDownload,
  "ui-expand": mdiArrowExpand, "ui-collapse": mdiArrowCollapse, "ui-left": mdiChevronLeft, "ui-right": mdiChevronRight, "ui-up": mdiChevronUp, "ui-down": mdiChevronDown,
  "ui-close": mdiClose, "ui-sql": mdiCogOutline, "ui-share": mdiShareVariantOutline, "ui-search": mdiMagnify, "ui-sort-az": mdiSortAlphabeticalVariant,
  "ui-sort-n": mdiSortNumericDescending, "ui-sort-recent": mdiSortClockDescending, "ui-minimize": mdiWindowMinimize, "ui-more": mdiDotsHorizontal,
  "ui-drag": mdiDragVertical, "ui-copy": mdiContentCopy, "ui-link": mdiLinkVariant, "ui-image": mdiImageOutline, "ui-undo": mdiUndo, "ui-pen": mdiPencil,
  "ui-arrow": mdiArrowTopRight, "ui-circle": mdiCircleOutline, "ui-rect": mdiRectangleOutline, "ui-text": mdiFormatText, "ui-clear": mdiEraser, "ui-send": mdiSend,
  "ui-github": mdiGithub, "ui-keyboard": mdiKeyboard, "ui-filter": mdiFilterOutline, "ui-data": mdiDatabaseOutline, "ui-layers": mdiLayersOutline,
  "ui-years": mdiCalendarRange, "ui-open": mdiOpenInNew, "ui-check": mdiCheck, "ui-bars": mdiChartBar, "ui-line": mdiChartLine, "ui-gantt": mdiChartTimeline,
  "ui-zoom-out": mdiMagnifyMinusOutline, "ui-zoom-sel": mdiSelectionDrag, "ui-folder": mdiFolderOutline, "ui-code": mdiCodeTags, "ui-tune": mdiTune, "ui-capture": mdiCropFree,
  "ui-ferry": mdiFerry,
} as const;
export type IconName = keyof typeof ICON;

export function Icon(p: { name: IconName; size?: number | string; className?: string; title?: string; style?: React.CSSProperties }) {
  const s = p.size ?? "1em";
  return (
    <svg className={`cc-icon${p.className ? ` ${p.className}` : ""}`} viewBox="0 0 24 24" width={s} height={s} style={p.style}
      aria-hidden={p.title ? undefined : true} role={p.title ? "img" : undefined} focusable="false">
      {p.title && <title>{p.title}</title>}
      <path d={ICON[p.name]} fill="currentColor" />
    </svg>
  );
}
