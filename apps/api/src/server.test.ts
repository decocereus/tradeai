import { describe, expect, it } from "bun:test";
import type {
  EquityInstrumentProfile,
  EquityQuoteSnapshot,
} from "@tradeai/domain";
import { Effect } from "effect";

import { createApiRequestHandler } from "./server.ts";

const readJson = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe("api server", () => {
  it("serves health", async () => {
    const handler = createApiRequestHandler();
    const response = await handler(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ status: "ok" });
  });

  it("validates required query params", async () => {
    const handler = createApiRequestHandler();
    const response = await handler(new Request("http://localhost/market/equities/search"));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      error: "Missing required query parameter: q",
    });
  });

  it("routes equity search through injected market sources", async () => {
    const profile: EquityInstrumentProfile = {
      instrumentKey: "NSE_EQ|INE002A01018",
      exchange: "NSE",
      tradingSymbol: "RELIANCE",
      name: "Reliance Industries",
      instrumentType: "EQ",
    };
    const handler = createApiRequestHandler({
      marketSources: {
        searchEquityProfiles: (query) =>
          query === "reliance" ? Effect.succeed([profile]) : Effect.succeed([]),
      },
    });

    const response = await handler(
      new Request("http://localhost/market/equities/search?q=reliance"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([profile]);
  });

  it("routes quote lookups through injected market sources", async () => {
    const quote: EquityQuoteSnapshot = {
      instrumentKey: "NSE_EQ|INE002A01018",
      exchange: "NSE",
      tradingSymbol: "RELIANCE",
      shortName: "Reliance",
      instrumentType: "EQ",
      lastPrice: 2500,
    };
    const handler = createApiRequestHandler({
      marketSources: {
        searchEquityInstruments: () => Effect.succeed([]),
        fetchEquityQuotes: () => Effect.succeed([]),
        buildEquityQuoteSnapshot: () => [quote],
      },
    });

    const response = await handler(
      new Request("http://localhost/market/quotes?instrumentKey=NSE_EQ|INE002A01018"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([quote]);
  });
});

