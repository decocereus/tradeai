import {
  buildEquityResearchPacket,
  buildIndstocksResearchPacketForPosition,
  buildPublicEquityResearchPacket,
  buildUpstoxQuoteSnapshot,
  fetchBseAnnouncements,
  fetchIndstocksHoldings,
  fetchIndstocksTradeBook,
  fetchUpstoxNseInstrumentProfiles,
  fetchUpstoxQuoteSnapshot,
  loadDemoResearchPacket,
  searchAmfiNavEntries,
  searchBseAnnouncements,
  searchUpstoxInstrumentProfiles,
  searchUpstoxInstruments,
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
  UpstoxInstrumentSearchEntry,
  UpstoxInstrumentProfile,
  UpstoxQuoteEntry,
  UpstoxQuoteSnapshot,
} from "@tradeai/domain";
import { loadMemoryContext } from "@tradeai/memory";
import { Effect } from "effect";

export interface TradeAiRuntimeConfig {
  accessToken?: string;
  brokerAccessToken?: string;
  marketAccessToken?: string;
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
  fetchNseInstrumentProfiles: () => Effect.Effect<readonly UpstoxInstrumentProfile[], Error>;
  searchAmfiNav: (query: string) => Effect.Effect<readonly AmfiNavEntry[], Error>;
  searchCorporateEvents: (query: string) => Effect.Effect<readonly CorporateEvent[], Error>;
  fetchCorporateEvents: () => Effect.Effect<readonly CorporateEvent[], Error>;
  searchEquityProfiles: (query: string) => Effect.Effect<readonly UpstoxInstrumentProfile[], Error>;
  searchEquityInstruments: (
    query: string,
    accessToken?: string,
  ) => Effect.Effect<readonly UpstoxInstrumentSearchEntry[], Error>;
  fetchEquityQuotes: (
    instrumentKeys: readonly string[],
    accessToken?: string,
  ) => Effect.Effect<readonly UpstoxQuoteEntry[], Error>;
  buildEquityQuoteSnapshot: (
    searchResults: readonly (UpstoxInstrumentSearchEntry | UpstoxInstrumentProfile)[],
    quotes: readonly UpstoxQuoteEntry[],
  ) => readonly UpstoxQuoteSnapshot[];
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

export const defaultTradeAiMarketSources: TradeAiMarketSources = {
  fetchNseInstrumentProfiles: fetchUpstoxNseInstrumentProfiles,
  searchAmfiNav: searchAmfiNavEntries,
  searchCorporateEvents: searchBseAnnouncements,
  fetchCorporateEvents: fetchBseAnnouncements,
  searchEquityProfiles: searchUpstoxInstrumentProfiles,
  searchEquityInstruments: (query, accessToken) =>
    searchUpstoxInstruments({ query }, accessToken),
  fetchEquityQuotes: fetchUpstoxQuoteSnapshot,
  buildEquityQuoteSnapshot: buildUpstoxQuoteSnapshot,
};

export const defaultTradeAiResearchSources: TradeAiResearchSources = {
  loadDemoResearchPacket: () => loadDemoResearchPacket,
  buildEquityResearchPacket,
  buildPublicEquityResearchPacket,
  buildBrokerPositionResearchPacket: buildIndstocksResearchPacketForPosition,
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

export const createTradeAiWorkflowDependencies = (
  options: CreateTradeAiWorkflowServiceOptions = {},
): TradeAiWorkflowDependencies => ({
  config: options.config ?? {},
  brokerSources: {
    ...defaultTradeAiBrokerSources,
    ...options.brokerSources,
  },
  marketSources: {
    ...defaultTradeAiMarketSources,
    ...options.marketSources,
  },
  researchSources: {
    ...defaultTradeAiResearchSources,
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
