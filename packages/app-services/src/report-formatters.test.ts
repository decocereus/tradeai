import { describe, expect, it } from "bun:test";

import {
  summarizeBrokerHolding,
  summarizeHoldingReviewTrendReport,
  summarizePortfolioDashboardReport,
} from "./report-formatters.ts";

describe("app-services / report formatters", () => {
  it("summarizes broker holdings with instrument names", () => {
    const summary = summarizeBrokerHolding(
      "RELIANCE-EQ",
      "Reliance Industries Limited",
      50,
      2200,
      13.87,
    );

    expect(summary).toContain("RELIANCE-EQ");
    expect(summary).toContain("Reliance Industries Limited");
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
          valuedHoldingsCount: 1,
          unvaluedHoldingsCount: 0,
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
      assetAllocation: [],
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
});
