import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildPortfolioSyncReport,
  getBrokerHoldings,
  importManualPortfolioSnapshot,
} from "./portfolio-workflows.ts";
import { summarizePortfolioSyncReport } from "./report-formatters.ts";

describe("app-services / portfolio workflows", () => {
  it("keeps INDstocks as broker while enriching prices from Groww market data", async () => {
    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {
          accessToken: "indstocks-token",
          marketAccessToken: "groww-token",
        },
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: (accessToken) => {
              expect(accessToken).toBe("indstocks-token");
              return Effect.succeed([
                {
                  broker: "indstocks",
                  securityId: "500325",
                  tradingSymbol: "RELIANCE-EQ",
                  exchangeSegment: "NSE_EQ",
                  isin: "INE002A01018",
                  quantity: 10,
                  averagePrice: 1300,
                  lastTradedPrice: 1300,
                  closePrice: 1300,
                  marketValue: 13000,
                  pnlAbsolute: 0,
                  pnlPercent: 0,
                },
              ]);
            },
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () =>
              Effect.succeed([
                {
                  instrumentKey: "NSE_RELIANCE",
                  exchange: "NSE",
                  tradingSymbol: "RELIANCE",
                  name: "Reliance Industries Limited",
                  instrumentType: "EQ",
                },
              ]),
            fetchEquityQuotes: (symbols, accessToken) => {
              expect(symbols).toEqual(["RELIANCE"]);
              expect(accessToken).toBe("groww-token");
              return Effect.succeed([
                {
                  instrumentKey: "NSE_RELIANCE",
                  tradingSymbol: "RELIANCE",
                  lastPrice: 1425,
                  closePrice: 1400,
                },
              ]);
            },
            searchAmfiNav: () => Effect.succeed([]),
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(holdings[0]?.broker).toBe("indstocks");
    expect(holdings[0]?.instrumentName).toBe("Reliance Industries Limited");
    expect(holdings[0]?.lastTradedPrice).toBe(1425);
    expect(holdings[0]?.pnlAbsolute).toBe(1250);
    expect(holdings[0]?.priceProvenance).toMatchObject({
      status: "market_enriched",
      source: "market",
      marketDataProvider: "groww",
    });
  });

  it("enriches INDstocks mutual fund rows from AMFI NAV by ISIN", async () => {
    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {},
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: () =>
              Effect.succeed([
                {
                  broker: "indstocks",
                  securityId: "INF194KB1AL4",
                  tradingSymbol: "INF194KB1AL4",
                  exchangeSegment: "MF",
                  isin: "INF194KB1AL4",
                  quantity: 194,
                  averagePrice: 0,
                  lastTradedPrice: 0,
                  closePrice: 0,
                  marketValue: 0,
                  pnlAbsolute: 0,
                  pnlPercent: 0,
                },
              ]),
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () => Effect.succeed([]),
            fetchEquityQuotes: () => Effect.fail(new Error("unexpected equity quote")),
            searchAmfiNav: (query) => {
              expect(query).toBe("INF194KB1AL4");
              return Effect.succeed([
                {
                  schemeCode: "147622",
                  isinDivPayoutOrGrowth: "INF194KB1AL4",
                  isinDivReinvestment: "-",
                  schemeName: "Bandhan Small Cap Fund - Direct Plan - Growth",
                  netAssetValue: "46.48",
                  date: "29-Apr-2026",
                },
              ]);
            },
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(holdings[0]).toMatchObject({
      broker: "indstocks",
      tradingSymbol: "Bandhan Small Cap Fund - Direct Plan - Growth",
      exchangeSegment: "MF",
      lastTradedPrice: 46.48,
      priceProvenance: {
        status: "market_enriched",
        source: "market",
        marketDataProvider: "amfi",
      },
    });
    expect(holdings[0]?.marketValue).toBeCloseTo(9017.12);
    expect(holdings[0]?.pnlAbsolute).toBeUndefined();
    expect(holdings[0]?.pnlPercent).toBeUndefined();
  });

  it("marks AMFI outages as unavailable instead of missing NAV", async () => {
    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {},
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: () =>
              Effect.succeed([
                {
                  broker: "indstocks" as const,
                  securityId: "INF194KB1AL4",
                  tradingSymbol: "INF194KB1AL4",
                  exchangeSegment: "MF",
                  isin: "INF194KB1AL4",
                  quantity: 194,
                  averagePrice: 42,
                  lastTradedPrice: 46,
                  closePrice: 45,
                  marketValue: 8924,
                  pnlAbsolute: 776,
                  pnlPercent: 9.52,
                },
              ]),
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () => Effect.succeed([]),
            fetchEquityQuotes: () => Effect.fail(new Error("unexpected equity quote")),
            searchAmfiNav: () => Effect.fail(new Error("AMFI feed unavailable")),
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(holdings[0]?.priceProvenance).toMatchObject({
      status: "market_unavailable",
      source: "fallback",
      marketDataProvider: "amfi",
      message: "AMFI feed unavailable",
    });
    expect(holdings[0]?.lastTradedPrice).toBeUndefined();
    expect(holdings[0]?.marketValue).toBeUndefined();
    expect(holdings[0]?.pnlAbsolute).toBeUndefined();
    expect(holdings[0]?.pnlPercent).toBeUndefined();
  });

  it("fetches equity quote enrichment in one bounded batch", async () => {
    let quoteFetches = 0;
    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {
          marketAccessToken: "groww-token",
        },
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: () =>
              Effect.succeed([
                {
                  broker: "indstocks" as const,
                  securityId: "500325",
                  tradingSymbol: "RELIANCE-EQ",
                  exchangeSegment: "NSE_EQ",
                  isin: "INE002A01018",
                  quantity: 1,
                  averagePrice: 100,
                },
                {
                  broker: "indstocks" as const,
                  securityId: "532540",
                  tradingSymbol: "TCS-EQ",
                  exchangeSegment: "NSE_EQ",
                  isin: "INE467B01029",
                  quantity: 1,
                  averagePrice: 100,
                },
              ]),
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () =>
              Effect.succeed([
                {
                  instrumentKey: "NSE_RELIANCE",
                  exchange: "NSE",
                  tradingSymbol: "RELIANCE",
                  name: "Reliance Industries Limited",
                  instrumentType: "EQ",
                },
                {
                  instrumentKey: "NSE_TCS",
                  exchange: "NSE",
                  tradingSymbol: "TCS",
                  name: "Tata Consultancy Services Limited",
                  instrumentType: "EQ",
                },
              ]),
            fetchEquityQuotes: (symbols, accessToken) => {
              quoteFetches += 1;
              expect(symbols).toEqual(["RELIANCE", "TCS"]);
              expect(accessToken).toBe("groww-token");
              return Effect.succeed([
                { instrumentKey: "NSE_RELIANCE", tradingSymbol: "RELIANCE", lastPrice: 120 },
                { instrumentKey: "NSE_TCS", tradingSymbol: "TCS", lastPrice: 90 },
              ]);
            },
            searchAmfiNav: () => Effect.succeed([]),
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(quoteFetches).toBe(1);
    expect(holdings.map((holding) => holding.lastTradedPrice)).toEqual([120, 90]);
  });

  it("chunks portfolio quote enrichment under the quote cap", async () => {
    const quoteBatches: string[][] = [];
    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {
          marketAccessToken: "groww-token",
        },
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: () =>
              Effect.succeed(
                Array.from({ length: 55 }, (_, index) => ({
                  broker: "indstocks" as const,
                  securityId: `SEC${index}`,
                  tradingSymbol: `SYM${index}-EQ`,
                  exchangeSegment: "NSE_EQ",
                  isin: `INE${String(index).padStart(9, "0")}`,
                  quantity: 1,
                  averagePrice: 100,
                })),
              ),
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () => Effect.succeed([]),
            fetchEquityQuotes: (symbols) => {
              quoteBatches.push([...symbols]);
              expect(symbols.length).toBeLessThanOrEqual(50);
              return Effect.succeed(
                symbols.map((symbol) => ({
                  instrumentKey: `NSE_${symbol}`,
                  tradingSymbol: symbol,
                  lastPrice: 120,
                })),
              );
            },
            searchAmfiNav: () => Effect.succeed([]),
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(quoteBatches.map((batch) => batch.length)).toEqual([50, 5]);
    expect(holdings).toHaveLength(55);
    expect(holdings.every((holding) => holding.lastTradedPrice === 120)).toBe(true);
  });

  it("marks per-symbol quote failures as unavailable instead of missing", async () => {
    const partialError = Object.assign(new Error("partial Groww quote failure"), {
      quotes: [
        {
          instrumentKey: "NSE_RELIANCE",
          tradingSymbol: "RELIANCE",
          lastPrice: 120,
        },
      ],
      failures: [
        {
          instrumentKey: "BROKEN",
          message: "Groww quote failed for BROKEN: 500",
        },
      ],
    });

    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {
          marketAccessToken: "groww-token",
        },
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: () =>
              Effect.succeed([
                {
                  broker: "indstocks" as const,
                  securityId: "500325",
                  tradingSymbol: "RELIANCE-EQ",
                  exchangeSegment: "NSE_EQ",
                  isin: "INE002A01018",
                  quantity: 1,
                  averagePrice: 100,
                },
                {
                  broker: "indstocks" as const,
                  securityId: "BROKEN",
                  tradingSymbol: "BROKEN-EQ",
                  exchangeSegment: "NSE_EQ",
                  isin: "INE000000000",
                  quantity: 1,
                  averagePrice: 100,
                },
              ]),
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () => Effect.succeed([]),
            fetchEquityQuotes: () => Effect.fail(partialError),
            searchAmfiNav: () => Effect.succeed([]),
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(holdings[0]?.priceProvenance?.status).toBe("market_enriched");
    expect(holdings[0]?.lastTradedPrice).toBe(120);
    expect(holdings[1]?.priceProvenance).toMatchObject({
      status: "market_unavailable",
      message: "Groww quote failed for BROKEN: 500",
    });
    expect(holdings[1]?.lastTradedPrice).toBeUndefined();
  });

  it("preserves broker PnL when current price is unavailable", async () => {
    const holdings = await Effect.runPromise(
      getBrokerHoldings(
        {},
        {
          config: { marketDataProvider: "groww" },
          brokerSources: {
            fetchBrokerHoldings: () =>
              Effect.succeed([
                {
                  broker: "indstocks" as const,
                  securityId: "500325",
                  tradingSymbol: "RELIANCE-EQ",
                  exchangeSegment: "NSE_EQ",
                  isin: "INE002A01018",
                  quantity: 10,
                  averagePrice: 100,
                  marketValue: 1250,
                  pnlAbsolute: 250,
                  pnlPercent: 25,
                },
              ]),
            fetchBrokerTradeBook: () => Effect.succeed([]),
          },
          marketSources: {
            fetchNseInstrumentProfiles: () => Effect.succeed([]),
            fetchEquityQuotes: () => Effect.succeed([]),
            searchAmfiNav: () => Effect.succeed([]),
            searchCorporateEvents: () => Effect.succeed([]),
            fetchCorporateEvents: () => Effect.succeed([]),
            searchEquityProfiles: () => Effect.succeed([]),
            searchEquityInstruments: () => Effect.succeed([]),
            buildEquityQuoteSnapshot: () => [],
          },
          researchSources: {} as never,
          memorySource: {} as never,
          repositories: {} as never,
        },
      ),
    );

    expect(holdings[0]?.lastTradedPrice).toBeUndefined();
    expect(holdings[0]?.marketValue).toBe(1250);
    expect(holdings[0]?.pnlAbsolute).toBe(250);
    expect(holdings[0]?.pnlPercent).toBe(25);
  });

  it("records price enrichment misses in sync reports", () => {
    const current = {
      snapshotId: "indstocks:2026-04-17T12:00:00.000Z",
      broker: "indstocks",
      capturedAt: "2026-04-17T12:00:00.000Z",
      positions: [
        {
          symbol: "MISSING-EQ",
          isin: "INE000000000",
          exchangeSegment: "NSE_EQ",
          quantity: 1,
          averagePrice: 100,
          lastTradedPrice: 100,
          closePrice: 100,
          marketValue: 100,
          pnlAbsolute: 0,
          pnlPercent: 0,
          sourceBroker: "indstocks",
          priceProvenance: {
            status: "market_missing",
            source: "fallback",
            marketDataProvider: "groww",
            quoteSymbol: "MISSING",
          },
        },
      ],
      summary: {
        holdingsCount: 1,
        valuedHoldingsCount: 1,
        unvaluedHoldingsCount: 0,
        totalMarketValue: 100,
        totalPnlAbsolute: 0,
        weightedPnlPercent: 0,
      },
    } as const;

    const report = buildPortfolioSyncReport(undefined, current, 0, false, undefined, {
      status: "unsupported",
      message: "Groww trade-book adapter is not implemented yet.",
    });

    expect(report.broker).toBe("indstocks");
    expect(report.priceEnrichment?.fallbackPositions).toBe(1);
    expect(report.priceEnrichment?.missingSymbols).toEqual(["MISSING-EQ"]);
    expect(report.tradeBook?.status).toBe("unsupported");
    expect(summarizePortfolioSyncReport(report)).toContain("prices=groww:0 enriched/1 fallback");
  });

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
        valuedHoldingsCount: 1,
        unvaluedHoldingsCount: 0,
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
        valuedHoldingsCount: 1,
        unvaluedHoldingsCount: 0,
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
