import {
  importManualHoldingsFromFile,
  importManualTradeBookFromFile,
} from "@tradeai/data-sources";
import type {
  BrokerHolding,
  BrokerSource,
  MarketDataProvider,
  PortfolioMemorySnapshot,
  PortfolioSyncReport,
  PortfolioPositionSnapshot,
} from "@tradeai/domain";
import {
  buildPortfolioMemorySnapshot,
  diffPortfolioMemorySnapshots,
} from "@tradeai/memory";
import { createLogger, timed } from "@tradeai/observability";
import {
  normalizeBrokerHoldings,
  summarizePortfolioPositions,
} from "@tradeai/portfolio-engine";
import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const log = createLogger("app-services");

const defaultDependencies = createTradeAiWorkflowDependencies();

export interface PortfolioPersistenceOptions {
  databaseUrl?: string;
  persist?: boolean;
}

export interface BrokerPortfolioWorkflowInput {
  accessToken?: string;
  marketAccessToken?: string;
  databaseUrl?: string;
  persist?: boolean;
}

export interface BrokerTradeBookInput {
  accessToken?: string;
  segment?: "EQUITY" | "DERIVATIVE";
}

export interface ManualPortfolioImportInput {
  holdingsCsvPath: string;
  tradesCsvPath?: string;
  persistence?: PortfolioPersistenceOptions;
}

export const canPersistPortfolioMemory = (
  databaseUrl?: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.repositories.hasConfiguredDatabaseUrl(databaseUrl);

const shouldPersistPortfolioMemory = (
  options?: PortfolioPersistenceOptions,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  options?.persist === false
    ? false
    : dependencies.repositories.hasConfiguredDatabaseUrl(options?.databaseUrl);

const inferBrokerSourceFromPositions = (
  positions: readonly PortfolioPositionSnapshot[],
  fallback: BrokerSource = "indstocks",
): BrokerSource => positions[0]?.sourceBroker ?? fallback;

const inferMarketDataProvider = (
  dependencies: TradeAiWorkflowDependencies,
): MarketDataProvider => dependencies.config.marketDataProvider ?? "groww";

const normalizeMarketSymbol = (symbol: string) =>
  symbol
    .replace(/-EQ$/i, "")
    .replace(/_[A-Z]+$/i, "")
    .toUpperCase();

const enrichMutualFundHolding = (
  holding: BrokerHolding,
  dependencies: TradeAiWorkflowDependencies,
) =>
  Effect.gen(function* () {
    const navEntries = yield* dependencies.marketSources.searchAmfiNav(holding.isin).pipe(
      Effect.catchAll((error) => {
        log.warn({ action: "enrichMutualFundHolding", isin: holding.isin, error }, "AMFI NAV enrichment unavailable");
        return Effect.succeed([]);
      }),
    );
    const nav = navEntries[0];
    const navValue = nav ? Number(nav.netAssetValue) : Number.NaN;
    if (!nav || !Number.isFinite(navValue)) {
      return {
        ...holding,
        priceProvenance: {
          status: "market_missing" as const,
          source: "fallback" as const,
          marketDataProvider: "amfi" as const,
          quoteSymbol: holding.isin,
        },
      };
    }

    const marketValue = holding.quantity * navValue;
    return {
      ...holding,
      instrumentName: nav.schemeName,
      tradingSymbol: nav.schemeName,
      lastTradedPrice: navValue,
      closePrice: navValue,
      marketValue,
      pnlAbsolute: holding.averagePrice > 0 ? (navValue - holding.averagePrice) * holding.quantity : 0,
      pnlPercent: holding.averagePrice > 0 ? ((navValue - holding.averagePrice) / holding.averagePrice) * 100 : 0,
      priceProvenance: {
        status: "market_enriched" as const,
        source: "market" as const,
        marketDataProvider: "amfi" as const,
        quoteSymbol: holding.isin,
      },
    };
  });

const summarizePriceEnrichment = (
  positions: readonly PortfolioPositionSnapshot[],
  marketDataProvider: MarketDataProvider,
): NonNullable<PortfolioSyncReport["priceEnrichment"]> => {
  const enrichedPositions = positions.filter(
    (position) => position.priceProvenance?.status === "market_enriched",
  ).length;
  const missingSymbols = positions
    .filter((position) =>
      ["market_missing", "market_unavailable"].includes(position.priceProvenance?.status ?? ""),
    )
    .map((position) => position.symbol);

  return {
    marketDataProvider,
    enrichedPositions,
    fallbackPositions: missingSymbols.length,
    missingSymbols,
  };
};

export const enrichBrokerHoldingsWithMarketData = (
  holdings: readonly BrokerHolding[],
  input: Pick<BrokerPortfolioWorkflowInput, "marketAccessToken"> = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    if (holdings.length === 0) {
      return [];
    }

    const marketDataProvider = inferMarketDataProvider(dependencies);
    const profiles = yield* dependencies.marketSources.fetchNseInstrumentProfiles().pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          log.warn(
            { action: "enrichBrokerHoldingsWithMarketData.profiles", error },
            "instrument-name enrichment unavailable",
          );
          return [];
        }),
      ),
    );
    const profilesBySymbol = new Map(
      profiles.map((profile) => [profile.tradingSymbol.toUpperCase(), profile]),
    );

    return yield* Effect.all(
      holdings.map((holding) =>
        Effect.gen(function* () {
          if (holding.exchangeSegment === "MF") {
            return yield* enrichMutualFundHolding(holding, dependencies);
          }

          const normalizedHoldingSymbol = normalizeMarketSymbol(holding.tradingSymbol);
          const profile = profilesBySymbol.get(normalizedHoldingSymbol);
          const instrumentName = profile?.name || profile?.shortName || holding.instrumentName;
          const marketSymbol = profile?.tradingSymbol ?? normalizeMarketSymbol(holding.tradingSymbol);
          const quoteResult = yield* Effect.either(
            dependencies.marketSources.fetchEquityQuotes([marketSymbol], input.marketAccessToken),
          );
          const quote =
            quoteResult._tag === "Right"
              ? quoteResult.right.find(
                  (entry) => normalizeMarketSymbol(entry.tradingSymbol ?? entry.instrumentKey) === marketSymbol,
                )
              : undefined;
          const priceProvenance =
            quote
              ? {
                  status: "market_enriched" as const,
                  source: "market" as const,
                  marketDataProvider,
                  quoteSymbol: quote.tradingSymbol ?? marketSymbol,
                }
              : quoteResult._tag === "Left"
                ? {
                    status: "market_unavailable" as const,
                    source: "fallback" as const,
                    marketDataProvider,
                    quoteSymbol: marketSymbol,
                    message: quoteResult.left.message,
                  }
                : {
                    status: "market_missing" as const,
                    source: "fallback" as const,
                    marketDataProvider,
                    quoteSymbol: marketSymbol,
                  };

          const lastTradedPrice = quote?.lastPrice ?? holding.lastTradedPrice;
          const closePrice = quote?.closePrice ?? holding.closePrice;
          const marketValue = holding.quantity * lastTradedPrice;
          const pnlAbsolute = (lastTradedPrice - holding.averagePrice) * holding.quantity;
          const pnlPercent =
            holding.averagePrice > 0 ? ((lastTradedPrice - holding.averagePrice) / holding.averagePrice) * 100 : 0;

          return {
            ...holding,
            ...(instrumentName ? { instrumentName } : {}),
            lastTradedPrice,
            closePrice,
            marketValue,
            pnlAbsolute,
            pnlPercent,
            priceProvenance,
          };
        }),
      ),
    );
  });

export const enrichBrokerHoldingsWithInstrumentNames = enrichBrokerHoldingsWithMarketData;

export const getBrokerHoldings = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const holdings = yield* dependencies.brokerSources.fetchBrokerHoldings(input.accessToken);
    return yield* enrichBrokerHoldingsWithMarketData(holdings, input, dependencies);
  });

export const getBrokerTradeBook = (
  input: BrokerTradeBookInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.brokerSources.fetchBrokerTradeBook(input.segment ?? "EQUITY", input.accessToken);

export const getBrokerPortfolioPositions = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => getBrokerHoldings(input, dependencies).pipe(Effect.map(normalizeBrokerHoldings));

export const getManualPortfolioPositions = (holdingsCsvPath: string) =>
  importManualHoldingsFromFile(holdingsCsvPath).pipe(Effect.map(normalizeBrokerHoldings));

export const getBrokerPortfolioSummary = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => getBrokerPortfolioPositions(input, dependencies).pipe(Effect.map(summarizePortfolioPositions));

export const summarizeBrokerHoldingsCollection = (holdings: readonly BrokerHolding[]) =>
  summarizePortfolioPositions(normalizeBrokerHoldings(holdings));

export const getManualPortfolioSummary = (holdingsCsvPath: string) =>
  getManualPortfolioPositions(holdingsCsvPath).pipe(Effect.map(summarizePortfolioPositions));

export const getBrokerPortfolioMemorySnapshot = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  getBrokerPortfolioPositions(input, dependencies).pipe(
    Effect.map((positions) =>
      buildPortfolioMemorySnapshot(positions, inferBrokerSourceFromPositions(positions)),
    ),
  );

export const getManualPortfolioMemorySnapshot = (holdingsCsvPath: string) =>
  getManualPortfolioPositions(holdingsCsvPath).pipe(
    Effect.map((positions) => buildPortfolioMemorySnapshot(positions, "manual_csv")),
  );

export const persistBrokerPortfolioMemorySnapshot = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const snapshot = yield* getBrokerPortfolioMemorySnapshot(input, dependencies);
    const fills = yield* getBrokerTradeBook(
      {
        segment: "EQUITY",
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      },
      dependencies,
    ).pipe(
      Effect.catchAll((error) => {
        log.warn({ action: "persistBrokerPortfolioMemorySnapshot", error }, "trade-book unavailable");
        return Effect.succeed([]);
      }),
    );
    const result = yield* Effect.tryPromise(() =>
      timed("app-services", "persistBrokerPortfolioMemorySnapshot", () =>
        dependencies.repositories.persistPortfolioSnapshot(snapshot, fills, input.databaseUrl),
      ),
    );

    return {
      snapshot,
      fills,
      persistence: result,
    };
  });

export const diffBrokerPortfolioAgainstLatestSnapshot = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const current = yield* getBrokerPortfolioMemorySnapshot(input, dependencies);
    const previous = yield* Effect.tryPromise(() =>
      dependencies.repositories.loadLatestPortfolioSnapshot(current.broker, input.databaseUrl),
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
  tradeBook?: NonNullable<PortfolioSyncReport["tradeBook"]>,
): PortfolioSyncReport => {
  const diff = diffPortfolioMemorySnapshots(previous, current);
  const priceEnrichment = current.positions.some((position) => position.priceProvenance)
    ? summarizePriceEnrichment(
        current.positions,
        current.positions.find((position) => position.priceProvenance?.marketDataProvider)?.priceProvenance?.marketDataProvider ?? "groww",
      )
    : undefined;
  return {
    broker: current.broker,
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
    ...(priceEnrichment ? { priceEnrichment } : {}),
    ...(tradeBook ? { tradeBook } : {}),
    diff,
  };
};

export const syncBrokerPortfolio = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const dbConfigured = canPersistPortfolioMemory(input.databaseUrl, dependencies);
    const shouldPersist = input.persist === false ? false : dbConfigured;
    log.info({ action: "syncBrokerPortfolio", dbConfigured }, "running portfolio sync");
    const current = yield* getBrokerPortfolioMemorySnapshot(input, dependencies);
    const tradeBookResult = yield* Effect.either(getBrokerTradeBook(
      {
        segment: "EQUITY",
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      },
      dependencies,
    ));
    const fills = tradeBookResult._tag === "Right" ? tradeBookResult.right : [];
    const tradeBook =
      tradeBookResult._tag === "Right"
        ? { status: "available" as const }
        : {
            status: tradeBookResult.left.message.includes("not implemented") ? "unsupported" as const : "unavailable" as const,
            message: tradeBookResult.left.message,
          };
    if (tradeBookResult._tag === "Left") {
      log.warn({ action: "syncBrokerPortfolio.tradeBook", error: tradeBookResult.left }, "trade-book unavailable");
    }

    const previous = dbConfigured
      ? yield* Effect.tryPromise(() =>
          dependencies.repositories.loadLatestPortfolioSnapshot(current.broker, input.databaseUrl),
        )
      : undefined;

    const persistence = shouldPersist
      ? yield* Effect.tryPromise(() =>
          timed("app-services", "syncBrokerPortfolio.persistSnapshot", () =>
            dependencies.repositories.persistPortfolioSnapshot(current, fills, input.databaseUrl),
          ),
        )
      : undefined;

    return buildPortfolioSyncReport(previous, current, fills.length, dbConfigured, persistence, tradeBook);
  });

export const importManualPortfolioSnapshot = (
  input: ManualPortfolioImportInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const positions = yield* getManualPortfolioPositions(input.holdingsCsvPath);
    const snapshot = buildPortfolioMemorySnapshot(positions, "manual_csv");
    const fills = input.tradesCsvPath
      ? yield* importManualTradeBookFromFile(input.tradesCsvPath)
      : [];
    const dbConfigured = shouldPersistPortfolioMemory(input.persistence, dependencies);
    const previous = dbConfigured
      ? yield* Effect.tryPromise(() =>
          dependencies.repositories.loadLatestPortfolioSnapshot(
            "manual_csv",
            input.persistence?.databaseUrl,
          ),
        )
      : undefined;
    const persistence = dbConfigured
      ? yield* Effect.tryPromise(() =>
          dependencies.repositories.persistPortfolioSnapshot(
            snapshot,
            fills,
            input.persistence?.databaseUrl,
          ),
        )
      : undefined;

    return {
      snapshot,
      fills,
      report: buildPortfolioSyncReport(previous, snapshot, fills.length, dbConfigured, persistence),
    };
  });
