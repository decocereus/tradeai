import {
  importManualHoldingsFromFile,
  importManualTradeBookFromFile,
} from "@tradeai/data-sources";
import type {
  BrokerHolding,
  PortfolioMemorySnapshot,
  PortfolioSyncReport,
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

export const enrichBrokerHoldingsWithInstrumentNames = (
  holdings: readonly BrokerHolding[],
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    if (holdings.length === 0) {
      return [];
    }

    const profiles = yield* dependencies.marketSources.fetchNseInstrumentProfiles().pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          log.warn(
            { action: "enrichBrokerHoldingsWithInstrumentNames", error },
            "instrument-name enrichment unavailable",
          );
          return [];
        }),
      ),
    );
    const profilesBySymbol = new Map(
      profiles.map((profile) => [profile.tradingSymbol.toUpperCase(), profile]),
    );

    return holdings.map((holding) => {
      const normalizedHoldingSymbol = holding.tradingSymbol.replace(/-EQ$/i, "").toUpperCase();
      const profile = profilesBySymbol.get(normalizedHoldingSymbol);
      const instrumentName = profile?.name || profile?.shortName || holding.instrumentName;

      return instrumentName
        ? {
            ...holding,
            instrumentName,
          }
        : holding;
    });
  });

export const getBrokerHoldings = (
  input: BrokerPortfolioWorkflowInput = {},
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const holdings = yield* dependencies.brokerSources.fetchBrokerHoldings(input.accessToken);
    return yield* enrichBrokerHoldingsWithInstrumentNames(holdings, dependencies);
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
    Effect.map((positions) => buildPortfolioMemorySnapshot(positions, "indstocks")),
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
      dependencies.repositories.loadLatestPortfolioSnapshot("indstocks", input.databaseUrl),
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
): PortfolioSyncReport => {
  const diff = diffPortfolioMemorySnapshots(previous, current);
  return {
    broker: "indstocks",
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
    const fills = yield* getBrokerTradeBook(
      {
        segment: "EQUITY",
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      },
      dependencies,
    );

    const previous = dbConfigured
      ? yield* Effect.tryPromise(() =>
          dependencies.repositories.loadLatestPortfolioSnapshot("indstocks", input.databaseUrl),
        )
      : undefined;

    const persistence = shouldPersist
      ? yield* Effect.tryPromise(() =>
          timed("app-services", "syncBrokerPortfolio.persistSnapshot", () =>
            dependencies.repositories.persistPortfolioSnapshot(current, fills, input.databaseUrl),
          ),
        )
      : undefined;

    return buildPortfolioSyncReport(previous, current, fills.length, dbConfigured, persistence);
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
