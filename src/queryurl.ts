// Where the Query Builder lives and where the Explorer lives — pure, so vite.config.ts (which pages a build holds, the
// redirect page) and the two apps (every link from one to the other) cannot disagree, and tests/queryurl.test.ts pins
// the rules.
//
//   VITE_APP          unset = this repo's usual build: the Explorer (index.html) and the Query Builder beside it
//                     (builder.html). "query" = the Query Builder alone, emitted as index.html into dist-query/, for
//                     its own address (https://calcofi.io/query/, deployed by the thin repo CalCOFI/query).
//   VITE_QUERY_URL    the Query Builder's own address, once it has one (production: https://calcofi.io/query/; a
//                     preview: /query/). Set on the EXPLORER's build it does two things: every Explorer link to the
//                     Query Builder goes there, and builder.html becomes a small page that redirects there carrying
//                     the query string and the fragment, so the dataset pages' ?pick=…&download=1 links and anything
//                     already shared still land and still download. Unset: builder.html is the app, as before.
//   VITE_EXPLORE_URL  the Explorer's address as the Query Builder's own build links it (default <site>explore/).
//
// DEPLOY ORDER: /query/ has to be live before VITE_QUERY_URL is set on the Explorer's deploy, or the old address
// redirects to a 404.

export type AppKind = "explore" | "query";
export const QUERY_LIVE = "https://calcofi.io/query/";
/** the SQL console. calcofi.io/query/ was ITS address first: from 2026-08-10 the site's query/index.html sent /query/ on
 *  to /db-query/, so a reader can arrive at the Query Builder expecting to type SQL. The builder says where that is. */
export const SQL_CONSOLE = "https://calcofi.io/db-query/";

/** the app a build is: only "query" asks for the Query Builder alone */
export const appOf = (v: string | undefined | null): AppKind => (v ?? "").trim() === "query" ? "query" : "explore";

/** VITE_QUERY_URL as a folder address ending in one slash; unset or blank = "" (the Query Builder has no address of its own) */
export function queryAddress(u: string | undefined | null): string {
  const s = (u ?? "").trim();
  return s ? s.replace(/\/*$/, "/") : "";
}

/** the Query Builder's address as a page of this build links it: its own page from inside itself (./ when it is the
 *  whole build, ./builder.html beside the Explorer), else its own address when it has one, else builder.html */
export function queryBase(app: AppKind, queryUrl: string | undefined | null, from: "explore" | "query" = "explore"): string {
  if (app === "query") return "./";
  if (from === "query") return "./builder.html";
  return queryAddress(queryUrl) || "./builder.html";
}

/** the Explorer's address as a page of this build links it: ./ beside it, its own address from the Query Builder's own build */
export function exploreBase(app: AppKind, exploreUrl: string | undefined | null, siteUrl: string = "https://calcofi.io/"): string {
  if (app !== "query") return "./";
  const s = (exploreUrl ?? "").trim();
  return s ? s.replace(/\/*$/, "/") : `${siteUrl.replace(/\/*$/, "/")}explore/`;
}

/** a link into the Query Builder with these picked and this shape: <base>?pick=…&lens=…  (src/builder/picks.ts reads it).
 *  Ids are the builder's own (bio:<dataset_key>:<taxon_key>, env:<dataset_key>:<measurement>); with none it is the bare address. */
export function queryHref(base: string, picks: string[] = [], shape: { lens?: "station" | "hex" | "region" | null; rows?: string | null; stations?: string | null } = {}): string {
  const q = [...picks.map((id) => `pick=${encodeURIComponent(id)}`),
    ...(["lens", "rows", "stations"] as const).flatMap((k) => (shape[k] ? [`${k}=${encodeURIComponent(shape[k]!)}`] : []))];
  return `${base}${q.length ? `?${q.join("&")}` : ""}`;
}

/** WHAT THE EXPLORER'S VIEW CARRIES INTO THE QUERY BUILDER: its species or measurement, once per dataset in view (a
 *  Query Builder column is one species or measurement FROM ONE DATASET), as the builder's own ids. Nothing when no
 *  dataset is in view yet, and nothing for a measurement the builder does not list (one value per cast, with no
 *  per-depth object): the link then opens the Query Builder with nothing picked, rather than with a notice. */
export function viewPicks(v: { realm: "bio" | "env"; taxon: string; variable: string; datasets: string[]; listed: boolean }): string[] {
  const key = v.realm === "bio" ? v.taxon : v.variable;
  if (!key || !v.listed) return [];
  return [...new Set(v.datasets)].filter(Boolean).map((d) => `${v.realm}:${d}:${key}`);
}
/** the Query Builder's lens for the Explorer's: Stations, Hexagons and Regions carry over; Cruises and Sections have no
 *  counterpart there, so the builder opens on its default (Stations) */
export const viewLens = (lens: string): "station" | "hex" | "region" | null => lens === "station" || lens === "hex" || lens === "region" ? lens : null;

/** THE REDIRECT: where the old address (…/explore/builder.html?pick=…#…) sends its reader — the new address with the
 *  query string and the fragment exactly as they came. A query string already on the target is kept and joined.
 *  Self-contained on purpose: redirectHtml() ships this very function, as text, in the page. */
export function redirectTo(queryUrl: string, search: string, hash: string): string {
  var at = queryUrl.indexOf("#"), base = at < 0 ? queryUrl : queryUrl.slice(0, at);
  var s = search && search !== "?" ? (search.charAt(0) === "?" ? search.slice(1) : search) : "";
  var h = hash && hash !== "#" ? (hash.charAt(0) === "#" ? hash : "#" + hash) : "";
  return base + (s ? (base.indexOf("?") < 0 ? "?" : "&") + s : "") + h;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** builder.html of an Explorer build whose Query Builder has moved: goes to `queryUrl` at once, carrying
 *  location.search and location.hash; canonical there, not indexed here, and a plain link for a reader without JavaScript */
export function redirectHtml(queryUrl: string): string {
  const to = queryAddress(queryUrl), canon = /^https?:\/\//.test(to) ? to : QUERY_LIVE;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Query Builder · CalCOFI.io</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(canon)}">
<script>
// the Query Builder has its own address: go there with this link's picks and shape, as they came
location.replace((${redirectTo.toString()})(${JSON.stringify(to)}, location.search, location.hash));
</script>
<noscript><meta http-equiv="refresh" content="0; url=${esc(to)}"></noscript>
</head>
<body style="font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 34rem; padding: 0 1rem">
<p>The CalCOFI Query Builder has moved to <a href="${esc(to)}">${esc(canon)}</a>.</p>
</body>
</html>
`;
}
