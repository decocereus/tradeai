import { buildRecommendation } from "@tradeai/agent-runtime";
import type {
  DailyResearchResult,
  KnowledgeContext,
  MemoryContext,
  PortfolioPositionSnapshot,
  ResearchQuality,
  ResearchPacket,
} from "@tradeai/domain";
import type { MemoryContextInput } from "@tradeai/memory";
import { scorePortfolioFit } from "@tradeai/portfolio-engine";
import { scoreInstrument, scoreSector } from "@tradeai/strategy-engine";
import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const defaultDependencies = createTradeAiWorkflowDependencies();

const memorySymbolCandidates = (packet: ResearchPacket): readonly string[] => {
  const symbols = [
    packet.instrument.symbol,
    packet.instrument.symbol.endsWith("-EQ") ? undefined : `${packet.instrument.symbol}-EQ`,
  ];
  return [...new Set(symbols.filter((symbol): symbol is string => Boolean(symbol)))];
};

const knowledgeQueryForPacket = (packet: ResearchPacket): string =>
  [
    packet.instrument.symbol,
    packet.instrument.name,
    packet.sector.name,
    packet.instrument.sectorSlug,
  ].join(" ");

const loadMemoryContextInputForPacket = (
  packet: ResearchPacket,
  dependencies: TradeAiWorkflowDependencies,
): Effect.Effect<MemoryContextInput> =>
  Effect.gen(function* () {
    const symbol = packet.instrument.symbol;
    if (
      !dependencies.config.databaseUrl ||
      !dependencies.repositories.hasConfiguredDatabaseUrl(dependencies.config.databaseUrl)
    ) {
      return { symbol };
    }

    const historyResult = yield* Effect.either(
      Effect.forEach(
        memorySymbolCandidates(packet),
        (candidate) =>
          Effect.tryPromise(() =>
            dependencies.repositories.loadHoldingReviewHistory(
              candidate,
              undefined,
              dependencies.config.databaseUrl,
            ),
          ),
        { concurrency: 1 },
      ).pipe(Effect.map((groups) => groups.flat())),
    );

    if (historyResult._tag === "Left") {
      return {
        symbol,
        retrievalError: historyResult.left instanceof Error
          ? historyResult.left.message
          : String(historyResult.left),
      };
    }

    return {
      symbol,
      history: historyResult.right.sort(
        (left, right) =>
          new Date(right.reviewedAt).getTime() - new Date(left.reviewedAt).getTime(),
      ),
    };
  });

const emptyKnowledgeContext = (
  query: string,
  notes: readonly string[] = [],
): KnowledgeContext => ({
  query,
  claims: [],
  notes: [...notes],
});

const loadKnowledgeContextForPacket = (
  packet: ResearchPacket,
  dependencies: TradeAiWorkflowDependencies,
): Effect.Effect<KnowledgeContext> =>
  Effect.gen(function* () {
    const query = knowledgeQueryForPacket(packet);
    if (
      !dependencies.config.databaseUrl ||
      !dependencies.repositories.hasConfiguredDatabaseUrl(dependencies.config.databaseUrl)
    ) {
      return emptyKnowledgeContext(query);
    }

    const documentsResult = yield* Effect.either(
      Effect.tryPromise(() =>
        dependencies.repositories.loadKnowledgeDocuments(dependencies.config.databaseUrl, 50),
      ),
    );

    if (documentsResult._tag === "Left") {
      const message = documentsResult.left instanceof Error
        ? documentsResult.left.message
        : String(documentsResult.left);
      return emptyKnowledgeContext(query, [`Knowledge retrieval unavailable: ${message}`]);
    }

    return yield* dependencies.knowledgeSource.loadKnowledgeContext({
      query,
      documents: documentsResult.right,
      maxClaims: 3,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed(
          emptyKnowledgeContext(
            query,
            [`Knowledge retrieval unavailable: ${error.message}`],
          ),
        ),
      ),
    );
  });

const loadResearchContexts = (
  packet: ResearchPacket,
  dependencies: TradeAiWorkflowDependencies,
): Effect.Effect<{
  memoryContext: MemoryContext;
  knowledgeContext: KnowledgeContext;
}, Error> =>
  Effect.gen(function* () {
    const memoryInput = yield* loadMemoryContextInputForPacket(packet, dependencies);
    const memoryContext = yield* dependencies.memorySource.loadMemoryContext(memoryInput);
    const knowledgeContext = yield* loadKnowledgeContextForPacket(packet, dependencies);
    return { memoryContext, knowledgeContext };
  });

const inferResearchQuality = (packet: ResearchPacket): ResearchQuality => {
  const source =
    packet.source === "indstocks_quote"
      ? "indstocks"
      : packet.source === "market_quote"
        ? "market"
        : "aftermarkets";

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

export interface IndstocksPositionResearchInput {
  position: PortfolioPositionSnapshot;
  accessToken?: string;
}

export const buildResearchResult = (
  packet: ResearchPacket,
  memoryContext: MemoryContext,
  knowledgeContext: KnowledgeContext = emptyKnowledgeContext(knowledgeQueryForPacket(packet)),
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
      knowledgeContext,
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
    const { memoryContext, knowledgeContext } = yield* loadResearchContexts(input.packet, dependencies);
    return yield* buildResearchResult(input.packet, memoryContext, knowledgeContext);
  });

export const runEquityResearch = (
  input: EquityResearchInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const packet = yield* dependencies.researchSources.buildEquityResearchPacket(input);
    const { memoryContext, knowledgeContext } = yield* loadResearchContexts(packet, dependencies);
    return yield* buildResearchResult(packet, memoryContext, knowledgeContext);
  });

export const runIndstocksPositionResearch = (
  input: IndstocksPositionResearchInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const packet = yield* dependencies.researchSources.buildBrokerPositionResearchPacket(input);
    const { memoryContext, knowledgeContext } = yield* loadResearchContexts(packet, dependencies);
    return yield* buildResearchResult(packet, memoryContext, knowledgeContext);
  });
