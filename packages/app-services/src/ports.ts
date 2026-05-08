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
  searchAmfiNavEntries,
  searchBseAnnouncements,
  searchGrowwInstrumentProfiles,
  searchGrowwInstruments,
} from "@tradeai/data-sources";
import {
  hasConfiguredDatabaseUrl,
  loadKnowledgeDocuments,
  loadHoldingReviewHistory,
  loadLatestPortfolioSnapshot,
  loadPreferredPortfolioDashboardRepositoryData,
  persistKnowledgeDocumentToDatabase,
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
  KnowledgeContext,
  KnowledgeDocument,
} from "@tradeai/domain";
import { loadKnowledgeContext, type KnowledgeRetrievalInput } from "@tradeai/knowledge";
import { loadMemoryContext, type MemoryContextInput } from "@tradeai/memory";
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
  buildEquityResearchPacket: (input: {
    query: string;
    accessToken?: string;
  }) => Effect.Effect<ResearchPacket, Error>;
  buildBrokerPositionResearchPacket: (input: {
    position: PortfolioPositionSnapshot;
    accessToken?: string;
  }) => Effect.Effect<ResearchPacket, Error>;
}

export interface TradeAiMemorySource {
  loadMemoryContext: (input?: MemoryContextInput) => Effect.Effect<MemoryContext, Error>;
}

export interface TradeAiKnowledgeSource {
  loadKnowledgeContext: (input: KnowledgeRetrievalInput) => Effect.Effect<KnowledgeContext, Error>;
}

export interface PortfolioSnapshotPersistenceResult {
  snapshotId: string;
  positionsInserted: number;
  tradeFillsInserted: number;
}

export interface HoldingReviewPersistenceResult {
  reviewsInserted: number;
}

export interface KnowledgeDocumentPersistenceResult {
  documentId: string;
  documentsInserted: number;
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
    broker?: BrokerSource,
    databaseUrl?: string,
  ) => Promise<HoldingReviewHistoryEntry[]>;
  loadKnowledgeDocuments: (
    databaseUrl?: string,
    limit?: number,
  ) => Promise<KnowledgeDocument[]>;
  persistHoldingReviewReport: (
    snapshotId: string,
    review: BrokerPortfolioReviewReport,
    databaseUrl?: string,
  ) => Promise<HoldingReviewPersistenceResult>;
  persistKnowledgeDocument: (
    document: KnowledgeDocument,
    databaseUrl?: string,
  ) => Promise<KnowledgeDocumentPersistenceResult>;
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
  knowledgeSource: TradeAiKnowledgeSource;
  repositories: TradeAiRepositories;
}

export interface CreateTradeAiWorkflowServiceOptions {
  config?: TradeAiRuntimeConfig;
  brokerSources?: Partial<TradeAiBrokerSources>;
  marketSources?: Partial<TradeAiMarketSources>;
  researchSources?: Partial<TradeAiResearchSources>;
  memorySource?: Partial<TradeAiMemorySource>;
  knowledgeSource?: Partial<TradeAiKnowledgeSource>;
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
  buildEquityResearchPacket: (input) =>
    buildAftermarketsResearchPacket({ query: input.query }),
  buildBrokerPositionResearchPacket: (input) =>
    buildAftermarketsResearchPacket({ query: input.position.symbol }),
};

export const defaultTradeAiMemorySource: TradeAiMemorySource = {
  loadMemoryContext: (input) => loadMemoryContext(input),
};

export const defaultTradeAiKnowledgeSource: TradeAiKnowledgeSource = {
  loadKnowledgeContext: (input) => loadKnowledgeContext(input),
};

export const defaultTradeAiRepositories: TradeAiRepositories = {
  hasConfiguredDatabaseUrl,
  loadLatestPortfolioSnapshot,
  persistPortfolioSnapshot: persistPortfolioSnapshotToDatabase,
  loadHoldingReviewHistory,
  loadKnowledgeDocuments,
  persistHoldingReviewReport: persistHoldingReviewReportToDatabase,
  persistKnowledgeDocument: persistKnowledgeDocumentToDatabase,
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
  knowledgeSource: {
    ...defaultTradeAiKnowledgeSource,
    ...options.knowledgeSource,
  },
  repositories: {
    ...defaultTradeAiRepositories,
    ...options.repositories,
  },
});
