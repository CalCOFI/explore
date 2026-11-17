// Which brand a build wears and where it loads it from — pure, so vite.config.ts (the head block) and src/brand.ts
// (the lockup, the fonts the capture embeds) cannot disagree, and tests/brandurl.test.ts pins the rules.
//
//   VITE_BRAND      v1 | v2 | v3     default v3 (2026-11-17). v3 is v2 with the brand's header: the same words on
//                                    every product, sentence case, the menu button, the wave under the bar.
//                                    v2 builds what was live until then; v1 the superseded dark-default look.
//   VITE_BRAND_URL  where the brand is served, default https://calcofi.io/brand/ . A preview that carries its own
//                   copy of the site sets it (/brand/), so the header it shows is the one being reviewed.
//
// v3 does not copy v2's files: the tokens, fonts, logos and favicons stay at <base>v2/ (v2 is frozen and still
// served); only header.css, header.js, theme.js and nav.json are at <base>v3/.

export type Brand = "v1" | "v2" | "v3";
export const BRAND_BASE = "https://calcofi.io/brand/";

/** the brand a build is on: v1 and v2 only on request, anything else (unset, empty, a typo) is the default, v3 */
export function brandOf(v: string | undefined | null): Brand {
  return v === "v1" || v === "v2" ? v : "v3";
}

/** where the brand is served, always ending in one slash; unset or blank is calcofi.io's */
export function brandBase(u: string | undefined | null): string {
  const s = (u ?? "").trim();
  return s ? s.replace(/\/*$/, "/") : BRAND_BASE;
}

/** the folders a build reads: `root` is the version's own (theme.js, and for v3 header.css, header.js, nav.json),
 *  `assets` holds the logos, the fonts and theme.css — v2's for a v3 build */
export function brandUrls(brand: Brand, base: string = BRAND_BASE): { root: string; assets: string; nav: string | null } {
  const b = brandBase(base);
  return { root: `${b}${brand}/`, assets: `${b}${brand === "v1" ? "v1" : "v2"}/`, nav: brand === "v3" ? `${b}v3/nav.json` : null };
}

/** a brand head block (brand/<v>.head.html) for one entry page: every https://calcofi.io/brand/ URL follows `base`,
 *  and a page at the reading scale (builder.html) drops the app-scale meta */
export function headFor(html: string, opts: { base?: string | null; scale?: "app" | "page" } = {}): string {
  let h = html.trim().split(BRAND_BASE).join(brandBase(opts.base));
  // the tag on a line of its own (the block's comment quotes the same tag mid-sentence, which stays)
  if (opts.scale === "page") h = h.replace(/^[ \t]*<meta name="cc-scale" content="app">[ \t]*\r?\n/m, "");
  return h;
}

/** how far the brand's wave lies over what follows it, in px: the strip's own bottom margin when it is negative
 *  (brand v3 .cc-wave-slim.cc-wave-over: margin-bottom −15px in an app), else 0 — a brand copy without the variant, a
 *  v1 or v2 build, or a value that is not a length all mean the strip is in the flow and nothing moves */
export function waveOver(marginBottom: string | null | undefined): number {
  const v = parseFloat(marginBottom ?? "");
  return Number.isFinite(v) && v < 0 ? Math.round(-v * 100) / 100 : 0;
}
