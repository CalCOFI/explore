// the brand the build is on (plan 2026-08-30, Phase 2): VITE_BRAND = v1 | v2 | v3 (default v3 since 2026-11-17: v2 with
// the brand's header — the same words on every product, the menu button, the wave), loaded from VITE_BRAND_URL (default
// https://calcofi.io/brand/; a preview with its own copy of the site sets /brand/). vite.config.ts injects the matching
// brand/<v>.head.html into the entry pages; this module is the same choice for the code — the header lockup, the
// default theme, the fonts the feedback capture must embed. The rules are src/brandurl.ts (pure, tested).
// Everything else reads the tokens at runtime (getComputedStyle), so it needs no version at all.
import { brandBase, brandOf, brandUrls, type Brand } from "./brandurl";
export const BRAND: Brand = brandOf(import.meta.env.VITE_BRAND);
const URLS = brandUrls(BRAND, brandBase(import.meta.env.VITE_BRAND_URL));
/** the version's own folder (theme.js; v3's header.css, header.js and nav.json) */
export const BRAND_URL = URLS.root;
/** where the logos, the fonts and the tokens are: v2's folder for a v3 build (v3 changes the header only) */
export const ASSET_URL = URLS.assets;
/** v3: the header is the brand's — the words come from nav.json, drawn by header.js into <nav data-cc-nav> */
export const BRAND_HEADER = BRAND === "v3";
export const DEFAULT_THEME: "dark" | "light" = BRAND === "v1" ? "dark" : "light";
/** the header logo pair: v1 the 32 px mark, v2 and v3 the horizontal lockup at the app scale's 28 px */
export const LOGO = BRAND !== "v1"
  ? { dark: `${ASSET_URL}logo_calcofi_h.svg`, light: `${ASSET_URL}logo_calcofi_h_light.svg`, markDark: `${ASSET_URL}logo_calcofi.svg`, markLight: `${ASSET_URL}logo_calcofi_light.svg`, height: 28 }
  : { dark: `${ASSET_URL}logo_calcofi.svg`, light: `${ASSET_URL}logo_calcofi_light.svg`, markDark: `${ASSET_URL}logo_calcofi.svg`, markLight: `${ASSET_URL}logo_calcofi_light.svg`, height: 32 };

/** the brand's menu button (calcofi.io's _layouts/default.html): the three bars, and the cross while its column is open */
export const ICON_MENU = "M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z";
export const ICON_MENU_CLOSE = "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/** the brand's @font-face rules with the woff2 files inlined as data: URLs — what html-to-image needs to draw
 *  Source Sans 3 into the feedback / share capture (v2 text is not in the system stack; v1 has no webfonts, so
 *  the answer is empty). Fetched once per session; GitHub Pages answers every asset with CORS `*`. */
let fontCss: Promise<string> | null = null;
export function fontEmbedCss(): Promise<string> {
  if (BRAND === "v1") return Promise.resolve("");
  if (!fontCss) fontCss = (async () => {
    try {
      const sheet = new URL(`${ASSET_URL}fonts.css`, location.href).href;   // absolute: VITE_BRAND_URL may be a path (/brand/)
      const css = await (await fetch(sheet)).text();
      const urls = [...new Set([...css.matchAll(/url\("?([^")]+\.woff2)"?\)/g)].map((m) => m[1]))];
      const data = await Promise.all(urls.map(async (u) => {
        const b = await (await fetch(new URL(u, sheet).href)).blob();
        return [u, await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); })] as const;
      }));
      return data.reduce((s, [u, d]) => s.split(`url("${u}")`).join(`url("${d}")`).split(`url(${u})`).join(`url("${d}")`), css);
    } catch { return ""; }   // a capture without the webfont is still a capture
  })();
  return fontCss;
}
