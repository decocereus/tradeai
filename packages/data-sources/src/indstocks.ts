import type { BrokerHolding, BrokerTradeFill, HistoricalCandle } from "@tradeai/domain";
import { Effect } from "effect";

export const INDSTOCKS_BASE_URL = "https://api.indstocks.com";
export const INDSTOCKS_ACCESS_TOKEN_ENV = "INDSTOCKS_ACCESS_TOKEN";

interface IndstocksHoldingsApiRecord {
  security_id?: string;
  trading_symbol?: string;
  symbol?: string;
  exchange_segment?: string;
  isin?: string;
  quantity?: number;
  total_qty?: number;
  average_price?: number;
  avg_price?: number;
  last_traded_price?: number;
  close_price?: number;
  market_value?: number;
  pnl_absolute?: number;
  pnl_percent?: number;
}

interface IndstocksHoldingsApiResponse {
  status?: string;
  data?: IndstocksHoldingsApiRecord[];
}

interface IndstocksTradeBookApiRecord {
  fill_id?: number;
  exch_order_id?: string;
  quantity?: number;
  price?: number;
  trade_date?: string;
  trade_serial_no?: string;
  scrip_code?: string;
}

interface IndstocksTradeBookApiResponse {
  status?: string;
  data?: IndstocksTradeBookApiRecord[];
}

interface IndstocksMarketQuoteEntry {
  live_price?: number;
  prev_close?: number;
}

interface IndstocksMarketQuoteResponse {
  status?: string;
  data?: Record<string, IndstocksMarketQuoteEntry>;
}

interface IndstocksHistoricalDataApiResponse {
  status?: string;
  data?: {
    candles?: Array<[number, number, number, number, number, number]>;
  };
}

export const resolveIndstocksAccessToken = (accessToken?: string): string => {
  const resolvedToken = accessToken?.trim() || process.env[INDSTOCKS_ACCESS_TOKEN_ENV]?.trim();
  if (!resolvedToken) {
    throw new Error(
      `Missing INDstocks access token. Set ${INDSTOCKS_ACCESS_TOKEN_ENV} or pass an access token explicitly.`,
    );
  }
  return resolvedToken;
};

export const createIndstocksHeaders = (accessToken?: string): HeadersInit => ({
  Authorization: resolveIndstocksAccessToken(accessToken),
});

export const buildIndstocksScripCode = (
  securityId: string,
  exchangeSegment = "NSE_EQ",
): string => `${exchangeSegment.startsWith("BSE") ? "BSE" : "NSE"}_${securityId}`;

const resolveHoldingQuantity = (record: IndstocksHoldingsApiRecord): number | undefined =>
  typeof record.quantity === "number"
    ? record.quantity
    : typeof record.total_qty === "number"
      ? record.total_qty
      : undefined;

const resolveHoldingAveragePrice = (record: IndstocksHoldingsApiRecord): number | undefined =>
  typeof record.average_price === "number"
    ? record.average_price
    : typeof record.avg_price === "number"
      ? record.avg_price
      : undefined;

const resolveHoldingExchangeSegment = (record: IndstocksHoldingsApiRecord): string =>
  record.exchange_segment || "NSE_EQ";

export const mapIndstocksHolding = (
  record: IndstocksHoldingsApiRecord,
  quotesByScripCode: Record<string, IndstocksMarketQuoteEntry> = {},
): BrokerHolding | null => {
  const securityId = record.security_id;
  const tradingSymbol = record.trading_symbol || record.symbol;
  const exchangeSegment = resolveHoldingExchangeSegment(record);
  const quantity = resolveHoldingQuantity(record);
  const averagePrice = resolveHoldingAveragePrice(record);
  const quote = securityId ? quotesByScripCode[buildIndstocksScripCode(securityId, exchangeSegment)] : undefined;
  const lastTradedPrice =
    typeof record.last_traded_price === "number"
      ? record.last_traded_price
      : quote?.live_price ?? averagePrice;
  const closePrice =
    typeof record.close_price === "number"
      ? record.close_price
      : quote?.prev_close ?? lastTradedPrice ?? averagePrice;

  if (
    !securityId ||
    !tradingSymbol ||
    !record.isin ||
    typeof quantity !== "number" ||
    typeof averagePrice !== "number" ||
    typeof lastTradedPrice !== "number" ||
    typeof closePrice !== "number"
  ) {
    return null;
  }

  const marketValue =
    typeof record.market_value === "number" ? record.market_value : quantity * lastTradedPrice;
  const pnlAbsolute =
    typeof record.pnl_absolute === "number"
      ? record.pnl_absolute
      : (lastTradedPrice - averagePrice) * quantity;
  const pnlPercent =
    typeof record.pnl_percent === "number"
      ? record.pnl_percent
      : averagePrice > 0
        ? ((lastTradedPrice - averagePrice) / averagePrice) * 100
        : 0;

  return {
    broker: "indstocks",
    securityId,
    tradingSymbol,
    exchangeSegment,
    isin: record.isin,
    quantity,
    averagePrice,
    lastTradedPrice,
    closePrice,
    marketValue,
    pnlAbsolute,
    pnlPercent,
  };
};

export const parseIndstocksHoldingsResponse = (
  payload: IndstocksHoldingsApiResponse,
  quotesByScripCode: Record<string, IndstocksMarketQuoteEntry> = {},
): BrokerHolding[] =>
  (payload.data ?? [])
    .map((record) => mapIndstocksHolding(record, quotesByScripCode))
    .filter((entry): entry is BrokerHolding => entry !== null);

export const mapIndstocksTradeFill = (
  record: IndstocksTradeBookApiRecord,
): BrokerTradeFill | null => {
  if (
    typeof record.fill_id !== "number" ||
    !record.exch_order_id ||
    typeof record.quantity !== "number" ||
    typeof record.price !== "number" ||
    !record.trade_date ||
    !record.trade_serial_no ||
    !record.scrip_code
  ) {
    return null;
  }

  return {
    broker: "indstocks",
    fillId: record.fill_id,
    exchangeOrderId: record.exch_order_id,
    quantity: record.quantity,
    price: record.price,
    tradeDate: record.trade_date,
    tradeSerialNumber: record.trade_serial_no,
    scripCode: record.scrip_code,
  };
};

export const parseIndstocksTradeBookResponse = (
  payload: IndstocksTradeBookApiResponse,
): BrokerTradeFill[] =>
  (payload.data ?? [])
    .map(mapIndstocksTradeFill)
    .filter((entry): entry is BrokerTradeFill => entry !== null);

export const fetchIndstocksMarketQuotes = (
  scripCodes: readonly string[],
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      if (scripCodes.length === 0) {
        return {} as Record<string, IndstocksMarketQuoteEntry>;
      }

      const url = new URL(`${INDSTOCKS_BASE_URL}/market/quotes/full`);
      url.searchParams.set("scrip-codes", scripCodes.join(","));

      const response = await fetchImpl(url, {
        headers: createIndstocksHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`INDstocks market quote fetch failed with status ${response.status}`);
      }

      const payload = (await response.json()) as IndstocksMarketQuoteResponse;
      return payload.data ?? {};
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const mapIndstocksHistoricalCandle = (
  row: [number, number, number, number, number, number],
): HistoricalCandle => ({
  timestamp: new Date(row[0]).toISOString(),
  open: row[1],
  high: row[2],
  low: row[3],
  close: row[4],
  volume: row[5],
});

export const parseIndstocksHistoricalDataResponse = (
  payload: IndstocksHistoricalDataApiResponse,
): HistoricalCandle[] =>
  (payload.data?.candles ?? []).map(mapIndstocksHistoricalCandle);

export interface IndstocksHistoricalDataRequest {
  interval: "1day" | "1week" | "1month" | "1minute" | "5minute" | "15minute" | "60minute";
  scripCodes: readonly string[];
  startTime: number;
  endTime: number;
}

export const fetchIndstocksHistoricalData = (
  request: IndstocksHistoricalDataRequest,
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      if (request.scripCodes.length === 0) {
        return [] satisfies HistoricalCandle[];
      }

      const url = new URL(`${INDSTOCKS_BASE_URL}/market/historical/${request.interval}`);
      url.searchParams.set("scrip-codes", request.scripCodes.join(","));
      url.searchParams.set("start_time", String(request.startTime));
      url.searchParams.set("end_time", String(request.endTime));

      const response = await fetchImpl(url, {
        headers: createIndstocksHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`INDstocks historical data fetch failed with status ${response.status}`);
      }

      return parseIndstocksHistoricalDataResponse(
        (await response.json()) as IndstocksHistoricalDataApiResponse,
      );
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const fetchIndstocksHoldings = (
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(`${INDSTOCKS_BASE_URL}/portfolio/holdings`, {
        headers: createIndstocksHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`INDstocks holdings fetch failed with status ${response.status}`);
      }

      const payload = (await response.json()) as IndstocksHoldingsApiResponse;
      const records = payload.data ?? [];
      const scripCodes = records
        .map((record) =>
          record.security_id ? buildIndstocksScripCode(record.security_id, resolveHoldingExchangeSegment(record)) : undefined,
        )
        .filter((entry): entry is string => Boolean(entry));
      const quotesByScripCode =
        scripCodes.length > 0
          ? await Effect.runPromise(fetchIndstocksMarketQuotes(scripCodes, accessToken, fetchImpl))
          : {};

      return parseIndstocksHoldingsResponse(payload, quotesByScripCode);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const fetchIndstocksTradeBook = (
  segment: "EQUITY" | "DERIVATIVE",
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const url = new URL(`${INDSTOCKS_BASE_URL}/trade-book`);
      url.searchParams.set("segment", segment);

      const response = await fetchImpl(url, {
        headers: createIndstocksHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`INDstocks trade-book fetch failed with status ${response.status}`);
      }

      return parseIndstocksTradeBookResponse((await response.json()) as IndstocksTradeBookApiResponse);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
