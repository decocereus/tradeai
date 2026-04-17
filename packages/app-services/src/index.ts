import { buildRecommendation } from "@tradeai/agent-runtime";
import {
  buildEquityResearchPacket,
  buildPublicEquityResearchPacket,
  buildUpstoxQuoteSnapshot,
  fetchBseAnnouncements,
  fetchIndstocksHoldings,
  fetchIndstocksTradeBook,
  importManualHoldingsFromFile,
  importManualTradeBookFromFile,
  fetchUpstoxQuoteSnapshot,
  fetchUpstoxNseInstrumentProfiles,
  loadResearchPacket,
  searchAmfiNavEntries,
  searchBseAnnouncements,
  searchUpstoxInstrumentProfiles,
  searchUpstoxInstruments,
} from "@tradeai/data-sources";
import {
  hasDatabaseUrl,
  loadHoldingReviewHistory,
  loadLatestPortfolioSnapshot,
  loadPreferredPortfolioDashboardRepositoryData,
  persistHoldingReviewReportToDatabase,
  persistPortfolioSnapshotToDatabase,
} from "@tradeai/db";
import type {
  BrokerSource,
  BrokerPortfolioDecisionReport,
  BrokerPortfolioReviewReport,
  DailyResearchResult,
  HoldingReviewHistoryEntry,
  HoldingResearchReview,
  HoldingStatusChange,
  HoldingReviewTrend,
  MemoryContext,
  PortfolioDashboardReport,
  PortfolioHoldingSnapshotSummary,
  PortfolioMemorySnapshot,
  PortfolioPositionSnapshot,
  PortfolioSyncReport,
  ResearchPacket,
  TodayActionItem,
} from "@tradeai/domain";
import {
  buildPortfolioMemorySnapshot,
  diffPortfolioMemorySnapshots,
  loadMemoryContext,
  summarizeHoldingReviewTrend,
} from "@tradeai/memory";
import {
  assessPositionAgainstResearch,
  deriveResearchQueryFromPositionSymbol,
  normalizeBrokerHoldings,
  scorePortfolioFit,
  summarizeHoldingResearchReviews,
  summarizePortfolioPositions,
} from "@tradeai/portfolio-engine";
import { createLogger, timed } from "@tradeai/observability";
import { scoreInstrument, scoreSector } from "@tradeai/strategy-engine";
import { Effect } from "effect";
const log = createLogger("app-services");

const DASHBOARD_SNAPSHOT_LIMIT = 5;
const DASHBOARD_REVIEW_LIMIT = 5;
const DASHBOARD_STREAK_LIMIT = 5;
const DASHBOARD_HOLDING_LIMIT = 5;

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
  } satisfies DailyResearchResult;
});

export const runDailyResearch = Effect.gen(function* () {
  const packet = yield* loadResearchPacket;
  const memoryContext = yield* loadMemoryContext;
  return yield* buildResearchResult(packet, memoryContext);
});

export const runEquityResearch = (query: string, accessToken?: string) =>
  Effect.gen(function* () {
    const packet = yield* buildEquityResearchPacket(query, accessToken);
    const memoryContext = yield* loadMemoryContext;
    return yield* buildResearchResult(packet, memoryContext);
  });

export const runPublicEquityResearch = (query: string) =>
  Effect.gen(function* () {
    const packet = yield* buildPublicEquityResearchPacket(query);
    const memoryContext = yield* loadMemoryContext;
    return yield* buildResearchResult(packet, memoryContext);
  });

export const summarizeDailyResearch = (result: DailyResearchResult) =>
  [
    `${result.instrument.symbol} (${result.instrument.name})`,
    `sector=${result.sector.name}`,
    `sectorScore=${result.sectorScore.total}`,
    `instrumentScore=${result.instrumentScore.total}`,
    `portfolioFit=${result.portfolioFit.total}`,
    `verdict=${result.recommendation.verdict}`,
    `conviction=${result.recommendation.conviction}`,
    `stability=${result.recommendation.stability}`,
    result.technicalAnalysis ? `trend=${result.technicalAnalysis.trend}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" | ");

export const lookupAmfiNav = (query: string) => searchAmfiNavEntries(query);
export const lookupCorporateEvents = (query: string) => searchBseAnnouncements(query);
export const getCorporateEvents = () => fetchBseAnnouncements();
export const getBrokerHoldings = (accessToken?: string) => fetchIndstocksHoldings(accessToken);
export const getBrokerTradeBook = (
  segment: "EQUITY" | "DERIVATIVE" = "EQUITY",
  accessToken?: string,
) => fetchIndstocksTradeBook(segment, accessToken);
export const getBrokerPortfolioPositions = (accessToken?: string) =>
  getBrokerHoldings(accessToken).pipe(Effect.map(normalizeBrokerHoldings));
export const getManualPortfolioPositions = (holdingsCsvPath: string) =>
  importManualHoldingsFromFile(holdingsCsvPath).pipe(Effect.map(normalizeBrokerHoldings));
export const getBrokerPortfolioSummary = (accessToken?: string) =>
  getBrokerPortfolioPositions(accessToken).pipe(Effect.map(summarizePortfolioPositions));
export const getManualPortfolioSummary = (holdingsCsvPath: string) =>
  getManualPortfolioPositions(holdingsCsvPath).pipe(Effect.map(summarizePortfolioPositions));
export const getBrokerPortfolioMemorySnapshot = (accessToken?: string) =>
  getBrokerPortfolioPositions(accessToken).pipe(
    Effect.map((positions) => buildPortfolioMemorySnapshot(positions, "indstocks")),
  );
export const getManualPortfolioMemorySnapshot = (holdingsCsvPath: string) =>
  getManualPortfolioPositions(holdingsCsvPath).pipe(
    Effect.map((positions) => buildPortfolioMemorySnapshot(positions, "manual_csv")),
  );
export const canPersistPortfolioMemory = (databaseUrl?: string) => hasDatabaseUrl(databaseUrl);
export const persistBrokerPortfolioMemorySnapshot = (
  accessToken?: string,
  databaseUrl?: string,
) =>
  Effect.gen(function* () {
    const snapshot = yield* getBrokerPortfolioMemorySnapshot(accessToken);
    const fills = yield* getBrokerTradeBook("EQUITY", accessToken);
    const result = yield* Effect.tryPromise(() =>
      timed("app-services", "persistBrokerPortfolioMemorySnapshot", () =>
        persistPortfolioSnapshotToDatabase(snapshot, fills, databaseUrl),
      ),
    );

    return {
      snapshot,
      fills,
      persistence: result,
    };
  });
export const diffBrokerPortfolioAgainstLatestSnapshot = (
  accessToken?: string,
  databaseUrl?: string,
) =>
  Effect.gen(function* () {
    const current = yield* getBrokerPortfolioMemorySnapshot(accessToken);
    const previous = yield* Effect.tryPromise(() =>
      loadLatestPortfolioSnapshot("indstocks", databaseUrl),
    );
    const diff = diffPortfolioMemorySnapshots(previous, current);

    return {
      previous,
      current,
      diff,
    };
  });

export const buildPortfolioSyncReport = (
  previous: PortfolioMemorySnapshot | undefined,
  current: PortfolioMemorySnapshot,
  tradeFillsFetched: number,
  dbConfigured: boolean,
  persistence?: {
    positionsInserted: number;
    tradeFillsInserted: number;
  },
): PortfolioSyncReport => {
  const diff = diffPortfolioMemorySnapshots(previous, current);
  return {
    broker: "indstocks",
    dbConfigured,
    ...(previous ? { previousSnapshotId: previous.snapshotId } : {}),
    currentSnapshotId: current.snapshotId,
    positionsFetched: current.positions.length,
    tradeFillsFetched,
    persisted: Boolean(persistence),
    ...(persistence
      ? {
          persistedPositions: persistence.positionsInserted,
          persistedTradeFills: persistence.tradeFillsInserted,
        }
      : {}),
    diff,
  };
};

export const syncBrokerPortfolio = (accessToken?: string, databaseUrl?: string) =>
  Effect.gen(function* () {
    log.info({ action: "syncBrokerPortfolio", dbConfigured: canPersistPortfolioMemory(databaseUrl) }, "running portfolio sync");
    const current = yield* getBrokerPortfolioMemorySnapshot(accessToken);
    const fills = yield* getBrokerTradeBook("EQUITY", accessToken);
    const dbConfigured = canPersistPortfolioMemory(databaseUrl);

    const previous = dbConfigured
      ? yield* Effect.tryPromise(() => loadLatestPortfolioSnapshot("indstocks", databaseUrl))
      : undefined;

    const persistence = dbConfigured
      ? yield* Effect.tryPromise(() =>
          timed("app-services", "syncBrokerPortfolio.persistSnapshot", () =>
            persistPortfolioSnapshotToDatabase(current, fills, databaseUrl),
          ),
        )
      : undefined;

    return buildPortfolioSyncReport(previous, current, fills.length, dbConfigured, persistence);
  });

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
    reason: assessment.reason,
    verdict: outcome.research.recommendation.verdict,
    conviction: outcome.research.recommendation.conviction,
    runLabel: outcome.research.runLabel,
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

const toHoldingResearchReview = (entry: HoldingReviewHistoryEntry): HoldingResearchReview => ({
  symbol: entry.symbol,
  query: entry.query,
  status: entry.status,
  reason: entry.reason,
  ...(entry.verdict ? { verdict: entry.verdict } : {}),
  ...(entry.conviction !== undefined ? { conviction: entry.conviction } : {}),
  ...(entry.runLabel ? { runLabel: entry.runLabel } : {}),
});

const toPortfolioHoldingSnapshotSummary = (
  position: PortfolioPositionSnapshot,
): PortfolioHoldingSnapshotSummary => ({
  symbol: position.symbol,
  marketValue: position.marketValue,
  pnlAbsolute: position.pnlAbsolute,
  pnlPercent: position.pnlPercent,
  quantity: position.quantity,
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

export const getPortfolioDashboard = (preferredBroker?: BrokerSource, databaseUrl?: string) =>
  Effect.gen(function* () {
    const dashboardData = yield* Effect.tryPromise(() =>
      loadPreferredPortfolioDashboardRepositoryData(
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

export const reviewPortfolioPositionsAgainstResearch = (
  positions: readonly PortfolioPositionSnapshot[],
  broker: BrokerSource,
  accessToken?: string,
) =>
  Effect.gen(function* () {
    const reviews = yield* Effect.forEach(
      positions,
      (position) =>
        Effect.gen(function* () {
          const query = deriveResearchQueryFromPositionSymbol(position.symbol);
          const outcome = yield* Effect.either(runEquityResearch(query, accessToken));

          if (outcome._tag === "Left") {
            const fallback = yield* Effect.either(runPublicEquityResearch(query));
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

    return buildBrokerPortfolioReviewReport(reviews, broker);
  });

export const reviewBrokerHoldingsAgainstResearch = (accessToken?: string) =>
  Effect.gen(function* () {
    log.info({ action: "reviewBrokerHoldingsAgainstResearch" }, "reviewing live holdings against research");
    const positions = yield* getBrokerPortfolioPositions(accessToken);
    return yield* reviewPortfolioPositionsAgainstResearch(positions, "indstocks", accessToken);
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

export const reviewSyncedBrokerPortfolio = (accessToken?: string, databaseUrl?: string) =>
  Effect.gen(function* () {
    log.info({ action: "reviewSyncedBrokerPortfolio" }, "building combined portfolio decision report");
    const sync = yield* syncBrokerPortfolio(accessToken, databaseUrl);
    const review = yield* reviewBrokerHoldingsAgainstResearch(accessToken);
    const reviewsPersisted =
      sync.persisted && canPersistPortfolioMemory(databaseUrl)
        ? (
            yield* Effect.tryPromise(() =>
              timed("app-services", "reviewSyncedBrokerPortfolio.persistReviewHistory", () =>
                persistHoldingReviewReportToDatabase(sync.currentSnapshotId, review, databaseUrl),
              ),
            )
          ).reviewsInserted
        : undefined;
    return buildBrokerPortfolioDecisionReport(sync, review, reviewsPersisted);
  });

export const importManualPortfolioSnapshot = (
  holdingsCsvPath: string,
  tradesCsvPath?: string,
  databaseUrl?: string,
) =>
  Effect.gen(function* () {
    const positions = yield* getManualPortfolioPositions(holdingsCsvPath);
    const snapshot = buildPortfolioMemorySnapshot(positions, "manual_csv");
    const fills = tradesCsvPath
      ? yield* importManualTradeBookFromFile(tradesCsvPath)
      : [];
    const dbConfigured = canPersistPortfolioMemory(databaseUrl);
    const previous = dbConfigured
      ? yield* Effect.tryPromise(() => loadLatestPortfolioSnapshot("manual_csv", databaseUrl))
      : undefined;
    const persistence = dbConfigured
      ? yield* Effect.tryPromise(() =>
          persistPortfolioSnapshotToDatabase(snapshot, fills, databaseUrl),
        )
      : undefined;

    return {
      snapshot,
      fills,
      report: buildPortfolioSyncReport(previous, snapshot, fills.length, dbConfigured, persistence),
    };
  });

export const reviewImportedPortfolioAgainstResearch = (
  holdingsCsvPath: string,
  accessToken?: string,
) =>
  Effect.gen(function* () {
    const positions = yield* getManualPortfolioPositions(holdingsCsvPath);
    return yield* reviewPortfolioPositionsAgainstResearch(positions, "manual_csv", accessToken);
  });

export const reviewImportedPortfolioDecision = (
  holdingsCsvPath: string,
  tradesCsvPath?: string,
  accessToken?: string,
  databaseUrl?: string,
) =>
  Effect.gen(function* () {
    const imported = yield* importManualPortfolioSnapshot(holdingsCsvPath, tradesCsvPath, databaseUrl);
    const review = yield* reviewPortfolioPositionsAgainstResearch(
      imported.snapshot.positions,
      "manual_csv",
      accessToken,
    );
    const reviewsPersisted =
      imported.report.persisted && canPersistPortfolioMemory(databaseUrl)
        ? (
            yield* Effect.tryPromise(() =>
              timed("app-services", "reviewImportedPortfolioDecision.persistReviewHistory", () =>
                persistHoldingReviewReportToDatabase(imported.snapshot.snapshotId, review, databaseUrl),
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
) =>
  Effect.gen(function* () {
    if (broker) {
      const history = yield* Effect.tryPromise(() =>
        loadHoldingReviewHistory(symbol, broker, databaseUrl),
      );
      return summarizeHoldingReviewTrend(symbol, history);
    }

    const [manualHistory, brokerHistory] = yield* Effect.all([
      Effect.tryPromise(() => loadHoldingReviewHistory(symbol, "manual_csv", databaseUrl)),
      Effect.tryPromise(() => loadHoldingReviewHistory(symbol, "indstocks", databaseUrl)),
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

export const searchEquities = (query: string) => searchUpstoxInstrumentProfiles(query);

export const getEquityProfiles = () => fetchUpstoxNseInstrumentProfiles();

export const getEquityQuoteSnapshots = (
  instrumentKeys: readonly string[],
  accessToken?: string,
) =>
  Effect.gen(function* () {
    const searchResults = yield* Effect.forEach(
      instrumentKeys,
      (instrumentKey) => searchUpstoxInstruments({ query: instrumentKey }, accessToken),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((groups) => groups.flat()));
    const quotes = yield* fetchUpstoxQuoteSnapshot(instrumentKeys, accessToken);
    return buildUpstoxQuoteSnapshot(searchResults, quotes);
  });

export const summarizeQuoteSnapshot = (instrumentKey: string, tradingSymbol: string, lastPrice: number) =>
  `${instrumentKey} | ${tradingSymbol} | last ${lastPrice}`;

export const summarizeCorporateEvent = (publishedAt: string, title: string) =>
  `${publishedAt} | ${title}`;

export const summarizeBrokerHolding = (
  tradingSymbol: string,
  quantity: number,
  averagePrice: number,
  pnlPercent: number,
) => `${tradingSymbol} | qty ${quantity} | avg ${averagePrice} | pnl ${pnlPercent.toFixed(2)}%`;

export const summarizeBrokerTradeFill = (
  tradeDate: string,
  scripCode: string,
  quantity: number,
  price: number,
) => `${tradeDate} | ${scripCode} | qty ${quantity} | price ${price}`;

export const summarizePortfolioSummary = (
  holdingsCount: number,
  totalMarketValue: number,
  weightedPnlPercent: number,
) =>
  `${holdingsCount} holdings | market value ${totalMarketValue.toFixed(2)} | weighted pnl ${weightedPnlPercent.toFixed(2)}%`;

export const summarizePortfolioDiff = (
  newPositions: number,
  exitedPositions: number,
  changedPositions: number,
  unchangedPositions: number,
) =>
  `new ${newPositions} | exited ${exitedPositions} | changed ${changedPositions} | unchanged ${unchangedPositions}`;

export const summarizePortfolioSyncReport = (report: PortfolioSyncReport) =>
  [
    `snapshot=${report.currentSnapshotId}`,
    report.previousSnapshotId ? `previous=${report.previousSnapshotId}` : "previous=none",
    `positions=${report.positionsFetched}`,
    `fills=${report.tradeFillsFetched}`,
    `persisted=${report.persisted}`,
  ].join(" | ");

export const summarizeHoldingsReview = (report: BrokerPortfolioReviewReport) =>
  [
    `reviewed=${report.holdingsReviewed}`,
    `aligned=${report.alignedCount}`,
    `review=${report.reviewCount}`,
    `conflict=${report.conflictCount}`,
    `unmatched=${report.unmatchedCount}`,
    `error=${report.errorCount}`,
  ].join(" | ");

export const summarizePortfolioDecisionReport = (report: BrokerPortfolioDecisionReport) =>
  [
    summarizePortfolioSyncReport(report.sync),
    summarizeHoldingsReview(report.review),
    report.reviewsPersisted !== undefined ? `reviewsPersisted=${report.reviewsPersisted}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");

export const summarizeHoldingReviewTrendReport = (
  trend: HoldingReviewTrend,
) => `${trend.symbol} | latest=${trend.latestStatus} | streak=${trend.streakCount}`;

export const summarizePortfolioDashboardReport = (report: PortfolioDashboardReport) =>
  [
    `broker=${report.broker}`,
    report.latestSnapshot
      ? `latestSnapshot=${report.latestSnapshot.snapshotId}`
      : "latestSnapshot=none",
    report.reviewSnapshot ? `reviewSnapshot=${report.reviewSnapshot.snapshotId}` : "reviewSnapshot=none",
    `recentSnapshots=${report.recentSnapshots.length}`,
    report.latestReview ? summarizeHoldingsReview(report.latestReview) : "reviewed=0",
    report.latestDiff
      ? `snapshotChanges=${report.latestDiff.newPositions + report.latestDiff.exitedPositions + report.latestDiff.changedPositions}`
      : "snapshotChanges=0",
    `topWinners=${report.topWinners.length}`,
    `topLosers=${report.topLosers.length}`,
    `topConflicts=${report.topConflicts.length}`,
    `topReviews=${report.topReviewCandidates.length}`,
    `statusChanges=${report.statusChanges.length}`,
    `unreviewedPositions=${report.unreviewedPositions.length}`,
    `streakLeaders=${report.streakLeaders.length}`,
    `todaysActions=${report.todaysActions.length}`,
  ].join(" | ");
