// usage events (plan D17: share · export · feedback) through the fleet's GA4 leg — the same measurement id
// calcofi4r::cc_ga_js() uses (content_group "explore"). A no-op until index.html carries gtag, so nothing here
// can fail a user action.
export function track(event: string, params: Record<string, string | number | boolean> = {}) {
  try { (window as any).gtag?.("event", event, { content_group: "explore", ...params }); } catch { /* never */ }
}
