import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildHoldingStatusChanges,
  buildPortfolioHoldingLeaders,
  buildTodaysActionList,
  buildBrokerPortfolioDecisionReport,
  buildBrokerPortfolioReviewReport,
  buildHoldingResearchReview,
  buildPortfolioSyncReport,
  importManualPortfolioSnapshot,
  runPublicEquityResearch,
  reviewImportedPortfolioAgainstResearch,
  buildResearchResult,
  summarizeHoldingReviewTrendReport,
  summarizeHoldingsReview,
  summarizePortfolioDashboardReport,
  runDailyResearch,
  summarizeDailyResearch,
  summarizePortfolioDecisionReport,
  summarizePortfolioSyncReport,
} from "./index.ts";

describe("app-services", () => {
  it("runs the daily research slice end to end", async () => {
    const result = await Effect.runPromise(runDailyResearch);

    expect(result.runLabel).toBe("demo-daily-run");
    expect(result.recommendation.verdict).toBe("buy");
    expect(result.instrument.symbol).toBe("DEMO");
  });

  it("summarizes the daily research result compactly", async () => {
    const result = await Effect.runPromise(runDailyResearch);
    const summary = summarizeDailyResearch(result);

    expect(summary).toContain("DEMO");
    expect(summary).toContain("verdict=buy");
    expect(summary).toContain("conviction=");
  });

  it("builds a scored research result from an arbitrary packet", async () => {
    const result = await Effect.runPromise(
      buildResearchResult(
        {
          runLabel: "custom-packet",
          source: "upstox_quote",
          sector: {
            slug: "unclassified",
            name: "Unclassified",
            macroTailwind: 50,
            policySupport: 50,
            geopoliticalEffect: 50,
            upcomingCatalysts: 55,
            sectorSentiment: 58,
            structuralDurability: 45,
            regulatoryRisk: 50,
          },
          instrument: {
            symbol: "RELIANCE",
            name: "Reliance Industries",
            sectorSlug: "unclassified",
            assetType: "stock",
            financialQuality: 45,
            businessQuality: 45,
            managementGovernance: 45,
            sectorAlignment: 50,
            stabilityProfile: 55,
            upsidePotential: 57,
            currentEventContext: 60,
          },
          portfolioExposures: [],
        },
        {
          previousVerdict: "watch",
          previousConviction: 50,
          notes: ["prior packet"],
        },
      ),
    );

    expect(result.runLabel).toBe("custom-packet");
    expect(result.recommendation.verdict).toBe("reject");
    expect(result.instrument.symbol).toBe("RELIANCE");
  });

  it("builds a portfolio sync report", () => {
    const previous = {
      snapshotId: "indstocks:2026-04-16T12:00:00.000Z",
      broker: "indstocks",
      capturedAt: "2026-04-16T12:00:00.000Z",
      positions: [
        {
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
          sourceBroker: "indstocks",
        },
      ],
      summary: {
        holdingsCount: 1,
        totalMarketValue: 125255,
        totalPnlAbsolute: 15255,
        weightedPnlPercent: 12.18,
        topWinnerSymbol: "RELIANCE-EQ",
        topLoserSymbol: "RELIANCE-EQ",
      },
    } as const;

    const current = {
      snapshotId: "indstocks:2026-04-17T12:00:00.000Z",
      broker: "indstocks",
      capturedAt: "2026-04-17T12:00:00.000Z",
      positions: [
        {
          symbol: "RELIANCE-EQ",
          isin: "INE002A01018",
          exchangeSegment: "NSE_EQ",
          quantity: 55,
          averagePrice: 2200,
          lastTradedPrice: 2505.1,
          closePrice: 2495,
          marketValue: 137780.5,
          pnlAbsolute: 16780.5,
          pnlPercent: 13.87,
          sourceBroker: "indstocks",
        },
      ],
      summary: {
        holdingsCount: 1,
        totalMarketValue: 137780.5,
        totalPnlAbsolute: 16780.5,
        weightedPnlPercent: 12.17,
        topWinnerSymbol: "RELIANCE-EQ",
        topLoserSymbol: "RELIANCE-EQ",
      },
    } as const;

    const report = buildPortfolioSyncReport(previous, current, 3, true, {
      positionsInserted: 1,
      tradeFillsInserted: 3,
    });

    expect(report.diff.changedPositions).toBe(1);
    expect(report.persisted).toBe(true);
    expect(summarizePortfolioSyncReport(report)).toContain("persisted=true");
  });

  it("builds a holdings review item and aggregate report", () => {
    const review = buildHoldingResearchReview("RELIANCE-EQ", "RELIANCE", {
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
      },
    });

    const report = buildBrokerPortfolioReviewReport([
      review,
      { symbol: "INFY-EQ", query: "INFY", status: "error", reason: "missing token" },
    ]);

    expect(review.status).toBe("aligned");
    expect(report.alignedCount).toBe(1);
    expect(report.errorCount).toBe(1);
    expect(summarizeHoldingsReview(report)).toContain("reviewed=2");
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

  it("builds portfolio holding leaders from snapshot positions", () => {
    const leaders = buildPortfolioHoldingLeaders([
      {
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
        sourceBroker: "manual_csv",
      },
      {
        symbol: "TCS-EQ",
        isin: "INE467B01029",
        exchangeSegment: "NSE_EQ",
        quantity: 10,
        averagePrice: 3900,
        lastTradedPrice: 3600,
        closePrice: 3620,
        marketValue: 36000,
        pnlAbsolute: -3000,
        pnlPercent: -7.69,
        sourceBroker: "manual_csv",
      },
    ]);

    expect(leaders.topWinners[0]?.symbol).toBe("RELIANCE-EQ");
    expect(leaders.topLosers[0]?.symbol).toBe("TCS-EQ");
  });

  it("builds holding status changes between review snapshots", () => {
    const changes = buildHoldingStatusChanges(
      {
        broker: "manual_csv",
        holdingsReviewed: 2,
        alignedCount: 1,
        reviewCount: 1,
        conflictCount: 0,
        unmatchedCount: 0,
        errorCount: 0,
        reviews: [
          { symbol: "RELIANCE-EQ", query: "RELIANCE", status: "review", reason: "watch now" },
          { symbol: "TCS-EQ", query: "TCS", status: "aligned", reason: "buy still" },
        ],
      },
      {
        broker: "manual_csv",
        holdingsReviewed: 1,
        alignedCount: 0,
        reviewCount: 0,
        conflictCount: 1,
        unmatchedCount: 0,
        errorCount: 0,
        reviews: [
          { symbol: "RELIANCE-EQ", query: "RELIANCE", status: "conflict", reason: "reject then" },
        ],
      },
    );

    expect(changes).toEqual([
      {
        symbol: "RELIANCE-EQ",
        previousStatus: "conflict",
        currentStatus: "review",
        changeType: "changed",
      },
      {
        symbol: "TCS-EQ",
        currentStatus: "aligned",
        changeType: "newly_reviewed",
      },
    ]);
  });

  it("builds today's action list from dashboard signals", () => {
    const actions = buildTodaysActionList({
      topConflicts: [
        {
          symbol: "RELIANCE-EQ",
          query: "RELIANCE",
          status: "conflict",
          reason: "Research would currently reject this holding.",
        },
      ],
      topReviewCandidates: [
        {
          symbol: "TCS-EQ",
          query: "TCS",
          status: "review",
          reason: "Research downgraded the holding to watch.",
        },
      ],
      unreviewedPositions: [
        {
          symbol: "INFY-EQ",
          marketValue: 50000,
          pnlAbsolute: 1000,
          pnlPercent: 2,
          quantity: 10,
        },
      ],
      statusChanges: [
        {
          symbol: "HDFCBANK-EQ",
          previousStatus: "unmatched",
          currentStatus: "review",
          changeType: "changed",
        },
      ],
    });

    expect(actions[0]?.priority).toBe("high");
    expect(actions[0]?.title).toContain("RELIANCE-EQ");
    expect(actions.some((action) => action.title.includes("INFY-EQ"))).toBe(true);
    expect(actions.some((action) => action.title.includes("HDFCBANK-EQ"))).toBe(true);
  });

  it("summarizes a holding review trend report", () => {
    const summary = summarizeHoldingReviewTrendReport({
      symbol: "RELIANCE-EQ",
      latestStatus: "conflict",
      latestReviewedAt: "2026-04-17T12:00:00.000Z",
      streakCount: 3,
      history: [],
    });

    expect(summary).toContain("RELIANCE-EQ");
    expect(summary).toContain("streak=3");
  });

  it("summarizes a portfolio dashboard report", () => {
    const summary = summarizePortfolioDashboardReport({
      broker: "manual_csv",
      latestSnapshot: {
        snapshotId: "manual_csv:2026-04-17T12:00:00.000Z",
        broker: "manual_csv",
        capturedAt: "2026-04-17T12:00:00.000Z",
        positions: [],
        summary: {
          holdingsCount: 1,
          totalMarketValue: 125255,
          totalPnlAbsolute: 15255,
          weightedPnlPercent: 12.18,
          topWinnerSymbol: "RELIANCE-EQ",
          topLoserSymbol: "RELIANCE-EQ",
        },
      },
      recentSnapshots: [
        {
          snapshotId: "manual_csv:2026-04-17T12:00:00.000Z",
          broker: "manual_csv",
          capturedAt: "2026-04-17T12:00:00.000Z",
        },
      ],
      reviewSnapshot: {
        snapshotId: "manual_csv:2026-04-16T12:00:00.000Z",
        broker: "manual_csv",
        capturedAt: "2026-04-16T12:00:00.000Z",
      },
      latestReview: {
        broker: "manual_csv",
        holdingsReviewed: 2,
        alignedCount: 0,
        reviewCount: 1,
        conflictCount: 1,
        unmatchedCount: 0,
        errorCount: 0,
        reviews: [],
      },
      topWinners: [],
      topLosers: [],
      topConflicts: [],
      topReviewCandidates: [],
      statusChanges: [],
      unreviewedPositions: [],
      streakLeaders: [],
      todaysActions: [],
    });

    expect(summary).toContain("broker=manual_csv");
    expect(summary).toContain("reviewSnapshot=manual_csv:2026-04-16T12:00:00.000Z");
    expect(summary).toContain("snapshotChanges=0");
    expect(summary).toContain("statusChanges=0");
    expect(summary).toContain("todaysActions=0");
    expect(summary).toContain("topConflicts=0");
    expect(summary).toContain("reviewed=2");
  });

  it("imports a manual portfolio snapshot from CSV files", async () => {
    const holdingsPath = "/tmp/tradeai-manual-holdings.csv";
    const tradesPath = "/tmp/tradeai-manual-trades.csv";

    await Bun.write(
      holdingsPath,
      [
        "symbol,isin,exchange_segment,quantity,average_price,last_traded_price,close_price,market_value,pnl_absolute,pnl_percent",
        "RELIANCE-EQ,INE002A01018,NSE_EQ,50,2200,2505.1,2495,125255,15255,13.87",
      ].join("\n"),
    );

    await Bun.write(
      tradesPath,
      [
        "order_id,quantity,price,trade_date,trade_serial_no,symbol",
        "2400000124991381,2425,1.55,2025-11-11T17:48:23+05:30,17628437030186581215,99133",
      ].join("\n"),
    );

    const imported = await Effect.runPromise(
      importManualPortfolioSnapshot(holdingsPath, tradesPath),
    );

    expect(imported.snapshot.summary.holdingsCount).toBe(1);
    expect(imported.fills).toHaveLength(1);
    expect(imported.report.positionsFetched).toBe(1);
  });

  it("reviews imported portfolio holdings against research", async () => {
    const holdingsPath = "/tmp/tradeai-manual-review-holdings.csv";

    await Bun.write(
      holdingsPath,
      [
        "symbol,isin,exchange_segment,quantity,average_price,last_traded_price,close_price,market_value,pnl_absolute,pnl_percent",
        "RELIANCE-EQ,INE002A01018,NSE_EQ,50,2200,2505.1,2495,125255,15255,13.87",
      ].join("\n"),
    );

    const report = await Effect.runPromise(reviewImportedPortfolioAgainstResearch(holdingsPath, "missing-token"));

    expect(report.broker).toBe("manual_csv");
    expect(report.holdingsReviewed).toBe(1);
  });

  it("runs public fallback equity research without broker auth", async () => {
    const result = await Effect.runPromise(runPublicEquityResearch("HDFCBANK"));

    expect(result.instrument.symbol).toBe("HDFCBANK");
    expect(result.sector.name).toBe("Banking & Financial Services");
  });
});
