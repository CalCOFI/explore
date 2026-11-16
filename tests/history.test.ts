// browser Back / Forward (state.ts historyMode): a change of what is shown is a history entry; the map's pan, folds and
// the app's own defaults filled in after a load replace the entry, so Back never lands on a state that re-fills itself
import { describe, expect, it } from "vitest";
import { historyMode } from "../src/state";

describe("historyMode", () => {
  it("a new view, pick, year range, season, area or added variable is a step", () => {
    expect(historyMode("?lens=station&var=temperature", "?lens=hex&res=5&var=temperature")).toBe("push");
    expect(historyMode("?lens=station&var=temperature", "?lens=station&var=salinity")).toBe("push");
    expect(historyMode("?lens=station&taxon=worms:217452", "?lens=station&var=temperature")).toBe("push");
    expect(historyMode("?var=temperature", "?var=temperature&years=1990-2000")).toBe("push");
    expect(historyMode("?var=temperature", "?var=temperature&q=2")).toBe("push");
    expect(historyMode("?var=temperature", "?var=temperature&area=std")).toBe("push");
    expect(historyMode("?lens=hex&res=5&var=temperature", "?lens=hex&res=5&var=temperature&var2=salinity")).toBe("push");
    expect(historyMode("?var=temperature&datasets=calcofi_bottle", "?var=temperature&datasets=all")).toBe("push");
  });
  it("the map moving, folds, and the defaults the app fills in are not", () => {
    expect(historyMode("?var=temperature", "?var=temperature&map=-121,33,6")).toBe("replace");
    expect(historyMode("?var=temperature", "?var=temperature&hide=years")).toBe("replace");
    expect(historyMode("?taxon=worms:217452", "?lens=station&taxon=worms:217452&stage=larva&den=per_10m2&datasets=swfsc_ichthyo")).toBe("replace");
    expect(historyMode("?lens=cruise&var=temperature", "?lens=cruise&var=temperature&cruise=2019-07-RL")).toBe("replace");
  });
  it("picking another cruise in the Cruise view is a step", () => {
    expect(historyMode("?lens=cruise&cruise=2019-07-RL", "?lens=cruise&cruise=2020-01-RL")).toBe("push");
  });
});
