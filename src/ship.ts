// the ship a cruise sailed on, in the words a reader knows: a cruise key ends in the ship's NODC code (`2026-11-33P4`),
// which names a ship only to someone who already knows the code. The name is the release's own `ship_name` from the
// cruise reference (sql/cruise_ref.sql), written there in capitals; nothing about a ship is kept in this app.
// tests/ship.test.ts pins the wording.

/** what the app holds of a cruise's reference row (App.tsx cruiseRef) */
export interface CruiseShip { ship: string; nodc: string }

const ROMAN = /^(II|III|IV|VI|VII|VIII|IX)$/;

/** a ship name from the reference's capitals: `SALLY RIDE` → `Sally Ride`, `BELL M. SHIMADA` → `Bell M. Shimada`,
 * `MCARTHUR II` → `McArthur II`. A name that is not all capitals is the reference's own spelling and is kept. */
export function shipTitle(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.split(/\s+/).map((w) => {
    if (ROMAN.test(w)) return w;
    if (/^MC[A-Z]{2,}/.test(w)) return "Mc" + w[2] + w.slice(3).toLowerCase();
    return w[0] + w.slice(1).toLowerCase();
  }).join(" ");
}

// the reference's name for a cruise, or "": App.tsx holds the NODC code as `ship` where the reference has no name, and a
// code is not a name (it is never re-cased, and never said beside a key that already ends in it)
const nameOf = (ref: Map<string, CruiseShip> | null | undefined, cruiseKey: string | null | undefined): string => {
  const r = cruiseKey ? ref?.get(cruiseKey) : undefined;
  return r?.ship && r.ship !== r.nodc ? shipTitle(r.ship) : "";
};
const codeOf = (cruiseKey: string | null | undefined): string => cruiseKey?.split("-")[2] ?? "";

/** the ship of a cruise key: its name where the reference names it, else the NODC code the key ends in (a key the
 * reference does not hold or does not name, or a reference not read yet), else "" for a key with no ship part */
export function shipOfCruise(ref: Map<string, CruiseShip> | null | undefined, cruiseKey: string | null | undefined): string {
  return nameOf(ref, cruiseKey) || codeOf(cruiseKey);
}

/** the ship as the first part of a picker row's second line: `Sally Ride · ` once the reference names the ship, and
 * nothing before that (the row's own label already ends in the NODC code, so the code is never said twice) */
export function shipLead(ref: Map<string, CruiseShip> | null | undefined, cruiseKey: string | null | undefined): string {
  const name = nameOf(ref, cruiseKey);
  return name ? `${name} · ` : "";
}

/** the ship in brackets after a cruise key in a title: ` (Sally Ride)`, or nothing where the reference does not name it */
export function shipAfter(ref: Map<string, CruiseShip> | null | undefined, cruiseKey: string | null | undefined): string {
  const name = nameOf(ref, cruiseKey);
  return name ? ` (${name})` : "";
}
