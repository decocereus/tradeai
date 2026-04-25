import type { BrokerSource } from "@tradeai/domain";

import {
  getEquityQuoteSnapshots,
  lookupAmfiNav,
  lookupCorporateEvents,
  searchEquities,
} from "./market-workflows.ts";
import {
  canPersistPortfolioMemory,
  diffBrokerPortfolioAgainstLatestSnapshot,
  getBrokerHoldings,
  getBrokerTradeBook,
  importManualPortfolioSnapshot,
  persistBrokerPortfolioMemorySnapshot,
  syncBrokerPortfolio,
  summarizeBrokerHoldingsCollection,
  type BrokerPortfolioWorkflowInput,
  type BrokerTradeBookInput,
  type ManualPortfolioImportInput,
} from "./portfolio-workflows.ts";
import {
  runDemoResearchSnapshot,
  runEquityResearch,
  type EquityResearchInput,
} from "./research-workflows.ts";
import {
  getHoldingReviewTrend,
  reviewBrokerHoldingsAgainstResearch,
  reviewImportedPortfolioDecision,
  reviewSyncedBrokerPortfolio,
  type BrokerPortfolioReviewInput,
  type ManualPortfolioDecisionInput,
} from "./review-workflows.ts";
import { getPortfolioDashboard } from "./dashboard-workflows.ts";

export interface EquityQuoteSnapshotsInput {
  instrumentKeys: readonly string[];
  accessToken?: string;
}

export interface PortfolioDashboardInput {
  broker?: BrokerSource;
  databaseUrl?: string;
}

export interface HoldingReviewTrendInput {
  symbol: string;
  broker?: BrokerSource;
  databaseUrl?: string;
}

export const createTradeAiWorkflowService = () => ({
  canPersistPortfolioMemory: (input: BrokerPortfolioWorkflowInput = {}) =>
    canPersistPortfolioMemory(input.databaseUrl),

  runDemoResearchSnapshot: () => runDemoResearchSnapshot,
  runEquityResearch: (input: EquityResearchInput) => runEquityResearch(input),

  lookupAmfiNav: (query: string) => lookupAmfiNav(query),
  lookupCorporateEvents: (query: string) => lookupCorporateEvents(query),
  searchEquities: (query: string) => searchEquities(query),
  getEquityQuoteSnapshots: (input: EquityQuoteSnapshotsInput) =>
    getEquityQuoteSnapshots(input.instrumentKeys, input.accessToken),

  getBrokerHoldings: (input: BrokerPortfolioWorkflowInput = {}) => getBrokerHoldings(input),
  summarizeBrokerHoldingsCollection,
  getBrokerTradeBook: (input: BrokerTradeBookInput = {}) => getBrokerTradeBook(input),
  persistBrokerPortfolioMemorySnapshot: (input: BrokerPortfolioWorkflowInput = {}) =>
    persistBrokerPortfolioMemorySnapshot(input),
  diffBrokerPortfolioAgainstLatestSnapshot: (input: BrokerPortfolioWorkflowInput = {}) =>
    diffBrokerPortfolioAgainstLatestSnapshot(input),
  syncBrokerPortfolio: (input: BrokerPortfolioWorkflowInput = {}) => syncBrokerPortfolio(input),
  importManualPortfolioSnapshot: (input: ManualPortfolioImportInput) =>
    importManualPortfolioSnapshot(input),

  reviewBrokerHoldingsAgainstResearch: (input: BrokerPortfolioReviewInput = {}) =>
    reviewBrokerHoldingsAgainstResearch(input),
  reviewSyncedBrokerPortfolio: (input: BrokerPortfolioReviewInput = {}) =>
    reviewSyncedBrokerPortfolio(input),
  reviewImportedPortfolioDecision: (input: ManualPortfolioDecisionInput) =>
    reviewImportedPortfolioDecision(input),

  getPortfolioDashboard: (input: PortfolioDashboardInput = {}) =>
    getPortfolioDashboard(input.broker, input.databaseUrl),
  getHoldingReviewTrend: (input: HoldingReviewTrendInput) =>
    getHoldingReviewTrend(input.symbol, input.broker, input.databaseUrl),
});

export type TradeAiWorkflowService = ReturnType<typeof createTradeAiWorkflowService>;
