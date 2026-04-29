import type {
  BrokerPortfolioDecisionReport,
  BrokerPortfolioReviewReport,
  DailyResearchResult,
  DailyOperatorReport,
  HoldingReviewTrend,
  PortfolioDashboardReport,
  PortfolioSyncReport,
  ProviderHealthReport,
} from "@tradeai/domain";

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
    `quality=${result.researchQuality.completeness}`,
    result.researchQuality.missingSignals.length > 0
      ? `missing=${result.researchQuality.missingSignals.join(",")}`
      : undefined,
    result.technicalAnalysis ? `trend=${result.technicalAnalysis.trend}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" | ");

export const summarizeQuoteSnapshot = (
  instrumentKey: string,
  tradingSymbol: string,
  lastPrice: number,
) => `${instrumentKey} | ${tradingSymbol} | last ${lastPrice}`;

export const summarizeCorporateEvent = (publishedAt: string, title: string) =>
  `${publishedAt} | ${title}`;

export const summarizeBrokerHolding = (
  tradingSymbol: string,
  instrumentName: string | undefined,
  quantity: number,
  averagePrice: number,
  pnlPercent: number,
) =>
  `${tradingSymbol}${instrumentName ? ` (${instrumentName})` : ""} | qty ${quantity} | avg ${averagePrice} | pnl ${pnlPercent.toFixed(2)}%`;

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
    `broker=${report.broker}`,
    `snapshot=${report.currentSnapshotId}`,
    report.previousSnapshotId ? `previous=${report.previousSnapshotId}` : "previous=none",
    `positions=${report.positionsFetched}`,
    `fills=${report.tradeFillsFetched}`,
    report.tradeBook ? `tradeBook=${report.tradeBook.status}` : undefined,
    report.priceEnrichment
      ? `prices=${report.priceEnrichment.marketDataProvider}:${report.priceEnrichment.enrichedPositions} enriched/${report.priceEnrichment.fallbackPositions} fallback`
      : undefined,
    `persisted=${report.persisted}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" | ");

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

export const summarizeHoldingReviewTrendReport = (trend: HoldingReviewTrend) =>
  `${trend.symbol} | latest=${trend.latestStatus} | streak=${trend.streakCount}`;

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
    report.latestSnapshot
      ? `priceFallbacks=${report.latestSnapshot.positions.filter((position) => position.priceProvenance?.source === "fallback").length}`
      : "priceFallbacks=0",
    report.latestReview
      ? `partialResearch=${report.latestReview.reviews.filter((review) => review.researchQuality?.completeness !== "complete").length}`
      : "partialResearch=0",
    `assetMix=${report.assetAllocation.map((entry) => `${entry.assetType}:${entry.percentage.toFixed(1)}%`).join(",") || "none"}`,
    `topWinners=${report.topWinners.length}`,
    `topLosers=${report.topLosers.length}`,
    `topConflicts=${report.topConflicts.length}`,
    `topReviews=${report.topReviewCandidates.length}`,
    `statusChanges=${report.statusChanges.length}`,
    `unreviewedPositions=${report.unreviewedPositions.length}`,
    `streakLeaders=${report.streakLeaders.length}`,
    `todaysActions=${report.todaysActions.length}`,
  ].join(" | ");

export const summarizeProviderHealthReport = (report: ProviderHealthReport) =>
  [
    `status=${report.status}`,
    ...report.checks.map((check) => `${check.name}:${check.provider}:${check.status}`),
  ].join(" | ");

export const summarizeDailyOperatorReport = (report: DailyOperatorReport) =>
  [
    `generatedAt=${report.generatedAt}`,
    summarizeProviderHealthReport(report.health),
    report.decision ? "decision=available" : "decision=skipped",
    report.dashboard ? "dashboard=available" : "dashboard=skipped",
    `actions=${report.actionItems.length}`,
  ].join(" | ");
