// a private preview build (calcofi-preview, behind Google sign-in) of a dataset its provider has not yet agreed
// to publish (workflows plan 2026-11-02). VITE_PREVIEW=1 keeps the view from leaving the private site: no
// usage hits, feedback goes to the preview's decision form instead of a public GitHub issue, and the
// dataset page link points at the private copy of calcofi.io (VITE_SITE_URL)
export const PREVIEW: boolean = import.meta.env.VITE_PREVIEW === "1";
/** the preview's own page for the dataset, with its decision and comments form */
export const PREVIEW_HOME: string = (import.meta.env.VITE_PREVIEW_HOME as string | undefined) ?? "/";
/** calcofi.io, or its private copy in a preview build */
export const SITE_URL: string = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://calcofi.io/").replace(/\/?$/, "/");
