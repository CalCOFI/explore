// the two apps' addresses in THIS build, resolved once (the rules are src/queryurl.ts): every Explorer link to the Query
// Builder uses QUERY_URL, every Query Builder link to the Explorer uses EXPLORE_URL, and nothing else types either.
import { appOf, exploreBase, queryBase } from "./queryurl";
import { SITE_URL } from "./preview";

export const APP = appOf(import.meta.env.VITE_APP as string | undefined);
/** the Query Builder, from the Explorer: its own address (VITE_QUERY_URL) or builder.html beside the Explorer */
export const QUERY_URL = queryBase(APP, import.meta.env.VITE_QUERY_URL as string | undefined);
/** the Query Builder's own page, from inside it */
export const QUERY_SELF = queryBase(APP, import.meta.env.VITE_QUERY_URL as string | undefined, "query");
/** the Explorer, from the Query Builder: ./ beside it, <site>explore/ (or VITE_EXPLORE_URL) from the builder's own build */
export const EXPLORE_URL = exploreBase(APP, import.meta.env.VITE_EXPLORE_URL as string | undefined, SITE_URL);
