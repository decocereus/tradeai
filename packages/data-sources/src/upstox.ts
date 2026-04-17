import type {
  CorporateEvent,
  HistoricalCandle,
  ResearchPacket,
  TechnicalAnalysisSnapshot,
  UpstoxFundamentalsSnapshot,
  UpstoxInstrumentSearchEntry,
  UpstoxInstrumentProfile,
  UpstoxQuoteEntry,
  UpstoxQuoteSnapshot,
} from "@tradeai/domain";
import { Effect } from "effect";
import {
  searchUpstoxInstrumentProfiles,
  selectPreferredUpstoxInstrumentProfile,
} from "./upstox-instruments.ts";
import { fetchUpstoxFundamentalsSnapshot, parseCroreNumber, parsePercentNumber } from "./upstox-fundamentals.ts";
import { scoreCorporateEventSignal, searchBseAnnouncements } from "./bse-events.ts";
import { fetchHistoricalCandles } from "./upstox-candles.ts";
import { analyzeHistoricalCandles } from "@tradeai/market-analysis";
import { inferSectorFromEvidence } from "../../strategy-engine/src/sector-inference.ts";

export const UPSTOX_INSTRUMENT_SEARCH_URL = "https://api.upstox.com/v2/search/instruments";
export const UPSTOX_FULL_QUOTE_URL = "https://api.upstox.com/v2/market-quote/quotes";
export const UPSTOX_ACCESS_TOKEN_ENV = "UPSTOX_ACCESS_TOKEN";

export interface UpstoxSearchParams {
  query: string;
  exchange?: string;
  instrumentType?: string;
}

interface UpstoxSearchApiRecord {
  instrument_key?: string;
  exchange?: string;
  trading_symbol?: string;
  short_name?: string;
  instrument_type?: string;
  isin?: string;
}

interface UpstoxSearchApiResponse {
  status?: string;
  data?: UpstoxSearchApiRecord[];
}

interface UpstoxQuoteApiRecord {
  instrument_token?: string;
  last_price?: number;
  close_price?: number;
  volume?: number;
  oi?: number;
  symbol?: string;
  trading_symbol?: string;
  instrument_key?: string;
}

interface UpstoxQuoteApiResponse {
  status?: string;
  data?: Record<string, UpstoxQuoteApiRecord>;
}

export const resolveUpstoxAccessToken = (accessToken?: string): string => {
  const resolvedToken = accessToken?.trim() || process.env[UPSTOX_ACCESS_TOKEN_ENV]?.trim();
  if (!resolvedToken) {
    throw new Error(
      `Missing Upstox access token. Set ${UPSTOX_ACCESS_TOKEN_ENV} or pass an access token explicitly.`,
    );
  }
  return resolvedToken;
};

export const createUpstoxHeaders = (accessToken?: string): HeadersInit => ({
  Accept: "application/json",
  Authorization: `Bearer ${resolveUpstoxAccessToken(accessToken)}`,
});

export const mapUpstoxSearchEntry = (
  record: UpstoxSearchApiRecord,
): UpstoxInstrumentSearchEntry | null => {
  const instrumentKey = record.instrument_key?.trim();
  const tradingSymbol = record.trading_symbol?.trim();
  const shortName = record.short_name?.trim();
  const exchange = record.exchange?.trim();
  const instrumentType = record.instrument_type?.trim();

  if (!instrumentKey || !tradingSymbol || !shortName || !exchange || !instrumentType) {
    return null;
  }

  return {
    instrumentKey,
    exchange,
    tradingSymbol,
    shortName,
    instrumentType,
    isin: record.isin?.trim() || undefined,
  };
};

export const parseUpstoxSearchResponse = (
  payload: UpstoxSearchApiResponse,
): UpstoxInstrumentSearchEntry[] =>
  (payload.data ?? [])
    .map(mapUpstoxSearchEntry)
    .filter((entry): entry is UpstoxInstrumentSearchEntry => entry !== null);

export const mapUpstoxQuoteEntry = (
  instrumentKey: string,
  record: UpstoxQuoteApiRecord,
): UpstoxQuoteEntry | null => {
  const resolvedInstrumentKey =
    record.instrument_key?.trim() || record.instrument_token?.trim() || instrumentKey.trim();
  const tradingSymbol = record.trading_symbol?.trim() || record.symbol?.trim();

  if (!resolvedInstrumentKey || typeof record.last_price !== "number") {
    return null;
  }

  return {
    instrumentKey: resolvedInstrumentKey,
    tradingSymbol: tradingSymbol || undefined,
    lastPrice: record.last_price,
    closePrice: typeof record.close_price === "number" ? record.close_price : undefined,
    volume: typeof record.volume === "number" ? record.volume : undefined,
    openInterest: typeof record.oi === "number" ? record.oi : undefined,
  };
};

export const parseUpstoxQuoteResponse = (payload: UpstoxQuoteApiResponse): UpstoxQuoteEntry[] =>
  Object.entries(payload.data ?? {})
    .map(([instrumentKey, record]) => mapUpstoxQuoteEntry(instrumentKey, record))
    .filter((entry): entry is UpstoxQuoteEntry => entry !== null);

export const searchUpstoxInstruments = (
  params: UpstoxSearchParams,
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const url = new URL(UPSTOX_INSTRUMENT_SEARCH_URL);
      url.searchParams.set("query", params.query);
      if (params.exchange) url.searchParams.set("exchange", params.exchange);
      if (params.instrumentType) url.searchParams.set("instrument_type", params.instrumentType);

      const response = await fetchImpl(url, {
        headers: createUpstoxHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`Upstox instrument search failed with status ${response.status}`);
      }

      return parseUpstoxSearchResponse((await response.json()) as UpstoxSearchApiResponse);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const fetchUpstoxQuoteSnapshot = (
  instrumentKeys: readonly string[],
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      if (instrumentKeys.length === 0) {
        return [] satisfies UpstoxQuoteEntry[];
      }

      const url = new URL(UPSTOX_FULL_QUOTE_URL);
      url.searchParams.set("instrument_key", instrumentKeys.join(","));

      const response = await fetchImpl(url, {
        headers: createUpstoxHeaders(accessToken),
      });
      if (!response.ok) {
        throw new Error(`Upstox quote fetch failed with status ${response.status}`);
      }

      return parseUpstoxQuoteResponse((await response.json()) as UpstoxQuoteApiResponse);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const buildUpstoxQuoteSnapshot = (
  searchResults: readonly (UpstoxInstrumentSearchEntry | UpstoxInstrumentProfile)[],
  quoteResults: readonly UpstoxQuoteEntry[],
): UpstoxQuoteSnapshot[] => {
  const searchMap = new Map(searchResults.map((entry) => [entry.instrumentKey, entry]));

  return quoteResults.map((quote) => {
    const searchEntry = searchMap.get(quote.instrumentKey);
    return {
      instrumentKey: quote.instrumentKey,
      tradingSymbol: quote.tradingSymbol || searchEntry?.tradingSymbol || "UNKNOWN",
      shortName: searchEntry?.shortName || quote.tradingSymbol || "Unknown instrument",
      exchange: searchEntry?.exchange || "UNKNOWN",
      instrumentType: searchEntry?.instrumentType || "UNKNOWN",
      lastPrice: quote.lastPrice,
      closePrice: quote.closePrice,
      volume: quote.volume,
      openInterest: quote.openInterest,
      isin: searchEntry?.isin,
    };
  });
};

const clampScore = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

export const buildResearchPacketFromUpstoxSnapshot = (
  snapshot: UpstoxQuoteSnapshot & {
    profile?: UpstoxInstrumentProfile;
    fundamentals?: UpstoxFundamentalsSnapshot;
    events?: readonly CorporateEvent[];
    technicalAnalysis?: TechnicalAnalysisSnapshot;
  },
): ResearchPacket => {
  const closePrice = snapshot.closePrice ?? snapshot.lastPrice;
  const rawPercentChange = closePrice === 0 ? 0 : ((snapshot.lastPrice - closePrice) / closePrice) * 100;
  const absolutePercentChange = Math.abs(rawPercentChange);
  const hasVolume = typeof snapshot.volume === "number" && snapshot.volume > 0;
  const profile = snapshot.profile;
  const fundamentals = snapshot.fundamentals;

  const roe = parsePercentNumber(
    fundamentals?.fundamentalMetrics.find((metric) => metric.label === "ROE")?.value ?? "",
  );
  const roce = parsePercentNumber(
    fundamentals?.fundamentalMetrics.find((metric) => metric.label === "ROCE")?.value ?? "",
  );
  const debtToEquity = parseCroreNumber(
    fundamentals?.fundamentalMetrics.find((metric) => metric.label === "Debt/Equity ratio")?.value ?? "",
  );
  const revenueRows = fundamentals?.revenueStatement ?? [];
  const latestRevenue = revenueRows[0]?.revenueCrores;
  const previousRevenue = revenueRows[1]?.revenueCrores;
  const latestProfit = revenueRows[0]?.netProfitCrores;
  const previousProfit = revenueRows[1]?.netProfitCrores;
  const revenueGrowth =
    latestRevenue && previousRevenue ? ((latestRevenue - previousRevenue) / previousRevenue) * 100 : undefined;
  const profitGrowth =
    latestProfit && previousProfit ? ((latestProfit - previousProfit) / previousProfit) * 100 : undefined;
  const marketCapCrores = fundamentals?.marketCapCrores;
  const eventSignal = scoreCorporateEventSignal(snapshot.events ?? []);
  const technicalAnalysis = snapshot.technicalAnalysis;
  const sectorInference =
    profile ? inferSectorFromEvidence(profile, fundamentals, snapshot.events ?? []) : undefined;

  // Conservative defaults: until we add fundamentals and governance sources,
  // unknown dimensions stay near neutral-to-cautious rather than overconfident.
  const currentEventContext = clampScore(
    45 +
      rawPercentChange * 3 +
      eventSignal * 2 +
      (technicalAnalysis?.trend === "bullish" ? 6 : technicalAnalysis?.trend === "bearish" ? -6 : 0),
  );
  const upsidePotential = clampScore(
    45 +
      Math.max(rawPercentChange, 0) * 2.5 +
      (technicalAnalysis?.oneMonthReturnPct ? Math.max(-8, Math.min(12, technicalAnalysis.oneMonthReturnPct / 2)) : 0),
  );
  const stabilityProfile = clampScore(
    55 -
      absolutePercentChange * 4 +
      (profile?.securityType === "NORMAL" ? 5 : 0) +
      (typeof debtToEquity === "number" ? Math.max(0, 5 - debtToEquity * 10) : 0) +
      (marketCapCrores && marketCapCrores > 100000 ? 5 : 0) +
      (technicalAnalysis?.volatility20dPct ? Math.max(-10, 8 - technicalAnalysis.volatility20dPct / 2) : 0),
  );
  const financialQuality = clampScore(
    45 +
      (typeof revenueGrowth === "number" ? Math.max(-10, Math.min(15, revenueGrowth / 2)) : 0) +
      (typeof profitGrowth === "number" ? Math.max(-10, Math.min(20, profitGrowth / 2)) : 0) +
      (typeof roe === "number" ? Math.max(0, Math.min(10, roe / 2)) : 0) +
      (typeof debtToEquity === "number" ? Math.max(-8, 5 - debtToEquity * 10) : 0),
  );
  const businessQuality = clampScore(
    45 +
      (typeof roce === "number" ? Math.max(0, Math.min(10, roce / 2)) : 0) +
      (marketCapCrores && marketCapCrores > 100000 ? 8 : marketCapCrores && marketCapCrores > 10000 ? 4 : 0) +
      (revenueRows.length >= 3 ? 4 : 0),
  );
  const managementGovernance = clampScore(
    45 +
      (profile?.securityType === "NORMAL" ? 5 : 0) +
      (profile?.mtfEnabled ? 3 : 0) +
      (typeof roe === "number" && roe > 12 ? 4 : 0),
  );
  const sectorAlignment = 50;

  return {
    runLabel: `upstox-${snapshot.tradingSymbol.toLowerCase()}-research`,
    source: "upstox_quote",
    sector: {
      slug: sectorInference?.slug ?? "unclassified",
      name: sectorInference?.name ?? "Unclassified",
      macroTailwind: sectorInference?.slug === "banking-financial-services" ? 58 : 50,
      policySupport: sectorInference?.slug === "defence-industrials" ? 62 : 50,
      geopoliticalEffect: sectorInference?.slug === "energy-oil-gas" ? 58 : 50,
      upcomingCatalysts: hasVolume ? 55 : 50,
      sectorSentiment: clampScore(
        50 + rawPercentChange * 2 + (sectorInference ? sectorInference.confidence * 10 : 0),
      ),
      structuralDurability: sectorInference && sectorInference.slug !== "unclassified" ? 52 : 45,
      regulatoryRisk: 50,
    },
    instrument: {
      symbol: snapshot.tradingSymbol,
      name: profile?.name || snapshot.shortName,
      sectorSlug: sectorInference?.slug ?? "unclassified",
      assetType: "stock",
      financialQuality,
      businessQuality,
      managementGovernance,
      sectorAlignment,
      stabilityProfile,
      upsidePotential,
      currentEventContext,
    },
    ...(snapshot.isin ? { instrumentIsin: snapshot.isin } : {}),
    portfolioExposures: [],
    technicalAnalysis,
  };
};

const buildHistoricalCandleRequestDates = (): { toDate: string; fromDate: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 90);
  const toDate = to.toISOString().slice(0, 10);
  const fromDate = from.toISOString().slice(0, 10);
  return { toDate, fromDate };
};

export const buildEquityResearchPacket = (
  query: string,
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.gen(function* () {
    const profiles = yield* searchUpstoxInstrumentProfiles(query, fetchImpl);
    const selectedProfile = selectPreferredUpstoxInstrumentProfile(query, profiles);
    if (!selectedProfile) {
      throw new Error(`No Upstox equity instrument matched query "${query}".`);
    }

    const quoteResults = yield* fetchUpstoxQuoteSnapshot(
      [selectedProfile.instrumentKey],
      accessToken,
      fetchImpl,
    );
    const fundamentals = selectedProfile.isin
      ? yield* fetchUpstoxFundamentalsSnapshot(selectedProfile.isin, fetchImpl).pipe(
          Effect.catchAll(() => Effect.succeed(undefined)),
        )
      : undefined;
    const events = yield* searchBseAnnouncements(
      selectedProfile.shortName || selectedProfile.name || selectedProfile.tradingSymbol,
      fetchImpl,
    ).pipe(Effect.catchAll(() => Effect.succeed([])));
    const { toDate, fromDate } = buildHistoricalCandleRequestDates();
    const historicalCandles = yield* fetchHistoricalCandles(
      {
        instrumentKey: selectedProfile.instrumentKey,
        unit: "days",
        interval: 1,
        toDate,
        fromDate,
      },
      accessToken,
      fetchImpl,
    ).pipe(Effect.catchAll(() => Effect.succeed([] as HistoricalCandle[])));
    const technicalAnalysis = analyzeHistoricalCandles(historicalCandles);

    const snapshots = buildUpstoxQuoteSnapshot([selectedProfile], quoteResults).map((snapshot) => ({
      ...snapshot,
      profile: selectedProfile,
      ...(fundamentals ? { fundamentals } : {}),
      events,
      ...(technicalAnalysis ? { technicalAnalysis } : {}),
    }));
    const snapshot = snapshots[0];
    if (!snapshot) {
      throw new Error(`No Upstox quote snapshot returned for instrument ${selectedProfile.instrumentKey}.`);
    }

    return buildResearchPacketFromUpstoxSnapshot(snapshot);
  });

export const buildPublicEquityResearchPacket = (
  query: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.gen(function* () {
    const profiles = yield* searchUpstoxInstrumentProfiles(query, fetchImpl);
    const selectedProfile = selectPreferredUpstoxInstrumentProfile(query, profiles);
    if (!selectedProfile) {
      throw new Error(`No public equity instrument matched query "${query}".`);
    }

    const fundamentals = selectedProfile.isin
      ? yield* fetchUpstoxFundamentalsSnapshot(selectedProfile.isin, fetchImpl).pipe(
          Effect.catchAll(() => Effect.succeed(undefined)),
        )
      : undefined;
    const events = yield* searchBseAnnouncements(
      selectedProfile.shortName || selectedProfile.name || selectedProfile.tradingSymbol,
      fetchImpl,
    ).pipe(Effect.catchAll(() => Effect.succeed([])));

    return buildResearchPacketFromUpstoxSnapshot({
      instrumentKey: selectedProfile.instrumentKey,
      tradingSymbol: selectedProfile.tradingSymbol,
      shortName: selectedProfile.shortName || selectedProfile.name,
      exchange: selectedProfile.exchange,
      instrumentType: selectedProfile.instrumentType,
      lastPrice: 0,
      closePrice: 0,
      volume: 0,
      openInterest: 0,
      isin: selectedProfile.isin,
      profile: selectedProfile,
      ...(fundamentals ? { fundamentals } : {}),
      events,
    });
  });
