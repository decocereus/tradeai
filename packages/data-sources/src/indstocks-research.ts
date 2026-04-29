import type {
  CorporateEvent,
  PortfolioPositionSnapshot,
  ResearchPacket,
  ResearchQuality,
  TechnicalAnalysisSnapshot,
} from "@tradeai/domain";
import { Effect } from "effect";

import {
  buildIndstocksScripCode,
  fetchIndstocksHistoricalData,
  fetchIndstocksMarketQuotes,
} from "./indstocks.ts";
import { scoreCorporateEventSignal, searchBseAnnouncements } from "./bse-events.ts";
import { analyzeHistoricalCandles } from "@tradeai/market-analysis";
import { inferSectorFromEvidence } from "../../strategy-engine/src/sector-inference.ts";

const clampScore = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const buildHistoricalDateRange = (): { startTime: number; endTime: number } => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 120);
  return {
    startTime: start.getTime(),
    endTime: end.getTime(),
  };
};

export interface IndstocksPositionResearchPacketInput {
  position: PortfolioPositionSnapshot;
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export const buildResearchPacketFromIndstocksPosition = (
  position: PortfolioPositionSnapshot,
  options?: {
    events?: readonly CorporateEvent[];
    technicalAnalysis?: TechnicalAnalysisSnapshot;
    researchQuality?: ResearchQuality;
  },
): ResearchPacket => {
  const technicalAnalysis = options?.technicalAnalysis;
  const events = options?.events ?? [];

  const rawPercentChange =
    position.closePrice === 0
      ? 0
      : ((position.lastTradedPrice - position.closePrice) / position.closePrice) * 100;
  const absolutePercentChange = Math.abs(rawPercentChange);
  const eventSignal = scoreCorporateEventSignal(events);
  const sectorInference = inferSectorFromEvidence(
    {
      instrumentKey: position.securityId ?? position.symbol,
      exchange: position.exchangeSegment.startsWith("BSE") ? "BSE_EQ" : "NSE_EQ",
      tradingSymbol: position.symbol.replace(/-EQ$/i, ""),
      name: position.instrumentName ?? position.symbol,
      shortName: position.instrumentName,
      isin: position.isin,
      instrumentType: "EQUITY",
    },
    undefined,
    events,
  );
  const missingSignals: ResearchQuality["missingSignals"] = [
    "fundamentals",
    ...(technicalAnalysis ? [] : ["candles" as const]),
    ...(events.length > 0 ? [] : ["events" as const]),
  ];
  const researchQuality =
    options?.researchQuality ??
    ({
      source: "indstocks",
      completeness: missingSignals.length === 0 ? "complete" : "partial",
      missingSignals,
      fallbacksUsed: missingSignals.length > 0 ? ["neutral_score_defaults"] : [],
    } satisfies ResearchQuality);

  const currentEventContext = clampScore(
    45 +
      rawPercentChange * 3 +
      eventSignal * 2 +
      (technicalAnalysis?.trend === "bullish" ? 6 : technicalAnalysis?.trend === "bearish" ? -6 : 0),
  );
  const upsidePotential = clampScore(
    45 +
      Math.max(rawPercentChange, 0) * 2.5 +
      (technicalAnalysis?.oneMonthReturnPct
        ? Math.max(-8, Math.min(12, technicalAnalysis.oneMonthReturnPct / 2))
        : 0),
  );
  const stabilityProfile = clampScore(
    55 -
      absolutePercentChange * 4 +
      (technicalAnalysis?.volatility20dPct
        ? Math.max(-10, 8 - technicalAnalysis.volatility20dPct / 2)
        : 0),
  );
  const financialQuality = 45;
  const businessQuality = 45;
  const managementGovernance = 45;

  return {
    runLabel: `indstocks-${position.symbol.toLowerCase()}-research`,
    source: "indstocks_quote",
    sector: {
      slug: sectorInference?.slug ?? "unclassified",
      name: sectorInference?.name ?? "Unclassified",
      macroTailwind: sectorInference?.slug === "banking-financial-services" ? 58 : 50,
      policySupport: sectorInference?.slug === "defence-industrials" ? 62 : 50,
      geopoliticalEffect: sectorInference?.slug === "energy-oil-gas" ? 58 : 50,
      upcomingCatalysts: 55,
      sectorSentiment: clampScore(
        50 + rawPercentChange * 2 + (sectorInference ? sectorInference.confidence * 10 : 0),
      ),
      structuralDurability: sectorInference && sectorInference.slug !== "unclassified" ? 52 : 45,
      regulatoryRisk: 50,
    },
    instrument: {
      symbol: position.symbol.replace(/-EQ$/i, ""),
      name: position.instrumentName ?? position.symbol,
      sectorSlug: sectorInference?.slug ?? "unclassified",
      assetType: "stock",
      financialQuality,
      businessQuality,
      managementGovernance,
      sectorAlignment: 50,
      stabilityProfile,
      upsidePotential,
      currentEventContext,
    },
    ...(position.isin ? { instrumentIsin: position.isin } : {}),
    portfolioExposures: [],
    ...(technicalAnalysis ? { technicalAnalysis } : {}),
    researchQuality,
  };
};

export const buildIndstocksResearchPacketForPosition = (
  input: IndstocksPositionResearchPacketInput,
) =>
  Effect.gen(function* () {
    const { position } = input;
    const fetchImpl = input.fetchImpl ?? fetch;
    if (!position.securityId) {
      throw new Error(`INDstocks position ${position.symbol} is missing securityId.`);
    }

    const scripCode = buildIndstocksScripCode(position.securityId, position.exchangeSegment);
    const quoteMapOutcome = yield* Effect.either(
      fetchIndstocksMarketQuotes([scripCode], input.accessToken, fetchImpl),
    );
    const quoteMap = quoteMapOutcome._tag === "Right" ? quoteMapOutcome.right : {};
    const { startTime, endTime } = buildHistoricalDateRange();
    const historicalCandlesOutcome = yield* Effect.either(
      fetchIndstocksHistoricalData(
        {
          interval: "1day",
          scripCodes: [scripCode],
          startTime,
          endTime,
        },
        input.accessToken,
        fetchImpl,
      ),
    );
    const historicalCandles =
      historicalCandlesOutcome._tag === "Right" ? historicalCandlesOutcome.right : [];
    const technicalAnalysis = analyzeHistoricalCandles(historicalCandles);
    const eventQuery = position.instrumentName ?? position.symbol.replace(/-EQ$/i, "");
    const eventsOutcome = yield* Effect.either(searchBseAnnouncements(eventQuery, fetchImpl));
    const events = eventsOutcome._tag === "Right" ? eventsOutcome.right : [];

    const quote = quoteMap[scripCode];
    const hasBrokerQuote = typeof quote?.live_price === "number";
    const enrichedPosition: PortfolioPositionSnapshot = {
      ...position,
      ...(quote?.live_price ? { lastTradedPrice: quote.live_price } : {}),
      ...(quote?.prev_close ? { closePrice: quote.prev_close } : {}),
      marketValue:
        typeof quote?.live_price === "number"
          ? quote.live_price * position.quantity
          : position.marketValue,
      pnlAbsolute:
        typeof quote?.live_price === "number"
          ? (quote.live_price - position.averagePrice) * position.quantity
          : position.pnlAbsolute,
      pnlPercent:
        typeof quote?.live_price === "number" && position.averagePrice > 0
          ? ((quote.live_price - position.averagePrice) / position.averagePrice) * 100
          : position.pnlPercent,
    };

    const missingSignals: ResearchQuality["missingSignals"] = [
      ...(hasBrokerQuote ? [] : ["broker_quote" as const]),
      "fundamentals",
      ...(technicalAnalysis ? [] : ["candles" as const]),
      ...(events.length > 0 ? [] : ["events" as const]),
    ];

    return buildResearchPacketFromIndstocksPosition(enrichedPosition, {
      events,
      ...(technicalAnalysis ? { technicalAnalysis } : {}),
      researchQuality: {
        source: "indstocks",
        completeness: missingSignals.length === 0 ? "complete" : "partial",
        missingSignals,
        fallbacksUsed: missingSignals.length === 0 ? [] : ["neutral_score_defaults" as const],
      },
    });
  });
