import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  fetchTrueDataQuoteSnapshot,
  mapTrueDataLtpResponse,
  resolveTrueDataCredentials,
} from "./truedata.ts";

describe("data-sources / truedata", () => {
  it("requires credentials", () => {
    const previousUser = process.env.TRUEDATA_USER_ID;
    const previousPassword = process.env.TRUEDATA_PASSWORD;
    delete process.env.TRUEDATA_USER_ID;
    delete process.env.TRUEDATA_PASSWORD;

    try {
      expect(() => resolveTrueDataCredentials()).toThrow("Missing TrueData credentials");
    } finally {
      if (previousUser) process.env.TRUEDATA_USER_ID = previousUser;
      if (previousPassword) process.env.TRUEDATA_PASSWORD = previousPassword;
    }
  });

  it("maps LTP responses into quote entries", () => {
    const quote = mapTrueDataLtpResponse("RELIANCE", {
      symbol: "RELIANCE",
      status: "Success",
      Records: [
        {
          symbol: "RELIANCE",
          ltp: 2500,
          close: 2480,
          volume: 100000,
        },
      ],
    });

    expect(quote).toEqual({
      instrumentKey: "RELIANCE",
      tradingSymbol: "RELIANCE",
      lastPrice: 2500,
      closePrice: 2480,
      volume: 100000,
      openInterest: undefined,
    });
  });

  it("fetches quotes through an injected client", async () => {
    const authCalls: string[] = [];
    const quotes = await Effect.runPromise(
      fetchTrueDataQuoteSnapshot(
        {
          symbols: ["RELIANCE"],
          userId: "user",
          password: "password",
        },
        {
          auth: async (userId, password) => {
            authCalls.push(`${userId}:${password}`);
            return true;
          },
          getLTP: async (symbol) => ({
            symbol,
            status: "Success",
            Records: [{ symbol, ltp: 2500 }],
          }),
        },
      ),
    );

    expect(authCalls).toEqual(["user:password"]);
    expect(quotes).toEqual([
      {
        instrumentKey: "RELIANCE",
        tradingSymbol: "RELIANCE",
        lastPrice: 2500,
        closePrice: undefined,
        volume: undefined,
        openInterest: undefined,
      },
    ]);
  });
});

