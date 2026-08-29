// the explorer's glyphs, rendered inline the way the header renders brand v1's theme-toggle pair
// (plan D15): Material Design Icons (Pictogrammers, Apache-2.0) on the 24-px grid, filled in
// currentColor — the idiom the fleet's shared sun / moon-in-sun toggle fixed on 2026-08-29. The
// names are the brand sprite's ids (cat-* · lens-* · realm-* · ui-*), so when brand/v1/icons/ ships
// (slice U2) this map becomes <use href> over the same ids. @mdi/js is tree-shaken: only the paths
// named here reach the bundle. Bespoke marine glyphs (copepod, krill, diatom, whale, the ship on a
// track, the section curtain) are drawn to the same weight; the ones still marked "placeholder"
// take MDI's nearest until U2's redraw.
import { ICON } from "./icon-paths";
export { ICON };
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
