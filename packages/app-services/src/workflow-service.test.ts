import { describe, expect, it } from "bun:test";
import type { BrokerHolding, BrokerTradeFill, MemoryContext } from "@tradeai/domain";
import { buildKnowledgeDocument } from "@tradeai/knowledge";
import type { MemoryContextInput } from "@tradeai/memory";
import { Effect } from "effect";

import { customResearchPacket } from "./test-fixtures.ts";
import { createTradeAiWorkflowService } from "./workflow-service.ts";
import {
  MAX_EQUITY_QUOTE_KEYS,
  PartialEquityQuoteSnapshotsError,
} from "./market-workflows.ts";

describe("app-services / workflow service", () => {
  it("exposes a stable UI-agnostic workflow port", async () => {
    const tradeAi = createTradeAiWorkflowService();

    expect(tradeAi.runEquityResearch).toBeFunction();
    expect(tradeAi.syncBrokerPortfolio).toBeFunction();
    expect(tradeAi.reviewBrokerHoldingsAgainstResearch).toBeFunction();
    expect(tradeAi.getPortfolioDashboard).toBeFunction();
    expect(tradeAi.importManualPortfolioSnapshot).toBeFunction();
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
        growwAccessToken: "groww-token",
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
        fetchEquityQuotes: (symbols, accessToken) => {
          calls.push(`market-quotes:${symbols.join(",")}:${accessToken}`);
          return Effect.succeed([]);
        },
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
      "market-quotes:RELIANCE:groww-token",
      "trade-book:runtime-token",
      "latest:postgresql://runtime-db",
    ]);
  });

  it("keeps broker research and trade-book credentials on the broker token", async () => {
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
    const tradeAi = createTradeAiWorkflowService({
      config: {
        brokerDataProvider: "indstocks",
        brokerAccessToken: "indstocks-token",
        growwAccessToken: "groww-token",
      },
      brokerSources: {
        fetchBrokerHoldings: (accessToken) => {
          calls.push(`holdings:${accessToken}`);
          return Effect.succeed([holding]);
        },
        fetchBrokerTradeBook: (_segment, accessToken) => {
          calls.push(`trade-book:${accessToken}`);
          return Effect.succeed([]);
        },
      },
      marketSources: {
        fetchNseInstrumentProfiles: () => Effect.succeed([]),
        fetchEquityQuotes: (_symbols, accessToken) => {
          calls.push(`market:${accessToken}`);
          return Effect.succeed([]);
        },
      },
      researchSources: {
        buildBrokerPositionResearchPacket: (input) => {
          calls.push(`broker-research:${input.accessToken}`);
          return Effect.succeed({
            ...customResearchPacket,
            instrumentIsin: "INE002A01018",
          });
        },
      },
      repositories: {
        hasConfiguredDatabaseUrl: () => false,
      },
    });

    await Effect.runPromise(tradeAi.getBrokerTradeBook());
    await Effect.runPromise(tradeAi.reviewBrokerHoldingsAgainstResearch());

    expect(calls).toEqual([
      "trade-book:indstocks-token",
      "holdings:indstocks-token",
      "market:groww-token",
      "broker-research:indstocks-token",
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

  it("loads persisted review history into research memory when database config is explicit", async () => {
    const memoryInputs: MemoryContextInput[] = [];
    const tradeAi = createTradeAiWorkflowService({
      config: {
        databaseUrl: "postgres://tradeai-test",
      },
      researchSources: {
        buildEquityResearchPacket: () => Effect.succeed(customResearchPacket),
      },
      memorySource: {
        loadMemoryContext: (input) => {
          memoryInputs.push(input ?? {});
          return Effect.succeed({
            previousVerdict: input?.history?.[0]?.verdict ?? "watch",
            previousConviction: input?.history?.[0]?.conviction ?? 50,
            notes: input?.history?.map((entry) => entry.reason) ?? [],
          });
        },
      },
      repositories: {
        hasConfiguredDatabaseUrl: () => true,
        loadHoldingReviewHistory: (symbol) =>
          Promise.resolve(
            symbol === "RELIANCE-EQ"
              ? [
                  {
                    snapshotId: "manual_csv:2026-05-06T00:00:00.000Z",
                    symbol: "RELIANCE-EQ",
                    query: "RELIANCE",
                    status: "aligned",
                    reason: "Prior review supported the holding.",
                    verdict: "buy",
                    conviction: 66,
                    reviewedAt: "2026-05-06T00:00:00.000Z",
                  },
                ]
              : [],
          ),
        loadKnowledgeDocuments: () => Promise.resolve([]),
      },
    });

    const result = await Effect.runPromise(tradeAi.runEquityResearch({ query: "RELIANCE" }));

    expect(result.memoryContext.previousVerdict).toBe("buy");
    expect(result.memoryContext.previousConviction).toBe(66);
    expect(memoryInputs[0]?.history?.[0]?.symbol).toBe("RELIANCE-EQ");
  });

  it("loads persisted knowledge claims into research memory when database config is explicit", async () => {
    const tradeAi = createTradeAiWorkflowService({
      config: {
        databaseUrl: "postgres://tradeai-test",
      },
      researchSources: {
        buildEquityResearchPacket: () => Effect.succeed(customResearchPacket),
      },
      memorySource: {
        loadMemoryContext: () =>
          Effect.succeed({
            previousVerdict: "watch",
            previousConviction: 50,
            notes: ["history loaded"],
          }),
      },
      repositories: {
        hasConfiguredDatabaseUrl: () => true,
        loadHoldingReviewHistory: () => Promise.resolve([]),
        loadKnowledgeDocuments: () =>
          Promise.resolve([
            buildKnowledgeDocument(
              {
                sourceType: "personal_note",
                title: "Reliance thesis discipline",
                body: "Reliance exposure should require clear cash-flow visibility and balance-sheet discipline before adding more capital.",
                metadata: { tags: ["reliance", "risk"] },
              },
              new Date("2026-05-08T00:00:00.000Z"),
            ),
          ]),
      },
    });

    const result = await Effect.runPromise(tradeAi.runEquityResearch({ query: "RELIANCE" }));

    expect(result.memoryContext.notes).toContain("history loaded");
    expect(result.memoryContext.notes.some((note) => note.includes("balance-sheet discipline"))).toBe(false);
    expect(result.knowledgeContext.claims[0]?.claim).toContain("balance-sheet discipline");
    expect(result.knowledgeContext.claims[0]?.provenance).toContain("Reliance thesis discipline");
  });

  it("uses Groww market sources by default", async () => {
    const calls: string[] = [];
    const tradeAi = createTradeAiWorkflowService({
      config: {
        growwAccessToken: "groww-token",
      },
      marketSources: {
        fetchEquityQuotes: (symbols, accessToken) => {
          calls.push(`quotes:${symbols.join(",")}:${accessToken}`);
          return Effect.succeed([
            {
              instrumentKey: "NSE_RELIANCE",
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

    expect(quotes[0]?.instrumentKey).toBe("NSE_RELIANCE");
    expect(quotes[0]?.tradingSymbol).toBe("RELIANCE");
    expect(calls).toEqual(["quotes:RELIANCE:groww-token"]);
  });

  it("exposes knowledge ingestion through the service port", async () => {
    const persisted: string[] = [];
    const tradeAi = createTradeAiWorkflowService({
      config: {
        databaseUrl: "postgres://tradeai-test",
      },
      repositories: {
        hasConfiguredDatabaseUrl: (databaseUrl) => databaseUrl === "postgres://tradeai-test",
        persistKnowledgeDocument: async (document, databaseUrl) => {
          persisted.push(`${document.title}:${databaseUrl}`);
          return {
            documentId: document.id,
            documentsInserted: 1,
          };
        },
      },
    });

    const report = await Effect.runPromise(
      tradeAi.ingestKnowledgeDocument({
        sourceType: "personal_note",
        title: "Sizing rule",
        body: "Keep sizing conservative when evidence is incomplete.",
      }),
    );

    expect(report.persistence.documentsInserted).toBe(1);
    expect(persisted).toEqual(["Sizing rule:postgres://tradeai-test"]);
  });

  it("deduplicates and caps quote snapshot inputs at the workflow boundary", async () => {
    const calls: string[] = [];
    const tradeAi = createTradeAiWorkflowService({
      marketSources: {
        searchEquityInstruments: (query) => {
          calls.push(`search:${query}`);
          return Effect.succeed([]);
        },
        fetchEquityQuotes: (symbols) => {
          calls.push(`quotes:${symbols.join(",")}`);
          return Effect.succeed([]);
        },
        buildEquityQuoteSnapshot: () => [],
      },
    });

    await Effect.runPromise(
      tradeAi.getEquityQuoteSnapshots({ instrumentKeys: ["RELIANCE", "reliance", "TCS"] }),
    );

    expect(calls).toEqual(["search:RELIANCE", "search:TCS", "quotes:RELIANCE,TCS"]);

    const tooManyKeys = Array.from({ length: MAX_EQUITY_QUOTE_KEYS + 1 }, (_, index) => `SYM${index}`);
    await expect(
      Effect.runPromise(tradeAi.getEquityQuoteSnapshots({ instrumentKeys: tooManyKeys })),
    ).rejects.toThrow(`Maximum allowed is ${MAX_EQUITY_QUOTE_KEYS}`);
  });

  it("reports partial quote fetch failures with successful snapshots attached", async () => {
    const tradeAi = createTradeAiWorkflowService({
      marketSources: {
        searchEquityInstruments: (query) =>
          Effect.succeed([
            {
              instrumentKey: `NSE_${query}`,
              exchange: "NSE",
              tradingSymbol: query,
              shortName: query,
              instrumentType: "EQ",
            },
          ]),
        fetchEquityQuotes: () =>
          Effect.fail(
            Object.assign(new Error("partial Groww quote failure"), {
              quotes: [
                {
                  instrumentKey: "NSE_RELIANCE",
                  tradingSymbol: "RELIANCE",
                  lastPrice: 2500,
                },
              ],
              failures: [
                {
                  instrumentKey: "BROKEN",
                  message: "Groww quote failed for BROKEN",
                },
              ],
            }),
          ),
      },
    });

    const result = await Effect.runPromise(
      Effect.either(tradeAi.getEquityQuoteSnapshots({ instrumentKeys: ["RELIANCE", "BROKEN"] })),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") throw new Error("expected partial quote snapshots");
    expect(result.left).toBeInstanceOf(PartialEquityQuoteSnapshotsError);
    const partialError = result.left as PartialEquityQuoteSnapshotsError;
    expect(partialError.snapshots).toEqual([
      {
        instrumentKey: "NSE_RELIANCE",
        exchange: "NSE",
        tradingSymbol: "RELIANCE",
        shortName: "RELIANCE",
        instrumentType: "EQ",
        lastPrice: 2500,
      },
    ]);
    expect(partialError.failures).toEqual([
      {
        instrumentKey: "BROKEN",
        message: "Groww quote failed for BROKEN",
      },
    ]);

    const batch = await Effect.runPromise(
      tradeAi.getEquityQuoteSnapshotBatch({ instrumentKeys: ["RELIANCE", "BROKEN"] }),
    );
    expect(batch.status).toBe("partial");
    expect(batch.snapshots).toEqual(partialError.snapshots);
    expect(batch.failures).toEqual(partialError.failures);
  });

  it("uses Aftermarkets research sources when configured", async () => {
    const tradeAi = createTradeAiWorkflowService({
      config: {
        researchDataProvider: "aftermarkets",
        aftermarketsApiKey: "am_live_test",
      },
      researchSources: {
        buildEquityResearchPacket: (input) => {
          expect(input.query).toBe("RELIANCE");
          return Effect.succeed({
            ...customResearchPacket,
            source: "aftermarkets",
            researchQuality: {
              source: "aftermarkets",
              completeness: "partial",
              missingSignals: ["events", "memory"],
              fallbacksUsed: ["neutral_score_defaults"],
            },
          });
        },
      },
    });

    const result = await Effect.runPromise(tradeAi.runEquityResearch({ query: "RELIANCE" }));

    expect(result.researchQuality.source).toBe("aftermarkets");
  });

  it("reports provider health without leaking tokens", async () => {
    const holding: BrokerHolding = {
      broker: "indstocks",
      securityId: "500325",
      tradingSymbol: "RELIANCE-EQ",
      exchangeSegment: "NSE_EQ",
      isin: "INE002A01018",
      quantity: 1,
      averagePrice: 2400,
      lastTradedPrice: 2500,
      closePrice: 2490,
      marketValue: 2500,
      pnlAbsolute: 100,
      pnlPercent: 4.17,
    };
    const tradeAi = createTradeAiWorkflowService({
      config: {
        brokerDataProvider: "indstocks",
        marketDataProvider: "groww",
        researchDataProvider: "aftermarkets",
        brokerAccessToken: "secret-broker-token",
        growwAccessToken: "secret-groww-token",
        databaseUrl: "postgresql://runtime-db",
      },
      brokerSources: {
        fetchBrokerHoldings: () => Effect.succeed([holding]),
      },
      marketSources: {
        fetchEquityQuotes: () =>
          Effect.succeed([
            {
              instrumentKey: "RELIANCE",
              tradingSymbol: "RELIANCE",
              lastPrice: 2500,
            },
          ]),
        searchAmfiNav: () =>
          Effect.succeed([
            {
              schemeCode: "123",
              isinDivPayoutOrGrowth: "INF194KB1AL4",
              isinDivReinvestment: "",
              schemeName: "Bandhan Small Cap Fund",
              netAssetValue: "10.5",
              date: "29-Apr-2026",
            },
          ]),
      },
      researchSources: {
        buildEquityResearchPacket: () =>
          Effect.succeed({
            ...customResearchPacket,
            source: "aftermarkets",
          }),
      },
      repositories: {
        hasConfiguredDatabaseUrl: (databaseUrl) => databaseUrl === "postgresql://runtime-db",
      },
    });

    const report = await Effect.runPromise(tradeAi.getProviderHealth());
    const serialized = JSON.stringify(report);

    expect(report.status).toBe("ok");
    expect(report.checks.map((check) => check.status)).toEqual([
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
    ]);
    expect(serialized).not.toContain("secret-broker-token");
    expect(serialized).not.toContain("secret-groww-token");
  });

  it("daily operator report stops before portfolio decisioning when required providers fail", async () => {
    const tradeAi = createTradeAiWorkflowService({
      brokerSources: {
        fetchBrokerHoldings: () => Effect.fail(new Error("expired indstocks token")),
      },
      marketSources: {
        fetchEquityQuotes: () => Effect.succeed([]),
        searchAmfiNav: () => Effect.succeed([]),
      },
      researchSources: {
        buildEquityResearchPacket: () => Effect.succeed(customResearchPacket),
      },
    });

    const report = await Effect.runPromise(tradeAi.getDailyOperatorReport());

    expect(report.health.status).toBe("failed");
    expect(report.decision).toBeUndefined();
    expect(report.dashboard).toBeUndefined();
    expect(report.actionItems[0]?.detail).toContain("INDstocks token");
  });

  it("exposes a UI-ready daily operator view model", async () => {
    const tradeAi = createTradeAiWorkflowService({
      brokerSources: {
        fetchBrokerHoldings: () => Effect.fail(new Error("expired indstocks token")),
      },
      marketSources: {
        fetchEquityQuotes: () => Effect.succeed([]),
        searchAmfiNav: () => Effect.succeed([]),
      },
      researchSources: {
        buildEquityResearchPacket: () => Effect.succeed(customResearchPacket),
      },
    });

    const viewModel = await Effect.runPromise(tradeAi.getDailyOperatorViewModel());

    expect(viewModel.providerHealth.status).toBe("failed");
    expect(viewModel.portfolio.holdingsCount).toBe(0);
    expect(viewModel.portfolio.valuedHoldingsCount).toBe(0);
    expect(viewModel.portfolio.unvaluedHoldingsCount).toBe(0);
    expect(viewModel.portfolio.marketValue).toBeUndefined();
    expect(viewModel.portfolio.weightedPnlPercent).toBeUndefined();
    expect(viewModel.actionItems[0]?.title).toBe("indstocks broker unavailable");
    expect(viewModel.dataQuality.providerIssues.map((issue) => issue.name)).toContain("broker");
    expect(Object.keys(viewModel).sort()).toEqual([
      "actionItems",
      "assetAllocation",
      "conflicts",
      "dataQuality",
      "generatedAt",
      "holdings",
      "portfolio",
      "providerHealth",
      "reviewCandidates",
    ]);
  });

  it("surfaces read-only dashboard database remediation as an action item", async () => {
    const tradeAi = createTradeAiWorkflowService({
      repositories: {
        hasConfiguredDatabaseUrl: () => false,
      },
    });

    const viewModel = await Effect.runPromise(tradeAi.getDailyOperatorReadOnlyViewModel());

    expect(viewModel.providerHealth.status).toBe("degraded");
    expect(viewModel.actionItems[0]).toMatchObject({
      priority: "medium",
      title: "postgres database unavailable",
    });
    expect(viewModel.actionItems[0]?.detail).toContain("Set DATABASE_URL");
  });
});
