import type {
  CorporateEvent,
  PortfolioPositionSnapshot,
  ResearchPacket,
  ResearchQuality,
  TechnicalAnalysisSnapshot,
} from "@tradeai/domain";
import { inferSectorFromEvidence } from "@tradeai/strategy-engine";

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

export interface ProviderStockDetailEnvelope {
  data?: {
    stock?: {
      symbol?: string;
      name?: string;
      industry?: string;
      price?: number;
      changePct?: number;
      volume?: number;
      volumeRatio?: number;
      marketCap?: number;
      return1m?: number;
    };
    fundamentals?: {
      pe?: number;
      pb?: number;
      roce?: number;
      debtEquity?: number;
      roe?: number;
      npm?: number;
      opm?: number;
      eps?: number;
      dividendYield?: number;
      evEbitda?: number;
      quarterlySales?: number;
      quarterlyProfit?: number;
    };
    technicals?: {
      rsi14?: number;
      sma20?: number;
      sma50?: number;
      macdTrend?: string;
      volumeRatio?: number;
    };
    checklist?: {
      overallScore?: number;
      dimensions?: readonly {
        type?: string;
        score?: number;
        rating?: string;
      }[];
    };
  };
}

const readDimensionScore = (
  detail: NonNullable<ProviderStockDetailEnvelope["data"]>,
  type: string,
  fallback: number,
) => detail.checklist?.dimensions?.find((dimension) => dimension.type === type)?.score ?? fallback;

const inferTrend = (
  technicals: NonNullable<ProviderStockDetailEnvelope["data"]>["technicals"] | undefined,
): TechnicalAnalysisSnapshot["trend"] => {
  if (technicals?.macdTrend === "bullish") return "bullish";
  if (technicals?.macdTrend === "bearish") return "bearish";
  return "rangebound";
};

const sectorSlugFromIndustry = (industry?: string) =>
  industry?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
  "unclassified";

export const buildAftermarketsResearchPacketFromStockDetail = (
  envelope: ProviderStockDetailEnvelope,
): ResearchPacket => {
  const detail = envelope.data;
  const stock = detail?.stock;
  if (!detail || !stock?.symbol || !stock.name) {
    throw new Error("Aftermarkets stock detail response is missing stock identity.");
  }

  const technicalAnalysis =
    typeof stock.price === "number"
      ? ({
          latestClose: stock.price,
          sma20: detail.technicals?.sma20,
          sma50: detail.technicals?.sma50,
          rsi14: detail.technicals?.rsi14,
          oneDayReturnPct: stock.changePct,
          oneMonthReturnPct: stock.return1m,
          trend: inferTrend(detail.technicals),
        } satisfies TechnicalAnalysisSnapshot)
      : undefined;
  const missingSignals: ResearchQuality["missingSignals"] = [
    ...(detail.fundamentals ? [] : ["fundamentals" as const]),
    ...(technicalAnalysis ? [] : ["candles" as const]),
    "events",
    "memory",
  ];
  const sectorSlug = sectorSlugFromIndustry(stock.industry);

  return {
    runLabel: `aftermarkets-${stock.symbol.toLowerCase()}-research`,
    source: "aftermarkets",
    sector: {
      slug: sectorSlug,
      name: stock.industry || "Unclassified",
      macroTailwind: 50,
      policySupport: 50,
      geopoliticalEffect: 50,
      upcomingCatalysts: readDimensionScore(detail, "performance", 50),
      sectorSentiment: clampScore(50 + (stock.changePct ?? 0) * 2),
      structuralDurability: readDimensionScore(detail, "risk", 50),
      regulatoryRisk: 50,
    },
    instrument: {
      symbol: stock.symbol,
      name: stock.name,
      sectorSlug,
      assetType: "stock",
      financialQuality: readDimensionScore(detail, "growth", 50),
      businessQuality: readDimensionScore(detail, "profitability", 50),
      managementGovernance: clampScore(
        45 +
          (detail.fundamentals?.roe ?? 0) / 3 +
          (detail.fundamentals?.debtEquity !== undefined
            ? Math.max(-8, 6 - detail.fundamentals.debtEquity * 10)
            : 0),
      ),
      sectorAlignment: 50,
      stabilityProfile: readDimensionScore(detail, "risk", 50),
      upsidePotential: readDimensionScore(detail, "valuation", 50),
      currentEventContext: readDimensionScore(detail, "technicals", 50),
    },
    portfolioExposures: [],
    ...(technicalAnalysis ? { technicalAnalysis } : {}),
    researchQuality: {
      source: "aftermarkets",
      completeness: missingSignals.length <= 2 ? "partial" : "minimal",
      missingSignals,
      fallbacksUsed: ["neutral_score_defaults"],
    },
  };
};

export const scoreCorporateEventSignal = (events: readonly CorporateEvent[]): number => {
  const signalWords = [
    "financial results",
    "board meeting",
    "joint venture",
    "settlement agreement",
    "allotment",
    "press release",
    "annual report",
    "acquisition",
  ];

  return events.reduce((score, event) => {
    const haystack = `${event.title} ${event.description}`.toLowerCase();
    const hitCount = signalWords.filter((word) => haystack.includes(word)).length;
    return score + hitCount;
  }, 0);
};

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
    position.closePrice === undefined ||
    position.closePrice === 0 ||
    position.lastTradedPrice === undefined
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
  const sectorSlug = sectorInference?.slug ?? "unclassified";

  return {
    runLabel: `indstocks-${position.symbol.toLowerCase()}-research`,
    source: "indstocks_quote",
    sector: {
      slug: sectorSlug,
      name: sectorInference?.name ?? "Unclassified",
      macroTailwind: sectorSlug === "banking-financial-services" ? 58 : 50,
      policySupport: sectorSlug === "defence-industrials" ? 62 : 50,
      geopoliticalEffect: sectorSlug === "energy-oil-gas" ? 58 : 50,
      upcomingCatalysts: 55,
      sectorSentiment: clampScore(
        50 + rawPercentChange * 2 + (sectorInference ? sectorInference.confidence * 10 : 0),
      ),
      structuralDurability: sectorInference && sectorSlug !== "unclassified" ? 52 : 45,
      regulatoryRisk: 50,
    },
    instrument: {
      symbol: position.symbol.replace(/-EQ$/i, ""),
      name: position.instrumentName ?? position.symbol,
      sectorSlug,
      assetType: "stock",
      financialQuality: 45,
      businessQuality: 45,
      managementGovernance: 45,
      sectorAlignment: 50,
      stabilityProfile: clampScore(
        55 -
          absolutePercentChange * 4 +
          (technicalAnalysis?.volatility20dPct
            ? Math.max(-10, 8 - technicalAnalysis.volatility20dPct / 2)
            : 0),
      ),
      upsidePotential: clampScore(
        45 +
          Math.max(rawPercentChange, 0) * 2.5 +
          (technicalAnalysis?.oneMonthReturnPct
            ? Math.max(-8, Math.min(12, technicalAnalysis.oneMonthReturnPct / 2))
            : 0),
      ),
      currentEventContext: clampScore(
        45 +
          rawPercentChange * 3 +
          eventSignal * 2 +
          (technicalAnalysis?.trend === "bullish"
            ? 6
            : technicalAnalysis?.trend === "bearish"
              ? -6
              : 0),
      ),
    },
    ...(position.isin ? { instrumentIsin: position.isin } : {}),
    portfolioExposures: [],
    ...(technicalAnalysis ? { technicalAnalysis } : {}),
    researchQuality,
  };
};
