import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildIndstocksResearchPacketForPosition,
  buildResearchPacketFromIndstocksPosition,
} from "./indstocks-research.ts";

describe("data-sources / indstocks research", () => {
  it("marks missing enrichment signals in research quality", () => {
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

  it("records failed broker and enrichment sources in research quality", async () => {
    const fetchStub = (async () =>
      new Response("upstream unavailable", { status: 503 })) as unknown as typeof fetch;

    const packet = await Effect.runPromise(
      buildIndstocksResearchPacketForPosition(
        {
          position: {
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
          },
          accessToken: "secret",
          fetchImpl: fetchStub,
        },
      ),
    );

    expect(packet.researchQuality?.completeness).toBe("partial");
    expect(packet.researchQuality?.missingSignals).toEqual([
      "broker_quote",
      "fundamentals",
      "candles",
      "events",
    ]);
    expect(packet.researchQuality?.fallbacksUsed).toEqual(["neutral_score_defaults"]);
  });
});
