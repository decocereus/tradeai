import type {
  BrokerPortfolioReviewReport,
  BrokerSource,
  HoldingResearchReview,
  HoldingReviewHistoryEntry,
  HoldingReviewTrend,
  HoldingStatusChange,
  PortfolioDashboardReport,
  PortfolioHoldingSnapshotSummary,
  PortfolioPositionSnapshot,
  TodayActionItem,
} from "@tradeai/domain";
import {
  diffPortfolioMemorySnapshots,
  summarizeHoldingReviewTrend,
} from "@tradeai/memory";
import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";
import { buildBrokerPortfolioReviewReport } from "./review-workflows.ts";

const DASHBOARD_SNAPSHOT_LIMIT = 5;
const DASHBOARD_REVIEW_LIMIT = 5;
const DASHBOARD_STREAK_LIMIT = 5;
const DASHBOARD_HOLDING_LIMIT = 5;
const defaultDependencies = createTradeAiWorkflowDependencies();

const toHoldingResearchReview = (entry: HoldingReviewHistoryEntry): HoldingResearchReview => ({
  symbol: entry.symbol,
  query: entry.query,
  status: entry.status,
  reason: entry.reason,
  ...(entry.verdict ? { verdict: entry.verdict } : {}),
  ...(entry.conviction !== undefined ? { conviction: entry.conviction } : {}),
  ...(entry.runLabel ? { runLabel: entry.runLabel } : {}),
  ...(entry.researchQuality ? { researchQuality: entry.researchQuality } : {}),
});

const toPortfolioHoldingSnapshotSummary = (
  position: PortfolioPositionSnapshot,
): PortfolioHoldingSnapshotSummary => ({
  symbol: position.symbol,
  ...(position.instrumentName ? { instrumentName: position.instrumentName } : {}),
  marketValue: position.marketValue,
  pnlAbsolute: position.pnlAbsolute,
  pnlPercent: position.pnlPercent,
  quantity: position.quantity,
  ...(position.priceProvenance ? { priceProvenance: position.priceProvenance } : {}),
});

export const buildPortfolioHoldingLeaders = (
  positions: readonly PortfolioPositionSnapshot[],
) => ({
  topWinners: [...positions]
    .sort((left, right) => right.pnlPercent - left.pnlPercent)
    .slice(0, DASHBOARD_HOLDING_LIMIT)
    .map(toPortfolioHoldingSnapshotSummary),
  topLosers: [...positions]
    .sort((left, right) => left.pnlPercent - right.pnlPercent)
    .slice(0, DASHBOARD_HOLDING_LIMIT)
    .map(toPortfolioHoldingSnapshotSummary),
});

export const buildHoldingStatusChanges = (
  currentReview: BrokerPortfolioReviewReport | undefined,
  previousReview: BrokerPortfolioReviewReport | undefined,
): HoldingStatusChange[] => {
  if (!currentReview) {
    return [];
  }

  const previousBySymbol = new Map(
    (previousReview?.reviews ?? []).map((review) => [review.symbol, review]),
  );

  const changes: HoldingStatusChange[] = [];

  for (const review of currentReview.reviews) {
    const previous = previousBySymbol.get(review.symbol);
    if (!previous) {
      changes.push({
        symbol: review.symbol,
        currentStatus: review.status,
        changeType: "newly_reviewed",
      });
      continue;
    }

    if (previous.status === review.status) {
      continue;
    }

    changes.push({
      symbol: review.symbol,
      previousStatus: previous.status,
      currentStatus: review.status,
      changeType: "changed",
    });
  }

  return changes.sort((left, right) => left.symbol.localeCompare(right.symbol));
};

export const buildTodaysActionList = (report: {
  topConflicts: readonly HoldingResearchReview[];
  topReviewCandidates: readonly HoldingResearchReview[];
  unreviewedPositions: readonly PortfolioHoldingSnapshotSummary[];
  statusChanges: readonly HoldingStatusChange[];
}): TodayActionItem[] => {
  const actions: TodayActionItem[] = [];

  for (const conflict of report.topConflicts.slice(0, 3)) {
    actions.push({
      priority: "high",
      title: `Review conflict: ${conflict.symbol}`,
      detail: conflict.reason,
    });
  }

  for (const position of report.unreviewedPositions.slice(0, 3)) {
    actions.push({
      priority: "high",
      title: `Review new position: ${position.symbol}`,
      detail: `New position is persisted locally but has no current review yet.`,
    });
  }

  for (const change of report.statusChanges.slice(0, 3)) {
    actions.push({
      priority: "medium",
      title: `Status changed: ${change.symbol}`,
      detail:
        change.changeType === "newly_reviewed"
          ? `Holding is newly reviewed as ${change.currentStatus}.`
          : `Holding moved from ${change.previousStatus} to ${change.currentStatus}.`,
    });
  }

  for (const review of report.topReviewCandidates.slice(0, 2)) {
    actions.push({
      priority: "low",
      title: `Watch closely: ${review.symbol}`,
      detail: review.reason,
    });
  }

  return actions.slice(0, 6);
};

export const getPortfolioDashboard = (
  preferredBroker?: BrokerSource,
  databaseUrl?: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const dashboardData = yield* Effect.tryPromise(() =>
      dependencies.repositories.loadPortfolioDashboardData(
        preferredBroker,
        databaseUrl,
        DASHBOARD_SNAPSHOT_LIMIT,
      ),
    );
    const {
      broker,
      recentSnapshots,
      latestSnapshot,
      previousSnapshot,
      reviewSnapshot,
      latestReviewEntries,
      previousReviewEntries,
      historyBySymbol,
    } = dashboardData;

    const latestReview =
      latestReviewEntries.length > 0
        ? buildBrokerPortfolioReviewReport(
            latestReviewEntries.map(toHoldingResearchReview),
            broker,
          )
        : undefined;

    let previousReview: BrokerPortfolioReviewReport | undefined;
    if (previousReviewEntries.length > 0) {
      previousReview = buildBrokerPortfolioReviewReport(
        previousReviewEntries.map(toHoldingResearchReview),
        broker,
      );
    }

    const topConflicts = (latestReview?.reviews ?? [])
      .filter((review) => review.status === "conflict")
      .sort((left, right) => (right.conviction ?? 0) - (left.conviction ?? 0))
      .slice(0, DASHBOARD_REVIEW_LIMIT);

    const topReviewCandidates = (latestReview?.reviews ?? [])
      .filter((review) => review.status === "review")
      .sort((left, right) => (right.conviction ?? 0) - (left.conviction ?? 0))
      .slice(0, DASHBOARD_REVIEW_LIMIT);

    const streakLeaders = [...topConflicts, ...topReviewCandidates]
      .map((review) => summarizeHoldingReviewTrend(review.symbol, historyBySymbol[review.symbol] ?? []))
      .filter((trend): trend is HoldingReviewTrend => Boolean(trend))
      .sort((left, right) => {
        if (right.streakCount !== left.streakCount) {
          return right.streakCount - left.streakCount;
        }

        return new Date(right.latestReviewedAt).getTime() - new Date(left.latestReviewedAt).getTime();
      })
      .slice(0, DASHBOARD_STREAK_LIMIT);

    const { topWinners, topLosers } = buildPortfolioHoldingLeaders(latestSnapshot?.positions ?? []);
    const latestDiff =
      latestSnapshot && previousSnapshot
        ? diffPortfolioMemorySnapshots(previousSnapshot, latestSnapshot)
        : undefined;
    const statusChanges = buildHoldingStatusChanges(latestReview, previousReview);
    const newlyAddedSymbols = new Set(
      (latestDiff?.changes ?? [])
        .filter((change) => change.status === "new")
        .map((change) => change.symbol),
    );
    const reviewedSymbols = new Set((latestReview?.reviews ?? []).map((review) => review.symbol));
    const unreviewedPositions =
      reviewSnapshot?.snapshotId === latestSnapshot?.snapshotId
        ? []
        : (latestSnapshot?.positions ?? [])
            .filter(
              (position) =>
                newlyAddedSymbols.has(position.symbol) && !reviewedSymbols.has(position.symbol),
            )
            .map(toPortfolioHoldingSnapshotSummary);
    const todaysActions = buildTodaysActionList({
      topConflicts,
      topReviewCandidates,
      unreviewedPositions,
      statusChanges,
    });

    return {
      broker,
      ...(latestSnapshot ? { latestSnapshot } : {}),
      ...(reviewSnapshot && latestReviewEntries.length > 0 ? { reviewSnapshot } : {}),
      recentSnapshots,
      ...(latestReview ? { latestReview } : {}),
      ...(latestDiff ? { latestDiff } : {}),
      topWinners,
      topLosers,
      topConflicts,
      topReviewCandidates,
      statusChanges,
      unreviewedPositions,
      streakLeaders,
      todaysActions,
    } satisfies PortfolioDashboardReport;
  });
