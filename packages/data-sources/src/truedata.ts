import type { UpstoxQuoteEntry } from "@tradeai/domain";
import { Effect } from "effect";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const TRUEDATA_USER_ID_ENV = "TRUEDATA_USER_ID";
export const TRUEDATA_PASSWORD_ENV = "TRUEDATA_PASSWORD";

export interface TrueDataCredentials {
  userId?: string;
  password?: string;
}

export interface TrueDataQuoteSnapshotInput extends TrueDataCredentials {
  symbols: readonly string[];
}

interface TrueDataLtpRecord {
  symbol?: string;
  ltp?: number;
  close?: number;
  volume?: number;
  oi?: number;
}

interface TrueDataLtpResponse {
  Records?: TrueDataLtpRecord[];
  status?: string;
  symbol?: string;
}

interface TrueDataHistoricalClient {
  auth: (userId: string, password: string, force?: boolean) => Promise<boolean | undefined>;
  getLTP: (
    symbol: string,
    bidask?: number,
    response?: "json" | "csv",
    getSymbolId?: number,
  ) => Promise<TrueDataLtpResponse>;
}

export const resolveTrueDataCredentials = (
  credentials: TrueDataCredentials = {},
): Required<TrueDataCredentials> => {
  const userId = credentials.userId?.trim() || process.env[TRUEDATA_USER_ID_ENV]?.trim();
  const password = credentials.password?.trim() || process.env[TRUEDATA_PASSWORD_ENV]?.trim();

  if (!userId || !password) {
    throw new Error(
      `Missing TrueData credentials. Set ${TRUEDATA_USER_ID_ENV} and ${TRUEDATA_PASSWORD_ENV}.`,
    );
  }

  return { userId, password };
};

const loadTrueDataHistoricalClient = (): TrueDataHistoricalClient =>
  require("truedata-nodejs").historical as TrueDataHistoricalClient;

export const mapTrueDataLtpResponse = (
  symbol: string,
  response: TrueDataLtpResponse,
): UpstoxQuoteEntry | null => {
  const record = response.Records?.[0];
  const lastPrice = record?.ltp;

  if (typeof lastPrice !== "number") {
    return null;
  }

  return {
    instrumentKey: symbol,
    tradingSymbol: record?.symbol ?? response.symbol ?? symbol,
    lastPrice,
    closePrice: typeof record?.close === "number" ? record.close : undefined,
    volume: typeof record?.volume === "number" ? record.volume : undefined,
    openInterest: typeof record?.oi === "number" ? record.oi : undefined,
  };
};

export const fetchTrueDataQuoteSnapshot = (
  input: TrueDataQuoteSnapshotInput,
  client: TrueDataHistoricalClient = loadTrueDataHistoricalClient(),
) =>
  Effect.tryPromise({
    try: async () => {
      const { userId, password } = resolveTrueDataCredentials(input);
      const authenticated = await client.auth(userId, password, true);
      if (authenticated !== true) {
        throw new Error(
          "TrueData authentication failed. Check TRUEDATA_USER_ID, TRUEDATA_PASSWORD, and whether the subscription includes historical REST access.",
        );
      }

      const quotes = await Promise.all(
        input.symbols.map(async (symbol) => {
          const response = await client.getLTP(symbol, 0, "json");
          return mapTrueDataLtpResponse(symbol, response);
        }),
      );

      return quotes.filter((quote): quote is UpstoxQuoteEntry => quote !== null);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
