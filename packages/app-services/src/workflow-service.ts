import type { BrokerSource } from "@tradeai/domain";
import { Effect } from "effect";

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
  buildDailyOperatorViewModel,
  getDailyOperatorReadOnlyReport,
  getDailyOperatorReadOnlyViewModel,
  getDailyOperatorReport,
  getProviderHealth,
  type DailyOperatorReadModelInput,
  type DailyOperatorInput,
  type ProviderHealthInput,
} from "./operator-workflows.ts";
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

const resolveBrokerAccessToken = (config: TradeAiRuntimeConfig): string | undefined => {
  if (config.brokerDataProvider === "groww") {
    return config.growwAccessToken ?? config.brokerAccessToken ?? config.accessToken;
  }

  return config.brokerAccessToken ?? config.accessToken;
};

const resolveMarketAccessToken = (config: TradeAiRuntimeConfig): string | undefined =>
  config.growwAccessToken ?? config.marketAccessToken ?? config.accessToken;

const mergeProviderHealthInput = (
  config: TradeAiRuntimeConfig,
  input: ProviderHealthInput = {},
): ProviderHealthInput => {
  const brokerAccessToken = resolveBrokerAccessToken(config);
  const marketAccessToken = resolveMarketAccessToken(config);
  return {
    ...(brokerAccessToken ? { brokerAccessToken } : {}),
    ...(marketAccessToken ? { marketAccessToken } : {}),
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
    ...input,
  };
};

const mergeBrokerPortfolioInput = (
  config: TradeAiRuntimeConfig,
  input: BrokerPortfolioWorkflowInput = {},
): BrokerPortfolioWorkflowInput => {
  const accessToken = resolveBrokerAccessToken(config);
  const marketAccessToken = resolveMarketAccessToken(config);
  return {
    ...(accessToken ? { accessToken } : {}),
    ...(marketAccessToken ? { marketAccessToken } : {}),
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
    ...(config.persistPortfolioSnapshots !== undefined
      ? { persist: config.persistPortfolioSnapshots }
      : {}),
    ...input,
  };
};

const mergeBrokerTradeBookInput = (
  config: TradeAiRuntimeConfig,
  input: BrokerTradeBookInput = {},
): BrokerTradeBookInput => {
  const accessToken = resolveBrokerAccessToken(config);
  return {
    ...(accessToken ? { accessToken } : {}),
    ...input,
  };
};

const mergePortfolioDashboardInput = (
  config: TradeAiRuntimeConfig,
  input: PortfolioDashboardInput = {},
): PortfolioDashboardInput => ({
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  ...input,
});

const mergeDailyOperatorReadModelInput = (
  config: TradeAiRuntimeConfig,
  input: DailyOperatorReadModelInput = {},
): DailyOperatorReadModelInput => ({
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

const mergeDailyOperatorInput = (
  config: TradeAiRuntimeConfig,
  dependencies: TradeAiWorkflowDependencies,
  input: DailyOperatorInput = {},
): DailyOperatorInput => {
  const merged = mergeBrokerPortfolioReviewInput(config, dependencies, input);
  return {
    ...merged,
    health: mergeProviderHealthInput(config, input.health ?? input),
  };
};

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
): ReviewResearchRunners => {
  const brokerAccessToken = resolveBrokerAccessToken(dependencies.config);
  const marketAccessToken = resolveMarketAccessToken(dependencies.config);
  return {
    runBrokerPositionResearch: (input) => {
      const accessToken = input.accessToken ?? brokerAccessToken;
      return runIndstocksPositionResearch(
        {
          ...input,
          ...(accessToken ? { accessToken } : {}),
        },
        dependencies,
      );
    },
    runAuthenticatedEquityResearch: (input) =>
      runEquityResearch(
        {
          ...input,
          ...(marketAccessToken ? { accessToken: marketAccessToken } : {}),
        },
        dependencies,
      ),
    runPublicEquityResearch: (input) => runPublicEquityResearch(input, dependencies),
  };
};

export const createTradeAiWorkflowService = (
  options: CreateTradeAiWorkflowServiceOptions = {},
) => {
  const dependencies = createTradeAiWorkflowDependencies(options);
  const { config } = dependencies;

  return {
    canPersistPortfolioMemory: (input: BrokerPortfolioWorkflowInput = {}) =>
      canPersistPortfolioMemory(mergeBrokerPortfolioInput(config, input).databaseUrl, dependencies),

    runDemoResearchSnapshot: () => runDemoResearchSnapshotWithDependencies(dependencies),
    getProviderHealth: (input: ProviderHealthInput = {}) =>
      getProviderHealth(mergeProviderHealthInput(config, input), dependencies),
    getDailyOperatorReport: (input: DailyOperatorInput = {}) =>
      getDailyOperatorReport(
        mergeDailyOperatorInput(config, dependencies, input),
        dependencies,
      ),
    getDailyOperatorViewModel: (input: DailyOperatorInput = {}) =>
      getDailyOperatorReport(
        mergeDailyOperatorInput(config, dependencies, input),
        dependencies,
      ).pipe(Effect.map(buildDailyOperatorViewModel)),
    getDailyOperatorReadOnlyReport: (input: DailyOperatorReadModelInput = {}) =>
      getDailyOperatorReadOnlyReport(
        mergeDailyOperatorReadModelInput(config, input),
        dependencies,
      ),
    getDailyOperatorReadOnlyViewModel: (input: DailyOperatorReadModelInput = {}) =>
      getDailyOperatorReadOnlyViewModel(
        mergeDailyOperatorReadModelInput(config, input),
        dependencies,
      ),
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
