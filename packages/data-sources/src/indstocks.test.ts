import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  INDSTOCKS_ACCESS_TOKEN_ENV,
  INDSTOCKS_BASE_URL,
  buildIndstocksScripCode,
  createIndstocksHeaders,
  fetchIndstocksHoldings,
  fetchIndstocksMarketQuotes,
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

  it("explains rejected INDstocks credentials", async () => {
    const fetchStub = (async () =>
      new Response(JSON.stringify({ status: "error" }), { status: 401 })) as unknown as typeof fetch;

    await expect(Effect.runPromise(fetchIndstocksHoldings("expired-token", fetchStub))).rejects.toThrow(
      "Check INDSTOCKS_ACCESS_TOKEN; the configured token was rejected by INDstocks.",
    );
    await expect(Effect.runPromise(fetchIndstocksHoldings("expired-token", fetchStub))).rejects.toThrow(
      "expire daily around 6 AM IST",
    );
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

  it("maps blank-symbol ISIN holdings as mutual fund holdings", () => {
    const holding = mapIndstocksHolding({
      isin: "INF194KB1AL4",
      total_qty: 194,
      avg_price: 0,
    });

    expect(holding).toMatchObject({
      broker: "indstocks",
      securityId: "INF194KB1AL4",
      tradingSymbol: "INF194KB1AL4",
      exchangeSegment: "MF",
      quantity: 194,
    });
  });

  it("maps compact holdings records using quote enrichment", () => {
    const holding = mapIndstocksHolding(
      {
        security_id: "10576",
        symbol: "NIFTYBEES",
        isin: "INF204KB14I2",
        total_qty: 11,
        avg_price: 274.23,
      },
      {
        NSE_10576: {
          live_price: 275.87,
          prev_close: 273.95,
        },
      },
    );

    expect(holding?.tradingSymbol).toBe("NIFTYBEES");
    expect(holding?.lastTradedPrice).toBe(275.87);
    expect(holding?.exchangeSegment).toBe("NSE_EQ");
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

  it("parses compact holdings payload with quotes", () => {
    const holdings = parseIndstocksHoldingsResponse(
      {
        data: [
          {
            security_id: "21401",
            symbol: "TATAGOLD",
            isin: "INF277KA1976",
            total_qty: 108,
            avg_price: 14.74,
          },
        ],
      },
      {
        NSE_21401: {
          live_price: 14.65,
          prev_close: 14.74,
        },
      },
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.marketValue).toBeCloseTo(1582.2);
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
      if (String(input) === `${INDSTOCKS_BASE_URL}/portfolio/holdings`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                security_id: "10576",
                symbol: "NIFTYBEES",
                isin: "INF204KB14I2",
                total_qty: 11,
                avg_price: 274.23,
              },
            ],
          }),
          { status: 200 },
        );
      }

      expect(String(input)).toContain("/market/quotes/full?scrip-codes=");
      return new Response(
        JSON.stringify({
          data: {
            NSE_10576: {
              live_price: 275.87,
              prev_close: 273.95,
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchIndstocksHoldings("secret", fetchStub));
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.tradingSymbol).toBe("NIFTYBEES");
  });

  it("keeps holdings usable when INDstocks quote enrichment fails", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      if (String(input) === `${INDSTOCKS_BASE_URL}/portfolio/holdings`) {
        return new Response(
          JSON.stringify({
            data: [
              {
                security_id: "10576",
                symbol: "NIFTYBEES",
                isin: "INF204KB14I2",
                total_qty: 11,
                avg_price: 274.23,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ status: "error" }), { status: 400 });
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchIndstocksHoldings("secret", fetchStub));
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.lastTradedPrice).toBe(274.23);
  });

  it("fetches market quotes with injected fetch", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("scrip-codes=NSE_10576");
      return new Response(
        JSON.stringify({
          data: {
            NSE_10576: {
              live_price: 275.87,
              prev_close: 273.95,
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const quotes = await Effect.runPromise(
      fetchIndstocksMarketQuotes([buildIndstocksScripCode("10576")], "secret", fetchStub),
    );
    expect(quotes.NSE_10576?.live_price).toBe(275.87);
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
