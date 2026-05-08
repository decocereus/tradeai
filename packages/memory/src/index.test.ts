import { describe, expect, it } from "bun:test";

import {
  buildMemoryContextFromReviewHistory,
  buildPortfolioMemorySnapshot,
  diffPortfolioMemorySnapshots,
  summarizeHoldingReviewTrend,
} from "./index.ts";

describe("memory", () => {
  it("builds a portfolio memory snapshot", () => {
    const snapshot = buildPortfolioMemorySnapshot(
      [
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
      "indstocks",
      new Date("2026-04-17T12:00:00.000Z"),
    );

    expect(snapshot.snapshotId).toContain("indstocks:");
    expect(snapshot.summary.holdingsCount).toBe(1);
  });

  it("diffs portfolio memory snapshots", () => {
    const previous = buildPortfolioMemorySnapshot(
      [
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
      "indstocks",
      new Date("2026-04-16T12:00:00.000Z"),
    );

    const current = buildPortfolioMemorySnapshot(
      [
        {
          symbol: "RELIANCE-EQ",
          isin: "INE002A01018",
          exchangeSegment: "NSE_EQ",
          quantity: 60,
          averagePrice: 2200,
          lastTradedPrice: 2505.1,
          closePrice: 2495,
          marketValue: 150306,
          pnlAbsolute: 18306,
          pnlPercent: 13.87,
          sourceBroker: "indstocks",
        },
        {
          symbol: "TCS-EQ",
          isin: "INE467B01029",
          exchangeSegment: "NSE_EQ",
          quantity: 5,
          averagePrice: 3600,
          lastTradedPrice: 3700,
          closePrice: 3690,
          marketValue: 18500,
          pnlAbsolute: 500,
          pnlPercent: 2.77,
          sourceBroker: "indstocks",
        },
      ],
      "indstocks",
      new Date("2026-04-17T12:00:00.000Z"),
    );

    const diff = diffPortfolioMemorySnapshots(previous, current);
    expect(diff.changedPositions).toBe(1);
    expect(diff.newPositions).toBe(1);
  });

  it("summarizes holding review trend from history", () => {
    const trend = summarizeHoldingReviewTrend("RELIANCE-EQ", [
      {
        snapshotId: "indstocks:2026-04-17T12:00:00.000Z",
        symbol: "RELIANCE-EQ",
        query: "RELIANCE",
        status: "conflict",
        reason: "Research would currently reject this holding.",
        verdict: "reject",
        conviction: 42,
        runLabel: "run-2",
        reviewedAt: "2026-04-17T12:00:00.000Z",
      },
      {
        snapshotId: "indstocks:2026-04-16T12:00:00.000Z",
        symbol: "RELIANCE-EQ",
        query: "RELIANCE",
        status: "conflict",
        reason: "Research would currently reject this holding.",
        verdict: "reject",
        conviction: 40,
        runLabel: "run-1",
        reviewedAt: "2026-04-16T12:00:00.000Z",
      },
      {
        snapshotId: "indstocks:2026-04-15T12:00:00.000Z",
        symbol: "RELIANCE-EQ",
        query: "RELIANCE",
        status: "review",
        reason: "Research downgraded the holding to watch.",
        verdict: "watch",
        conviction: 55,
        runLabel: "run-0",
        reviewedAt: "2026-04-15T12:00:00.000Z",
      },
    ]);

    expect(trend?.latestStatus).toBe("conflict");
    expect(trend?.streakCount).toBe(2);
  });

  it("builds research memory from persisted holding review history", () => {
    const memory = buildMemoryContextFromReviewHistory({
      symbol: "RELIANCE-EQ",
      history: [
        {
          snapshotId: "indstocks:2026-04-17T12:00:00.000Z",
          symbol: "RELIANCE-EQ",
          query: "RELIANCE",
          status: "conflict",
          reason: "Research would currently reject this holding.",
          verdict: "reject",
          conviction: 42,
          runLabel: "run-2",
          reviewedAt: "2026-04-17T12:00:00.000Z",
        },
      ],
    });

    expect(memory.previousVerdict).toBe("reject");
    expect(memory.previousConviction).toBe(42);
    expect(memory.notes[0]).toContain("RELIANCE-EQ was conflict");
  });

  it("does not invent prior memory when no persisted history exists", () => {
    const memory = buildMemoryContextFromReviewHistory({ symbol: "RELIANCE" });

    expect(memory.previousVerdict).toBe("watch");
    expect(memory.previousConviction).toBe(50);
    expect(memory.notes).toEqual(["No prior case memory found for RELIANCE."]);
  });
});
