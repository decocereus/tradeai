import { describe, expect, it } from "bun:test";

import {
  createPortfolioSnapshotId,
  serializeBrokerTradeBook,
  serializeBrokerTradeFill,
  serializePortfolioPosition,
  serializePortfolioSnapshot,
} from "./portfolio.ts";

describe("db / portfolio serialization", () => {
  const createdAt = new Date("2026-04-17T12:00:00.000Z");
  const snapshotId = createPortfolioSnapshotId("indstocks", createdAt);

  it("serializes a portfolio position into a DB-ready record", () => {
    const record = serializePortfolioPosition(
      {
        symbol: "RELIANCE-EQ",
        isin: "INE002A01018",
        exchangeSegment: "NSE_EQ",
        quantity: 50,
        averagePrice: 2200.1234,
        lastTradedPrice: 2505.1,
        closePrice: 2495,
        marketValue: 125255,
        pnlAbsolute: 15255,
        pnlPercent: 13.87,
        sourceBroker: "indstocks",
      },
      snapshotId,
      createdAt,
    );

    expect(record.averagePrice).toBe("2200.1234");
    expect(record.snapshotId).toBe(snapshotId);
    expect(record.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("serializes a broker trade fill into a DB-ready record", () => {
    const record = serializeBrokerTradeFill(
      {
        broker: "indstocks",
        fillId: 1020280,
        exchangeOrderId: "2400000124991381",
        quantity: 2425,
        price: 1.55,
        tradeDate: "2025-11-11T17:48:23+05:30",
        tradeSerialNumber: "17628437030186581215",
        scripCode: "99133",
      },
      snapshotId,
      createdAt,
    );

    expect(record.price).toBe("1.5500");
    expect(record.snapshotId).toBe(snapshotId);
    expect(record.tradeDate.toISOString()).toContain("2025-11-11");
  });

  it("serializes full portfolio snapshots and trade books", () => {
    const positions = serializePortfolioSnapshot(
      {
        snapshotId,
        broker: "indstocks",
        capturedAt: createdAt.toISOString(),
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
          valuedHoldingsCount: 1,
          unvaluedHoldingsCount: 0,
          totalMarketValue: 125255,
          totalPnlAbsolute: 15255,
          weightedPnlPercent: 13.87,
          topWinnerSymbol: "RELIANCE-EQ",
          topLoserSymbol: "RELIANCE-EQ",
        },
      },
      createdAt,
    );

    const fills = serializeBrokerTradeBook(
      [
        {
          broker: "indstocks",
          fillId: 1020280,
          exchangeOrderId: "2400000124991381",
          quantity: 2425,
          price: 1.55,
          tradeDate: "2025-11-11T17:48:23+05:30",
          tradeSerialNumber: "17628437030186581215",
          scripCode: "99133",
        },
      ],
      snapshotId,
      createdAt,
    );

    expect(positions).toHaveLength(1);
    expect(fills).toHaveLength(1);
  });
});
