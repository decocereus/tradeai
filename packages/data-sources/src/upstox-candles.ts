import type { HistoricalCandle } from "@tradeai/domain";
import { Effect } from "effect";

import { createUpstoxHeaders } from "./upstox.ts";

export const UPSTOX_HISTORICAL_CANDLES_V3_URL = "https://api.upstox.com/v3/historical-candle";

interface UpstoxHistoricalCandleApiResponse {
  status?: string;
  data?: {
    candles?: Array<[string, number, number, number, number, number, number?]>;
  };
}

export interface HistoricalCandleRequest {
  instrumentKey: string;
  unit: "minutes" | "hours" | "days" | "weeks" | "months";
  interval: number;
  toDate: string;
  fromDate?: string;
}

export const mapHistoricalCandle = (
  row: [string, number, number, number, number, number, number?],
): HistoricalCandle => ({
  timestamp: row[0],
  open: row[1],
  high: row[2],
  low: row[3],
  close: row[4],
  volume: row[5],
  openInterest: row[6],
});

export const parseHistoricalCandlesResponse = (
  payload: UpstoxHistoricalCandleApiResponse,
): HistoricalCandle[] =>
  (payload.data?.candles ?? []).map(mapHistoricalCandle);

export const buildHistoricalCandlesUrl = (request: HistoricalCandleRequest): string => {
  const encodedInstrumentKey = encodeURIComponent(request.instrumentKey);
  const fromDatePart = request.fromDate ? `/${request.fromDate}` : "";
  return `${UPSTOX_HISTORICAL_CANDLES_V3_URL}/${encodedInstrumentKey}/${request.unit}/${request.interval}/${request.toDate}${fromDatePart}`;
};

export const fetchHistoricalCandles = (
  request: HistoricalCandleRequest,
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(buildHistoricalCandlesUrl(request), {
        headers: createUpstoxHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`Upstox historical candles fetch failed with status ${response.status}`);
      }

      return parseHistoricalCandlesResponse((await response.json()) as UpstoxHistoricalCandleApiResponse);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
