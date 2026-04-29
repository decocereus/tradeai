import { describe, expect, it } from "bun:test";

import { serializeHoldingReviewEntry, serializeHoldingReviewReport } from "./review-history.ts";

describe("db / review history serialization", () => {
  const createdAt = new Date("2026-04-17T12:00:00.000Z");

  it("serializes one holding review entry", () => {
    const record = serializeHoldingReviewEntry(
      "indstocks:2026-04-17T12:00:00.000Z",
      "indstocks",
      {
        snapshotId: "indstocks:2026-04-17T12:00:00.000Z",
        symbol: "RELIANCE-EQ",
        query: "RELIANCE",
        status: "aligned",
        reason: "Research still supports the holding.",
        verdict: "buy",
        conviction: 72.5,
        runLabel: "market-reliance-research",
        reviewedAt: createdAt.toISOString(),
      },
      createdAt,
    );

    expect(record.conviction).toBe("72.50");
    expect(record.snapshotId).toContain("indstocks:");
  });

  it("serializes a full holding review report", () => {
    const records = serializeHoldingReviewReport(
      "indstocks:2026-04-17T12:00:00.000Z",
      {
        broker: "indstocks",
        holdingsReviewed: 2,
        alignedCount: 1,
        reviewCount: 0,
        conflictCount: 1,
        unmatchedCount: 0,
        errorCount: 0,
        reviews: [
          {
            symbol: "RELIANCE-EQ",
            query: "RELIANCE",
            status: "aligned",
            reason: "Research still supports the holding.",
            verdict: "buy",
            conviction: 72.5,
            runLabel: "market-reliance-research",
            researchQuality: {
              source: "market",
              completeness: "partial",
              missingSignals: ["candles"],
              fallbacksUsed: ["neutral_score_defaults"],
            },
          },
          {
            symbol: "INFY-EQ",
            query: "INFY",
            status: "conflict",
            reason: "Research would currently reject this holding.",
            verdict: "reject",
            conviction: 40,
            runLabel: "market-infy-research",
          },
        ],
      },
      createdAt,
    );

    expect(records).toHaveLength(2);
    expect(records[1]?.status).toBe("conflict");
    expect(records[0]?.payload.researchQuality?.missingSignals).toEqual(["candles"]);
  });
});
