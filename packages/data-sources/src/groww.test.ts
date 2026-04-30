import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildGrowwExchangeSymbol,
  buildGrowwQuoteSnapshot,
  fetchGrowwAccessToken,
  fetchGrowwHoldings,
  fetchGrowwQuoteSnapshot,
  generateGrowwChecksum,
  MAX_GROWW_QUOTE_KEYS,
  mapGrowwHolding,
  mapGrowwQuoteEntry,
  PartialGrowwQuoteSnapshotError,
  parseGrowwInstrumentCsv,
  resolveGrowwAccessToken,
} from "./groww.ts";

describe("data-sources / groww", () => {
  it("requires an access token", () => {
    const previous = process.env.GROWW_ACCESS_TOKEN;
    delete process.env.GROWW_ACCESS_TOKEN;
    try {
      expect(() => resolveGrowwAccessToken()).toThrow("Missing Groww access token");
      expect(() => resolveGrowwAccessToken()).toThrow("expire daily around 6 AM IST");
    } finally {
      if (previous) process.env.GROWW_ACCESS_TOKEN = previous;
    }
  });

  it("generates checksums and access tokens from API key credentials", async () => {
    expect(generateGrowwChecksum("secret", "1719830400")).toBe(
      "88a2717290e5a55d3180bc94e5a9258ae7df766924a6fc2f1c5cbd6e6804930a",
    );

    const requests: RequestInit[] = [];
    const fetchStub = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) requests.push(init);
      return new Response(JSON.stringify({ token: "access-token" }));
    }) as typeof fetch;

    const token = await Effect.runPromise(
      fetchGrowwAccessToken({
        apiKey: "api-key",
        apiSecret: "secret",
        timestamp: "1719830400",
        fetchImpl: fetchStub,
      }),
    );

    expect(token).toBe("access-token");
    expect(String(requests[0]?.body)).toContain("approval");
  });

  it("maps holdings into broker holdings", () => {
    expect(
      mapGrowwHolding(
        {
          isin: "INE002A01018",
          trading_symbol: "RELIANCE",
          quantity: 10,
          average_price: 1400,
        },
        {
          instrumentKey: "NSE_RELIANCE",
          tradingSymbol: "RELIANCE",
          lastPrice: 1500,
          closePrice: 1490,
        },
      ),
    ).toMatchObject({
      broker: "groww",
      tradingSymbol: "RELIANCE",
      isin: "INE002A01018",
      quantity: 10,
      averagePrice: 1400,
      lastTradedPrice: 1500,
      closePrice: 1490,
      marketValue: 15000,
      pnlAbsolute: 1000,
      priceProvenance: {
        status: "market_enriched",
        source: "market",
        marketDataProvider: "groww",
        quoteSymbol: "RELIANCE",
      },
    });
  });

  it("fetches holdings with injected fetch", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/live-data/quote")) {
        return new Response(
          JSON.stringify({
            status: "SUCCESS",
            payload: {
              last_price: 1500,
              ohlc: { close: 1490 },
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            holdings: [
              {
                isin: "INE002A01018",
                trading_symbol: "RELIANCE",
                quantity: 10,
                average_price: 1400,
              },
            ],
          },
        }),
      );
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchGrowwHoldings("token", fetchStub));
    expect(holdings[0]?.broker).toBe("groww");
    expect(holdings[0]?.lastTradedPrice).toBe(1500);
    expect(holdings[0]?.pnlAbsolute).toBe(1000);
  });

  it("keeps holdings visible with explicit unavailable provenance when quote enrichment fails", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/live-data/quote")) {
        return new Response("unavailable", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            holdings: [
              {
                isin: "INE002A01018",
                trading_symbol: "RELIANCE",
                quantity: 10,
                average_price: 1400,
              },
            ],
          },
        }),
      );
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchGrowwHoldings("token", fetchStub));
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      broker: "groww",
      tradingSymbol: "RELIANCE",
      priceProvenance: {
        status: "market_unavailable",
        source: "fallback",
        marketDataProvider: "groww",
        quoteSymbol: "RELIANCE",
      },
    });
    expect(holdings[0]?.marketValue).toBeUndefined();
    expect(holdings[0]?.pnlAbsolute).toBeUndefined();
    expect(holdings[0]?.priceProvenance?.message).toContain("valuation and PnL are unavailable");
  });

  it("does not drop valid quote enrichment when one holding quote fails", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("trading_symbol=BAD")) {
        return new Response("unavailable", { status: 500 });
      }
      if (url.includes("/live-data/quote")) {
        return new Response(
          JSON.stringify({
            status: "SUCCESS",
            payload: {
              last_price: 1500,
              ohlc: { close: 1490 },
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            holdings: [
              {
                isin: "INE002A01018",
                trading_symbol: "RELIANCE",
                quantity: 10,
                average_price: 1400,
              },
              {
                isin: "INE000000000",
                trading_symbol: "BAD",
                quantity: 1,
                average_price: 100,
              },
            ],
          },
        }),
      );
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchGrowwHoldings("token", fetchStub));
    expect(holdings.find((holding) => holding.tradingSymbol === "RELIANCE")?.lastTradedPrice).toBe(1500);
    expect(holdings.find((holding) => holding.tradingSymbol === "BAD")?.priceProvenance).toMatchObject({
      status: "market_unavailable",
      source: "fallback",
      marketDataProvider: "groww",
    });
  });

  it("bounds concurrent quote enrichment for holdings", async () => {
    let activeQuotes = 0;
    let maxActiveQuotes = 0;
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/live-data/quote")) {
        activeQuotes += 1;
        maxActiveQuotes = Math.max(maxActiveQuotes, activeQuotes);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeQuotes -= 1;
        return new Response(
          JSON.stringify({
            status: "SUCCESS",
            payload: {
              last_price: 100,
              ohlc: { close: 99 },
            },
          }),
        );
      }

      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            holdings: Array.from({ length: 20 }, (_, index) => ({
              isin: `INE${String(index).padStart(9, "0")}`,
              trading_symbol: `SYM${index}`,
              quantity: 1,
              average_price: 90,
            })),
          },
        }),
      );
    }) as unknown as typeof fetch;

    const holdings = await Effect.runPromise(fetchGrowwHoldings("token", fetchStub));

    expect(holdings).toHaveLength(20);
    expect(maxActiveQuotes).toBeLessThanOrEqual(8);
  });

  it("maps quotes and quote snapshots", () => {
    const quote = mapGrowwQuoteEntry("NSE_RELIANCE", {
      last_price: 1425.4,
      ohlc: "{open: 1392,high: 1433.8,low: 1391.3,close: 1388.9}",
      volume: 30542143,
    });

    expect(quote).toEqual({
      instrumentKey: "NSE_RELIANCE",
      tradingSymbol: "RELIANCE",
      lastPrice: 1425.4,
      closePrice: 1388.9,
      volume: 30542143,
      openInterest: undefined,
    });

    expect(
      buildGrowwQuoteSnapshot(
        [
          {
            instrumentKey: "NSE_RELIANCE",
            exchange: "NSE",
            tradingSymbol: "RELIANCE",
            shortName: "Reliance Industries",
            instrumentType: "EQ",
            isin: "INE002A01018",
          },
        ],
        quote ? [quote] : [],
      )[0],
    ).toMatchObject({
      instrumentKey: "NSE_RELIANCE",
      tradingSymbol: "RELIANCE",
      shortName: "Reliance Industries",
      lastPrice: 1425.4,
    });
  });

  it("fetches quotes with injected fetch", async () => {
    const urls: string[] = [];
    const fetchStub = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            last_price: 1425.4,
            ohlc: { close: 1388.9 },
          },
        }),
      );
    }) as typeof fetch;

    const quotes = await Effect.runPromise(fetchGrowwQuoteSnapshot(["RELIANCE"], "token", fetchStub));

    expect(urls[0]).toContain("trading_symbol=RELIANCE");
    expect(quotes[0]?.instrumentKey).toBe("NSE_RELIANCE");
  });

  it("deduplicates quote snapshot keys before fetching", async () => {
    const urls: string[] = [];
    const fetchStub = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            last_price: 1425.4,
            ohlc: { close: 1388.9 },
          },
        }),
      );
    }) as typeof fetch;

    const quotes = await Effect.runPromise(
      fetchGrowwQuoteSnapshot(["RELIANCE", "reliance", "NSE_RELIANCE"], "token", fetchStub),
    );

    expect(quotes).toHaveLength(1);
    expect(urls.filter((url) => url.includes("/live-data/quote"))).toHaveLength(1);
  });

  it("reports partial quote snapshot failures with successful rows attached", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("trading_symbol=BROKEN")) {
        return new Response(JSON.stringify({ status: "FAILURE" }), { status: 500 });
      }

      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            last_price: 1425.4,
            ohlc: { close: 1388.9 },
          },
        }),
      );
    }) as typeof fetch;

    const result = await Effect.runPromise(
      Effect.either(fetchGrowwQuoteSnapshot(["RELIANCE", "BROKEN"], "token", fetchStub)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") throw new Error("expected partial quote failure");
    expect(result.left).toBeInstanceOf(PartialGrowwQuoteSnapshotError);
    const partialError = result.left as PartialGrowwQuoteSnapshotError;
    expect(partialError.quotes).toHaveLength(1);
    expect(partialError.quotes[0]?.tradingSymbol).toBe("RELIANCE");
    expect(partialError.failures).toEqual([
      {
        instrumentKey: "BROKEN",
        message: "Groww quote fetch failed with status 500: {\"status\":\"FAILURE\"}",
      },
    ]);
  });

  it("bounds concurrent quote snapshot requests", async () => {
    let activeQuotes = 0;
    let maxActiveQuotes = 0;
    const fetchStub = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/live-data/quote")) {
        activeQuotes += 1;
        maxActiveQuotes = Math.max(maxActiveQuotes, activeQuotes);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeQuotes -= 1;
      }

      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          payload: {
            last_price: 1425.4,
            ohlc: { close: 1388.9 },
          },
        }),
      );
    }) as typeof fetch;

    const quotes = await Effect.runPromise(
      fetchGrowwQuoteSnapshot(
        Array.from({ length: 20 }, (_, index) => `SYM${index}`),
        "token",
        fetchStub,
      ),
    );

    expect(quotes).toHaveLength(20);
    expect(maxActiveQuotes).toBeLessThanOrEqual(8);
  });

  it("rejects unbounded quote snapshot requests at the data-source boundary", async () => {
    await expect(
      Effect.runPromise(
        fetchGrowwQuoteSnapshot(
          Array.from({ length: MAX_GROWW_QUOTE_KEYS + 1 }, (_, index) => `SYM${index}`),
          "token",
          (() => {
            throw new Error("fetch should not run");
          }) as unknown as typeof fetch,
        ),
      ),
    ).rejects.toThrow(`Maximum allowed is ${MAX_GROWW_QUOTE_KEYS}`);
  });

  it("parses Groww instrument CSV", () => {
    const profiles = parseGrowwInstrumentCsv(
      [
        "exchange,exchange_token,trading_symbol,groww_symbol,name,instrument_type,segment,series,isin,lot_size,tick_size,freeze_quantity",
        "NSE,2885,RELIANCE,NSE-RELIANCE,Reliance Industries Limited,EQ,CASH,EQ,INE002A01018,1,0.05,100000",
      ].join("\n"),
    );

    expect(buildGrowwExchangeSymbol("RELIANCE")).toBe("NSE_RELIANCE");
    expect(profiles[0]).toMatchObject({
      instrumentKey: "NSE_RELIANCE",
      tradingSymbol: "RELIANCE",
      name: "Reliance Industries Limited",
      isin: "INE002A01018",
    });
  });
});
