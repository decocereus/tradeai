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
  runDemoResearchSnapshotWithDependencies,
  runEquityResearch,
  runIndstocksPositionResearch,
  runPublicEquityResearch,
  type EquityResearchInput,
} from "./research-workflows.ts";
import {
  getHoldingReviewTrend,
  reviewBrokerHoldingsAgainstResearchWithDependencies,
  reviewImportedPortfolioDecisionWithDependencies,
  reviewSyncedBrokerPortfolioWithDependencies,
  type BrokerPortfolioReviewInput,
  type ReviewResearchRunners,
  type ManualPortfolioDecisionInput,
} from "./review-workflows.ts";
import { getPortfolioDashboard } from "./dashboard-workflows.ts";
import {
  createTradeAiWorkflowDependencies,
  type CreateTradeAiWorkflowServiceOptions,
  type TradeAiRuntimeConfig,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

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

const mergeBrokerPortfolioInput = (
  config: TradeAiRuntimeConfig,
  input: BrokerPortfolioWorkflowInput = {},
): BrokerPortfolioWorkflowInput => ({
  ...(config.growwAccessToken ?? config.brokerAccessToken ?? config.accessToken
    ? { accessToken: config.growwAccessToken ?? config.brokerAccessToken ?? config.accessToken }
    : {}),
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  ...(config.persistPortfolioSnapshots !== undefined
    ? { persist: config.persistPortfolioSnapshots }
    : {}),
  ...input,
});

const mergeBrokerTradeBookInput = (
  config: TradeAiRuntimeConfig,
  input: BrokerTradeBookInput = {},
): BrokerTradeBookInput => ({
  ...(config.growwAccessToken ?? config.brokerAccessToken ?? config.accessToken
    ? { accessToken: config.growwAccessToken ?? config.brokerAccessToken ?? config.accessToken }
    : {}),
  ...input,
});

const mergePortfolioDashboardInput = (
  config: TradeAiRuntimeConfig,
  input: PortfolioDashboardInput = {},
): PortfolioDashboardInput => ({
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  ...input,
});

const mergeHoldingReviewTrendInput = (
  config: TradeAiRuntimeConfig,
  input: HoldingReviewTrendInput,
): HoldingReviewTrendInput => ({
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  ...input,
});

const mergeManualPortfolioImportInput = (
  config: TradeAiRuntimeConfig,
  input: ManualPortfolioImportInput,
): ManualPortfolioImportInput => ({
  ...input,
  persistence: {
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
    ...(config.persistPortfolioSnapshots !== undefined
      ? { persist: config.persistPortfolioSnapshots }
      : {}),
    ...input.persistence,
  },
});

const mergeBrokerPortfolioReviewInput = (
  config: TradeAiRuntimeConfig,
  dependencies: TradeAiWorkflowDependencies,
  input: BrokerPortfolioReviewInput = {},
): BrokerPortfolioReviewInput => ({
  ...mergeBrokerPortfolioInput(config, input),
  options: {
    researchRunners: input.options?.researchRunners ?? createReviewResearchRunners(dependencies),
    ...(config.allowPublicResearchFallback !== undefined
      ? { allowPublicResearchFallback: config.allowPublicResearchFallback }
      : {}),
    ...input.options,
  },
});

const mergeManualPortfolioDecisionInput = (
  config: TradeAiRuntimeConfig,
  dependencies: TradeAiWorkflowDependencies,
  input: ManualPortfolioDecisionInput,
): ManualPortfolioDecisionInput => ({
  ...input,
  ...(input.accessToken ?? config.growwAccessToken ?? config.marketAccessToken ?? config.accessToken
    ? {
        accessToken:
          input.accessToken ?? config.growwAccessToken ?? config.marketAccessToken ?? config.accessToken,
      }
    : {}),
  persistence: {
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
    ...(config.persistPortfolioSnapshots !== undefined
      ? { persist: config.persistPortfolioSnapshots }
      : {}),
    ...input.persistence,
  },
  options: {
    researchRunners: input.options?.researchRunners ?? createReviewResearchRunners(dependencies),
    ...(config.allowPublicResearchFallback !== undefined
      ? { allowPublicResearchFallback: config.allowPublicResearchFallback }
      : {}),
    ...input.options,
  },
});

const createReviewResearchRunners = (
  dependencies: TradeAiWorkflowDependencies,
): ReviewResearchRunners => ({
  runBrokerPositionResearch: (input) =>
    runIndstocksPositionResearch(
      {
        ...input,
        ...(input.accessToken ?? dependencies.config.growwAccessToken ?? dependencies.config.brokerAccessToken ?? dependencies.config.accessToken
          ? {
              accessToken:
                input.accessToken ??
                dependencies.config.growwAccessToken ??
                dependencies.config.brokerAccessToken ??
                dependencies.config.accessToken,
            }
          : {}),
      },
      dependencies,
    ),
  runAuthenticatedEquityResearch: (input) =>
    runEquityResearch(
      {
        ...input,
        ...(dependencies.config.growwAccessToken ?? dependencies.config.marketAccessToken ?? dependencies.config.accessToken
          ? {
              accessToken:
                dependencies.config.growwAccessToken ??
                dependencies.config.marketAccessToken ??
                dependencies.config.accessToken,
            }
          : {}),
      },
      dependencies,
    ),
  runPublicEquityResearch: (input) => runPublicEquityResearch(input, dependencies),
});

export const createTradeAiWorkflowService = (
  options: CreateTradeAiWorkflowServiceOptions = {},
) => {
  const dependencies = createTradeAiWorkflowDependencies(options);
  const { config } = dependencies;

  return {
    canPersistPortfolioMemory: (input: BrokerPortfolioWorkflowInput = {}) =>
      canPersistPortfolioMemory(mergeBrokerPortfolioInput(config, input).databaseUrl, dependencies),

    runDemoResearchSnapshot: () => runDemoResearchSnapshotWithDependencies(dependencies),
    runEquityResearch: (input: EquityResearchInput) =>
      runEquityResearch(
        {
          ...(config.growwAccessToken ?? config.marketAccessToken ?? config.accessToken
            ? { accessToken: config.growwAccessToken ?? config.marketAccessToken ?? config.accessToken }
            : {}),
          ...input,
        },
        dependencies,
      ),

    lookupAmfiNav: (query: string) => lookupAmfiNav(query, dependencies),
    lookupCorporateEvents: (query: string) => lookupCorporateEvents(query, dependencies),
    searchEquities: (query: string) => searchEquities(query, dependencies),
    getEquityQuoteSnapshots: (input: EquityQuoteSnapshotsInput) =>
      getEquityQuoteSnapshots(
        input.instrumentKeys,
        input.accessToken ?? config.growwAccessToken ?? config.marketAccessToken ?? config.accessToken,
        dependencies,
      ),

    getBrokerHoldings: (input: BrokerPortfolioWorkflowInput = {}) =>
      getBrokerHoldings(mergeBrokerPortfolioInput(config, input), dependencies),
    summarizeBrokerHoldingsCollection,
    getBrokerTradeBook: (input: BrokerTradeBookInput = {}) =>
      getBrokerTradeBook(mergeBrokerTradeBookInput(config, input), dependencies),
    persistBrokerPortfolioMemorySnapshot: (input: BrokerPortfolioWorkflowInput = {}) =>
      persistBrokerPortfolioMemorySnapshot(
        mergeBrokerPortfolioInput(config, input),
        dependencies,
      ),
    diffBrokerPortfolioAgainstLatestSnapshot: (input: BrokerPortfolioWorkflowInput = {}) =>
      diffBrokerPortfolioAgainstLatestSnapshot(
        mergeBrokerPortfolioInput(config, input),
        dependencies,
      ),
    syncBrokerPortfolio: (input: BrokerPortfolioWorkflowInput = {}) =>
      syncBrokerPortfolio(mergeBrokerPortfolioInput(config, input), dependencies),
    importManualPortfolioSnapshot: (input: ManualPortfolioImportInput) =>
      importManualPortfolioSnapshot(mergeManualPortfolioImportInput(config, input), dependencies),

    reviewBrokerHoldingsAgainstResearch: (input: BrokerPortfolioReviewInput = {}) =>
      reviewBrokerHoldingsAgainstResearchWithDependencies(
        mergeBrokerPortfolioReviewInput(config, dependencies, input),
        dependencies,
      ),
    reviewSyncedBrokerPortfolio: (input: BrokerPortfolioReviewInput = {}) =>
      reviewSyncedBrokerPortfolioWithDependencies(
        mergeBrokerPortfolioReviewInput(config, dependencies, input),
        dependencies,
      ),
    reviewImportedPortfolioDecision: (input: ManualPortfolioDecisionInput) =>
      reviewImportedPortfolioDecisionWithDependencies(
        mergeManualPortfolioDecisionInput(config, dependencies, input),
        dependencies,
      ),

    getPortfolioDashboard: (input: PortfolioDashboardInput = {}) => {
      const merged = mergePortfolioDashboardInput(config, input);
      return getPortfolioDashboard(merged.broker, merged.databaseUrl, dependencies);
    },
    getHoldingReviewTrend: (input: HoldingReviewTrendInput) => {
      const merged = mergeHoldingReviewTrendInput(config, input);
      return getHoldingReviewTrend(
        merged.symbol,
        merged.broker,
        merged.databaseUrl,
        dependencies,
      );
    },
  };
};

export type TradeAiWorkflowService = ReturnType<typeof createTradeAiWorkflowService>;
