import type {
  BrokerSource,
  HoldingReviewHistoryEntry,
  HoldingReviewTrend,
  MemoryContext,
  PortfolioMemorySnapshot,
  PortfolioPositionSnapshot,
  PortfolioSnapshotDiff,
} from "@tradeai/domain";
import { Effect } from "effect";
import { diffPortfolioPositions, summarizePortfolioPositions } from "@tradeai/portfolio-engine";

export interface MemoryContextInput {
  symbol?: string;
  history?: readonly HoldingReviewHistoryEntry[];
  retrievalError?: string;
}

const statusToVerdict = (
  status: HoldingReviewHistoryEntry["status"],
): MemoryContext["previousVerdict"] => {
  if (status === "aligned") return "buy";
  if (status === "conflict") return "reject";
  return "watch";
};

const statusToConviction = (status: HoldingReviewHistoryEntry["status"]): number => {
  if (status === "aligned") return 65;
  if (status === "conflict") return 35;
  return 50;
};

export const buildMemoryContextFromReviewHistory = (
  input: MemoryContextInput = {},
): MemoryContext => {
  if (input.retrievalError) {
    return {
      previousVerdict: "watch",
      previousConviction: 50,
      notes: [
        `Memory retrieval unavailable${input.symbol ? ` for ${input.symbol}` : ""}: ${input.retrievalError}`,
      ],
    };
  }

  const latest = input.history?.[0];
  if (!latest) {
    return {
      previousVerdict: "watch",
      previousConviction: 50,
      notes: [
        input.symbol
          ? `No prior case memory found for ${input.symbol}.`
          : "No prior case memory found for this research run.",
      ],
    };
  }

  const history = input.history ?? [];
  return {
    previousVerdict: latest.verdict ?? statusToVerdict(latest.status),
    previousConviction: latest.conviction ?? statusToConviction(latest.status),
    notes: history.slice(0, 3).map((entry) =>
      `${entry.reviewedAt}: ${entry.symbol} was ${entry.status}; ${entry.reason}`,
    ),
  };
};

export const loadMemoryContext = (input: MemoryContextInput = {}) =>
  Effect.succeed(buildMemoryContextFromReviewHistory(input));

export const buildPortfolioMemorySnapshot = (
  positions: readonly PortfolioPositionSnapshot[],
  broker: BrokerSource = "indstocks",
  capturedAt = new Date(),
): PortfolioMemorySnapshot => ({
  snapshotId: `${broker}:${capturedAt.toISOString()}`,
  broker,
  capturedAt: capturedAt.toISOString(),
  positions: [...positions],
  summary: summarizePortfolioPositions(positions),
});

export const diffPortfolioMemorySnapshots = (
  previous: PortfolioMemorySnapshot | undefined,
  current: PortfolioMemorySnapshot,
): PortfolioSnapshotDiff =>
  diffPortfolioPositions(previous?.positions ?? [], current.positions);

export const summarizeHoldingReviewTrend = (
  symbol: string,
  history: readonly HoldingReviewHistoryEntry[],
): HoldingReviewTrend | undefined => {
  const latest = history[0];
  if (!latest) return undefined;

  let streakCount = 0;
  for (const entry of history) {
    if (entry.status !== latest.status) break;
    streakCount += 1;
  }

  return {
    symbol,
    latestStatus: latest.status,
    latestReviewedAt: latest.reviewedAt,
    streakCount,
    history: [...history],
  };
};
