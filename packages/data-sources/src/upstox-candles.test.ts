import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildHistoricalCandlesUrl,
  fetchHistoricalCandles,
  mapHistoricalCandle,
  parseHistoricalCandlesResponse,
} from "./upstox-candles.ts";

describe("data-sources / upstox candles", () => {
  it("maps a candle tuple into a typed candle", () => {
    const candle = mapHistoricalCandle([
      "2025-01-01T00:00:00+05:30",
      100,
      105,
      99,
      104,
      123456,
      10,
    ]);

    expect(candle.close).toBe(104);
    expect(candle.volume).toBe(123456);
  });

  it("builds the historical candle url", () => {
    const url = buildHistoricalCandlesUrl({
      instrumentKey: "NSE_EQ|INE002A01018",
      unit: "days",
      interval: 1,
      toDate: "2026-04-17",
      fromDate: "2026-01-01",
    });

    expect(url).toContain("NSE_EQ%7CINE002A01018");
    expect(url).toContain("/days/1/2026-04-17/2026-01-01");
  });

  it("parses historical candle response", () => {
    const candles = parseHistoricalCandlesResponse({
      data: {
        candles: [
          ["2025-01-01T00:00:00+05:30", 100, 105, 99, 104, 123456, 10],
          ["2025-01-02T00:00:00+05:30", 104, 106, 103, 105, 100000, 9],
        ],
      },
    });

    expect(candles).toHaveLength(2);
    expect(candles[1]?.close).toBe(105);
  });

  it("fetches historical candles with injected fetch", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("historical-candle");
      return new Response(
        JSON.stringify({
          data: {
            candles: [["2025-01-01T00:00:00+05:30", 100, 105, 99, 104, 123456, 10]],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const candles = await Effect.runPromise(
      fetchHistoricalCandles(
        {
          instrumentKey: "NSE_EQ|INE002A01018",
          unit: "days",
          interval: 1,
          toDate: "2026-04-17",
          fromDate: "2026-01-01",
        },
        "secret",
        fetchStub,
      ),
    );

    expect(candles).toHaveLength(1);
  });
});
