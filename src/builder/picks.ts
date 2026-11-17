// links that pick for the reader (Betty 2026-11-15; calcofi.io's dataset pages use them for "just this species" CSV buttons):
//   builder.html?pick=bio:<dataset_key>:<taxon_key>      one species from one dataset   (bio:swfsc_ichthyo:worms:217452)
//   builder.html?pick=env:<dataset_key>:<measurement>    one water measurement from one (env:calcofi_bottle:temperature)
//   …&pick=…  or  ?pick=a,b                               several: the parameter repeated, or ids separated by commas
//   …&download=1                                          also start the CSV, once every pick is known
// The ids are the ones src/builder/data.ts lists (ListItem.id). A taxon key carries its own colon (worms:217452), so an id
// is split at its first two colons only. Pure, so tests/builder.picks.test.ts can check every rule without a browser.

export interface PickLink { picked: string[]; unknown: string[]; download: boolean }

/** an id as the lists carry it, or null when it is not shaped like one */
export function normalizePick(raw: string): string | null {
  const m = /^\s*(bio|env):([^:,\s]+):(\S+?)\s*$/.exec(raw);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
}

/** the picks a link asks for, in the order asked, each once: those the release holds (`known`) and those it does not.
 *  `download` is true only when the link asks for it AND every pick is known AND there is at least one: a CSV that silently
 *  lacks a column the link named would be worse than a notice. */
export function parsePicks(search: string, known: (id: string) => boolean): PickLink {
  const q = new URLSearchParams(search);
  const asked = q.getAll("pick").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const picked: string[] = [], unknown: string[] = [];
  for (const raw of asked) {
    const id = normalizePick(raw);
    const to = id && known(id) ? picked : unknown;
    const v = id ?? raw;
    if (!to.includes(v)) to.push(v);
  }
  const want = /^(1|true|yes)$/i.test(q.get("download") ?? "");
  return { picked, unknown, download: want && picked.length > 0 && unknown.length === 0 };
}

/** the link that opens the builder with these picked (and, with `download`, starts the CSV) */
export function pickHref(base: string, ids: string[], download = false): string {
  const q = ids.map((id) => `pick=${encodeURIComponent(id)}`).join("&");
  return `${base}${q ? `?${q}${download ? "&download=1" : ""}` : ""}`;
}

/** the address without `download=1`, so a reload or a shared link does not download again */
export function withoutDownload(search: string): string {
  const q = new URLSearchParams(search);
  q.delete("download");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** what the page says about picks the release does not hold */
export function unknownNotice(unknown: string[]): string | null {
  if (!unknown.length) return null;
  const what = unknown.length === 1 ? `“${unknown[0]}” is` : `${unknown.length} of the items this link asked for (${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? ", …" : ""}) are`;
  return `${what} not in this release's Query Builder lists, so nothing was downloaded. Pick from the lists below.`;
}
