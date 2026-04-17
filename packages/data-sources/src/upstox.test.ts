import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  UPSTOX_ACCESS_TOKEN_ENV,
  buildEquityResearchPacket,
  buildUpstoxQuoteSnapshot,
  buildResearchPacketFromUpstoxSnapshot,
  createUpstoxHeaders,
  fetchUpstoxQuoteSnapshot,
  mapUpstoxSearchEntry,
  parseUpstoxQuoteResponse,
  parseUpstoxSearchResponse,
  resolveUpstoxAccessToken,
  searchUpstoxInstruments,
} from "./upstox.ts";

import type { UpstoxInstrumentProfile } from "@tradeai/domain";
import { selectPreferredUpstoxInstrumentProfile } from "./upstox-instruments.ts";

describe("data-sources / upstox", () => {
  it("resolves explicit access token before environment fallback", () => {
    expect(resolveUpstoxAccessToken("token-123")).toBe("token-123");
  });

  it("throws when no access token is available", () => {
    const previous = process.env[UPSTOX_ACCESS_TOKEN_ENV];
    delete process.env[UPSTOX_ACCESS_TOKEN_ENV];

    try {
      expect(() => resolveUpstoxAccessToken()).toThrow("Missing Upstox access token");
    } finally {
      if (previous) process.env[UPSTOX_ACCESS_TOKEN_ENV] = previous;
    }
  });

  it("creates auth headers for upstox calls", () => {
    expect(createUpstoxHeaders("secret")).toEqual({
      Accept: "application/json",
      Authorization: "Bearer secret",
    });
  });

  it("maps search records into typed entries", () => {
    const results = parseUpstoxSearchResponse({
      data: [
        {
          instrument_key: "NSE_EQ|INE002A01018",
          exchange: "NSE_EQ",
          trading_symbol: "RELIANCE",
          short_name: "Reliance Industries",
          instrument_type: "EQ",
          isin: "INE002A01018",
        },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.instrumentKey).toBe("NSE_EQ|INE002A01018");
  });

  it("drops incomplete search records", () => {
    expect(
      mapUpstoxSearchEntry({
        instrument_key: "NSE_EQ|BROKEN",
      }),
    ).toBeNull();
  });

  it("maps quote payloads into typed entries", () => {
    const results = parseUpstoxQuoteResponse({
      data: {
        "NSE_EQ|INE002A01018": {
          instrument_key: "NSE_EQ|INE002A01018",
          trading_symbol: "RELIANCE",
          last_price: 2945.4,
          close_price: 2901.1,
          volume: 123456,
          oi: 111,
        },
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.lastPrice).toBe(2945.4);
  });

  it("builds a merged quote snapshot from search and quote data", () => {
    const snapshots = buildUpstoxQuoteSnapshot(
      [
        {
          instrumentKey: "NSE_EQ|INE002A01018",
          exchange: "NSE_EQ",
          tradingSymbol: "RELIANCE",
          shortName: "Reliance Industries",
          instrumentType: "EQ",
          isin: "INE002A01018",
        },
      ],
      [
        {
          instrumentKey: "NSE_EQ|INE002A01018",
          tradingSymbol: "RELIANCE",
          lastPrice: 2945.4,
          closePrice: 2901.1,
          volume: 123456,
          openInterest: 111,
        },
      ],
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.shortName).toBe("Reliance Industries");
    expect(snapshots[0]?.lastPrice).toBe(2945.4);
  });

  it("selects the preferred instrument by exact trading symbol match", () => {
    const selected = selectPreferredUpstoxInstrumentProfile("reliance", [
      {
        instrumentKey: "NSE_EQ|ONE",
        exchange: "NSE_EQ",
        tradingSymbol: "RELIANCE",
        name: "RELIANCE INDUSTRIES LTD",
        shortName: "Reliance Industries",
        instrumentType: "EQ",
        isin: "INE002A01018",
      },
      {
        instrumentKey: "NSE_EQ|TWO",
        exchange: "NSE_EQ",
        tradingSymbol: "RPOWER",
        name: "RELIANCE POWER LTD",
        shortName: "Reliance Power",
        instrumentType: "EQ",
        isin: undefined,
      },
    ]);

    expect(selected?.instrumentKey).toBe("NSE_EQ|ONE");
  });

  it("builds a conservative market-driven research packet from a quote snapshot", () => {
    const packet = buildResearchPacketFromUpstoxSnapshot(
      {
        instrumentKey: "NSE_EQ|INE002A01018",
        tradingSymbol: "RELIANCE",
        shortName: "Reliance Industries",
        exchange: "NSE_EQ",
        instrumentType: "EQ",
        lastPrice: 2945.4,
        closePrice: 2901.1,
        volume: 123456,
        openInterest: 111,
        isin: "INE002A01018",
        profile: {
          instrumentKey: "NSE_EQ|INE002A01018",
          exchange: "NSE",
          tradingSymbol: "RELIANCE",
          name: "RELIANCE INDUSTRIES LTD",
          shortName: "Reliance Industries",
          isin: "INE002A01018",
          instrumentType: "EQ",
          securityType: "NORMAL",
          lotSize: 1,
          freezeQuantity: 100000,
          tickSize: 10,
          exchangeToken: "2885",
          mtfEnabled: true,
          mtfBracket: 26.5,
          intradayMargin: 20,
          intradayLeverage: 5,
        } satisfies UpstoxInstrumentProfile,
      },
    );

    expect(packet.source).toBe("upstox_quote");
    expect(packet.instrument.symbol).toBe("RELIANCE");
    expect(packet.instrument.currentEventContext).toBeGreaterThan(45);
    expect(packet.instrument.financialQuality).toBe(45);
  });

  it("builds a full equity research packet from injected search and quote responses", async () => {
    let requestCount = 0;
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestCount += 1;
      if (url.includes("NSE.json.gz")) {
        const { gzipSync } = await import("node:zlib");
        return new Response(
          gzipSync(
            Buffer.from(
              JSON.stringify([
                {
                  segment: "NSE_EQ",
                  name: "RELIANCE INDUSTRIES LTD",
                  exchange: "NSE",
                  isin: "INE002A01018",
                  instrument_type: "EQ",
                  instrument_key: "NSE_EQ|INE002A01018",
                  trading_symbol: "RELIANCE",
                  short_name: "Reliance Industries",
                  security_type: "NORMAL",
                  mtf_enabled: true,
                },
              ]),
            ),
          ),
          { status: 200 },
        );
      }

      if (url.includes("company-share-price/INE002A01018")) {
        return new Response(
          `
            <div id="Fundamentals">
              <h2>Reliance Fundamentals</h2>
              <div class="text-sm font-medium leading-5 text-gray-accent3">ROE</div>
              <div class="text-sm font-medium leading-5 text-light-black">12.5%</div>
              <div class="text-sm font-medium leading-5 text-gray-accent3">Debt/Equity ratio</div>
              <div class="text-sm font-medium leading-5 text-light-black">0.3</div>
            </div>
            <div id="Shareholder returns"></div>
            <p>The market capitalization of Reliance is ₹18,00,000 Crs.</p>
            <div id="Revenue statement">
              <tr><td><div>Mar-25</div></td><td><div>₹4,70,915.93</div></td><td><div>₹96,242.05</div></td><td><div>₹73,440.17</div></td></tr>
              <tr><td><div>Mar-24</div></td><td><div>₹4,07,994.77</div></td><td><div>₹76,568.60</div></td><td><div>₹65,446.50</div></td></tr>
            </div>
            <div id="Cash flow"></div>
          `,
          { status: 200 },
        );
      }

      if (url.includes("announcements.xml")) {
        return new Response(
          `
            <rss version="2.0">
              <channel>
                <item>
                  <title>Reliance Industries Ltd (500325)</title>
                  <link>https://www.bseindia.com/xml-data/corpfiling/AttachLive/sample1.pdf</link>
                  <scripcode>500325</scripcode>
                  <description>Financial Results for quarter ended March 2026</description>
                  <pubDate>17-Apr-2026 13:39:53</pubDate>
                </item>
              </channel>
            </rss>
          `,
          { status: 200 },
        );
      }

      expect(url).toContain("instrument_key=NSE_EQ%7CINE002A01018");
      return new Response(
        JSON.stringify({
          data: {
            "NSE_EQ|INE002A01018": {
              instrument_key: "NSE_EQ|INE002A01018",
              trading_symbol: "RELIANCE",
              last_price: 2945.4,
              close_price: 2901.1,
              volume: 123456,
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const packet = await Effect.runPromise(buildEquityResearchPacket("reliance", "secret", fetchStub));

    expect(requestCount).toBe(5);
    expect(packet.source).toBe("upstox_quote");
    expect(packet.instrument.symbol).toBe("RELIANCE");
    expect(packet.runLabel).toContain("reliance");
    expect(packet.instrument.financialQuality).toBeGreaterThan(45);
  });

  it("uses injected fetch for instrument search", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("query=reliance");
      return new Response(
        JSON.stringify({
          data: [
            {
              instrument_key: "NSE_EQ|INE002A01018",
              exchange: "NSE_EQ",
              trading_symbol: "RELIANCE",
              short_name: "Reliance Industries",
              instrument_type: "EQ",
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const results = await Effect.runPromise(
      searchUpstoxInstruments({ query: "reliance" }, "secret", fetchStub),
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.tradingSymbol).toBe("RELIANCE");
  });

  it("uses injected fetch for quote retrieval", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("instrument_key=NSE_EQ%7CINE002A01018");
      return new Response(
        JSON.stringify({
          data: {
            "NSE_EQ|INE002A01018": {
              instrument_key: "NSE_EQ|INE002A01018",
              trading_symbol: "RELIANCE",
              last_price: 2945.4,
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const results = await Effect.runPromise(
      fetchUpstoxQuoteSnapshot(["NSE_EQ|INE002A01018"], "secret", fetchStub),
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.instrumentKey).toBe("NSE_EQ|INE002A01018");
  });
});
