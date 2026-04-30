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
import { MAX_EQUITY_QUOTE_KEYS } from "./market-workflows.ts";

const log = createLogger("app-services");

const defaultDependencies = createTradeAiWorkflowDependencies();

const chunkArray = <T>(items: readonly T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

interface PartialQuoteFetchError extends Error {
  quotes: readonly {
    instrumentKey: string;
    tradingSymbol?: string;
    lastPrice: number;
    closePrice?: number;
  }[];
  failures: readonly {
    instrumentKey: string;
    message: string;
  }[];
}

const isPartialQuoteFetchError = (error: Error): error is PartialQuoteFetchError =>
  Array.isArray((error as PartialQuoteFetchError).quotes) &&
  Array.isArray((error as PartialQuoteFetchError).failures);

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
): Effect.Effect<BrokerHolding, Error> =>
  Effect.gen(function* () {
    const navEntriesOutcome = yield* Effect.either(
      dependencies.marketSources.searchAmfiNav(holding.isin),
    );
    if (navEntriesOutcome._tag === "Left") {
      log.warn(
        { action: "enrichMutualFundHolding", isin: holding.isin, error: navEntriesOutcome.left },
        "AMFI NAV enrichment unavailable",
      );
      const {
        lastTradedPrice: _oldLastTradedPrice,
        closePrice: _oldClosePrice,
        marketValue: _oldMarketValue,
        pnlAbsolute: _oldPnlAbsolute,
        pnlPercent: _oldPnlPercent,
        priceProvenance: _oldPriceProvenance,
        ...holdingWithoutValuation
      } = holding;
      return {
        ...holdingWithoutValuation,
        priceProvenance: {
          status: "market_unavailable" as const,
          source: "fallback" as const,
          marketDataProvider: "amfi" as const,
          quoteSymbol: holding.isin,
          message: navEntriesOutcome.left.message,
        },
      } satisfies BrokerHolding;
    }

    const navEntries = navEntriesOutcome.right;
    const nav = navEntries[0];
    const navValue = nav ? Number(nav.netAssetValue) : Number.NaN;
    if (!nav || !Number.isFinite(navValue)) {
      const {
        lastTradedPrice: _lastTradedPrice,
        closePrice: _closePrice,
        marketValue: _marketValue,
        pnlAbsolute: _pnlAbsolute,
        pnlPercent: _pnlPercent,
        ...unvaluedHolding
      } = holding;
      return {
        ...unvaluedHolding,
        priceProvenance: {
          status: "market_missing" as const,
          source: "fallback" as const,
          marketDataProvider: "amfi" as const,
          quoteSymbol: holding.isin,
        },
      } satisfies BrokerHolding;
    }

    const marketValue = holding.quantity * navValue;
    const pnlAbsolute =
      holding.averagePrice > 0
        ? (navValue - holding.averagePrice) * holding.quantity
        : undefined;
    const pnlPercent =
      holding.averagePrice > 0
        ? ((navValue - holding.averagePrice) / holding.averagePrice) * 100
        : undefined;
    const {
      pnlAbsolute: _oldPnlAbsolute,
      pnlPercent: _oldPnlPercent,
      ...holdingWithoutPnl
    } = holding;
    return {
      ...holdingWithoutPnl,
      instrumentName: nav.schemeName,
      tradingSymbol: nav.schemeName,
      lastTradedPrice: navValue,
      closePrice: navValue,
      marketValue,
      ...(pnlAbsolute !== undefined ? { pnlAbsolute } : {}),
      ...(pnlPercent !== undefined ? { pnlPercent } : {}),
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
): NonNullable<PortfolioSyncReport["priceEnrichment"]> => {
  const providers = new Set(
    positions
      .map((position) => position.priceProvenance?.marketDataProvider)
      .filter((provider): provider is MarketDataProvider => Boolean(provider)),
  );
  const marketDataProvider =
    providers.size === 1 ? [...providers][0] ?? "groww" : "mixed";
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
    const resolveEquityMarketProfile = (holding: BrokerHolding) => {
      const normalizedHoldingSymbol = normalizeMarketSymbol(holding.tradingSymbol);
      const profile = profilesBySymbol.get(normalizedHoldingSymbol);
      return {
        profile,
        instrumentName: profile?.name || profile?.shortName || holding.instrumentName,
        marketSymbol: profile?.tradingSymbol ?? normalizedHoldingSymbol,
      };
    };
    const equityHoldings = holdings.filter((holding) => holding.exchangeSegment !== "MF");
    const marketSymbols = [
      ...new Set(equityHoldings.map((holding) => resolveEquityMarketProfile(holding).marketSymbol)),
    ];
    const marketSymbolChunks = chunkArray(marketSymbols, MAX_EQUITY_QUOTE_KEYS);
    const quoteResults = yield* Effect.forEach(
      marketSymbolChunks,
      (marketSymbolChunk) =>
        Effect.either(
          dependencies.marketSources.fetchEquityQuotes(marketSymbolChunk, input.marketAccessToken),
        ),
      { concurrency: 1 },
    );
    const quotesByMarketSymbol = new Map(
      quoteResults
        .flatMap((result) =>
          result._tag === "Right"
            ? result.right
            : isPartialQuoteFetchError(result.left)
              ? result.left.quotes
              : [],
        )
        .map((quote) => [
          normalizeMarketSymbol(quote.tradingSymbol ?? quote.instrumentKey),
          quote,
        ]),
    );
    const quoteFailuresByMarketSymbol = new Map<string, string>();
    quoteResults.forEach((result, index) => {
      if (result._tag !== "Left") return;
      if (isPartialQuoteFetchError(result.left)) {
        result.left.failures.forEach((failure) => {
          quoteFailuresByMarketSymbol.set(normalizeMarketSymbol(failure.instrumentKey), failure.message);
        });
        return;
      }
      marketSymbolChunks[index]?.forEach((marketSymbol) => {
        quoteFailuresByMarketSymbol.set(normalizeMarketSymbol(marketSymbol), result.left.message);
      });
    });

    return yield* Effect.all(
      holdings.map((holding) =>
        Effect.gen(function* () {
          if (holding.exchangeSegment === "MF") {
            return yield* enrichMutualFundHolding(holding, dependencies);
          }

          const { instrumentName, marketSymbol } = resolveEquityMarketProfile(holding);
          const normalizedMarketSymbol = normalizeMarketSymbol(marketSymbol);
          const quote = quotesByMarketSymbol.get(normalizedMarketSymbol);
          const quoteFetchError = quoteFailuresByMarketSymbol.get(normalizedMarketSymbol);
          const hasBrokerValuation =
            holding.lastTradedPrice !== undefined || holding.marketValue !== undefined;
          const priceProvenance =
            quote
              ? {
                  status: "market_enriched" as const,
                  source: "market" as const,
                  marketDataProvider,
                  quoteSymbol: quote.tradingSymbol ?? marketSymbol,
                }
              : quoteFetchError
                ? {
                    ...(hasBrokerValuation
                      ? {
                          status: "broker" as const,
                          source: "broker" as const,
                        }
                      : {
                          status: "market_unavailable" as const,
                          source: "fallback" as const,
                          marketDataProvider,
                          quoteSymbol: marketSymbol,
                        }),
                    message: quoteFetchError,
                  }
                : hasBrokerValuation
                  ? {
                      status: "broker" as const,
                      source: "broker" as const,
                    }
                  : {
                      status: "market_missing" as const,
                      source: "fallback" as const,
                      marketDataProvider,
                      quoteSymbol: marketSymbol,
                    };

          const lastTradedPrice = quote?.lastPrice ?? holding.lastTradedPrice;
          const closePrice = quote?.closePrice ?? holding.closePrice;
          const marketValue =
            lastTradedPrice === undefined
              ? holding.marketValue
              : holding.quantity * lastTradedPrice;
          const pnlAbsolute =
            lastTradedPrice === undefined || holding.averagePrice <= 0
              ? holding.pnlAbsolute
              : (lastTradedPrice - holding.averagePrice) * holding.quantity;
          const pnlPercent =
            lastTradedPrice === undefined || holding.averagePrice <= 0
              ? holding.pnlPercent
              : ((lastTradedPrice - holding.averagePrice) / holding.averagePrice) * 100;
          const {
            lastTradedPrice: _oldLastTradedPrice,
            closePrice: _oldClosePrice,
            marketValue: _oldMarketValue,
            pnlAbsolute: _oldPnlAbsolute,
            pnlPercent: _oldPnlPercent,
            ...holdingWithoutValuation
          } = holding;

          return {
            ...holdingWithoutValuation,
            ...(instrumentName ? { instrumentName } : {}),
            ...(lastTradedPrice !== undefined ? { lastTradedPrice } : {}),
            ...(closePrice !== undefined ? { closePrice } : {}),
            ...(marketValue !== undefined ? { marketValue } : {}),
            ...(pnlAbsolute !== undefined ? { pnlAbsolute } : {}),
            ...(pnlPercent !== undefined ? { pnlPercent } : {}),
            priceProvenance,
          };
        }),
      ),
      { concurrency: 8 },
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
    ? summarizePriceEnrichment(current.positions)
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
  syncBrokerPortfolioSnapshot(input, dependencies).pipe(Effect.map((result) => result.report));

export const syncBrokerPortfolioSnapshot = (
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

    return {
      snapshot: current,
      fills,
      report: buildPortfolioSyncReport(previous, current, fills.length, dbConfigured, persistence, tradeBook),
    };
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
