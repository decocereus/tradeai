import type {
  BrokerPortfolioDecisionReport,
  BrokerPortfolioReviewReport,
  BrokerSource,
  DailyResearchResult,
  HoldingResearchReview,
  PortfolioPositionSnapshot,
  PortfolioSyncReport,
} from "@tradeai/domain";
import { summarizeHoldingReviewTrend } from "@tradeai/memory";
import { createLogger, timed } from "@tradeai/observability";
import {
  assessPositionAgainstResearch,
  deriveResearchQueryFromPositionSymbol,
  summarizeHoldingResearchReviews,
} from "@tradeai/portfolio-engine";
import { Effect } from "effect";

import {
  type BrokerPortfolioWorkflowInput,
  canPersistPortfolioMemory,
  getBrokerPortfolioPositions,
  getManualPortfolioPositions,
  importManualPortfolioSnapshot,
  type ManualPortfolioImportInput,
  syncBrokerPortfolio,
} from "./portfolio-workflows.ts";
import {
  type EquityResearchInput,
  type IndstocksPositionResearchInput,
  type PublicEquityResearchInput,
  runEquityResearch,
  runIndstocksPositionResearch,
  runPublicEquityResearch,
} from "./research-workflows.ts";
import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const log = createLogger("app-services");
const defaultDependencies = createTradeAiWorkflowDependencies();

export interface ReviewResearchRunners {
  runBrokerPositionResearch: (
    input: IndstocksPositionResearchInput,
  ) => Effect.Effect<DailyResearchResult, Error>;
  runAuthenticatedEquityResearch: (
    input: EquityResearchInput,
  ) => Effect.Effect<DailyResearchResult, Error>;
  runPublicEquityResearch: (
    input: PublicEquityResearchInput,
  ) => Effect.Effect<DailyResearchResult, Error>;
}

export interface ReviewWorkflowOptions {
  researchRunners?: ReviewResearchRunners;
  allowPublicResearchFallback?: boolean;
}

export interface ReviewPortfolioPositionsInput {
  positions: readonly PortfolioPositionSnapshot[];
  broker: BrokerSource;
  accessToken?: string;
  options?: ReviewWorkflowOptions;
}

export interface BrokerPortfolioReviewInput extends BrokerPortfolioWorkflowInput {
  options?: ReviewWorkflowOptions;
}

export interface ManualPortfolioReviewInput {
  holdingsCsvPath: string;
  accessToken?: string;
  options?: ReviewWorkflowOptions;
}

export interface ManualPortfolioDecisionInput extends ManualPortfolioImportInput {
  accessToken?: string;
  options?: ReviewWorkflowOptions;
}

const defaultReviewResearchRunners: ReviewResearchRunners = {
  runBrokerPositionResearch: runIndstocksPositionResearch,
  runAuthenticatedEquityResearch: runEquityResearch,
  runPublicEquityResearch,
};

const resolveReviewWorkflowOptions = (options?: ReviewWorkflowOptions) => ({
  researchRunners: options?.researchRunners ?? defaultReviewResearchRunners,
  allowPublicResearchFallback: options?.allowPublicResearchFallback ?? true,
});

const formatResearchEvidence = (research: DailyResearchResult) => {
  const parts = [
    `verdict=${research.recommendation.verdict}`,
    `conviction=${research.recommendation.conviction}`,
    `instrumentScore=${research.instrumentScore.total}`,
    `sectorScore=${research.sectorScore.total}`,
    research.technicalAnalysis ? `trend=${research.technicalAnalysis.trend}` : undefined,
    `quality=${research.researchQuality.completeness}`,
    research.researchQuality.missingSignals.length > 0
      ? `missing=${research.researchQuality.missingSignals.join(",")}`
      : undefined,
    research.researchQuality.fallbacksUsed.length > 0
      ? `fallbacks=${research.researchQuality.fallbacksUsed.join(",")}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join(", ");
};

const formatResearchDrivers = (research: DailyResearchResult) => {
  const reasons = [
    ...research.recommendation.keyReasons,
    ...research.instrumentScore.reasons,
    ...research.sectorScore.reasons,
  ];
  const uniqueReasons = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))];
  return uniqueReasons.length > 0 ? ` Drivers: ${uniqueReasons.slice(0, 3).join("; ")}.` : "";
};

const buildReviewReason = (
  baseReason: string,
  research: DailyResearchResult,
) => `${baseReason} Evidence: ${formatResearchEvidence(research)}.${formatResearchDrivers(research)}`;

export const buildHoldingResearchReview = (
  symbol: string,
  query: string,
  outcome:
    | { research: DailyResearchResult }
    | { error: string },
): HoldingResearchReview => {
  if ("error" in outcome) {
    return {
      symbol,
      query,
      status: "error",
      reason: outcome.error,
    };
  }

  const assessment = assessPositionAgainstResearch(
    {
      symbol,
      isin: "",
      exchangeSegment: "NSE_EQ",
      quantity: 0,
      averagePrice: 0,
      lastTradedPrice: 0,
      closePrice: 0,
      marketValue: 0,
      pnlAbsolute: 0,
      pnlPercent: 0,
      sourceBroker: "indstocks",
    },
    outcome.research,
  );

  return {
    symbol,
    query,
    status: assessment.status,
    reason: buildReviewReason(assessment.reason, outcome.research),
    verdict: outcome.research.recommendation.verdict,
    conviction: outcome.research.recommendation.conviction,
    runLabel: outcome.research.runLabel,
    researchQuality: outcome.research.researchQuality,
  };
};

export const buildBrokerPortfolioReviewReport = (
  reviews: readonly HoldingResearchReview[],
  broker: BrokerSource = "indstocks",
): BrokerPortfolioReviewReport => {
  const summary = summarizeHoldingResearchReviews(reviews);
  return {
    broker,
    holdingsReviewed: summary.holdingsReviewed,
    alignedCount: summary.alignedCount,
    reviewCount: summary.reviewCount,
    conflictCount: summary.conflictCount,
    unmatchedCount: summary.unmatchedCount,
    errorCount: summary.errorCount,
    reviews: [...reviews],
  };
};

export const reviewPortfolioPositionsAgainstResearch = (input: ReviewPortfolioPositionsInput) =>
  Effect.gen(function* () {
    const { researchRunners, allowPublicResearchFallback } =
      resolveReviewWorkflowOptions(input.options);
    const reviews = yield* Effect.forEach(
      input.positions,
      (position) =>
        Effect.gen(function* () {
          if (input.broker === "indstocks" && position.securityId) {
            const indstocksOutcome = yield* Effect.either(
              researchRunners.runBrokerPositionResearch({
                position,
                ...(input.accessToken ? { accessToken: input.accessToken } : {}),
              }),
            );

            if (indstocksOutcome._tag === "Right") {
              return buildHoldingResearchReview(position.symbol, position.symbol, {
                research: indstocksOutcome.right,
              });
            }

            yield* Effect.sync(() =>
              log.warn(
                {
                  action: "reviewPortfolioPositionsAgainstResearch",
                  symbol: position.symbol,
                  error: indstocksOutcome.left,
                },
                "INDstocks position research unavailable; trying broader equity research",
              ),
            );
          }

          const query = deriveResearchQueryFromPositionSymbol(position.symbol);
          const outcome = yield* Effect.either(
            researchRunners.runAuthenticatedEquityResearch({
              query,
              ...(input.accessToken ? { accessToken: input.accessToken } : {}),
            }),
          );

          if (outcome._tag === "Left") {
            if (!allowPublicResearchFallback) {
              const error =
                outcome.left instanceof Error ? outcome.left.message : String(outcome.left);
              return buildHoldingResearchReview(position.symbol, query, { error });
            }

            const fallback = yield* Effect.either(
              researchRunners.runPublicEquityResearch({ query }),
            );
            if (fallback._tag === "Left") {
              const error =
                outcome.left instanceof Error ? outcome.left.message : String(outcome.left);
              return buildHoldingResearchReview(position.symbol, query, { error });
            }

            const review = buildHoldingResearchReview(position.symbol, query, {
              research: fallback.right,
            });

            return {
              ...review,
              reason: `${review.reason} (public fallback review: live quote/candle data unavailable)`,
            };
          }

          return buildHoldingResearchReview(position.symbol, query, {
            research: outcome.right,
          });
        }),
      { concurrency: 3 },
    );

    return buildBrokerPortfolioReviewReport(reviews, input.broker);
  });

export const reviewBrokerHoldingsAgainstResearch = (input: BrokerPortfolioReviewInput = {}) =>
  reviewBrokerHoldingsAgainstResearchWithDependencies(input);

export const reviewBrokerHoldingsAgainstResearchWithDependencies = (
  input: BrokerPortfolioReviewInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    log.info({ action: "reviewBrokerHoldingsAgainstResearch" }, "reviewing live holdings against research");
    const positions = yield* getBrokerPortfolioPositions(input, dependencies);
    return yield* reviewPortfolioPositionsAgainstResearch({
      positions,
      broker: "indstocks",
      ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      ...(input.options ? { options: input.options } : {}),
    });
  });

export const buildBrokerPortfolioDecisionReport = (
  sync: PortfolioSyncReport,
  review: BrokerPortfolioReviewReport,
  reviewsPersisted?: number,
): BrokerPortfolioDecisionReport => ({
  sync,
  review,
  ...(reviewsPersisted !== undefined ? { reviewsPersisted } : {}),
});

export const reviewSyncedBrokerPortfolio = (input: BrokerPortfolioReviewInput = {}) =>
  reviewSyncedBrokerPortfolioWithDependencies(input);

export const reviewSyncedBrokerPortfolioWithDependencies = (
  input: BrokerPortfolioReviewInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    log.info({ action: "reviewSyncedBrokerPortfolio" }, "building combined portfolio decision report");
    const sync = yield* syncBrokerPortfolio(input, dependencies);
    const review = yield* reviewBrokerHoldingsAgainstResearchWithDependencies(input, dependencies);
    const reviewsPersisted =
      sync.persisted && canPersistPortfolioMemory(input.databaseUrl, dependencies)
        ? (
            yield* Effect.tryPromise(() =>
              timed("app-services", "reviewSyncedBrokerPortfolio.persistReviewHistory", () =>
                dependencies.repositories.persistHoldingReviewReport(
                  sync.currentSnapshotId,
                  review,
                  input.databaseUrl,
                ),
              ),
            )
          ).reviewsInserted
        : undefined;
    return buildBrokerPortfolioDecisionReport(sync, review, reviewsPersisted);
  });

export const reviewImportedPortfolioAgainstResearch = (input: ManualPortfolioReviewInput) =>
  Effect.gen(function* () {
    const positions = yield* getManualPortfolioPositions(input.holdingsCsvPath);
    return yield* reviewPortfolioPositionsAgainstResearch(
      {
        positions,
        broker: "manual_csv",
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
        ...(input.options ? { options: input.options } : {}),
      },
    );
  });

export const reviewImportedPortfolioDecision = (input: ManualPortfolioDecisionInput) =>
  reviewImportedPortfolioDecisionWithDependencies(input);

export const reviewImportedPortfolioDecisionWithDependencies = (
  input: ManualPortfolioDecisionInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const imported = yield* importManualPortfolioSnapshot(input, dependencies);
    const review = yield* reviewPortfolioPositionsAgainstResearch(
      {
        positions: imported.snapshot.positions,
        broker: "manual_csv",
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
        ...(input.options ? { options: input.options } : {}),
      },
    );
    const reviewsPersisted =
      imported.report.persisted &&
        canPersistPortfolioMemory(input.persistence?.databaseUrl, dependencies)
        ? (
            yield* Effect.tryPromise(() =>
              timed("app-services", "reviewImportedPortfolioDecision.persistReviewHistory", () =>
                dependencies.repositories.persistHoldingReviewReport(
                  imported.snapshot.snapshotId,
                  review,
                  input.persistence?.databaseUrl,
                ),
              ),
            )
          ).reviewsInserted
        : undefined;

    return buildBrokerPortfolioDecisionReport(imported.report, review, reviewsPersisted);
  });

export const getHoldingReviewTrend = (
  symbol: string,
  broker?: BrokerSource,
  databaseUrl?: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    if (broker) {
      const history = yield* Effect.tryPromise(() =>
        dependencies.repositories.loadHoldingReviewHistory(symbol, broker, databaseUrl),
      );
      return summarizeHoldingReviewTrend(symbol, history);
    }

    const [manualHistory, brokerHistory] = yield* Effect.all([
      Effect.tryPromise(() =>
        dependencies.repositories.loadHoldingReviewHistory(symbol, "manual_csv", databaseUrl),
      ),
      Effect.tryPromise(() =>
        dependencies.repositories.loadHoldingReviewHistory(symbol, "indstocks", databaseUrl),
      ),
    ]);

    const manualTrend = summarizeHoldingReviewTrend(symbol, manualHistory);
    const brokerTrend = summarizeHoldingReviewTrend(symbol, brokerHistory);

    if (!manualTrend) {
      return brokerTrend;
    }

    if (!brokerTrend) {
      return manualTrend;
    }

    return new Date(manualTrend.latestReviewedAt).getTime() >=
      new Date(brokerTrend.latestReviewedAt).getTime()
      ? manualTrend
      : brokerTrend;
  });
