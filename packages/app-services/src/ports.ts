import {
  buildAftermarketsResearchPacket,
  buildGrowwQuoteSnapshot,
  fetchBseAnnouncements,
  fetchGrowwHoldings,
  fetchGrowwInstrumentProfiles,
  fetchGrowwQuoteSnapshot,
  fetchGrowwTradeBook,
  fetchIndstocksHoldings,
  fetchIndstocksTradeBook,
  loadDemoResearchPacket,
  searchAmfiNavEntries,
  searchBseAnnouncements,
  searchGrowwInstrumentProfiles,
  searchGrowwInstruments,
} from "@tradeai/data-sources";
import {
  hasConfiguredDatabaseUrl,
  loadHoldingReviewHistory,
  loadLatestPortfolioSnapshot,
  loadPreferredPortfolioDashboardRepositoryData,
  persistHoldingReviewReportToDatabase,
  persistPortfolioSnapshotToDatabase,
  type PortfolioDashboardRepositoryData,
} from "@tradeai/db";
import type {
  BrokerHolding,
  BrokerPortfolioReviewReport,
  BrokerSource,
  BrokerTradeFill,
  AmfiNavEntry,
  CorporateEvent,
  HoldingReviewHistoryEntry,
  MemoryContext,
  PortfolioMemorySnapshot,
  PortfolioPositionSnapshot,
  ResearchPacket,
  EquityInstrumentSearchEntry,
  EquityInstrumentProfile,
  EquityQuoteEntry,
  EquityQuoteSnapshot,
} from "@tradeai/domain";
import { loadMemoryContext } from "@tradeai/memory";
import { Effect } from "effect";

export interface TradeAiRuntimeConfig {
  accessToken?: string;
  brokerAccessToken?: string;
  marketAccessToken?: string;
  brokerDataProvider?: "groww" | "indstocks";
  marketDataProvider?: "groww";
  researchDataProvider?: "aftermarkets";
  growwAccessToken?: string;
  aftermarketsApiKey?: string;
  databaseUrl?: string;
  allowPublicResearchFallback?: boolean;
  persistPortfolioSnapshots?: boolean;
}

export interface TradeAiBrokerSources {
  fetchBrokerHoldings: (accessToken?: string) => Effect.Effect<readonly BrokerHolding[], Error>;
  fetchBrokerTradeBook: (
    segment: "EQUITY" | "DERIVATIVE",
    accessToken?: string,
  ) => Effect.Effect<readonly BrokerTradeFill[], Error>;
}

export interface TradeAiMarketSources {
  fetchNseInstrumentProfiles: () => Effect.Effect<readonly EquityInstrumentProfile[], Error>;
  searchAmfiNav: (query: string) => Effect.Effect<readonly AmfiNavEntry[], Error>;
  searchCorporateEvents: (query: string) => Effect.Effect<readonly CorporateEvent[], Error>;
  fetchCorporateEvents: () => Effect.Effect<readonly CorporateEvent[], Error>;
  searchEquityProfiles: (query: string) => Effect.Effect<readonly EquityInstrumentProfile[], Error>;
  searchEquityInstruments: (
    query: string,
    accessToken?: string,
  ) => Effect.Effect<readonly EquityInstrumentSearchEntry[], Error>;
  fetchEquityQuotes: (
    instrumentKeys: readonly string[],
    accessToken?: string,
  ) => Effect.Effect<readonly EquityQuoteEntry[], Error>;
  buildEquityQuoteSnapshot: (
    searchResults: readonly (EquityInstrumentSearchEntry | EquityInstrumentProfile)[],
    quotes: readonly EquityQuoteEntry[],
  ) => readonly EquityQuoteSnapshot[];
}

export interface TradeAiResearchSources {
  loadDemoResearchPacket: () => Effect.Effect<ResearchPacket, Error>;
  buildEquityResearchPacket: (input: {
    query: string;
    accessToken?: string;
  }) => Effect.Effect<ResearchPacket, Error>;
  buildPublicEquityResearchPacket: (input: {
    query: string;
  }) => Effect.Effect<ResearchPacket, Error>;
  buildBrokerPositionResearchPacket: (input: {
    position: PortfolioPositionSnapshot;
    accessToken?: string;
  }) => Effect.Effect<ResearchPacket, Error>;
}

export interface TradeAiMemorySource {
  loadMemoryContext: () => Effect.Effect<MemoryContext, Error>;
}

export interface PortfolioSnapshotPersistenceResult {
  snapshotId: string;
  positionsInserted: number;
  tradeFillsInserted: number;
}

export interface HoldingReviewPersistenceResult {
  reviewsInserted: number;
}

export interface TradeAiRepositories {
  hasConfiguredDatabaseUrl: (databaseUrl?: string) => boolean;
  loadLatestPortfolioSnapshot: (
    broker: BrokerSource,
    databaseUrl?: string,
  ) => Promise<PortfolioMemorySnapshot | undefined>;
  persistPortfolioSnapshot: (
    snapshot: PortfolioMemorySnapshot,
    fills: readonly BrokerTradeFill[],
    databaseUrl?: string,
  ) => Promise<PortfolioSnapshotPersistenceResult>;
  loadHoldingReviewHistory: (
    symbol: string,
    broker: BrokerSource,
    databaseUrl?: string,
  ) => Promise<HoldingReviewHistoryEntry[]>;
  persistHoldingReviewReport: (
    snapshotId: string,
    review: BrokerPortfolioReviewReport,
    databaseUrl?: string,
  ) => Promise<HoldingReviewPersistenceResult>;
  loadPortfolioDashboardData: (
    preferredBroker: BrokerSource | undefined,
    databaseUrl: string | undefined,
    snapshotLimit: number,
  ) => Promise<PortfolioDashboardRepositoryData>;
}

export interface TradeAiWorkflowDependencies {
  config: TradeAiRuntimeConfig;
  brokerSources: TradeAiBrokerSources;
  marketSources: TradeAiMarketSources;
  researchSources: TradeAiResearchSources;
  memorySource: TradeAiMemorySource;
  repositories: TradeAiRepositories;
}

export interface CreateTradeAiWorkflowServiceOptions {
  config?: TradeAiRuntimeConfig;
  brokerSources?: Partial<TradeAiBrokerSources>;
  marketSources?: Partial<TradeAiMarketSources>;
  researchSources?: Partial<TradeAiResearchSources>;
  memorySource?: Partial<TradeAiMemorySource>;
  repositories?: Partial<TradeAiRepositories>;
}

export const defaultTradeAiBrokerSources: TradeAiBrokerSources = {
  fetchBrokerHoldings: fetchIndstocksHoldings,
  fetchBrokerTradeBook: fetchIndstocksTradeBook,
};

export const indstocksTradeAiBrokerSources: TradeAiBrokerSources = {
  fetchBrokerHoldings: fetchIndstocksHoldings,
  fetchBrokerTradeBook: fetchIndstocksTradeBook,
};

export const growwTradeAiBrokerSources: TradeAiBrokerSources = {
  fetchBrokerHoldings: fetchGrowwHoldings,
  fetchBrokerTradeBook: fetchGrowwTradeBook,
};

export const defaultTradeAiMarketSources: TradeAiMarketSources = {
  fetchNseInstrumentProfiles: fetchGrowwInstrumentProfiles,
  searchAmfiNav: searchAmfiNavEntries,
  searchCorporateEvents: searchBseAnnouncements,
  fetchCorporateEvents: fetchBseAnnouncements,
  searchEquityProfiles: searchGrowwInstrumentProfiles,
  searchEquityInstruments: (query) => searchGrowwInstruments(query),
  fetchEquityQuotes: fetchGrowwQuoteSnapshot,
  buildEquityQuoteSnapshot: buildGrowwQuoteSnapshot,
};

export const defaultTradeAiResearchSources: TradeAiResearchSources = {
  loadDemoResearchPacket: () => loadDemoResearchPacket,
  buildEquityResearchPacket: (input) =>
    buildAftermarketsResearchPacket({ query: input.query }),
  buildPublicEquityResearchPacket: (input) =>
    buildAftermarketsResearchPacket({ query: input.query }),
  buildBrokerPositionResearchPacket: (input) =>
    buildAftermarketsResearchPacket({ query: input.position.symbol }),
};

export const defaultTradeAiMemorySource: TradeAiMemorySource = {
  loadMemoryContext: () => loadMemoryContext,
};

export const defaultTradeAiRepositories: TradeAiRepositories = {
  hasConfiguredDatabaseUrl,
  loadLatestPortfolioSnapshot,
  persistPortfolioSnapshot: persistPortfolioSnapshotToDatabase,
  loadHoldingReviewHistory,
  persistHoldingReviewReport: persistHoldingReviewReportToDatabase,
  loadPortfolioDashboardData: loadPreferredPortfolioDashboardRepositoryData,
};

const createAftermarketsResearchSources = (
  config: TradeAiRuntimeConfig,
): Partial<TradeAiResearchSources> => ({
  buildEquityResearchPacket: (input) =>
    buildAftermarketsResearchPacket({
      query: input.query,
      ...(config.aftermarketsApiKey ? { apiKey: config.aftermarketsApiKey } : {}),
    }),
  buildPublicEquityResearchPacket: (input) =>
    buildAftermarketsResearchPacket({
      query: input.query,
      ...(config.aftermarketsApiKey ? { apiKey: config.aftermarketsApiKey } : {}),
    }),
  buildBrokerPositionResearchPacket: (input) =>
    buildAftermarketsResearchPacket({
      query: input.position.symbol,
      ...(config.aftermarketsApiKey ? { apiKey: config.aftermarketsApiKey } : {}),
    }),
});

export const createTradeAiWorkflowDependencies = (
  options: CreateTradeAiWorkflowServiceOptions = {},
): TradeAiWorkflowDependencies => ({
  config: options.config ?? {},
  brokerSources: {
    ...(options.config?.brokerDataProvider === "groww"
      ? growwTradeAiBrokerSources
      : options.config?.brokerDataProvider === "indstocks"
        ? indstocksTradeAiBrokerSources
        : defaultTradeAiBrokerSources),
    ...options.brokerSources,
  },
  marketSources: {
    ...defaultTradeAiMarketSources,
    ...options.marketSources,
  },
  researchSources: {
    ...defaultTradeAiResearchSources,
    ...(options.config?.researchDataProvider === "aftermarkets"
      ? createAftermarketsResearchSources(options.config)
      : {}),
    ...options.researchSources,
  },
  memorySource: {
    ...defaultTradeAiMemorySource,
    ...options.memorySource,
  },
  repositories: {
    ...defaultTradeAiRepositories,
    ...options.repositories,
  },
});
