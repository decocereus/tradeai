import { describe, expect, it } from "bun:test";

import { MAX_EQUITY_QUOTE_KEYS } from "@tradeai/app-services";
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
    expect(options.quoteKeysError).toBeUndefined();
  });

  it("deduplicates and caps quote flags before the TUI workflow call", () => {
    const duplicateOptions = parseTuiCliOptions(["--quote", "RELIANCE,RELIANCE,TCS"]);
    expect(duplicateOptions.quoteKeys).toEqual(["RELIANCE", "TCS"]);

    const tooManyQuoteKeys = Array.from(
      { length: MAX_EQUITY_QUOTE_KEYS + 1 },
      (_, index) => `SYM${index}`,
    ).join(",");
    const cappedOptions = parseTuiCliOptions(["--quote", tooManyQuoteKeys]);

    expect(cappedOptions.quoteKeys).toBeUndefined();
    expect(cappedOptions.quoteKeysError).toContain(`Maximum allowed is ${MAX_EQUITY_QUOTE_KEYS}`);
    expect(cappedOptions.hasExplicitPrimaryAction).toBe(true);
  });

  it("deduplicates quote flags case-insensitively", () => {
    const options = parseTuiCliOptions(["--quote", "RELIANCE,reliance,TCS"]);

    expect(options.quoteKeys).toEqual(["RELIANCE", "TCS"]);
  });

  it("parses operator flags as explicit actions", () => {
    const options = parseTuiCliOptions(["--provider-health", "--daily", "--json", "--raw"]);

    expect(options.providerHealthFlag).toBe(true);
    expect(options.dailyFlag).toBe(true);
    expect(options.jsonFlag).toBe(true);
    expect(options.rawFlag).toBe(true);
    expect(options.hasExplicitPrimaryAction).toBe(true);
  });

  it("parses knowledge ingestion flags", () => {
    const options = parseTuiCliOptions([
      "--knowledge-file",
      "/tmp/thesis.md",
      "--knowledge-title",
      "Reliance thesis",
      "--knowledge-source",
      "personal_note",
    ]);

    expect(options.knowledgeFilePath).toBe("/tmp/thesis.md");
    expect(options.knowledgeTitle).toBe("Reliance thesis");
    expect(options.knowledgeSourceType).toBe("personal_note");
    expect(options.knowledgeSourceError).toBeUndefined();
    expect(options.hasExplicitPrimaryAction).toBe(true);
  });

  it("rejects invalid knowledge source flags", () => {
    const options = parseTuiCliOptions([
      "--knowledge-file",
      "/tmp/thesis.md",
      "--knowledge-source",
      "telegram",
    ]);

    expect(options.knowledgeSourceType).toBe("personal_note");
    expect(options.knowledgeSourceError).toContain("Invalid knowledge source");
  });
});
