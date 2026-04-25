import type { ResearchPacket } from "@tradeai/domain";
import { Effect } from "effect";

const demoPacket: ResearchPacket = {
  runLabel: "demo-daily-run",
  source: "demo",
  sector: {
    slug: "defense",
    name: "Defense",
    macroTailwind: 82,
    policySupport: 88,
    geopoliticalEffect: 79,
    upcomingCatalysts: 72,
    sectorSentiment: 76,
    structuralDurability: 81,
    regulatoryRisk: 34,
  },
  instrument: {
    symbol: "DEMO",
    name: "Demo Defense Systems",
    sectorSlug: "defense",
    assetType: "stock",
    financialQuality: 74,
    businessQuality: 79,
    managementGovernance: 71,
    sectorAlignment: 86,
    stabilityProfile: 67,
    upsidePotential: 73,
    currentEventContext: 78,
  },
  instrumentIsin: "DEMO00000000",
  portfolioExposures: [
    {
      sectorSlug: "banks",
      percentage: 35,
    },
    {
      sectorSlug: "it",
      percentage: 20,
    },
  ],
  researchQuality: {
    source: "demo",
    completeness: "minimal",
    missingSignals: ["fundamentals", "candles", "events", "broker_quote", "memory"],
    fallbacksUsed: ["neutral_score_defaults"],
  },
};

export const loadDemoResearchPacket = Effect.succeed(demoPacket);
