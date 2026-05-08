import { describe, expect, it } from "bun:test";

import type { PortfolioPositionSnapshot } from "@tradeai/domain";
import { buildPortfolioMemorySnapshot } from "@tradeai/memory";

import {
  extractPortfolioSnapshotHeaders,
  materializeKnowledgeDocument,
  materializePortfolioMemorySnapshot,
  resolvePreferredPortfolioDashboardBroker,
} from "./repository.ts";

describe("db / repository helpers", () => {
  const positions: PortfolioPositionSnapshot[] = [
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
  ];

  it("extracts unique snapshot headers from rows", () => {
    const snapshot = buildPortfolioMemorySnapshot(
      positions,
      "indstocks",
      new Date("2026-04-17T12:00:00.000Z"),
    );

    const headers = extractPortfolioSnapshotHeaders([
      {
        snapshotId: snapshot.snapshotId,
        broker: "indstocks",
        payload: positions[0]!,
        createdAt: new Date("2026-04-17T12:00:00.000Z"),
      },
      {
        snapshotId: snapshot.snapshotId,
        broker: "indstocks",
        payload: positions[0]!,
        createdAt: new Date("2026-04-17T12:00:00.000Z"),
      },
    ]);

    expect(headers).toHaveLength(1);
    expect(headers[0]?.snapshotId).toBe(snapshot.snapshotId);
  });

  it("materializes a portfolio memory snapshot from rows", () => {
    const snapshot = materializePortfolioMemorySnapshot([
      {
        snapshotId: "indstocks:1",
        broker: "indstocks",
        payload: positions[0]!,
        createdAt: new Date("2026-04-17T12:00:00.000Z"),
      },
    ]);

    expect(snapshot?.positions).toHaveLength(1);
    expect(snapshot?.summary.holdingsCount).toBe(1);
  });

  it("materializes valued snapshots with unavailable PnL when PnL is missing", () => {
    const snapshot = materializePortfolioMemorySnapshot([
      {
        snapshotId: "indstocks:1",
        broker: "indstocks",
        payload: {
          symbol: "VALUED-NO-PNL",
          isin: "INE000000000",
          exchangeSegment: "NSE_EQ",
          quantity: 10,
          averagePrice: 0,
          lastTradedPrice: 100,
          marketValue: 1000,
          sourceBroker: "indstocks",
        },
        createdAt: new Date("2026-04-17T12:00:00.000Z"),
      },
    ]);

    expect(snapshot?.summary.totalMarketValue).toBe(1000);
    expect(snapshot?.summary.totalPnlAbsolute).toBeUndefined();
    expect(snapshot?.summary.weightedPnlPercent).toBeUndefined();
  });

  it("selects Groww as a preferred or latest dashboard broker", () => {
    const headers = [
      {
        snapshotId: "groww:2026-04-18T12:00:00.000Z",
        broker: "groww" as const,
        capturedAt: "2026-04-18T12:00:00.000Z",
      },
      {
        snapshotId: "indstocks:2026-04-17T12:00:00.000Z",
        broker: "indstocks" as const,
        capturedAt: "2026-04-17T12:00:00.000Z",
      },
    ];

    expect(resolvePreferredPortfolioDashboardBroker(headers)).toBe("groww");
    expect(resolvePreferredPortfolioDashboardBroker(headers, "indstocks")).toBe("indstocks");
    expect(resolvePreferredPortfolioDashboardBroker(headers, "manual_csv", true)).toBe("manual_csv");
  });

  it("materializes persisted knowledge documents with safe metadata", () => {
    const document = materializeKnowledgeDocument({
      id: "knowledge:personal_note:1",
      sourceType: "personal_note",
      title: "Position sizing",
      body: "Keep position sizing aligned with drawdown tolerance.",
      metadata: { tags: ["risk"] },
      createdAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    expect(document.sourceType).toBe("personal_note");
    expect(document.metadata).toEqual({ tags: ["risk"] });
    expect(document.createdAt).toBe("2026-05-08T00:00:00.000Z");

    const malformed = materializeKnowledgeDocument({
      id: "knowledge:manual:1",
      sourceType: "manual",
      title: "Malformed metadata",
      body: "Metadata must remain object-shaped.",
      metadata: ["not", "object"],
      createdAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    expect(malformed.metadata).toEqual({});
  });
});
