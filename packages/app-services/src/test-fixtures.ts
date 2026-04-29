import { Effect } from "effect";
import type { DailyResearchResult, ResearchPacket } from "@tradeai/domain";

import { buildResearchResult } from "./research-workflows.ts";

export const customResearchPacket = {
  runLabel: "custom-packet",
  source: "market_quote",
  sector: {
    slug: "unclassified",
    name: "Unclassified",
    macroTailwind: 50,
    policySupport: 50,
    geopoliticalEffect: 50,
    upcomingCatalysts: 55,
    sectorSentiment: 58,
    structuralDurability: 45,
    regulatoryRisk: 50,
  },
  instrument: {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sectorSlug: "unclassified",
    assetType: "stock",
    financialQuality: 45,
    businessQuality: 45,
    managementGovernance: 45,
    sectorAlignment: 50,
    stabilityProfile: 55,
    upsidePotential: 57,
    currentEventContext: 60,
  },
  portfolioExposures: [],
} satisfies ResearchPacket;

export const buildMockResearchResult = (overrides?: {
  symbol?: string;
  isin?: string;
  verdict?: DailyResearchResult["recommendation"]["verdict"];
  conviction?: number;
}) =>
  Effect.runPromise(
    buildResearchResult(
      {
        ...customResearchPacket,
        runLabel: "mock-review-research",
        instrument: {
          ...customResearchPacket.instrument,
          symbol: overrides?.symbol ?? "RELIANCE",
        },
        ...(overrides?.isin ? { instrumentIsin: overrides.isin } : {}),
      },
      {
        previousVerdict: "watch",
        previousConviction: 50,
        notes: ["deterministic test memory"],
      },
      (_sectorScore, _instrumentScore, _portfolioFit, _memoryContext) =>
        Effect.succeed({
          verdict: overrides?.verdict ?? "buy",
          conviction: overrides?.conviction ?? 70,
          stability: "strengthening",
          riskBucket: "moderate",
          keyReasons: [],
          mainRisks: [],
          invalidationConditions: [],
        }),
    ),
  );
