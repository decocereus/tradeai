import type { BrokerPortfolioReviewReport, HoldingReviewHistoryEntry } from "@tradeai/domain";

export interface PersistedHoldingReviewRecord {
  id: string;
  snapshotId: string;
  broker: string;
  symbol: string;
  query: string;
  status: string;
  reason: string;
  verdict: string | null;
  conviction: string | null;
  runLabel: string | null;
  payload: HoldingReviewHistoryEntry;
  createdAt: Date;
}

export const serializeHoldingReviewEntry = (
  snapshotId: string,
  broker: string,
  entry: HoldingReviewHistoryEntry,
  createdAt = new Date(),
): PersistedHoldingReviewRecord => ({
  id: `${snapshotId}:${entry.symbol}:${entry.status}`,
  snapshotId,
  broker,
  symbol: entry.symbol,
  query: entry.query,
  status: entry.status,
  reason: entry.reason,
  verdict: entry.verdict ?? null,
  conviction: entry.conviction !== undefined ? entry.conviction.toFixed(2) : null,
  runLabel: entry.runLabel ?? null,
  payload: entry,
  createdAt,
});

export const serializeHoldingReviewReport = (
  snapshotId: string,
  report: BrokerPortfolioReviewReport,
  createdAt = new Date(),
): PersistedHoldingReviewRecord[] =>
  report.reviews.map((review) =>
    serializeHoldingReviewEntry(
      snapshotId,
      report.broker,
      {
        snapshotId,
        symbol: review.symbol,
        query: review.query,
        status: review.status,
        reason: review.reason,
        ...(review.verdict ? { verdict: review.verdict } : {}),
        ...(review.conviction !== undefined ? { conviction: review.conviction } : {}),
        ...(review.runLabel ? { runLabel: review.runLabel } : {}),
        reviewedAt: createdAt.toISOString(),
      },
      createdAt,
    ),
  );
