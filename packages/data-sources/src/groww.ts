import type {
  BrokerHolding,
  EquityInstrumentProfile,
  EquityInstrumentSearchEntry,
  EquityQuoteEntry,
  EquityQuoteSnapshot,
} from "@tradeai/domain";
import { Effect } from "effect";
import { createHash } from "node:crypto";

export const GROWW_ACCESS_TOKEN_ENV = "GROWW_ACCESS_TOKEN";
export const GROWW_API_KEY_ENV = "GROWW_API_KEY";
export const GROWW_API_SECRET_ENV = "GROWW_API_SECRET";
export const GROWW_API_BASE_URL = "https://api.groww.in/v1";
export const GROWW_INSTRUMENTS_CSV_URL = "https://growwapi-assets.groww.in/instruments/instrument.csv";
export const MAX_GROWW_QUOTE_KEYS = 50;
export const GROWW_TOKEN_REFRESH_HINT =
  "Groww access tokens expire daily around 6 AM IST; prefer GROWW_API_KEY/GROWW_API_SECRET so TradeAI can mint a fresh token.";

export interface GrowwQuoteFailure {
  instrumentKey: string;
  message: string;
}

export class PartialGrowwQuoteSnapshotError extends Error {
  readonly quotes: readonly EquityQuoteEntry[];
  readonly failures: readonly GrowwQuoteFailure[];

  constructor(quotes: readonly EquityQuoteEntry[], failures: readonly GrowwQuoteFailure[]) {
    super(`Groww quote snapshot partially failed for ${failures.length} instrument(s).`);
    this.name = "PartialGrowwQuoteSnapshotError";
    this.quotes = quotes;
    this.failures = failures;
  }
}

interface GrowwApiResponse<T> {
  status?: string;
  payload?: T;
  error?: string;
  message?: string;
}

interface GrowwHoldingRecord {
  isin?: string;
  trading_symbol?: string;
  quantity?: number;
  average_price?: number;
  t1_quantity?: number;
  demat_free_quantity?: number;
}

interface GrowwQuotePayload {
  last_price?: number;
  day_change?: number;
  day_change_perc?: number;
  ohlc?: string | {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };
  volume?: number;
  open_interest?: number;
}

interface GrowwInstrumentRecord {
  exchange?: string;
  exchange_token?: string;
  trading_symbol?: string;
  groww_symbol?: string;
  name?: string;
  instrument_type?: string;
  segment?: string;
  series?: string;
  isin?: string;
  lot_size?: string;
  tick_size?: string;
  freeze_quantity?: string;
  buy_allowed?: string;
  sell_allowed?: string;
}

export const resolveGrowwAccessToken = (accessToken?: string): string => {
  const resolvedToken = accessToken?.trim() || process.env[GROWW_ACCESS_TOKEN_ENV]?.trim();
  if (!resolvedToken) {
    throw new Error(
      `Missing Groww access token. Set ${GROWW_ACCESS_TOKEN_ENV} or pass an access token explicitly. ${GROWW_TOKEN_REFRESH_HINT}`,
    );
  }
  return resolvedToken;
};

export const createGrowwHeaders = (accessToken?: string): HeadersInit => ({
  Accept: "application/json",
  Authorization: `Bearer ${resolveGrowwAccessToken(accessToken)}`,
  "X-API-VERSION": "1.0",
});

export const generateGrowwChecksum = (secret: string, timestamp: string) =>
  createHash("sha256").update(`${secret}${timestamp}`).digest("hex");

interface GrowwTokenResponse {
  token?: string;
  tokenRefId?: string;
  sessionName?: string;
  expiry?: string;
  isActive?: boolean;
}

export const fetchGrowwAccessToken = (
  input: {
    apiKey?: string;
    apiSecret?: string;
    timestamp?: string;
    fetchImpl?: typeof fetch;
  } = {},
) =>
  Effect.tryPromise({
    try: async () => {
      const apiKey = input.apiKey?.trim() || process.env[GROWW_API_KEY_ENV]?.trim();
      const apiSecret = input.apiSecret?.trim() || process.env[GROWW_API_SECRET_ENV]?.trim();
      if (!apiKey || !apiSecret) {
        throw new Error(
          `Missing Groww credentials. Set ${GROWW_ACCESS_TOKEN_ENV}, or set ${GROWW_API_KEY_ENV} and ${GROWW_API_SECRET_ENV}. ${GROWW_TOKEN_REFRESH_HINT}`,
        );
      }

      const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000).toString();
      const response = await (input.fetchImpl ?? fetch)(`${GROWW_API_BASE_URL}/token/api/access`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key_type: "approval",
          checksum: generateGrowwChecksum(apiSecret, timestamp),
          timestamp,
        }),
      });
      if (!response.ok) {
        throw new Error(`Groww token fetch failed with status ${response.status}. ${GROWW_TOKEN_REFRESH_HINT}`);
      }

      const payload = (await response.json()) as GrowwTokenResponse;
      if (!payload.token) {
        throw new Error("Groww token response did not include a token.");
      }
      return payload.token;
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

const resolveGrowwAccessTokenForRequest = async (
  accessToken: string | undefined,
  fetchImpl: typeof fetch,
) => {
  const directToken = accessToken?.trim() || process.env[GROWW_ACCESS_TOKEN_ENV]?.trim();
  if (directToken) return directToken;
  return Effect.runPromise(fetchGrowwAccessToken({ fetchImpl }));
};

const assertGrowwSuccess = <T>(payload: GrowwApiResponse<T>, context: string): T => {
  if (payload.status !== "SUCCESS" || !payload.payload) {
    throw new Error(
      `Groww ${context} failed: ${payload.message ?? payload.error ?? payload.status ?? "unknown error"}`,
    );
  }
  return payload.payload;
};

const buildGrowwHttpError = async (response: Response, context: string) => {
  const body = await response.text();
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    message = parsed.error?.message ?? parsed.message ?? message;
    if (parsed.error?.code) {
      message = `${parsed.error.code}: ${message}`;
    }
  } catch {
    // Keep the trimmed response body as the diagnostic message.
  }
  return new Error(`Groww ${context} failed with status ${response.status}: ${message}`);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const GROWW_QUOTE_ENRICHMENT_CONCURRENCY = 8;

const normalizeGrowwSymbol = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  return trimmed.includes("_") ? trimmed.split("_").at(-1) ?? trimmed : trimmed;
};

const normalizeGrowwQuoteKeys = (instrumentKeys: readonly string[]): readonly string[] => {
  const normalizedByKey = new Map<string, string>();
  for (const instrumentKey of instrumentKeys) {
    const normalized = normalizeGrowwSymbol(instrumentKey);
    if (!normalized) continue;
    if (!normalizedByKey.has(normalized)) {
      normalizedByKey.set(normalized, instrumentKey.trim());
    }
  }
  return [...normalizedByKey.values()];
};

export const buildGrowwExchangeSymbol = (symbol: string, exchange = "NSE") =>
  `${exchange.trim().toUpperCase()}_${normalizeGrowwSymbol(symbol)}`;

const parseOhlcClose = (ohlc: GrowwQuotePayload["ohlc"]): number | undefined => {
  if (!ohlc) return undefined;
  if (typeof ohlc === "object") return typeof ohlc.close === "number" ? ohlc.close : undefined;
  const closeMatch = ohlc.match(/close\s*:\s*([0-9.]+)/i);
  return closeMatch ? Number(closeMatch[1]) : undefined;
};

export const mapGrowwHolding = (
  record: GrowwHoldingRecord,
  quote?: EquityQuoteEntry,
): BrokerHolding | null => {
  const tradingSymbol = record.trading_symbol?.trim();
  const isin = record.isin?.trim();
  const quantity = record.quantity;
  const averagePrice = record.average_price;
  if (!tradingSymbol || !isin || typeof quantity !== "number" || typeof averagePrice !== "number") {
    return null;
  }
  const quoteUnavailable = !quote || typeof quote.lastPrice !== "number";
  const lastTradedPrice = quoteUnavailable ? undefined : quote.lastPrice;
  const closePrice = quoteUnavailable ? undefined : quote.closePrice ?? quote.lastPrice;
  const marketValue = lastTradedPrice === undefined ? undefined : quantity * lastTradedPrice;
  const pnlAbsolute = lastTradedPrice === undefined ? undefined : (lastTradedPrice - averagePrice) * quantity;
  const pnlPercent =
    lastTradedPrice === undefined || averagePrice <= 0
      ? undefined
      : ((lastTradedPrice - averagePrice) / averagePrice) * 100;

  return {
    broker: "groww",
    securityId: isin,
    tradingSymbol,
    exchangeSegment: "NSE_EQ",
    isin,
    quantity,
    averagePrice,
    ...(lastTradedPrice !== undefined ? { lastTradedPrice } : {}),
    ...(closePrice !== undefined ? { closePrice } : {}),
    ...(marketValue !== undefined ? { marketValue } : {}),
    ...(pnlAbsolute !== undefined ? { pnlAbsolute } : {}),
    ...(pnlPercent !== undefined ? { pnlPercent } : {}),
    priceProvenance: quoteUnavailable
      ? {
          status: "market_unavailable",
          source: "fallback",
          marketDataProvider: "groww",
          quoteSymbol: tradingSymbol,
          message: "Groww quote unavailable; current valuation and PnL are unavailable.",
        }
      : {
          status: "market_enriched",
          source: "market",
          marketDataProvider: "groww",
          quoteSymbol: quote.tradingSymbol ?? quote.instrumentKey,
        },
  };
};

export const fetchGrowwHoldings = (
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const resolvedToken = await resolveGrowwAccessTokenForRequest(accessToken, fetchImpl);
      const requestHoldings = () =>
        fetchImpl(`${GROWW_API_BASE_URL}/holdings/user`, {
          headers: createGrowwHeaders(resolvedToken),
        });
      let response = await requestHoldings();
      if (response.status >= 500) {
        await wait(250);
        response = await requestHoldings();
      }
      if (!response.ok) {
        throw await buildGrowwHttpError(response, "holdings fetch");
      }

      const payload = assertGrowwSuccess(
        (await response.json()) as GrowwApiResponse<{ holdings?: GrowwHoldingRecord[] }>,
        "holdings fetch",
      );
      const holdingRecords = payload.holdings ?? [];
      const symbols = holdingRecords
        .map((holding) => holding.trading_symbol?.trim())
        .filter((symbol): symbol is string => Boolean(symbol));
      const quoteResults = await mapSettledWithConcurrency(
        symbols,
        GROWW_QUOTE_ENRICHMENT_CONCURRENCY,
        (symbol) => fetchGrowwQuote(symbol, resolvedToken, fetchImpl),
      );
      const quotes = quoteResults
        .filter((result): result is PromiseFulfilledResult<EquityQuoteEntry | null> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((quote): quote is EquityQuoteEntry => quote !== null);
      const quotesBySymbol = new Map(
        quotes.map((quote) => [quote.tradingSymbol?.toUpperCase() ?? quote.instrumentKey, quote]),
      );

      return holdingRecords
        .map((holding) =>
          mapGrowwHolding(
            holding,
            quotesBySymbol.get(holding.trading_symbol?.trim().toUpperCase() ?? ""),
          ),
        )
        .filter((holding): holding is BrokerHolding => holding !== null);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const fetchGrowwTradeBook = () =>
  Effect.fail(new Error("Groww trade-book adapter is not implemented yet. Use holdings/positions first."));

export const mapGrowwQuoteEntry = (
  exchangeSymbol: string,
  quote: GrowwQuotePayload,
): EquityQuoteEntry | null => {
  if (typeof quote.last_price !== "number") return null;
  return {
    instrumentKey: exchangeSymbol,
    tradingSymbol: normalizeGrowwSymbol(exchangeSymbol),
    lastPrice: quote.last_price,
    closePrice: parseOhlcClose(quote.ohlc),
    volume: typeof quote.volume === "number" ? quote.volume : undefined,
    openInterest: typeof quote.open_interest === "number" ? quote.open_interest : undefined,
  };
};

const fetchGrowwQuote = async (
  instrumentKey: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<EquityQuoteEntry | null> => {
  const symbol = normalizeGrowwSymbol(instrumentKey);
  const url = new URL(`${GROWW_API_BASE_URL}/live-data/quote`);
  url.searchParams.set("exchange", "NSE");
  url.searchParams.set("segment", "CASH");
  url.searchParams.set("trading_symbol", symbol);

  const response = await fetchImpl(url, { headers: createGrowwHeaders(accessToken) });
  if (!response.ok) {
    throw await buildGrowwHttpError(response, "quote fetch");
  }

  const payload = assertGrowwSuccess(
    (await response.json()) as GrowwApiResponse<GrowwQuotePayload>,
    "quote fetch",
  );
  return mapGrowwQuoteEntry(buildGrowwExchangeSymbol(symbol), payload);
};

const mapSettledWithConcurrency = async <Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  mapper: (input: Input) => Promise<Output>,
): Promise<PromiseSettledResult<Output>[]> => {
  const results = Array.from({ length: inputs.length }) as PromiseSettledResult<Output>[];
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const input = inputs[currentIndex];
      if (input === undefined) continue;

      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await mapper(input),
        };
      } catch (reason) {
        results[currentIndex] = {
          status: "rejected",
          reason,
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()),
  );
  return results;
};

export const fetchGrowwQuoteSnapshot = (
  instrumentKeys: readonly string[],
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const normalizedInstrumentKeys = normalizeGrowwQuoteKeys(instrumentKeys);
      if (normalizedInstrumentKeys.length > MAX_GROWW_QUOTE_KEYS) {
        throw new Error(`Too many Groww quote keys. Maximum allowed is ${MAX_GROWW_QUOTE_KEYS}.`);
      }
      const resolvedToken = await resolveGrowwAccessTokenForRequest(accessToken, fetchImpl);
      const results = await mapSettledWithConcurrency(
        normalizedInstrumentKeys,
        GROWW_QUOTE_ENRICHMENT_CONCURRENCY,
        (instrumentKey) => fetchGrowwQuote(instrumentKey, resolvedToken, fetchImpl),
      );
      const quotes = results
        .filter((result): result is PromiseFulfilledResult<EquityQuoteEntry | null> => result.status === "fulfilled")
        .map((result) => result.value);
      const failures = results.flatMap((result, index) => {
        if (result.status !== "rejected") return [];
        const reason = result.reason;
        return [
          {
            instrumentKey: normalizedInstrumentKeys[index] ?? "unknown",
            message: reason instanceof Error ? reason.message : String(reason),
          },
        ];
      });

      if (quotes.length === 0 && failures.length > 0) {
        throw new Error(failures[0]?.message ?? "Groww quote snapshot failed.");
      }
      if (failures.length > 0) {
        throw new PartialGrowwQuoteSnapshotError(
          quotes.filter((quote): quote is EquityQuoteEntry => quote !== null),
          failures,
        );
      }

      return quotes.filter((quote): quote is EquityQuoteEntry => quote !== null);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of line) {
    if (character === "\"") {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
};

export const parseGrowwInstrumentCsv = (csv: string): EquityInstrumentProfile[] => {
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  return rows
    .flatMap((line) => {
      const values = parseCsvLine(line);
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as GrowwInstrumentRecord;
      if (record.segment !== "CASH" || record.exchange !== "NSE" || !record.trading_symbol) {
        return [];
      }
      const profile: EquityInstrumentProfile = {
        instrumentKey: buildGrowwExchangeSymbol(record.trading_symbol, record.exchange),
        exchange: record.exchange,
        tradingSymbol: record.trading_symbol,
        name: record.name || record.trading_symbol,
        instrumentType: record.instrument_type || "EQ",
        ...(record.name ? { shortName: record.name } : {}),
        ...(record.isin ? { isin: record.isin } : {}),
        ...(record.series ? { securityType: record.series } : {}),
        ...(record.lot_size ? { lotSize: Number(record.lot_size) } : {}),
        ...(record.freeze_quantity ? { freezeQuantity: Number(record.freeze_quantity) } : {}),
        ...(record.tick_size ? { tickSize: Number(record.tick_size) } : {}),
        ...(record.exchange_token ? { exchangeToken: record.exchange_token } : {}),
      };
      return [profile];
    });
};

export const fetchGrowwInstrumentProfiles = (
  fetchImpl: typeof fetch = fetch,
  url = GROWW_INSTRUMENTS_CSV_URL,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Groww instrument CSV fetch failed with status ${response.status}`);
      }
      return parseGrowwInstrumentCsv(await response.text());
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const searchGrowwInstrumentProfiles = (query: string, fetchImpl: typeof fetch = fetch) =>
  fetchGrowwInstrumentProfiles(fetchImpl).pipe(
    Effect.map((profiles) => {
      const normalized = query.trim().toLowerCase();
      return profiles.filter(
        (profile) =>
          profile.tradingSymbol.toLowerCase().includes(normalized) ||
          profile.name.toLowerCase().includes(normalized) ||
          profile.isin?.toLowerCase() === normalized,
      );
    }),
  );

export const searchGrowwInstruments = (
  query: string,
): Effect.Effect<readonly EquityInstrumentSearchEntry[], Error> => {
  const symbol = normalizeGrowwSymbol(query);
  return Effect.succeed([
    {
      instrumentKey: buildGrowwExchangeSymbol(symbol),
      exchange: "NSE",
      tradingSymbol: symbol,
      shortName: symbol,
      instrumentType: "EQ",
    },
  ]);
};

export const buildGrowwQuoteSnapshot = (
  searchResults: readonly (EquityInstrumentSearchEntry | EquityInstrumentProfile)[],
  quoteResults: readonly EquityQuoteEntry[],
): EquityQuoteSnapshot[] => {
  const searchMap = new Map(searchResults.map((entry) => [entry.instrumentKey, entry]));
  return quoteResults.map((quote) => {
    const searchEntry = searchMap.get(quote.instrumentKey);
    return {
      instrumentKey: quote.instrumentKey,
      tradingSymbol: quote.tradingSymbol || searchEntry?.tradingSymbol || normalizeGrowwSymbol(quote.instrumentKey),
      shortName: searchEntry?.shortName || quote.tradingSymbol || normalizeGrowwSymbol(quote.instrumentKey),
      exchange: searchEntry?.exchange || "NSE",
      instrumentType: searchEntry?.instrumentType || "EQ",
      lastPrice: quote.lastPrice,
      closePrice: quote.closePrice,
      volume: quote.volume,
      openInterest: quote.openInterest,
      isin: searchEntry?.isin,
    };
  });
};
