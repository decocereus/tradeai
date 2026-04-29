import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildPortfolioSyncReport,
  importManualPortfolioSnapshot,
} from "./portfolio-workflows.ts";
import { summarizePortfolioSyncReport } from "./report-formatters.ts";

describe("app-services / portfolio workflows", () => {
  it("builds a portfolio sync report", () => {
    const previous = {
      snapshotId: "groww:2026-04-16T12:00:00.000Z",
      broker: "groww",
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
          sourceBroker: "groww",
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
      snapshotId: "groww:2026-04-17T12:00:00.000Z",
      broker: "groww",
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
          sourceBroker: "groww",
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

    expect(report.broker).toBe("groww");
    expect(report.diff.changedPositions).toBe(1);
    expect(report.persisted).toBe(true);
    expect(summarizePortfolioSyncReport(report)).toContain("persisted=true");
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
      importManualPortfolioSnapshot({
        holdingsCsvPath: holdingsPath,
        tradesCsvPath: tradesPath,
        persistence: { persist: false },
      }),
    );

    expect(imported.snapshot.summary.holdingsCount).toBe(1);
    expect(imported.fills).toHaveLength(1);
    expect(imported.report.positionsFetched).toBe(1);
  });
});
