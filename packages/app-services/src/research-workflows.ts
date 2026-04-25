import { buildRecommendation } from "@tradeai/agent-runtime";
import {
  buildEquityResearchPacket,
  buildIndstocksResearchPacketForPosition,
  buildPublicEquityResearchPacket,
  loadDemoResearchPacket,
} from "@tradeai/data-sources";
import type {
  DailyResearchResult,
  MemoryContext,
  PortfolioPositionSnapshot,
  ResearchQuality,
  ResearchPacket,
} from "@tradeai/domain";
import { loadMemoryContext } from "@tradeai/memory";
import { scorePortfolioFit } from "@tradeai/portfolio-engine";
import { scoreInstrument, scoreSector } from "@tradeai/strategy-engine";
import { Effect } from "effect";

const inferResearchQuality = (packet: ResearchPacket): ResearchQuality => {
  const source =
    packet.source === "indstocks_quote"
      ? "indstocks"
      : packet.source === "upstox_quote"
        ? "upstox"
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

export const runDailyResearch = (input: DailyResearchInput) =>
  Effect.gen(function* () {
    const memoryContext = yield* loadMemoryContext;
    return yield* buildResearchResult(input.packet, memoryContext);
  });

export const runDemoResearchSnapshot = Effect.gen(function* () {
  const packet = yield* loadDemoResearchPacket;
  const memoryContext = yield* loadMemoryContext;
  return yield* buildResearchResult(packet, memoryContext);
});

export const runEquityResearch = (input: EquityResearchInput) =>
  Effect.gen(function* () {
    const packet = yield* buildEquityResearchPacket(input);
    const memoryContext = yield* loadMemoryContext;
    return yield* buildResearchResult(packet, memoryContext);
  });

export const runPublicEquityResearch = (input: PublicEquityResearchInput) =>
  Effect.gen(function* () {
    const packet = yield* buildPublicEquityResearchPacket(input);
    const memoryContext = yield* loadMemoryContext;
    return yield* buildResearchResult(packet, memoryContext);
  });

export const runIndstocksPositionResearch = (input: IndstocksPositionResearchInput) =>
  Effect.gen(function* () {
    const packet = yield* buildIndstocksResearchPacketForPosition(input);
    const memoryContext = yield* loadMemoryContext;
    return yield* buildResearchResult(packet, memoryContext);
  });
