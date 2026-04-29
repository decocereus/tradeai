import type {
  DailyOperatorReport,
  HoldingResearchReview,
  PortfolioAssetAllocation,
  PortfolioHoldingSnapshotSummary,
  ProviderHealthCheck,
  ProviderHealthReport,
  ProviderHealthStatus,
  TodayActionItem,
} from "@tradeai/domain";
import { Effect } from "effect";

import { getPortfolioDashboard } from "./dashboard-workflows.ts";
import type { BrokerPortfolioReviewInput } from "./review-workflows.ts";
import { reviewSyncedBrokerPortfolioWithDependencies } from "./review-workflows.ts";
import type { TradeAiWorkflowDependencies } from "./ports.ts";

export interface ProviderHealthInput {
  brokerAccessToken?: string;
  marketAccessToken?: string;
  databaseUrl?: string;
}

export interface DailyOperatorInput extends BrokerPortfolioReviewInput {
  health?: ProviderHealthInput;
}

export interface DailyOperatorViewModel {
  generatedAt: string;
  providerHealth: {
    status: ProviderHealthStatus;
    checkedAt: string;
    checks: readonly ProviderHealthCheck[];
  };
  portfolio: {
    broker: string | undefined;
    snapshotId: string | undefined;
    capturedAt: string | undefined;
    holdingsCount: number;
    marketValue: number;
    weightedPnlPercent: number;
    priceFallbacks: number;
    partialResearch: number;
  };
  assetAllocation: readonly PortfolioAssetAllocation[];
  actionItems: readonly TodayActionItem[];
  conflicts: readonly HoldingResearchReview[];
  reviewCandidates: readonly HoldingResearchReview[];
  holdings: readonly PortfolioHoldingSnapshotSummary[];
  dataQuality: {
    missingOrFallbackPrices: readonly PortfolioHoldingSnapshotSummary[];
    incompleteResearch: readonly HoldingResearchReview[];
    providerIssues: readonly ProviderHealthCheck[];
  };
}

const nowIso = () => new Date().toISOString();

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const runProviderCheck = (
  name: ProviderHealthCheck["name"],
  provider: string,
  run: Effect.Effect<string, Error>,
  action?: string,
): Effect.Effect<ProviderHealthCheck> =>
  Effect.gen(function* () {
    const checkedAt = nowIso();
    const result = yield* run.pipe(
      Effect.map((message) => ({
        name,
        provider,
        status: "ok" as const,
        checkedAt,
        message,
      })),
      Effect.catchAll((error) =>
        Effect.succeed({
          name,
          provider,
          status: "failed" as const,
          checkedAt,
          message: formatError(error),
          ...(action ? { action } : {}),
        }),
      ),
    );

    return result;
  });

const overallHealthStatus = (
  checks: readonly ProviderHealthCheck[],
): ProviderHealthStatus => {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  if (checks.every((check) => check.status === "skipped")) return "skipped";
  return "ok";
};

const healthActionItems = (health: ProviderHealthReport): TodayActionItem[] =>
  health.checks
    .filter((check) => check.status === "failed" && check.action)
    .map((check) => ({
      priority: "high" as const,
      title: `${check.provider} ${check.name} unavailable`,
      detail: check.action ?? check.message,
    }));

export const getProviderHealth = (
  input: ProviderHealthInput,
  dependencies: TradeAiWorkflowDependencies,
): Effect.Effect<ProviderHealthReport> =>
  Effect.gen(function* () {
    const checkedAt = nowIso();
    const brokerProvider = dependencies.config.brokerDataProvider ?? "indstocks";
    const marketProvider = dependencies.config.marketDataProvider ?? "groww";
    const researchProvider = dependencies.config.researchDataProvider ?? "aftermarkets";

    const broker = yield* runProviderCheck(
      "broker",
      brokerProvider,
      dependencies.brokerSources.fetchBrokerHoldings(input.brokerAccessToken).pipe(
        Effect.map((holdings) => `${holdings.length} broker holdings returned`),
      ),
      "Refresh INDstocks token in .env. INDstocks access tokens expire daily around 6 AM IST.",
    );

    const market = yield* runProviderCheck(
      "market",
      marketProvider,
      dependencies.marketSources.fetchEquityQuotes(["RELIANCE"], input.marketAccessToken).pipe(
        Effect.map((quotes) => `${quotes.length} quote rows returned for RELIANCE`),
      ),
      "Refresh or mint the Groww access token. Groww tokens expire daily around 6 AM IST.",
    );

    const mutualFundNav = yield* runProviderCheck(
      "mutual_fund_nav",
      "amfi",
      dependencies.marketSources.searchAmfiNav("INF194KB1AL4").pipe(
        Effect.map((entries) => `${entries.length} AMFI NAV rows returned for sample ISIN`),
      ),
      "Check AMFI NAV feed availability before relying on mutual fund valuation.",
    );

    const research = yield* runProviderCheck(
      "research",
      researchProvider,
      dependencies.researchSources.buildEquityResearchPacket({ query: "RELIANCE" }).pipe(
        Effect.map((packet) => `research packet returned from ${packet.source}`),
      ),
      "Check AFTERMARKETS_API_KEY and provider quota before running portfolio research.",
    );

    const databaseConfigured = dependencies.repositories.hasConfiguredDatabaseUrl(
      input.databaseUrl,
    );
    const database: ProviderHealthCheck = databaseConfigured
      ? {
          name: "database",
          provider: "postgres",
          status: "ok",
          checkedAt: nowIso(),
          message: "DATABASE_URL is configured",
        }
      : {
          name: "database",
          provider: "postgres",
          status: "degraded",
          checkedAt: nowIso(),
          message: "DATABASE_URL is not configured; portfolio memory and dashboard are unavailable",
          action: "Set DATABASE_URL to enable persisted snapshots, review history, and dashboard output.",
        };

    const checks = [broker, market, mutualFundNav, research, database];

    return {
      checkedAt,
      status: overallHealthStatus(checks),
      checks,
    };
  });

export const getDailyOperatorReport = (
  input: DailyOperatorInput,
  dependencies: TradeAiWorkflowDependencies,
): Effect.Effect<DailyOperatorReport, Error> =>
  Effect.gen(function* () {
    const generatedAt = nowIso();
    const health = yield* getProviderHealth(input.health ?? input, dependencies);
    const actionItems = healthActionItems(health);
    const requiredHealthy = health.checks
      .filter(
        (check) =>
          check.name === "broker" || check.name === "market" || check.name === "research",
      )
      .every((check) => check.status === "ok");

    if (!requiredHealthy) {
      return {
        generatedAt,
        health,
        actionItems,
      };
    }

    const decision = yield* reviewSyncedBrokerPortfolioWithDependencies(input, dependencies);
    const dashboard = dependencies.repositories.hasConfiguredDatabaseUrl(input.databaseUrl)
      ? yield* getPortfolioDashboard(decision.sync.broker, input.databaseUrl, dependencies)
      : undefined;

    return {
      generatedAt,
      health,
      decision,
      ...(dashboard ? { dashboard } : {}),
      actionItems,
    };
  });

export const buildDailyOperatorViewModel = (
  report: DailyOperatorReport,
): DailyOperatorViewModel => {
  const snapshot = report.dashboard?.latestSnapshot;
  const latestReview = report.dashboard?.latestReview;
  const dashboardHoldings = [
    ...(report.dashboard?.topWinners ?? []),
    ...(report.dashboard?.unreviewedPositions ?? []),
  ];
  const holdingsBySymbol = new Map(
    dashboardHoldings.map((holding) => [holding.symbol, holding]),
  );
  const holdings = [...holdingsBySymbol.values()];
  const missingOrFallbackPrices = holdings.filter(
    (holding) => holding.priceProvenance?.source === "fallback",
  );
  const incompleteResearch = latestReview?.reviews.filter(
    (review) => review.researchQuality?.completeness !== "complete",
  ) ?? [];
  const providerIssues = report.health.checks.filter((check) => check.status !== "ok");

  return {
    generatedAt: report.generatedAt,
    providerHealth: {
      status: report.health.status,
      checkedAt: report.health.checkedAt,
      checks: report.health.checks,
    },
    portfolio: {
      broker: report.dashboard?.broker ?? report.decision?.sync.broker,
      snapshotId: snapshot?.snapshotId ?? report.decision?.sync.currentSnapshotId,
      capturedAt: snapshot?.capturedAt,
      holdingsCount:
        snapshot?.summary.holdingsCount ?? report.decision?.sync.positionsFetched ?? 0,
      marketValue: snapshot?.summary.totalMarketValue ?? 0,
      weightedPnlPercent: snapshot?.summary.weightedPnlPercent ?? 0,
      priceFallbacks:
        snapshot?.positions.filter((position) => position.priceProvenance?.source === "fallback")
          .length ?? 0,
      partialResearch: incompleteResearch.length,
    },
    assetAllocation: report.dashboard?.assetAllocation ?? [],
    actionItems: [
      ...report.actionItems,
      ...(report.dashboard?.todaysActions ?? []),
    ],
    conflicts: report.dashboard?.topConflicts ?? [],
    reviewCandidates: report.dashboard?.topReviewCandidates ?? [],
    holdings,
    dataQuality: {
      missingOrFallbackPrices,
      incompleteResearch,
      providerIssues,
    },
  };
};
