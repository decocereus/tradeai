import type { BrokerHolding, BrokerTradeFill } from "@tradeai/domain";
import { Effect } from "effect";

export const INDSTOCKS_BASE_URL = "https://api.indstocks.com";
export const INDSTOCKS_ACCESS_TOKEN_ENV = "INDSTOCKS_ACCESS_TOKEN";

interface IndstocksHoldingsApiRecord {
  security_id?: string;
  trading_symbol?: string;
  exchange_segment?: string;
  isin?: string;
  quantity?: number;
  average_price?: number;
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

export const mapIndstocksHolding = (
  record: IndstocksHoldingsApiRecord,
): BrokerHolding | null => {
  if (
    !record.security_id ||
    !record.trading_symbol ||
    !record.exchange_segment ||
    !record.isin ||
    typeof record.quantity !== "number" ||
    typeof record.average_price !== "number" ||
    typeof record.last_traded_price !== "number" ||
    typeof record.close_price !== "number" ||
    typeof record.market_value !== "number" ||
    typeof record.pnl_absolute !== "number" ||
    typeof record.pnl_percent !== "number"
  ) {
    return null;
  }

  return {
    broker: "indstocks",
    securityId: record.security_id,
    tradingSymbol: record.trading_symbol,
    exchangeSegment: record.exchange_segment,
    isin: record.isin,
    quantity: record.quantity,
    averagePrice: record.average_price,
    lastTradedPrice: record.last_traded_price,
    closePrice: record.close_price,
    marketValue: record.market_value,
    pnlAbsolute: record.pnl_absolute,
    pnlPercent: record.pnl_percent,
  };
};

export const parseIndstocksHoldingsResponse = (
  payload: IndstocksHoldingsApiResponse,
): BrokerHolding[] =>
  (payload.data ?? [])
    .map(mapIndstocksHolding)
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

      return parseIndstocksHoldingsResponse((await response.json()) as IndstocksHoldingsApiResponse);
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
