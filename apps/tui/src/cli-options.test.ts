import { describe, expect, it } from "bun:test";

import { parseTuiCliOptions } from "./cli-options.ts";

describe("tui cli options", () => {
  it("parses dashboard broker and explicit action flags", () => {
    const options = parseTuiCliOptions([
      "--dashboard",
      "--dashboard-broker",
      "manual_csv",
    ]);

    expect(options.dashboardFlag).toBe(true);
    expect(options.dashboardBroker).toBe("manual_csv");
    expect(options.hasExplicitPrimaryAction).toBe(false);
  });

  it("parses direct workflow inputs without coupling to process argv", () => {
    const options = parseTuiCliOptions([
      "--holding-history",
      "RELIANCE-EQ",
      "--holding-history-broker",
      "indstocks",
    ]);

    expect(options.holdingHistorySymbol).toBe("RELIANCE-EQ");
    expect(options.holdingHistoryBroker).toBe("indstocks");
    expect(options.hasExplicitPrimaryAction).toBe(true);
  });

  it("parses Groww-oriented equity search and quote flags", () => {
    const options = parseTuiCliOptions([
      "--equity-search",
      "RELIANCE",
      "--quote",
      "RELIANCE,TCS",
    ]);

    expect(options.equitySearchQuery).toBe("RELIANCE");
    expect(options.quoteKeys).toEqual(["RELIANCE", "TCS"]);
  });
});
