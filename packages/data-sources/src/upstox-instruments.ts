import type { UpstoxInstrumentProfile } from "@tradeai/domain";
import { Effect } from "effect";
import { gunzipSync } from "node:zlib";

export const UPSTOX_NSE_BOD_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

interface UpstoxBodApiRecord {
  segment?: string;
  name?: string;
  exchange?: string;
  isin?: string;
  instrument_type?: string;
  instrument_key?: string;
  lot_size?: number;
  freeze_quantity?: number;
  exchange_token?: string;
  tick_size?: number;
  trading_symbol?: string;
  short_name?: string;
  security_type?: string;
  mtf_enabled?: boolean;
  mtf_bracket?: number;
  intraday_margin?: number;
  intraday_leverage?: number;
}

export const decodeGzipJsonText = (buffer: ArrayBuffer): string =>
  gunzipSync(Buffer.from(buffer)).toString("utf8");

export const mapUpstoxInstrumentProfile = (
  record: UpstoxBodApiRecord,
): UpstoxInstrumentProfile | null => {
  const instrumentKey = record.instrument_key?.trim();
  const exchange = record.exchange?.trim();
  const tradingSymbol = record.trading_symbol?.trim();
  const name = record.name?.trim();
  const instrumentType = record.instrument_type?.trim();

  if (!instrumentKey || !exchange || !tradingSymbol || !name || !instrumentType) {
    return null;
  }

  return {
    instrumentKey,
    exchange,
    tradingSymbol,
    name,
    shortName: record.short_name?.trim() || undefined,
    isin: record.isin?.trim() || undefined,
    instrumentType,
    securityType: record.security_type?.trim() || undefined,
    lotSize: typeof record.lot_size === "number" ? record.lot_size : undefined,
    freezeQuantity: typeof record.freeze_quantity === "number" ? record.freeze_quantity : undefined,
    tickSize: typeof record.tick_size === "number" ? record.tick_size : undefined,
    exchangeToken: record.exchange_token?.trim() || undefined,
    mtfEnabled: typeof record.mtf_enabled === "boolean" ? record.mtf_enabled : undefined,
    mtfBracket: typeof record.mtf_bracket === "number" ? record.mtf_bracket : undefined,
    intradayMargin: typeof record.intraday_margin === "number" ? record.intraday_margin : undefined,
    intradayLeverage:
      typeof record.intraday_leverage === "number" ? record.intraday_leverage : undefined,
  };
};

export const parseUpstoxInstrumentProfiles = (payload: unknown): UpstoxInstrumentProfile[] => {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((record) => mapUpstoxInstrumentProfile(record as UpstoxBodApiRecord))
    .filter((entry): entry is UpstoxInstrumentProfile => entry !== null);
};

export const filterUpstoxInstrumentProfiles = (
  query: string,
  profiles: readonly UpstoxInstrumentProfile[],
  limit = 20,
): UpstoxInstrumentProfile[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return profiles.slice(0, limit);

  return profiles
    .filter(
      (profile) =>
        profile.tradingSymbol.toLowerCase() === normalizedQuery ||
        profile.tradingSymbol.toLowerCase().includes(normalizedQuery) ||
        profile.name.toLowerCase().includes(normalizedQuery) ||
        (profile.shortName?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (profile.isin?.toLowerCase().includes(normalizedQuery) ?? false),
    )
    .slice(0, limit);
};

export const selectPreferredUpstoxInstrumentProfile = (
  query: string,
  profiles: readonly UpstoxInstrumentProfile[],
): UpstoxInstrumentProfile | null => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return profiles[0] ?? null;

  const exactTradingSymbol = profiles.find(
    (profile) => profile.tradingSymbol.toLowerCase() === normalizedQuery,
  );
  if (exactTradingSymbol) return exactTradingSymbol;

  const exactShortName = profiles.find(
    (profile) => profile.shortName?.toLowerCase() === normalizedQuery,
  );
  if (exactShortName) return exactShortName;

  const exactName = profiles.find((profile) => profile.name.toLowerCase() === normalizedQuery);
  if (exactName) return exactName;

  const prefixTradingSymbol = profiles.find((profile) =>
    profile.tradingSymbol.toLowerCase().startsWith(normalizedQuery),
  );
  if (prefixTradingSymbol) return prefixTradingSymbol;

  return profiles[0] ?? null;
};

export const fetchUpstoxNseInstrumentProfiles = (
  fetchImpl: typeof fetch = fetch,
  url = UPSTOX_NSE_BOD_URL,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Upstox NSE BOD fetch failed with status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const jsonText = decodeGzipJsonText(arrayBuffer);
      return parseUpstoxInstrumentProfiles(JSON.parse(jsonText));
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const searchUpstoxInstrumentProfiles = (query: string, fetchImpl: typeof fetch = fetch) =>
  fetchUpstoxNseInstrumentProfiles(fetchImpl).pipe(
    Effect.map((profiles) => filterUpstoxInstrumentProfiles(query, profiles)),
  );
