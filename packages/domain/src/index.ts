import { Schema } from "effect";

export const AssetType = Schema.Literal("stock", "etf", "mutual_fund", "gold");
export type AssetType = Schema.Schema.Type<typeof AssetType>;

export const BrokerSource = Schema.Literal("groww", "indstocks", "manual_csv");
export type BrokerSource = Schema.Schema.Type<typeof BrokerSource>;

export const RiskBucket = Schema.Literal("stable", "moderate", "growth", "speculative");
export type RiskBucket = Schema.Schema.Type<typeof RiskBucket>;

export const RecommendationVerdict = Schema.Literal("strong_buy", "buy", "watch", "reject");
export type RecommendationVerdict = Schema.Schema.Type<typeof RecommendationVerdict>;

export const RecommendationStability = Schema.Literal("strengthening", "unchanged", "weakening");
export type RecommendationStability = Schema.Schema.Type<typeof RecommendationStability>;

export const ScoreLabel = Schema.Literal("favored", "research_further", "watch", "avoid");
export type ScoreLabel = Schema.Schema.Type<typeof ScoreLabel>;

export const SectorSnapshot = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  macroTailwind: Schema.Number,
  policySupport: Schema.Number,
  geopoliticalEffect: Schema.Number,
  upcomingCatalysts: Schema.Number,
  sectorSentiment: Schema.Number,
  structuralDurability: Schema.Number,
  regulatoryRisk: Schema.Number,
});
export type SectorSnapshot = Schema.Schema.Type<typeof SectorSnapshot>;

export const InstrumentSnapshot = Schema.Struct({
  symbol: Schema.String,
  name: Schema.String,
  sectorSlug: Schema.String,
  assetType: AssetType,
  financialQuality: Schema.Number,
  businessQuality: Schema.Number,
  managementGovernance: Schema.Number,
  sectorAlignment: Schema.Number,
  stabilityProfile: Schema.Number,
  upsidePotential: Schema.Number,
  currentEventContext: Schema.Number,
});
export type InstrumentSnapshot = Schema.Schema.Type<typeof InstrumentSnapshot>;

export const ScoreBreakdown = Schema.Struct({
  total: Schema.Number,
  label: ScoreLabel,
  reasons: Schema.Array(Schema.String),
});
export type ScoreBreakdown = Schema.Schema.Type<typeof ScoreBreakdown>;

export const PortfolioExposure = Schema.Struct({
  sectorSlug: Schema.String,
  percentage: Schema.Number,
});
export type PortfolioExposure = Schema.Schema.Type<typeof PortfolioExposure>;

export const PortfolioFit = Schema.Struct({
  total: Schema.Number,
  label: Schema.Literal("good_fit", "acceptable", "crowded"),
  reasons: Schema.Array(Schema.String),
});
export type PortfolioFit = Schema.Schema.Type<typeof PortfolioFit>;

export const MemoryContext = Schema.Struct({
  previousVerdict: RecommendationVerdict,
  previousConviction: Schema.Number,
  notes: Schema.Array(Schema.String),
});
export type MemoryContext = Schema.Schema.Type<typeof MemoryContext>;

export const Recommendation = Schema.Struct({
  verdict: RecommendationVerdict,
  conviction: Schema.Number,
  stability: RecommendationStability,
  riskBucket: RiskBucket,
  keyReasons: Schema.Array(Schema.String),
  mainRisks: Schema.Array(Schema.String),
  invalidationConditions: Schema.Array(Schema.String),
});
export type Recommendation = Schema.Schema.Type<typeof Recommendation>;

export const TechnicalAnalysisSnapshot = Schema.Struct({
  latestClose: Schema.Number,
  sma20: Schema.optional(Schema.Number),
  sma50: Schema.optional(Schema.Number),
  ema20: Schema.optional(Schema.Number),
  rsi14: Schema.optional(Schema.Number),
  oneDayReturnPct: Schema.optional(Schema.Number),
  oneMonthReturnPct: Schema.optional(Schema.Number),
  volatility20dPct: Schema.optional(Schema.Number),
  trend: Schema.Literal("bullish", "bearish", "rangebound"),
});
export type TechnicalAnalysisSnapshot = Schema.Schema.Type<typeof TechnicalAnalysisSnapshot>;

export const ResearchQualitySource = Schema.Literal(
  "demo",
  "indstocks",
  "market",
  "aftermarkets",
  "public",
);
export type ResearchQualitySource = Schema.Schema.Type<typeof ResearchQualitySource>;

export const ResearchCompleteness = Schema.Literal("complete", "partial", "minimal");
export type ResearchCompleteness = Schema.Schema.Type<typeof ResearchCompleteness>;

export const MissingResearchSignal = Schema.Literal(
  "fundamentals",
  "candles",
  "events",
  "broker_quote",
  "memory",
);
export type MissingResearchSignal = Schema.Schema.Type<typeof MissingResearchSignal>;

export const ResearchFallbackUsed = Schema.Literal(
  "public_research",
  "symbol_match",
  "neutral_score_defaults",
);
export type ResearchFallbackUsed = Schema.Schema.Type<typeof ResearchFallbackUsed>;

export const ResearchQuality = Schema.Struct({
  source: ResearchQualitySource,
  completeness: ResearchCompleteness,
  missingSignals: Schema.Array(MissingResearchSignal),
  fallbacksUsed: Schema.Array(ResearchFallbackUsed),
});
export type ResearchQuality = Schema.Schema.Type<typeof ResearchQuality>;

export const ResearchPacket = Schema.Struct({
  runLabel: Schema.String,
  source: Schema.Literal("demo", "market_quote", "indstocks_quote", "aftermarkets"),
  sector: SectorSnapshot,
  instrument: InstrumentSnapshot,
  instrumentIsin: Schema.optional(Schema.String),
  portfolioExposures: Schema.Array(PortfolioExposure),
  technicalAnalysis: Schema.optional(TechnicalAnalysisSnapshot),
  researchQuality: Schema.optional(ResearchQuality),
});
export type ResearchPacket = Schema.Schema.Type<typeof ResearchPacket>;

export const DailyResearchResult = Schema.Struct({
  runLabel: Schema.String,
  sector: SectorSnapshot,
  sectorScore: ScoreBreakdown,
  instrument: InstrumentSnapshot,
  instrumentIsin: Schema.optional(Schema.String),
  instrumentScore: ScoreBreakdown,
  portfolioFit: PortfolioFit,
  memoryContext: MemoryContext,
  recommendation: Recommendation,
  technicalAnalysis: Schema.optional(TechnicalAnalysisSnapshot),
  researchQuality: ResearchQuality,
});
export type DailyResearchResult = Schema.Schema.Type<typeof DailyResearchResult>;

export const AmfiNavEntry = Schema.Struct({
  schemeCode: Schema.String,
  isinDivPayoutOrGrowth: Schema.String,
  isinDivReinvestment: Schema.String,
  schemeName: Schema.String,
  netAssetValue: Schema.String,
  date: Schema.String,
});
export type AmfiNavEntry = Schema.Schema.Type<typeof AmfiNavEntry>;

export const EquityInstrumentSearchEntry = Schema.Struct({
  instrumentKey: Schema.String,
  exchange: Schema.String,
  tradingSymbol: Schema.String,
  shortName: Schema.String,
  instrumentType: Schema.String,
  isin: Schema.optional(Schema.String),
});
export type EquityInstrumentSearchEntry = Schema.Schema.Type<typeof EquityInstrumentSearchEntry>;

export const EquityQuoteEntry = Schema.Struct({
  instrumentKey: Schema.String,
  tradingSymbol: Schema.optional(Schema.String),
  lastPrice: Schema.Number,
  closePrice: Schema.optional(Schema.Number),
  volume: Schema.optional(Schema.Number),
  openInterest: Schema.optional(Schema.Number),
});
export type EquityQuoteEntry = Schema.Schema.Type<typeof EquityQuoteEntry>;

export const EquityQuoteSnapshot = Schema.Struct({
  instrumentKey: Schema.String,
  tradingSymbol: Schema.String,
  shortName: Schema.String,
  exchange: Schema.String,
  instrumentType: Schema.String,
  lastPrice: Schema.Number,
  closePrice: Schema.optional(Schema.Number),
  volume: Schema.optional(Schema.Number),
  openInterest: Schema.optional(Schema.Number),
  isin: Schema.optional(Schema.String),
});
export type EquityQuoteSnapshot = Schema.Schema.Type<typeof EquityQuoteSnapshot>;

export const EquityInstrumentProfile = Schema.Struct({
  instrumentKey: Schema.String,
  exchange: Schema.String,
  tradingSymbol: Schema.String,
  name: Schema.String,
  shortName: Schema.optional(Schema.String),
  isin: Schema.optional(Schema.String),
  instrumentType: Schema.String,
  securityType: Schema.optional(Schema.String),
  lotSize: Schema.optional(Schema.Number),
  freezeQuantity: Schema.optional(Schema.Number),
  tickSize: Schema.optional(Schema.Number),
  exchangeToken: Schema.optional(Schema.String),
  mtfEnabled: Schema.optional(Schema.Boolean),
  mtfBracket: Schema.optional(Schema.Number),
  intradayMargin: Schema.optional(Schema.Number),
  intradayLeverage: Schema.optional(Schema.Number),
});
export type EquityInstrumentProfile = Schema.Schema.Type<typeof EquityInstrumentProfile>;

export const EquityFundamentalMetric = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
});
export type EquityFundamentalMetric = Schema.Schema.Type<typeof EquityFundamentalMetric>;

export const EquityRevenueStatementRow = Schema.Struct({
  year: Schema.String,
  revenueCrores: Schema.Number,
  operatingProfitCrores: Schema.Number,
  netProfitCrores: Schema.Number,
});
export type EquityRevenueStatementRow = Schema.Schema.Type<typeof EquityRevenueStatementRow>;

export const EquityFundamentalsSnapshot = Schema.Struct({
  isin: Schema.String,
  companyName: Schema.optional(Schema.String),
  marketCapCrores: Schema.optional(Schema.Number),
  fundamentalMetrics: Schema.Array(EquityFundamentalMetric),
  revenueStatement: Schema.Array(EquityRevenueStatementRow),
});
export type EquityFundamentalsSnapshot = Schema.Schema.Type<typeof EquityFundamentalsSnapshot>;

export const CorporateEvent = Schema.Struct({
  source: Schema.Literal("bse_announcements"),
  title: Schema.String,
  link: Schema.String,
  scripCode: Schema.optional(Schema.String),
  description: Schema.String,
  publishedAt: Schema.String,
});
export type CorporateEvent = Schema.Schema.Type<typeof CorporateEvent>;

export const BrokerHolding = Schema.Struct({
  broker: BrokerSource,
  securityId: Schema.String,
  tradingSymbol: Schema.String,
  instrumentName: Schema.optional(Schema.String),
  exchangeSegment: Schema.String,
  isin: Schema.String,
  quantity: Schema.Number,
  averagePrice: Schema.Number,
  lastTradedPrice: Schema.Number,
  closePrice: Schema.Number,
  marketValue: Schema.Number,
  pnlAbsolute: Schema.Number,
  pnlPercent: Schema.Number,
});
export type BrokerHolding = Schema.Schema.Type<typeof BrokerHolding>;

export const BrokerTradeFill = Schema.Struct({
  broker: BrokerSource,
  fillId: Schema.Number,
  exchangeOrderId: Schema.String,
  quantity: Schema.Number,
  price: Schema.Number,
  tradeDate: Schema.String,
  tradeSerialNumber: Schema.String,
  scripCode: Schema.String,
});
export type BrokerTradeFill = Schema.Schema.Type<typeof BrokerTradeFill>;

export const PortfolioPositionSnapshot = Schema.Struct({
  symbol: Schema.String,
  securityId: Schema.optional(Schema.String),
  instrumentName: Schema.optional(Schema.String),
  isin: Schema.String,
  exchangeSegment: Schema.String,
  quantity: Schema.Number,
  averagePrice: Schema.Number,
  lastTradedPrice: Schema.Number,
  closePrice: Schema.Number,
  marketValue: Schema.Number,
  pnlAbsolute: Schema.Number,
  pnlPercent: Schema.Number,
  sourceBroker: BrokerSource,
});
export type PortfolioPositionSnapshot = Schema.Schema.Type<typeof PortfolioPositionSnapshot>;

export const PortfolioSummary = Schema.Struct({
  holdingsCount: Schema.Number,
  totalMarketValue: Schema.Number,
  totalPnlAbsolute: Schema.Number,
  weightedPnlPercent: Schema.Number,
  topWinnerSymbol: Schema.optional(Schema.String),
  topLoserSymbol: Schema.optional(Schema.String),
});
export type PortfolioSummary = Schema.Schema.Type<typeof PortfolioSummary>;

export const PortfolioPositionChange = Schema.Struct({
  symbol: Schema.String,
  status: Schema.Literal("new", "exited", "quantity_changed", "unchanged"),
  previousQuantity: Schema.optional(Schema.Number),
  currentQuantity: Schema.optional(Schema.Number),
  quantityDelta: Schema.optional(Schema.Number),
});
export type PortfolioPositionChange = Schema.Schema.Type<typeof PortfolioPositionChange>;

export const PortfolioSnapshotDiff = Schema.Struct({
  newPositions: Schema.Number,
  exitedPositions: Schema.Number,
  changedPositions: Schema.Number,
  unchangedPositions: Schema.Number,
  changes: Schema.Array(PortfolioPositionChange),
});
export type PortfolioSnapshotDiff = Schema.Schema.Type<typeof PortfolioSnapshotDiff>;

export const PortfolioMemorySnapshot = Schema.Struct({
  snapshotId: Schema.String,
  broker: BrokerSource,
  capturedAt: Schema.String,
  positions: Schema.Array(PortfolioPositionSnapshot),
  summary: PortfolioSummary,
});
export type PortfolioMemorySnapshot = Schema.Schema.Type<typeof PortfolioMemorySnapshot>;

export const PortfolioSnapshotReference = Schema.Struct({
  snapshotId: Schema.String,
  broker: BrokerSource,
  capturedAt: Schema.String,
});
export type PortfolioSnapshotReference = Schema.Schema.Type<typeof PortfolioSnapshotReference>;

export const PortfolioSyncReport = Schema.Struct({
  broker: BrokerSource,
  dbConfigured: Schema.Boolean,
  previousSnapshotId: Schema.optional(Schema.String),
  currentSnapshotId: Schema.String,
  positionsFetched: Schema.Number,
  tradeFillsFetched: Schema.Number,
  persisted: Schema.Boolean,
  persistedPositions: Schema.optional(Schema.Number),
  persistedTradeFills: Schema.optional(Schema.Number),
  diff: PortfolioSnapshotDiff,
});
export type PortfolioSyncReport = Schema.Schema.Type<typeof PortfolioSyncReport>;

export const HoldingResearchReview = Schema.Struct({
  symbol: Schema.String,
  query: Schema.String,
  status: Schema.Literal("aligned", "review", "conflict", "unmatched", "error"),
  reason: Schema.String,
  verdict: Schema.optional(RecommendationVerdict),
  conviction: Schema.optional(Schema.Number),
  runLabel: Schema.optional(Schema.String),
  researchQuality: Schema.optional(ResearchQuality),
});
export type HoldingResearchReview = Schema.Schema.Type<typeof HoldingResearchReview>;

export const BrokerPortfolioReviewReport = Schema.Struct({
  broker: BrokerSource,
  holdingsReviewed: Schema.Number,
  alignedCount: Schema.Number,
  reviewCount: Schema.Number,
  conflictCount: Schema.Number,
  unmatchedCount: Schema.Number,
  errorCount: Schema.Number,
  reviews: Schema.Array(HoldingResearchReview),
});
export type BrokerPortfolioReviewReport = Schema.Schema.Type<typeof BrokerPortfolioReviewReport>;

export const BrokerPortfolioDecisionReport = Schema.Struct({
  sync: PortfolioSyncReport,
  review: BrokerPortfolioReviewReport,
  reviewsPersisted: Schema.optional(Schema.Number),
});
export type BrokerPortfolioDecisionReport = Schema.Schema.Type<typeof BrokerPortfolioDecisionReport>;

export const HoldingReviewHistoryEntry = Schema.Struct({
  snapshotId: Schema.String,
  symbol: Schema.String,
  query: Schema.String,
  status: Schema.Literal("aligned", "review", "conflict", "unmatched", "error"),
  reason: Schema.String,
  verdict: Schema.optional(RecommendationVerdict),
  conviction: Schema.optional(Schema.Number),
  runLabel: Schema.optional(Schema.String),
  researchQuality: Schema.optional(ResearchQuality),
  reviewedAt: Schema.String,
});
export type HoldingReviewHistoryEntry = Schema.Schema.Type<typeof HoldingReviewHistoryEntry>;

export const HoldingReviewTrend = Schema.Struct({
  symbol: Schema.String,
  latestStatus: Schema.Literal("aligned", "review", "conflict", "unmatched", "error"),
  latestReviewedAt: Schema.String,
  streakCount: Schema.Number,
  history: Schema.Array(HoldingReviewHistoryEntry),
});
export type HoldingReviewTrend = Schema.Schema.Type<typeof HoldingReviewTrend>;

export const PortfolioHoldingSnapshotSummary = Schema.Struct({
  symbol: Schema.String,
  instrumentName: Schema.optional(Schema.String),
  marketValue: Schema.Number,
  pnlAbsolute: Schema.Number,
  pnlPercent: Schema.Number,
  quantity: Schema.Number,
});
export type PortfolioHoldingSnapshotSummary = Schema.Schema.Type<typeof PortfolioHoldingSnapshotSummary>;

export const HoldingStatusChange = Schema.Struct({
  symbol: Schema.String,
  previousStatus: Schema.optional(
    Schema.Literal("aligned", "review", "conflict", "unmatched", "error"),
  ),
  currentStatus: Schema.Literal("aligned", "review", "conflict", "unmatched", "error"),
  changeType: Schema.Literal("newly_reviewed", "changed"),
});
export type HoldingStatusChange = Schema.Schema.Type<typeof HoldingStatusChange>;

export const TodayActionItem = Schema.Struct({
  priority: Schema.Literal("high", "medium", "low"),
  title: Schema.String,
  detail: Schema.String,
});
export type TodayActionItem = Schema.Schema.Type<typeof TodayActionItem>;

export const PortfolioDashboardReport = Schema.Struct({
  broker: BrokerSource,
  latestSnapshot: Schema.optional(PortfolioMemorySnapshot),
  reviewSnapshot: Schema.optional(PortfolioSnapshotReference),
  recentSnapshots: Schema.Array(PortfolioSnapshotReference),
  latestReview: Schema.optional(BrokerPortfolioReviewReport),
  latestDiff: Schema.optional(PortfolioSnapshotDiff),
  topWinners: Schema.Array(PortfolioHoldingSnapshotSummary),
  topLosers: Schema.Array(PortfolioHoldingSnapshotSummary),
  topConflicts: Schema.Array(HoldingResearchReview),
  topReviewCandidates: Schema.Array(HoldingResearchReview),
  statusChanges: Schema.Array(HoldingStatusChange),
  unreviewedPositions: Schema.Array(PortfolioHoldingSnapshotSummary),
  streakLeaders: Schema.Array(HoldingReviewTrend),
  todaysActions: Schema.Array(TodayActionItem),
});
export type PortfolioDashboardReport = Schema.Schema.Type<typeof PortfolioDashboardReport>;

export const HistoricalCandle = Schema.Struct({
  timestamp: Schema.String,
  open: Schema.Number,
  high: Schema.Number,
  low: Schema.Number,
  close: Schema.Number,
  volume: Schema.Number,
  openInterest: Schema.optional(Schema.Number),
});
export type HistoricalCandle = Schema.Schema.Type<typeof HistoricalCandle>;

export const SectorInference = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  confidence: Schema.Number,
  evidence: Schema.Array(Schema.String),
});
export type SectorInference = Schema.Schema.Type<typeof SectorInference>;
