import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildBrokerPortfolioDecisionReport,
  buildBrokerPortfolioReviewReport,
  buildHoldingResearchReview,
  reviewImportedPortfolioAgainstResearch,
  reviewPortfolioPositionsAgainstResearch,
  reviewSyncedBrokerPortfolioWithDependencies,
} from "./review-workflows.ts";
import { createTradeAiWorkflowDependencies } from "./ports.ts";
import {
  summarizeHoldingsReview,
  summarizePortfolioDecisionReport,
} from "./report-formatters.ts";
import { buildMockResearchResult } from "./test-fixtures.ts";

describe("app-services / review workflows", () => {
  it("builds a holdings review item and aggregate report", () => {
    const position = {
      symbol: "RELIANCE-EQ",
      isin: "INE002A01018",
      exchangeSegment: "NSE_EQ",
      quantity: 50,
      averagePrice: 2200,
      lastTradedPrice: 2505.1,
      closePrice: 2495,
      marketValue: 125255,
      pnlAbsolute: 15255,
      pnlPercent: 13.87,
      sourceBroker: "indstocks" as const,
    };
    const review = buildHoldingResearchReview(position, "RELIANCE", {
      research: {
        runLabel: "live-run",
        sector: {
          slug: "unclassified",
          name: "Unclassified",
          macroTailwind: 50,
          policySupport: 50,
          geopoliticalEffect: 50,
          upcomingCatalysts: 50,
          sectorSentiment: 50,
          structuralDurability: 50,
          regulatoryRisk: 50,
        },
        sectorScore: { total: 50, label: "watch", reasons: [] },
        instrument: {
          symbol: "RELIANCE",
          name: "Reliance Industries",
          sectorSlug: "unclassified",
          assetType: "stock",
          financialQuality: 60,
          businessQuality: 60,
          managementGovernance: 60,
          sectorAlignment: 50,
          stabilityProfile: 60,
          upsidePotential: 60,
          currentEventContext: 60,
        },
        instrumentScore: { total: 60, label: "research_further", reasons: [] },
        portfolioFit: { total: 90, label: "good_fit", reasons: [] },
        memoryContext: { previousVerdict: "watch", previousConviction: 50, notes: [] },
        recommendation: {
          verdict: "buy",
          conviction: 70,
          stability: "strengthening",
          riskBucket: "moderate",
          keyReasons: [],
          mainRisks: [],
          invalidationConditions: [],
        },
        instrumentIsin: "INE002A01018",
        researchQuality: {
          source: "market",
          completeness: "complete",
          missingSignals: [],
          fallbacksUsed: [],
        },
      },
    });

    const report = buildBrokerPortfolioReviewReport([
      review,
      { symbol: "INFY-EQ", query: "INFY", status: "error", reason: "missing token" },
    ]);

    expect(review.status).toBe("aligned");
    expect(review.reason).toContain("verdict=buy");
    expect(review.reason).toContain("conviction=70");
    expect(review.reason).toContain("quality=complete");
    expect(review.researchQuality?.completeness).toBe("complete");
    expect(report.alignedCount).toBe(1);
    expect(report.errorCount).toBe(1);
    expect(summarizeHoldingsReview(report)).toContain("reviewed=2");
  });

  it("reviews the exact synced Groww snapshot without refetching holdings", async () => {
    let holdingsFetches = 0;
    const research = await buildMockResearchResult({
      symbol: "RELIANCE",
      isin: "INE002A01018",
      verdict: "buy",
    });
    const dependencies = createTradeAiWorkflowDependencies({
      config: { brokerDataProvider: "groww", persistPortfolioSnapshots: false },
      brokerSources: {
        fetchBrokerHoldings: () => {
          holdingsFetches += 1;
          return Effect.succeed([
            {
              broker: "groww" as const,
              securityId: "INE002A01018",
              tradingSymbol: "RELIANCE",
              exchangeSegment: "NSE_EQ",
              isin: "INE002A01018",
              quantity: 5,
              averagePrice: 2400,
              lastTradedPrice: 2500,
              closePrice: 2490,
              marketValue: 12500,
              pnlAbsolute: 500,
              pnlPercent: 4.17,
            },
          ]);
        },
        fetchBrokerTradeBook: () => Effect.succeed([]),
      },
      marketSources: {
        fetchNseInstrumentProfiles: () => Effect.succeed([]),
        fetchEquityQuotes: () => Effect.succeed([]),
      },
      repositories: {
        hasConfiguredDatabaseUrl: () => false,
      },
    });

    const report = await Effect.runPromise(
      reviewSyncedBrokerPortfolioWithDependencies(
        {
          options: {
            researchRunners: {
              runBrokerPositionResearch: () => Effect.fail(new Error("unexpected broker research")),
              runAuthenticatedEquityResearch: () => Effect.succeed(research),
              runPublicEquityResearch: () => Effect.fail(new Error("unexpected public research")),
            },
          },
        },
        dependencies,
      ),
    );

    expect(holdingsFetches).toBe(1);
    expect(report.sync.broker).toBe("groww");
    expect(report.review.broker).toBe("groww");
    expect(report.sync.currentSnapshotId.startsWith("groww:")).toBe(true);
    expect(report.review.alignedCount).toBe(1);
  });

  it("builds a combined broker portfolio decision report", () => {
    const decision = buildBrokerPortfolioDecisionReport(
      {
        broker: "indstocks",
        dbConfigured: false,
        currentSnapshotId: "indstocks:2026-04-17T12:00:00.000Z",
        positionsFetched: 2,
        tradeFillsFetched: 3,
        persisted: false,
        diff: {
          newPositions: 1,
          exitedPositions: 0,
          changedPositions: 1,
          unchangedPositions: 0,
          changes: [],
        },
      },
      {
        broker: "indstocks",
        holdingsReviewed: 2,
        alignedCount: 1,
        reviewCount: 0,
        conflictCount: 1,
        unmatchedCount: 0,
        errorCount: 0,
        reviews: [],
      },
      2,
    );

    expect(decision.sync.positionsFetched).toBe(2);
    expect(decision.review.conflictCount).toBe(1);
    expect(summarizePortfolioDecisionReport(decision)).toContain("positions=2");
    expect(summarizePortfolioDecisionReport(decision)).toContain("reviewsPersisted=2");
  });

  it("reviews imported portfolio holdings against injected research runners", async () => {
    const holdingsPath = "/tmp/tradeai-manual-review-holdings.csv";
    const mockResearch = await buildMockResearchResult({
      symbol: "RELIANCE",
      isin: "INE002A01018",
      verdict: "buy",
    });

    await Bun.write(
      holdingsPath,
      [
        "symbol,isin,exchange_segment,quantity,average_price,last_traded_price,close_price,market_value,pnl_absolute,pnl_percent",
        "RELIANCE-EQ,INE002A01018,NSE_EQ,50,2200,2505.1,2495,125255,15255,13.87",
      ].join("\n"),
    );

    const report = await Effect.runPromise(
      reviewImportedPortfolioAgainstResearch({
        holdingsCsvPath: holdingsPath,
        accessToken: "missing-token",
        options: {
          researchRunners: {
            runBrokerPositionResearch: () => Effect.fail(new Error("unexpected broker research")),
            runAuthenticatedEquityResearch: () => Effect.fail(new Error("missing token")),
            runPublicEquityResearch: () => Effect.succeed(mockResearch),
          },
        },
      }),
    );

    expect(report.broker).toBe("manual_csv");
    expect(report.holdingsReviewed).toBe(1);
    expect(report.alignedCount).toBe(1);
    expect(report.reviews[0]?.researchQuality?.missingSignals).toContain("memory");
  });

  it("reviews funds and ETFs as allocation holdings instead of equity research calls", async () => {
    const holdingsPath = "/tmp/tradeai-allocation-review-holdings.csv";

    await Bun.write(
      holdingsPath,
      [
        "symbol,isin,exchange_segment,quantity,average_price,last_traded_price,close_price,market_value,pnl_absolute,pnl_percent",
        "NIFTYBEES,INF204KB14I2,NSE_EQ,10,270,275,275,2750,50,1.85",
      ].join("\n"),
    );

    const report = await Effect.runPromise(
      reviewImportedPortfolioAgainstResearch({
        holdingsCsvPath: holdingsPath,
        options: {
          researchRunners: {
            runBrokerPositionResearch: () => Effect.fail(new Error("unexpected broker research")),
            runAuthenticatedEquityResearch: () => Effect.fail(new Error("unexpected equity research")),
            runPublicEquityResearch: () => Effect.fail(new Error("unexpected public research")),
          },
        },
      }),
    );

    expect(report.reviewCount).toBe(1);
    expect(report.reviews[0]?.reason).toContain("ETF holding");
    expect(report.reviews[0]?.reason).toContain("portfolio allocation");
  });

  it("renders unavailable allocation PnL without a percent sign", async () => {
    const report = await Effect.runPromise(
      reviewPortfolioPositionsAgainstResearch({
        broker: "indstocks",
        positions: [
          {
            symbol: "NIFTYBEES",
            assetType: "etf",
            isin: "INF204KB14I2",
            exchangeSegment: "NSE_EQ",
            quantity: 10,
            averagePrice: 270,
            marketValue: 2750,
            sourceBroker: "indstocks",
          },
        ],
      }),
    );

    expect(report.reviews[0]?.reason).toContain("pnl=unavailable,");
    expect(report.reviews[0]?.reason).not.toContain("unavailable%");
  });

  it("can fail closed instead of falling back to public research", async () => {
    const holdingsPath = "/tmp/tradeai-manual-review-fail-closed-holdings.csv";
    const publicResearch = await buildMockResearchResult({
      symbol: "RELIANCE",
      isin: "INE002A01018",
      verdict: "buy",
    });

    await Bun.write(
      holdingsPath,
      [
        "symbol,isin,exchange_segment,quantity,average_price,last_traded_price,close_price,market_value,pnl_absolute,pnl_percent",
        "RELIANCE-EQ,INE002A01018,NSE_EQ,50,2200,2505.1,2495,125255,15255,13.87",
      ].join("\n"),
    );

    const report = await Effect.runPromise(
      reviewImportedPortfolioAgainstResearch({
        holdingsCsvPath: holdingsPath,
        accessToken: "missing-token",
        options: {
          allowPublicResearchFallback: false,
          researchRunners: {
            runBrokerPositionResearch: () => Effect.fail(new Error("unexpected broker research")),
            runAuthenticatedEquityResearch: () => Effect.fail(new Error("missing token")),
            runPublicEquityResearch: () => Effect.succeed(publicResearch),
          },
        },
      }),
    );

    expect(report.errorCount).toBe(1);
    expect(report.alignedCount).toBe(0);
    expect(report.reviews[0]?.status).toBe("error");
    expect(report.reviews[0]?.reason).toBe("missing token");
  });
});
