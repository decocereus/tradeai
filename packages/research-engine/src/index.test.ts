import { describe, expect, it } from "bun:test";

import {
  buildAftermarketsResearchPacketFromStockDetail,
  buildResearchPacketFromIndstocksPosition,
  scoreCorporateEventSignal,
} from "./index.ts";

const stockDetailEnvelope = {
  data: {
    stock: {
      symbol: "RELIANCE",
      name: "Reliance Industries Limited",
      industry: "Refineries & Marketing",
      price: 1425.4,
      changePct: 2.63,
      volume: 30542143,
      volumeRatio: 1.51,
      marketCap: 1928918.65,
      return1m: 5.73,
    },
    fundamentals: {
      pe: 35.55,
      pb: 3.32,
      roce: 7.81,
      debtEquity: 0.41,
      roe: 7.8,
      eps: 5.48,
    },
    technicals: {
      rsi14: 60.34,
      sma20: 1350.16,
      sma50: 1385.05,
      macdTrend: "bullish",
    },
    checklist: {
      overallScore: 58,
      dimensions: [
        { type: "performance", score: 95, rating: "pass" },
        { type: "valuation", score: 40, rating: "neutral" },
        { type: "growth", score: 50, rating: "neutral" },
        { type: "profitability", score: 20, rating: "fail" },
        { type: "technicals", score: 70, rating: "pass" },
        { type: "risk", score: 70, rating: "pass" },
      ],
    },
  },
  asOf: "2026-04-29T16:45:48.479Z",
  freshness: "eod",
  version: "1.0.0",
};

describe("research-engine", () => {
  it("maps Aftermarkets stock detail into a research packet", () => {
    const packet = buildAftermarketsResearchPacketFromStockDetail(stockDetailEnvelope);

    expect(packet.source).toBe("aftermarkets");
    expect(packet.instrument.symbol).toBe("RELIANCE");
    expect(packet.instrument.financialQuality).toBe(50);
    expect(packet.instrument.businessQuality).toBe(20);
    expect(packet.technicalAnalysis?.trend).toBe("bullish");
    expect(packet.researchQuality?.source).toBe("aftermarkets");
  });

  it("scores corporate event signals for research packet context", () => {
    expect(
      scoreCorporateEventSignal([
        {
          source: "bse_announcements",
          title: "Reliance Industries Ltd",
          link: "https://example.test/1",
          description: "Financial Results and Board Meeting Intimation",
          publishedAt: "17-Apr-2026 13:39:53",
        },
      ]),
    ).toBeGreaterThan(1);
  });

  it("marks missing enrichment signals in Indstocks position research quality", () => {
    const packet = buildResearchPacketFromIndstocksPosition({
      symbol: "RELIANCE-EQ",
      securityId: "2885",
      instrumentName: "Reliance Industries",
      isin: "INE002A01018",
      exchangeSegment: "NSE_EQ",
      quantity: 10,
      averagePrice: 2500,
      lastTradedPrice: 2600,
      closePrice: 2550,
      marketValue: 26000,
      pnlAbsolute: 1000,
      pnlPercent: 4,
      sourceBroker: "indstocks",
    });

    expect(packet.source).toBe("indstocks_quote");
    expect(packet.researchQuality?.source).toBe("indstocks");
    expect(packet.researchQuality?.completeness).toBe("partial");
    expect(packet.researchQuality?.missingSignals).toEqual(["fundamentals", "candles", "events"]);
  });
});
