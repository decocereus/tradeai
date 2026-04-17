import { describe, expect, it } from "bun:test";

import type { HistoricalCandle } from "@tradeai/domain";

import {
  analyzeHistoricalCandles,
  calculateEma,
  calculateReturns,
  calculateRsi,
  calculateSma,
  calculateVolatility,
  inferTrend,
} from "./index.ts";

const makeCandles = (closes: number[]): HistoricalCandle[] =>
  closes.map((close, index) => ({
    timestamp: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00+05:30`,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1000 + index,
    openInterest: 0,
  }));

describe("market-analysis", () => {
  const candles = makeCandles([
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    110, 111, 112, 113, 114, 115, 116, 117, 118, 119,
    120, 121, 122, 123, 124, 125, 126, 127, 128, 129,
    130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
    140, 141, 142, 143, 144, 145, 146, 147, 148, 149,
    150, 151, 152, 153, 154, 155, 156, 157, 158, 159,
  ]);

  it("calculates moving averages", () => {
    expect(calculateSma(candles, 20)).toBe(149.5);
    expect(calculateEma(candles, 20)).toBeDefined();
  });

  it("calculates returns and volatility", () => {
    const returns = calculateReturns(candles);
    expect(returns.oneDayPct).toBeCloseTo((159 - 158) / 158 * 100, 6);
    expect(calculateVolatility(candles, 20)).toBeDefined();
  });

  it("calculates RSI", () => {
    const rsi = calculateRsi(candles, 14);
    expect(rsi).toBeDefined();
    expect(rsi).toBeGreaterThan(70);
  });

  it("infers bullish trend when price is above key averages", () => {
    expect(inferTrend(159, 149.5, 134.5, 75)).toBe("bullish");
  });

  it("builds a technical analysis snapshot", () => {
    const analysis = analyzeHistoricalCandles(candles);
    expect(analysis).toBeDefined();
    expect(analysis?.trend).toBe("bullish");
    expect(analysis?.latestClose).toBe(159);
  });
});
