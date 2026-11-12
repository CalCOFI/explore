// the ship beside a cruise (the tour rehearsal, 2026-11-12): the Explorer named the fall 2026 cruise only by its key,
// `2026-11-33P4`, so nothing on the page said it was the Sally Ride. The name is the release's `ship_name`, which the
// cruise reference writes in capitals; src/ship.ts is how it is worded and where it falls back to the NODC code.
import { describe, expect, it } from "vitest";
import { shipAfter, shipLead, shipOfCruise, shipTitle, type CruiseShip } from "../src/ship";

const REF = new Map<string, CruiseShip>([
  ["2026-11-33P4", { ship: "SALLY RIDE", nodc: "33P4" }],
  ["2026-04-3322", { ship: "BELL M. SHIMADA", nodc: "3322" }],
  ["2006-04-33MH", { ship: "MCARTHUR II", nodc: "33MH" }],
  ["1951-03-31ES", { ship: "E. W. SCRIPPS", nodc: "31ES" }],
  ["1999-01-XXXX", { ship: "", nodc: "" }],
  ["2000-01-31JD", { ship: "31JD", nodc: "31JD" }],   // the reference had no name, so App.tsx holds the code
]);

describe("shipTitle", () => {
  it("writes the reference's capitals as a name", () => {
    expect(shipTitle("SALLY RIDE")).toBe("Sally Ride");
    expect(shipTitle("REUBEN LASKER")).toBe("Reuben Lasker");
    expect(shipTitle("DAVID STARR JORDAN")).toBe("David Starr Jordan");
  });
  it("keeps initials, and a final one", () => {
    expect(shipTitle("BELL M. SHIMADA")).toBe("Bell M. Shimada");
    expect(shipTitle("E. W. SCRIPPS")).toBe("E. W. Scripps");
    expect(shipTitle("PAOLINA T.")).toBe("Paolina T.");
  });
  it("keeps a roman numeral and the capital after Mc", () => {
    expect(shipTitle("MCARTHUR II")).toBe("McArthur II");
    expect(shipTitle("MCARTHUR")).toBe("McArthur");
  });
  it("leaves a name that is not all capitals as the reference spells it", () => {
    expect(shipTitle("Sally Ride")).toBe("Sally Ride");
    expect(shipTitle("R/V Sproul")).toBe("R/V Sproul");
  });
  it("is empty for none", () => {
    expect(shipTitle(null)).toBe("");
    expect(shipTitle(undefined)).toBe("");
    expect(shipTitle("  ")).toBe("");
  });
});

describe("shipOfCruise", () => {
  it("names the ship of the fall 2026 cruise", () => expect(shipOfCruise(REF, "2026-11-33P4")).toBe("Sally Ride"));
  it("falls back to the NODC code of the key", () => {
    expect(shipOfCruise(REF, "2015-11-32OC")).toBe("32OC");   // not in the reference
    expect(shipOfCruise(null, "2026-11-33P4")).toBe("33P4");  // the reference not read yet
    expect(shipOfCruise(REF, "1999-01-XXXX")).toBe("XXXX");   // in the reference, with no name
    expect(shipOfCruise(REF, "2000-01-31JD")).toBe("31JD");   // the reference's code is not re-cased as a name
  });
  it("is empty for no cruise, or a key with no ship part", () => {
    expect(shipOfCruise(REF, null)).toBe("");
    expect(shipOfCruise(REF, "2026-11")).toBe("");
  });
});

describe("shipLead", () => {
  it("leads a picker row with the name", () => {
    expect(shipLead(REF, "2026-11-33P4")).toBe("Sally Ride · ");
    expect(shipLead(REF, "2006-04-33MH")).toBe("McArthur II · ");
  });
  it("says nothing where it could only repeat the code in the key", () => {
    expect(shipLead(null, "2026-11-33P4")).toBe("");
    expect(shipLead(REF, "2015-11-32OC")).toBe("");
    expect(shipLead(REF, "1999-01-XXXX")).toBe("");
    expect(shipLead(REF, "2000-01-31JD")).toBe("");
    expect(shipLead(REF, null)).toBe("");
  });
});

describe("shipAfter", () => {
  it("follows a cruise key in a title", () => expect(shipAfter(REF, "2026-11-33P4")).toBe(" (Sally Ride)"));
  it("adds nothing where the reference does not name the ship", () => {
    expect(shipAfter(null, "2026-11-33P4")).toBe("");
    expect(shipAfter(REF, "2000-01-31JD")).toBe("");
    expect(shipAfter(REF, null)).toBe("");
  });
});
