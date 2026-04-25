import { describe, expect, it } from "bun:test";

import {
  buildHoldingStatusChanges,
  buildPortfolioHoldingLeaders,
  buildTodaysActionList,
} from "./dashboard-workflows.ts";

describe("app-services / dashboard workflows", () => {
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
});
