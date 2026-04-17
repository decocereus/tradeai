import { describe, expect, it } from "bun:test";

import { inferSectorFromEvidence } from "./sector-inference.ts";

describe("strategy-engine / sector inference", () => {
  it("infers banking from company and banking metrics", () => {
    const sector = inferSectorFromEvidence(
      {
        instrumentKey: "NSE_EQ|INE040A01034",
        exchange: "NSE",
        tradingSymbol: "HDFCBANK",
        name: "HDFC BANK LIMITED",
        shortName: "HDFC Bank",
        isin: "INE040A01034",
        instrumentType: "EQ",
        securityType: "NORMAL",
      },
      {
        isin: "INE040A01034",
        companyName: "HDFC Bank",
        marketCapCrores: 1224540,
        fundamentalMetrics: [
          { label: "Net Interest Margin (NIM)", value: "3.25%" },
          { label: "Gross NPA", value: "1.33%" },
        ],
        revenueStatement: [],
      },
      [],
    );

    expect(sector.slug).toBe("banking-financial-services");
    expect(sector.confidence).toBeGreaterThan(0.4);
  });

  it("infers energy from company name", () => {
    const sector = inferSectorFromEvidence(
      {
        instrumentKey: "NSE_EQ|INE002A01018",
        exchange: "NSE",
        tradingSymbol: "RELIANCE",
        name: "RELIANCE INDUSTRIES LIMITED",
        shortName: "Reliance Industries",
        isin: "INE002A01018",
        instrumentType: "EQ",
        securityType: "NORMAL",
      },
      undefined,
      [{ source: "bse_announcements", title: "Energy expansion update", link: "https://example.com", description: "Oil and gas capacity expansion", publishedAt: "2026-04-17T12:00:00.000Z" }],
    );

    expect(sector.slug).toBe("energy-oil-gas");
  });

  it("falls back to unclassified when evidence is weak", () => {
    const sector = inferSectorFromEvidence(
      {
        instrumentKey: "NSE_EQ|UNKNOWN",
        exchange: "NSE",
        tradingSymbol: "UNKNOWN",
        name: "UNKNOWN LIMITED",
        shortName: "Unknown",
        isin: "INE000000000",
        instrumentType: "EQ",
        securityType: "NORMAL",
      },
      undefined,
      [],
    );

    expect(sector.slug).toBe("unclassified");
  });
});
