import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  INDSTOCKS_ACCESS_TOKEN_ENV,
  INDSTOCKS_BASE_URL,
  createIndstocksHeaders,
  fetchIndstocksHoldings,
  fetchIndstocksTradeBook,
  mapIndstocksHolding,
  mapIndstocksTradeFill,
  parseIndstocksHoldingsResponse,
  parseIndstocksTradeBookResponse,
  resolveIndstocksAccessToken,
} from "./indstocks.ts";

describe("data-sources / indstocks", () => {
  it("resolves explicit access token before env fallback", () => {
    expect(resolveIndstocksAccessToken("token-123")).toBe("token-123");
  });

  it("throws when no INDstocks token is available", () => {
    const previous = process.env[INDSTOCKS_ACCESS_TOKEN_ENV];
    delete process.env[INDSTOCKS_ACCESS_TOKEN_ENV];

    try {
      expect(() => resolveIndstocksAccessToken()).toThrow("Missing INDstocks access token");
    } finally {
      if (previous) process.env[INDSTOCKS_ACCESS_TOKEN_ENV] = previous;
    }
  });

  it("creates INDstocks auth headers", () => {
    expect(createIndstocksHeaders("secret")).toEqual({
      Authorization: "secret",
    });
  });

  it("maps holdings records", () => {
    const holding = mapIndstocksHolding({
      security_id: "12345",
      trading_symbol: "RELIANCE-EQ",
      exchange_segment: "NSE_EQ",
      isin: "INE002A01018",
      quantity: 50,
      average_price: 2200,
      last_traded_price: 2505.1,
      close_price: 2495,
      market_value: 125255,
      pnl_absolute: 15255,
      pnl_percent: 13.87,
    });

    expect(holding?.tradingSymbol).toBe("RELIANCE-EQ");
    expect(holding?.broker).toBe("indstocks");
  });

  it("maps trade-book records", () => {
    const fill = mapIndstocksTradeFill({
      fill_id: 1020280,
      exch_order_id: "2400000124991381",
      quantity: 2425,
      price: 1.55,
      trade_date: "2025-11-11T17:48:23+05:30",
      trade_serial_no: "17628437030186581215",
      scrip_code: "99133",
    });

    expect(fill?.fillId).toBe(1020280);
    expect(fill?.broker).toBe("indstocks");
  });

  it("parses holdings response payload", () => {
    const holdings = parseIndstocksHoldingsResponse({
      data: [
        {
          security_id: "12345",
          trading_symbol: "RELIANCE-EQ",
          exchange_segment: "NSE_EQ",
          isin: "INE002A01018",
          quantity: 50,
          average_price: 2200,
          last_traded_price: 2505.1,
          close_price: 2495,
          market_value: 125255,
          pnl_absolute: 15255,
          pnl_percent: 13.87,
        },
      ],
    });

    expect(holdings).toHaveLength(1);
  });

  it("parses trade-book response payload", () => {
    const fills = parseIndstocksTradeBookResponse({
      data: [
        {
          fill_id: 1020280,
          exch_order_id: "2400000124991381",
          quantity: 2425,
          price: 1.55,
          trade_date: "2025-11-11T17:48:23+05:30",
          trade_serial_no: "17628437030186581215",
          scrip_code: "99133",
        },
      ],
    });

    expect(fills).toHaveLength(1);
  });

  it("fetches holdings with injected fetch", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${INDSTOCKS_BASE_URL}/portfolio/holdings`);
      return new Response(
        JSON.stringify({
          data: [
            {
              security_id: "12345",
              trading_symbol: "RELIANCE-EQ",
              exchange_segment: "NSE_EQ",
              isin: "INE002A01018",
              quantity: 50,
              average_price: 2200,
              last_traded_price: 2505.1,
              close_price: 2495,
              market_value: 125255,
              pnl_absolute: 15255,
              pnl_percent: 13.87,
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchIndstocksHoldings("secret", fetchStub));
    expect(holdings).toHaveLength(1);
  });

  it("fetches trade-book with injected fetch", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/trade-book?segment=EQUITY");
      return new Response(
        JSON.stringify({
          data: [
            {
              fill_id: 1020280,
              exch_order_id: "2400000124991381",
              quantity: 2425,
              price: 1.55,
              trade_date: "2025-11-11T17:48:23+05:30",
              trade_serial_no: "17628437030186581215",
              scrip_code: "99133",
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const fills = await Effect.runPromise(fetchIndstocksTradeBook("EQUITY", "secret", fetchStub));
    expect(fills).toHaveLength(1);
  });
});
