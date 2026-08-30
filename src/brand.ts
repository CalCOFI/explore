// the brand the build is on (plan 2026-08-30, Phase 2): VITE_BRAND = v1 | v2 (default v1 until the flip).
// vite.config.ts injects the matching brand/<v>.head.html into index.html; this module is the same choice
// for the code — the header lockup, the default theme, the fonts the feedback capture must embed.
// Everything else reads the tokens at runtime (getComputedStyle), so it needs no version at all.
export const BRAND: "v1" | "v2" = import.meta.env.VITE_BRAND === "v2" ? "v2" : "v1";
export const BRAND_URL = `https://calcofi.io/brand/${BRAND}/`;
export const DEFAULT_THEME: "dark" | "light" = BRAND === "v2" ? "light" : "dark";
/** the header logo pair: v1 the 32 px mark, v2 the horizontal lockup at the app scale's 28 px */
export const LOGO = BRAND === "v2"
  ? { dark: `${BRAND_URL}logo_calcofi_h.svg`, light: `${BRAND_URL}logo_calcofi_h_light.svg`, markDark: `${BRAND_URL}logo_calcofi.svg`, markLight: `${BRAND_URL}logo_calcofi_light.svg`, height: 28 }
  : { dark: `${BRAND_URL}logo_calcofi.svg`, light: `${BRAND_URL}logo_calcofi_light.svg`, markDark: `${BRAND_URL}logo_calcofi.svg`, markLight: `${BRAND_URL}logo_calcofi_light.svg`, height: 32 };

/** the brand's @font-face rules with the woff2 files inlined as data: URLs — what html-to-image needs to draw
 *  Source Sans 3 into the feedback / share capture (v2 text is not in the system stack; v1 has no webfonts, so
 *  the answer is empty). Fetched once per session; GitHub Pages answers every asset with CORS `*`. */
let fontCss: Promise<string> | null = null;
export function fontEmbedCss(): Promise<string> {
  if (BRAND !== "v2") return Promise.resolve("");
  if (!fontCss) fontCss = (async () => {
    try {
      const css = await (await fetch(`${BRAND_URL}fonts.css`)).text();
      const urls = [...new Set([...css.matchAll(/url\("?([^")]+\.woff2)"?\)/g)].map((m) => m[1]))];
      const data = await Promise.all(urls.map(async (u) => {
        const b = await (await fetch(new URL(u, `${BRAND_URL}fonts.css`).href)).blob();
        return [u, await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); })] as const;
      }));
      return data.reduce((s, [u, d]) => s.split(`url("${u}")`).join(`url("${d}")`).split(`url(${u})`).join(`url("${d}")`), css);
    } catch { return ""; }   // a capture without the webfont is still a capture
  })();
  return fontCss;
}
