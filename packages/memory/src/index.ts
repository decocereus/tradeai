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

const demoMemory: MemoryContext = {
  previousVerdict: "buy",
  previousConviction: 68,
  notes: [
    "Yesterday the same stock stayed above the stable-company threshold.",
    "Prior run favored the sector because policy support remained elevated.",
    "No governance red flags were recorded in the last stored case.",
  ],
};

export const loadMemoryContext = Effect.succeed(demoMemory);

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
