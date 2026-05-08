import type {
  PortfolioPositionSnapshot,
  ResearchQuality,
} from "@tradeai/domain";
import { buildResearchPacketFromIndstocksPosition } from "@tradeai/research-engine";
import { Effect } from "effect";

import {
  buildIndstocksScripCode,
  fetchIndstocksHistoricalData,
  fetchIndstocksMarketQuotes,
} from "./indstocks.ts";
import { searchBseAnnouncements } from "./bse-events.ts";
import { analyzeHistoricalCandles } from "@tradeai/market-analysis";

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
    const livePrice = quote?.live_price;
    const enrichedPosition: PortfolioPositionSnapshot = {
      ...position,
      ...(typeof livePrice === "number" ? { lastTradedPrice: livePrice } : {}),
      ...(typeof quote?.prev_close === "number" ? { closePrice: quote.prev_close } : {}),
      ...(typeof livePrice === "number"
        ? {
            marketValue: livePrice * position.quantity,
            pnlAbsolute: (livePrice - position.averagePrice) * position.quantity,
            ...(position.averagePrice > 0
              ? { pnlPercent: ((livePrice - position.averagePrice) / position.averagePrice) * 100 }
              : {}),
          }
        : {}),
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
