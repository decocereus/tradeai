import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildAftermarketsResearchPacket,
  buildResearchPacketFromAftermarketsStockDetail,
  parseAftermarketsToolResponse,
  resolveAftermarketsApiKey,
} from "./aftermarkets.ts";

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

describe("data-sources / aftermarkets", () => {
  it("requires an API key", () => {
    const previous = process.env.AFTERMARKETS_API_KEY;
    delete process.env.AFTERMARKETS_API_KEY;

    try {
      expect(() => resolveAftermarketsApiKey()).toThrow("Missing Aftermarkets API key");
    } finally {
      if (previous) process.env.AFTERMARKETS_API_KEY = previous;
    }
  });

  it("parses MCP event-stream tool responses", () => {
    const envelope = parseAftermarketsToolResponse<typeof stockDetailEnvelope.data>(
      `event: message\ndata: ${JSON.stringify({
        result: {
          content: [{ type: "text", text: JSON.stringify(stockDetailEnvelope) }],
        },
        jsonrpc: "2.0",
        id: 1,
      })}`,
    );

    expect(envelope.data?.stock?.symbol).toBe("RELIANCE");
    expect(envelope.freshness).toBe("eod");
  });

  it("maps stock detail into a research packet", () => {
    const packet = buildResearchPacketFromAftermarketsStockDetail(stockDetailEnvelope);

    expect(packet.source).toBe("aftermarkets");
    expect(packet.instrument.symbol).toBe("RELIANCE");
    expect(packet.instrument.financialQuality).toBe(50);
    expect(packet.instrument.businessQuality).toBe(20);
    expect(packet.technicalAnalysis?.trend).toBe("bullish");
    expect(packet.researchQuality?.source).toBe("aftermarkets");
  });

  it("fetches research through the MCP tool endpoint", async () => {
    const calls: string[] = [];
    const responseBody = `event: message\ndata: ${JSON.stringify({
      result: {
        content: [{ type: "text", text: JSON.stringify(stockDetailEnvelope) }],
      },
      jsonrpc: "2.0",
      id: 1,
    })}`;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${String(input)}:${init?.headers instanceof Headers ? "headers" : "object"}`);
      return new Response(responseBody, { status: 200 });
    }) as typeof fetch;

    const packet = await Effect.runPromise(
      buildAftermarketsResearchPacket({
        query: "reliance",
        apiKey: "am_live_test",
        fetchImpl,
      }),
    );

    expect(packet.runLabel).toBe("aftermarkets-reliance-research");
    expect(calls).toEqual(["https://mcp.aftermarkets.in/mcp:object"]);
  });
});
