import { buildRecommendation } from "@tradeai/agent-runtime";
import type {
  DailyResearchResult,
  MemoryContext,
  PortfolioPositionSnapshot,
  ResearchQuality,
  ResearchPacket,
} from "@tradeai/domain";
import { scorePortfolioFit } from "@tradeai/portfolio-engine";
import { scoreInstrument, scoreSector } from "@tradeai/strategy-engine";
import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const defaultDependencies = createTradeAiWorkflowDependencies();

const inferResearchQuality = (packet: ResearchPacket): ResearchQuality => {
  const source =
    packet.source === "indstocks_quote"
      ? "indstocks"
      : packet.source === "market_quote"
        ? "market"
        : packet.source === "aftermarkets"
          ? "aftermarkets"
          : "demo";

  return {
    source,
    completeness: "partial",
    missingSignals: ["memory"],
    fallbacksUsed: [],
  };
};

export interface DailyResearchInput {
  packet: ResearchPacket;
}

export interface EquityResearchInput {
  query: string;
  accessToken?: string;
}

export interface PublicEquityResearchInput {
  query: string;
}

export interface IndstocksPositionResearchInput {
  position: PortfolioPositionSnapshot;
  accessToken?: string;
}

export const buildResearchResult = (
  packet: ResearchPacket,
  memoryContext: MemoryContext,
  recommendation = buildRecommendation,
): Effect.Effect<DailyResearchResult> =>
  Effect.gen(function* () {
    const sectorScore = scoreSector(packet.sector);
    const instrumentScore = scoreInstrument(packet.instrument);
    const portfolioFit = scorePortfolioFit(packet.instrument.sectorSlug, packet.portfolioExposures);
    const recommendationResult = yield* recommendation(
      sectorScore,
      instrumentScore,
      portfolioFit,
      memoryContext,
    );

    return {
      runLabel: packet.runLabel,
      sector: packet.sector,
      sectorScore,
      instrument: packet.instrument,
      ...(packet.instrumentIsin ? { instrumentIsin: packet.instrumentIsin } : {}),
      instrumentScore,
      portfolioFit,
      memoryContext,
      recommendation: recommendationResult,
      ...(packet.technicalAnalysis ? { technicalAnalysis: packet.technicalAnalysis } : {}),
      researchQuality: packet.researchQuality ?? inferResearchQuality(packet),
    } satisfies DailyResearchResult;
  });

export const runDailyResearch = (
  input: DailyResearchInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const memoryContext = yield* dependencies.memorySource.loadMemoryContext();
    return yield* buildResearchResult(input.packet, memoryContext);
  });

export const runDemoResearchSnapshotWithDependencies = (
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => Effect.gen(function* () {
  const packet = yield* dependencies.researchSources.loadDemoResearchPacket();
  const memoryContext = yield* dependencies.memorySource.loadMemoryContext();
  return yield* buildResearchResult(packet, memoryContext);
});

export const runDemoResearchSnapshot = runDemoResearchSnapshotWithDependencies();

export const runEquityResearch = (
  input: EquityResearchInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const packet = yield* dependencies.researchSources.buildEquityResearchPacket(input);
    const memoryContext = yield* dependencies.memorySource.loadMemoryContext();
    return yield* buildResearchResult(packet, memoryContext);
  });

export const runPublicEquityResearch = (
  input: PublicEquityResearchInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const packet = yield* dependencies.researchSources.buildPublicEquityResearchPacket(input);
    const memoryContext = yield* dependencies.memorySource.loadMemoryContext();
    return yield* buildResearchResult(packet, memoryContext);
  });

export const runIndstocksPositionResearch = (
  input: IndstocksPositionResearchInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const packet = yield* dependencies.researchSources.buildBrokerPositionResearchPacket(input);
    const memoryContext = yield* dependencies.memorySource.loadMemoryContext();
    return yield* buildResearchResult(packet, memoryContext);
  });
