import { describe, expect, it } from "bun:test";
import type { BrokerHolding, BrokerTradeFill, MemoryContext } from "@tradeai/domain";
import { Effect } from "effect";

import { customResearchPacket } from "./test-fixtures.ts";
import { createTradeAiWorkflowService } from "./workflow-service.ts";

describe("app-services / workflow service", () => {
  it("exposes a stable UI-agnostic workflow port", async () => {
    const tradeAi = createTradeAiWorkflowService();

    expect(tradeAi.runEquityResearch).toBeFunction();
    expect(tradeAi.syncBrokerPortfolio).toBeFunction();
    expect(tradeAi.reviewBrokerHoldingsAgainstResearch).toBeFunction();
    expect(tradeAi.getPortfolioDashboard).toBeFunction();
    expect(tradeAi.importManualPortfolioSnapshot).toBeFunction();
  });

  it("runs the explicit demo snapshot through the service port", async () => {
    const tradeAi = createTradeAiWorkflowService();
    const result = await Effect.runPromise(tradeAi.runDemoResearchSnapshot());

    expect(result.instrument.symbol).toBe("DEMO");
    expect(result.researchQuality.source).toBe("demo");
  });

  it("applies runtime config and injected ports at the service boundary", async () => {
    const calls: string[] = [];
    const holding: BrokerHolding = {
      broker: "indstocks",
      securityId: "500325",
      tradingSymbol: "RELIANCE-EQ",
      exchangeSegment: "NSE_EQ",
      isin: "INE002A01018",
      quantity: 5,
      averagePrice: 2200,
      lastTradedPrice: 2500,
      closePrice: 2490,
      marketValue: 12500,
      pnlAbsolute: 1500,
      pnlPercent: 13.64,
    };
    const fill: BrokerTradeFill = {
      broker: "indstocks",
      fillId: 1,
      exchangeOrderId: "order-1",
      quantity: 5,
      price: 2200,
      tradeDate: "2026-04-25T09:15:00.000Z",
      tradeSerialNumber: "trade-1",
      scripCode: "500325",
    };
    const tradeAi = createTradeAiWorkflowService({
      config: {
        brokerAccessToken: "runtime-token",
        databaseUrl: "postgresql://runtime-db",
        persistPortfolioSnapshots: false,
      },
      brokerSources: {
        fetchBrokerHoldings: (accessToken) => {
          calls.push(`holdings:${accessToken}`);
          return Effect.succeed([holding]);
        },
        fetchBrokerTradeBook: (_segment, accessToken) => {
          calls.push(`trade-book:${accessToken}`);
          return Effect.succeed([fill]);
        },
      },
      marketSources: {
        fetchNseInstrumentProfiles: () => Effect.succeed([]),
      },
      repositories: {
        hasConfiguredDatabaseUrl: (databaseUrl) => databaseUrl === "postgresql://runtime-db",
        loadLatestPortfolioSnapshot: async (_broker, databaseUrl) => {
          calls.push(`latest:${databaseUrl}`);
          return undefined;
        },
        persistPortfolioSnapshot: async () => {
          calls.push("persist");
          return {
            snapshotId: "unexpected",
            positionsInserted: 0,
            tradeFillsInserted: 0,
          };
        },
      },
    });

    const report = await Effect.runPromise(tradeAi.syncBrokerPortfolio());

    expect(report.dbConfigured).toBe(true);
    expect(report.persisted).toBe(false);
    expect(calls).toEqual([
      "holdings:runtime-token",
      "trade-book:runtime-token",
      "latest:postgresql://runtime-db",
    ]);
  });

  it("uses injected market and research sources through the service port", async () => {
    const memoryContext: MemoryContext = {
      previousVerdict: "watch",
      previousConviction: 45,
      notes: ["test memory"],
    };
    const calls: string[] = [];
    const tradeAi = createTradeAiWorkflowService({
      config: {
        marketAccessToken: "runtime-token",
      },
      marketSources: {
        searchEquityInstruments: (query, accessToken) => {
          calls.push(`search:${query}:${accessToken}`);
          return Effect.succeed([
            {
              instrumentKey: query,
              exchange: "NSE",
              tradingSymbol: "RELIANCE",
              shortName: "Reliance",
              instrumentType: "EQ",
              isin: "INE002A01018",
            },
          ]);
        },
        fetchEquityQuotes: (instrumentKeys, accessToken) => {
          calls.push(`quotes:${instrumentKeys.join(",")}:${accessToken}`);
          return Effect.succeed([
            {
              instrumentKey: instrumentKeys[0] ?? "NSE_EQ|INE002A01018",
              tradingSymbol: "RELIANCE",
              lastPrice: 2500,
            },
          ]);
        },
        buildEquityQuoteSnapshot: (searchResults, quotes) => {
          calls.push(`snapshot:${searchResults.length}:${quotes.length}`);
          return [
            {
              instrumentKey: "NSE_EQ|INE002A01018",
              exchange: "NSE",
              tradingSymbol: "RELIANCE",
              shortName: "Reliance",
              instrumentType: "EQ",
              lastPrice: 2500,
              isin: "INE002A01018",
            },
          ];
        },
      },
      researchSources: {
        buildEquityResearchPacket: (input) => {
          calls.push(`research:${input.query}:${input.accessToken}`);
          return Effect.succeed(customResearchPacket);
        },
      },
      memorySource: {
        loadMemoryContext: () => {
          calls.push("memory");
          return Effect.succeed(memoryContext);
        },
      },
    });

    const quotes = await Effect.runPromise(
      tradeAi.getEquityQuoteSnapshots({ instrumentKeys: ["NSE_EQ|INE002A01018"] }),
    );
    const research = await Effect.runPromise(tradeAi.runEquityResearch({ query: "RELIANCE" }));

    expect(quotes[0]?.tradingSymbol).toBe("RELIANCE");
    expect(research.memoryContext.previousVerdict).toBe("watch");
    expect(calls).toEqual([
      "search:NSE_EQ|INE002A01018:runtime-token",
      "quotes:NSE_EQ|INE002A01018:runtime-token",
      "snapshot:1:1",
      "research:RELIANCE:runtime-token",
      "memory",
    ]);
  });

  it("uses TrueData market sources when configured", async () => {
    const calls: string[] = [];
    const tradeAi = createTradeAiWorkflowService({
      config: {
        marketDataProvider: "truedata",
        trueDataUserId: "user",
        trueDataPassword: "password",
      },
      marketSources: {
        fetchEquityQuotes: (symbols) => {
          calls.push(`quotes:${symbols.join(",")}`);
          return Effect.succeed([
            {
              instrumentKey: "RELIANCE",
              tradingSymbol: "RELIANCE",
              lastPrice: 2500,
            },
          ]);
        },
      },
    });

    const quotes = await Effect.runPromise(
      tradeAi.getEquityQuoteSnapshots({ instrumentKeys: ["RELIANCE"] }),
    );

    expect(quotes[0]?.instrumentKey).toBe("RELIANCE");
    expect(quotes[0]?.tradingSymbol).toBe("RELIANCE");
    expect(calls).toEqual(["quotes:RELIANCE"]);
  });
});
