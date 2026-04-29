import type { PortfolioDashboardReport } from "@tradeai/domain";
import {
  summarizeHoldingReviewTrendReport,
  summarizeHoldingsReview,
  summarizePortfolioDashboardReport,
  summarizePortfolioDiff,
  summarizePortfolioSummary,
} from "@tradeai/app-services";

const formatReviewQuality = (quality: PortfolioDashboardReport["topConflicts"][number]["researchQuality"]) =>
  quality ? ` | quality ${quality.completeness}` : "";

const formatPriceProvenance = (
  provenance: PortfolioDashboardReport["topWinners"][number]["priceProvenance"],
) => {
  if (!provenance) return "";
  if (provenance.status === "market_enriched") {
    return ` | price ${provenance.marketDataProvider ?? "market"}`;
  }
  return ` | price fallback:${provenance.quoteSymbol ?? provenance.status}`;
};

const formatAssetType = (assetType?: string) => assetType?.replace("_", " ") ?? "unknown";

export const renderList = (title: string, items: readonly string[]) => {
  console.log(`\n${title}`);
  for (const item of items) {
    console.log(`- ${item}`);
  }
};

export const renderDivider = (title: string) => {
  console.log(`\n== ${title} ==`);
};

export const renderDashboardSection = (
  report: PortfolioDashboardReport,
  options?: {
    autoHome?: boolean;
  },
) => {
  const formatHoldingLabel = (symbol: string, instrumentName?: string) =>
    `${symbol}${instrumentName ? ` (${instrumentName})` : ""}`;
  const formatHoldingSummary = (
    position: PortfolioDashboardReport["topWinners"][number],
  ) =>
    `${formatHoldingLabel(position.symbol, position.instrumentName)} | ${formatAssetType(position.assetType)} | pnl ${position.pnlPercent.toFixed(2)}% | value ${position.marketValue.toFixed(2)}${formatPriceProvenance(position.priceProvenance)}`;

  console.log(summarizePortfolioDashboardReport(report));
  if (report.latestSnapshot) {
    console.log(
      summarizePortfolioSummary(
        report.latestSnapshot.summary.holdingsCount,
        report.latestSnapshot.summary.totalMarketValue,
        report.latestSnapshot.summary.weightedPnlPercent,
      ),
    );
  }

  if (report.recentSnapshots.length > 0) {
    renderList(
      "Recent snapshots",
      report.recentSnapshots.map(
        (snapshot) => `${snapshot.capturedAt} | ${snapshot.broker} | ${snapshot.snapshotId}`,
      ),
    );
  }

  if (report.latestReview) {
    console.log(summarizeHoldingsReview(report.latestReview));
  }

  if (report.latestDiff) {
    console.log(
      summarizePortfolioDiff(
        report.latestDiff.newPositions,
        report.latestDiff.exitedPositions,
        report.latestDiff.changedPositions,
        report.latestDiff.unchangedPositions,
      ),
    );
  }

  if (report.reviewSnapshot && report.reviewSnapshot.snapshotId !== report.latestSnapshot?.snapshotId) {
    console.log(
      `Review snapshot: ${report.reviewSnapshot.capturedAt} | ${report.reviewSnapshot.snapshotId}`,
    );
  }

  if (report.todaysActions.length > 0) {
    renderList(
      "Today's action list",
      report.todaysActions.map(
        (action) => `[${action.priority}] ${action.title} | ${action.detail}`,
      ),
    );
  }

  if (report.assetAllocation.length > 0) {
    renderList(
      "Asset allocation",
      report.assetAllocation.map(
        (allocation) =>
          `${formatAssetType(allocation.assetType)} | ${allocation.holdingsCount} holdings | ${allocation.marketValue.toFixed(2)} | ${allocation.percentage.toFixed(2)}%`,
      ),
    );
  }

  if (report.topWinners.length > 0) {
    renderList(
      "Top winners",
      report.topWinners.map(formatHoldingSummary),
    );
  }

  if (report.topLosers.length > 0) {
    renderList(
      "Top losers",
      report.topLosers.map(formatHoldingSummary),
    );
  }

  if (report.topConflicts.length > 0) {
    renderList(
      "Top conflicts",
      report.topConflicts.map(
        (review) => `${review.symbol} | ${review.status}${formatReviewQuality(review.researchQuality)} | ${review.reason}`,
      ),
    );
  }

  if (report.topReviewCandidates.length > 0) {
    renderList(
      "Top review candidates",
      report.topReviewCandidates.map(
        (review) => `${review.symbol} | ${review.status}${formatReviewQuality(review.researchQuality)} | ${review.reason}`,
      ),
    );
  }

  if (report.statusChanges.length > 0) {
    renderList(
      "Status changes",
      report.statusChanges.map((change) =>
        change.changeType === "newly_reviewed"
          ? `${change.symbol} | ${change.currentStatus} | newly reviewed`
          : `${change.symbol} | ${change.previousStatus} -> ${change.currentStatus}`,
      ),
    );
  }

  if (report.unreviewedPositions.length > 0) {
    renderList(
      "New positions without review",
      report.unreviewedPositions.map(formatHoldingSummary),
    );
  }

  if (report.streakLeaders.length > 0) {
    renderList(
      "Longest active streaks",
      report.streakLeaders.map(summarizeHoldingReviewTrendReport),
    );
  }

  if (options?.autoHome) {
    renderList("Quick commands", [
      "bun run dev:tui -- --manual-decision --import-holdings /path/to/holdings.csv --import-trades /path/to/trades.csv",
      "bun run dev:tui -- --holding-history RELIANCE-EQ --holding-history-broker manual_csv",
      "bun run dev:tui -- --dashboard",
    ]);
  }
};
