import type {
  BrokerSource,
  BrokerTradeFill,
  BrokerPortfolioReviewReport,
  HoldingReviewHistoryEntry,
  PortfolioMemorySnapshot,
  PortfolioPositionSnapshot,
  PortfolioSnapshotReference,
} from "@tradeai/domain";
import { and, desc, eq, inArray } from "drizzle-orm";

import { createDatabaseConnection } from "./client.ts";
import { brokerTradeFills, holdingReviews, portfolioPositions } from "./index.ts";
import {
  serializeBrokerTradeBook,
  serializePortfolioSnapshot,
} from "./portfolio.ts";
import { serializeHoldingReviewReport } from "./review-history.ts";

interface PortfolioPositionRowLike {
  snapshotId: string;
  broker: string;
  payload: PortfolioPositionSnapshot;
  createdAt: Date;
}

interface BrokerTradeFillRowLike {
  snapshotId: string;
  broker: string;
  payload: BrokerTradeFill;
  createdAt: Date;
}

interface HoldingReviewRowLike {
  snapshotId: string;
  broker: string;
  payload: HoldingReviewHistoryEntry;
  createdAt: Date;
}

export interface PortfolioDashboardRepositoryData {
  broker: BrokerSource;
  recentSnapshots: PortfolioSnapshotReference[];
  latestSnapshot?: PortfolioMemorySnapshot;
  previousSnapshot?: PortfolioMemorySnapshot;
  reviewSnapshot?: PortfolioSnapshotReference;
  latestReviewEntries: HoldingReviewHistoryEntry[];
  previousReviewEntries: HoldingReviewHistoryEntry[];
  historyBySymbol: Record<string, HoldingReviewHistoryEntry[]>;
}

interface DashboardQueryDbLike {
  select: ReturnType<typeof createDatabaseConnection>["db"]["select"];
}

export const extractPortfolioSnapshotHeaders = (
  rows: readonly PortfolioPositionRowLike[],
): PortfolioSnapshotReference[] => {
  const seen = new Set<string>();
  const headers: PortfolioSnapshotReference[] = [];

  for (const row of rows) {
    if (seen.has(row.snapshotId)) continue;
    seen.add(row.snapshotId);
    headers.push({
      snapshotId: row.snapshotId,
      broker: row.broker as BrokerSource,
      capturedAt: row.createdAt.toISOString(),
    });
  }

  return headers;
};

export const materializePortfolioMemorySnapshot = (
  rows: readonly PortfolioPositionRowLike[],
): PortfolioMemorySnapshot | undefined => {
  const first = rows[0];
  if (!first) return undefined;

  const positions = rows.map((row) => row.payload);
  const totalMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const totalPnlAbsolute = positions.reduce((sum, position) => sum + position.pnlAbsolute, 0);
  const weightedPnlPercent = totalMarketValue > 0 ? (totalPnlAbsolute / totalMarketValue) * 100 : 0;
  const sortedByPnl = [...positions].sort((left, right) => right.pnlPercent - left.pnlPercent);

  return {
    snapshotId: first.snapshotId,
    broker: first.broker as BrokerSource,
    capturedAt: first.createdAt.toISOString(),
    positions,
    summary: {
      holdingsCount: positions.length,
      totalMarketValue,
      totalPnlAbsolute,
      weightedPnlPercent,
      ...(sortedByPnl[0] ? { topWinnerSymbol: sortedByPnl[0].symbol } : {}),
      ...(sortedByPnl.at(-1) ? { topLoserSymbol: sortedByPnl.at(-1)?.symbol } : {}),
    },
  };
};

const groupPortfolioRowsBySnapshotId = (
  rows: readonly PortfolioPositionRowLike[],
): Map<string, PortfolioPositionRowLike[]> => {
  const grouped = new Map<string, PortfolioPositionRowLike[]>();

  for (const row of rows) {
    const existing = grouped.get(row.snapshotId);
    if (existing) {
      existing.push(row);
      continue;
    }

    grouped.set(row.snapshotId, [row]);
  }

  return grouped;
};

const groupHoldingReviewRowsBySnapshotId = (
  rows: readonly HoldingReviewRowLike[],
): Map<string, HoldingReviewHistoryEntry[]> => {
  const grouped = new Map<string, HoldingReviewHistoryEntry[]>();

  for (const row of rows) {
    const existing = grouped.get(row.snapshotId);
    if (existing) {
      existing.push(row.payload);
      continue;
    }

    grouped.set(row.snapshotId, [row.payload]);
  }

  return grouped;
};

const groupHoldingReviewRowsBySymbol = (
  rows: readonly HoldingReviewRowLike[],
): Record<string, HoldingReviewHistoryEntry[]> => {
  const grouped: Record<string, HoldingReviewHistoryEntry[]> = {};

  for (const row of rows) {
    grouped[row.payload.symbol] ??= [];
    grouped[row.payload.symbol]!.push(row.payload);
  }

  return grouped;
};

const extractHoldingReviewSnapshotHeaders = (
  rows: readonly HoldingReviewRowLike[],
): PortfolioSnapshotReference[] => {
  const seen = new Set<string>();
  const headers: PortfolioSnapshotReference[] = [];

  for (const row of rows) {
    if (seen.has(row.snapshotId)) continue;
    seen.add(row.snapshotId);
    headers.push({
      snapshotId: row.snapshotId,
      broker: row.broker as BrokerSource,
      capturedAt: row.createdAt.toISOString(),
    });
  }

  return headers;
};

export const persistPortfolioSnapshotToDatabase = async (
  snapshot: PortfolioMemorySnapshot,
  fills: readonly BrokerTradeFill[],
  databaseUrl?: string,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const positionRecords = serializePortfolioSnapshot(snapshot, new Date(snapshot.capturedAt));
    const fillRecords = serializeBrokerTradeBook(
      fills,
      snapshot.snapshotId,
      new Date(snapshot.capturedAt),
    );

    await db.transaction(async (tx) => {
      if (positionRecords.length > 0) {
        await tx.insert(portfolioPositions).values(positionRecords);
      }
      if (fillRecords.length > 0) {
        await tx.insert(brokerTradeFills).values(fillRecords);
      }
    });

    return {
      snapshotId: snapshot.snapshotId,
      positionsInserted: positionRecords.length,
      tradeFillsInserted: fillRecords.length,
    };
  } finally {
    await pool.end();
  }
};

export const loadRecentPortfolioSnapshotHeaders = async (
  broker: BrokerSource = "indstocks",
  databaseUrl?: string,
  limit = 10,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const rows = await db
      .select({
        snapshotId: portfolioPositions.snapshotId,
        broker: portfolioPositions.broker,
        payload: portfolioPositions.payload,
        createdAt: portfolioPositions.createdAt,
      })
      .from(portfolioPositions)
      .where(eq(portfolioPositions.broker, broker))
      .orderBy(desc(portfolioPositions.createdAt))
      .limit(limit * 20);

    return extractPortfolioSnapshotHeaders(rows as PortfolioPositionRowLike[]).slice(0, limit);
  } finally {
    await pool.end();
  }
};

export const loadPortfolioSnapshotById = async (
  snapshotId: string,
  broker: BrokerSource = "indstocks",
  databaseUrl?: string,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const rows = await db
      .select({
        snapshotId: portfolioPositions.snapshotId,
        broker: portfolioPositions.broker,
        payload: portfolioPositions.payload,
        createdAt: portfolioPositions.createdAt,
      })
      .from(portfolioPositions)
      .where(
        and(eq(portfolioPositions.snapshotId, snapshotId), eq(portfolioPositions.broker, broker)),
      )
      .orderBy(desc(portfolioPositions.createdAt));

    return materializePortfolioMemorySnapshot(rows as PortfolioPositionRowLike[]);
  } finally {
    await pool.end();
  }
};

export const loadLatestPortfolioSnapshot = async (
  broker: BrokerSource = "indstocks",
  databaseUrl?: string,
) => {
  const headers = await loadRecentPortfolioSnapshotHeaders(broker, databaseUrl, 1);
  const latest = headers[0];
  if (!latest) return undefined;
  return loadPortfolioSnapshotById(latest.snapshotId, broker, databaseUrl);
};

export const loadPreviousPortfolioSnapshot = async (
  broker: BrokerSource = "indstocks",
  databaseUrl?: string,
) => {
  const headers = await loadRecentPortfolioSnapshotHeaders(broker, databaseUrl, 2);
  const previous = headers[1];
  if (!previous) return undefined;
  return loadPortfolioSnapshotById(previous.snapshotId, broker, databaseUrl);
};

export const loadBrokerTradeFillsBySnapshotId = async (
  snapshotId: string,
  broker: BrokerSource = "indstocks",
  databaseUrl?: string,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const rows = await db
      .select({
        snapshotId: brokerTradeFills.snapshotId,
        broker: brokerTradeFills.broker,
        payload: brokerTradeFills.payload,
        createdAt: brokerTradeFills.createdAt,
      })
      .from(brokerTradeFills)
      .where(and(eq(brokerTradeFills.snapshotId, snapshotId), eq(brokerTradeFills.broker, broker)))
      .orderBy(desc(brokerTradeFills.createdAt));

    return (rows as BrokerTradeFillRowLike[]).map((row) => row.payload);
  } finally {
    await pool.end();
  }
};

export const persistHoldingReviewReportToDatabase = async (
  snapshotId: string,
  report: BrokerPortfolioReviewReport,
  databaseUrl?: string,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const createdAt = new Date();
    const reviewRecords = serializeHoldingReviewReport(snapshotId, report, createdAt);
    if (reviewRecords.length > 0) {
      await db.insert(holdingReviews).values(reviewRecords);
    }

    return {
      snapshotId,
      reviewsInserted: reviewRecords.length,
    };
  } finally {
    await pool.end();
  }
};

export const loadHoldingReviewHistory = async (
  symbol: string,
  broker?: BrokerSource,
  databaseUrl?: string,
  limit = 10,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const baseQuery = db
      .select({
        snapshotId: holdingReviews.snapshotId,
        broker: holdingReviews.broker,
        payload: holdingReviews.payload,
        createdAt: holdingReviews.createdAt,
      })
      .from(holdingReviews)
      .where(
        broker
          ? and(eq(holdingReviews.symbol, symbol), eq(holdingReviews.broker, broker))
          : eq(holdingReviews.symbol, symbol),
      )
      .orderBy(desc(holdingReviews.createdAt))
      .limit(limit);
    const rows = await baseQuery;

    return (rows as HoldingReviewRowLike[]).map((row) => row.payload);
  } finally {
    await pool.end();
  }
};

export const loadHoldingReviewsBySnapshotId = async (
  snapshotId: string,
  broker: BrokerSource,
  databaseUrl?: string,
) => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const rows = await db
      .select({
        snapshotId: holdingReviews.snapshotId,
        broker: holdingReviews.broker,
        payload: holdingReviews.payload,
        createdAt: holdingReviews.createdAt,
      })
      .from(holdingReviews)
      .where(
        and(eq(holdingReviews.snapshotId, snapshotId), eq(holdingReviews.broker, broker)),
      )
      .orderBy(desc(holdingReviews.createdAt));

    return (rows as HoldingReviewRowLike[]).map((row) => row.payload);
  } finally {
    await pool.end();
  }
};

const queryPortfolioDashboardRepositoryData = async (
  db: DashboardQueryDbLike,
  broker: BrokerSource,
  snapshotLimit = 5,
  historyLimitPerSymbol = 10,
): Promise<PortfolioDashboardRepositoryData> => {
    const snapshotHeaderRows = await db
      .select({
        snapshotId: portfolioPositions.snapshotId,
        broker: portfolioPositions.broker,
        payload: portfolioPositions.payload,
        createdAt: portfolioPositions.createdAt,
      })
      .from(portfolioPositions)
      .where(eq(portfolioPositions.broker, broker))
      .orderBy(desc(portfolioPositions.createdAt))
      .limit(snapshotLimit * 20);

    const recentSnapshots = extractPortfolioSnapshotHeaders(
      snapshotHeaderRows as PortfolioPositionRowLike[],
    ).slice(0, snapshotLimit);

    if (recentSnapshots.length === 0) {
      return {
        broker,
        recentSnapshots: [],
        latestReviewEntries: [],
        previousReviewEntries: [],
        historyBySymbol: {},
      };
    }

    const snapshotIds = recentSnapshots.map((snapshot) => snapshot.snapshotId);
    const snapshotRows = await db
      .select({
        snapshotId: portfolioPositions.snapshotId,
        broker: portfolioPositions.broker,
        payload: portfolioPositions.payload,
        createdAt: portfolioPositions.createdAt,
      })
      .from(portfolioPositions)
      .where(
        and(eq(portfolioPositions.broker, broker), inArray(portfolioPositions.snapshotId, snapshotIds)),
      )
      .orderBy(desc(portfolioPositions.createdAt));

    const snapshotRowsById = groupPortfolioRowsBySnapshotId(snapshotRows as PortfolioPositionRowLike[]);
    const latestSnapshot = materializePortfolioMemorySnapshot(
      snapshotRowsById.get(recentSnapshots[0]!.snapshotId) ?? [],
    );
    const previousSnapshot = recentSnapshots[1]
      ? materializePortfolioMemorySnapshot(snapshotRowsById.get(recentSnapshots[1]!.snapshotId) ?? [])
      : undefined;

    const recentReviewRows = await db
      .select({
        snapshotId: holdingReviews.snapshotId,
        broker: holdingReviews.broker,
        payload: holdingReviews.payload,
        createdAt: holdingReviews.createdAt,
      })
      .from(holdingReviews)
      .where(eq(holdingReviews.broker, broker))
      .orderBy(desc(holdingReviews.createdAt))
      .limit(snapshotLimit * 50);

    const reviewSnapshotHeaders = extractHoldingReviewSnapshotHeaders(
      recentReviewRows as HoldingReviewRowLike[],
    );
    const latestReviewSnapshot = reviewSnapshotHeaders[0];
    const previousReviewSnapshot = reviewSnapshotHeaders[1];
    const reviewsBySnapshotId = groupHoldingReviewRowsBySnapshotId(
      recentReviewRows as HoldingReviewRowLike[],
    );
    const latestReviewEntries = latestReviewSnapshot
      ? reviewsBySnapshotId.get(latestReviewSnapshot.snapshotId) ?? []
      : [];
    const previousReviewEntries = previousReviewSnapshot
      ? reviewsBySnapshotId.get(previousReviewSnapshot.snapshotId) ?? []
      : [];

    const reviewSymbols = [...new Set(latestReviewEntries.map((entry) => entry.symbol))];
    let historyBySymbol: Record<string, HoldingReviewHistoryEntry[]> = {};

    if (reviewSymbols.length > 0) {
      const historyRows = await db
        .select({
          snapshotId: holdingReviews.snapshotId,
          broker: holdingReviews.broker,
          payload: holdingReviews.payload,
          createdAt: holdingReviews.createdAt,
        })
        .from(holdingReviews)
        .where(and(eq(holdingReviews.broker, broker), inArray(holdingReviews.symbol, reviewSymbols)))
        .orderBy(desc(holdingReviews.createdAt));

      historyBySymbol = Object.fromEntries(
        Object.entries(groupHoldingReviewRowsBySymbol(historyRows as HoldingReviewRowLike[])).map(
          ([symbol, entries]) => [symbol, entries.slice(0, historyLimitPerSymbol)],
        ),
      );
    }

    return {
      broker,
      recentSnapshots,
      ...(latestSnapshot ? { latestSnapshot } : {}),
      ...(previousSnapshot ? { previousSnapshot } : {}),
      ...(latestReviewSnapshot ? { reviewSnapshot: latestReviewSnapshot } : {}),
      latestReviewEntries,
      previousReviewEntries,
      historyBySymbol,
    };
};

export const loadPortfolioDashboardRepositoryData = async (
  broker: BrokerSource,
  databaseUrl?: string,
  snapshotLimit = 5,
  historyLimitPerSymbol = 10,
): Promise<PortfolioDashboardRepositoryData> => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    return await queryPortfolioDashboardRepositoryData(
      db,
      broker,
      snapshotLimit,
      historyLimitPerSymbol,
    );
  } finally {
    await pool.end();
  }
};

export const loadPreferredPortfolioDashboardRepositoryData = async (
  preferredBroker?: BrokerSource,
  databaseUrl?: string,
  snapshotLimit = 5,
  historyLimitPerSymbol = 10,
): Promise<PortfolioDashboardRepositoryData> => {
  const { db, pool } = createDatabaseConnection(databaseUrl);

  try {
    const brokerHeaderRows = await db
      .select({
        snapshotId: portfolioPositions.snapshotId,
        broker: portfolioPositions.broker,
        payload: portfolioPositions.payload,
        createdAt: portfolioPositions.createdAt,
      })
      .from(portfolioPositions)
      .orderBy(desc(portfolioPositions.createdAt))
      .limit(80);

    const allHeaders = extractPortfolioSnapshotHeaders(
      brokerHeaderRows as PortfolioPositionRowLike[],
    );
    const manualLatest = allHeaders.find((header) => header.broker === "manual_csv");
    const brokerLatest = allHeaders.find((header) => header.broker === "indstocks");

    const resolvedBroker: BrokerSource =
      preferredBroker && allHeaders.some((header) => header.broker === preferredBroker)
        ? preferredBroker
        : !manualLatest && !brokerLatest
          ? preferredBroker ?? "manual_csv"
          : !manualLatest
            ? "indstocks"
            : !brokerLatest
              ? "manual_csv"
              : new Date(manualLatest.capturedAt).getTime() >=
                  new Date(brokerLatest.capturedAt).getTime()
                ? "manual_csv"
                : "indstocks";

    return await queryPortfolioDashboardRepositoryData(
      db,
      resolvedBroker,
      snapshotLimit,
      historyLimitPerSymbol,
    );
  } finally {
    await pool.end();
  }
};
