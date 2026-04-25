import {
  fetchIndstocksHoldings,
  fetchIndstocksTradeBook,
  fetchUpstoxNseInstrumentProfiles,
  importManualHoldingsFromFile,
  importManualTradeBookFromFile,
} from "@tradeai/data-sources";
import {
  hasConfiguredDatabaseUrl,
  loadLatestPortfolioSnapshot,
  persistPortfolioSnapshotToDatabase,
} from "@tradeai/db";
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

const log = createLogger("app-services");

export interface PortfolioPersistenceOptions {
  databaseUrl?: string;
  persist?: boolean;
}

export interface BrokerPortfolioWorkflowInput {
  accessToken?: string;
  databaseUrl?: string;
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

export const canPersistPortfolioMemory = (databaseUrl?: string) =>
  hasConfiguredDatabaseUrl(databaseUrl);

const shouldPersistPortfolioMemory = (options?: PortfolioPersistenceOptions) =>
  options?.persist === false ? false : canPersistPortfolioMemory(options?.databaseUrl);

export const enrichBrokerHoldingsWithInstrumentNames = (
  holdings: readonly BrokerHolding[],
) =>
  Effect.gen(function* () {
    if (holdings.length === 0) {
      return [];
    }

    const profiles = yield* fetchUpstoxNseInstrumentProfiles().pipe(
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

export const getBrokerHoldings = (input: BrokerPortfolioWorkflowInput = {}) =>
  Effect.gen(function* () {
    const holdings = yield* fetchIndstocksHoldings(input.accessToken);
    return yield* enrichBrokerHoldingsWithInstrumentNames(holdings);
  });

export const getBrokerTradeBook = (input: BrokerTradeBookInput = {}) =>
  fetchIndstocksTradeBook(input.segment ?? "EQUITY", input.accessToken);

export const getBrokerPortfolioPositions = (input: BrokerPortfolioWorkflowInput = {}) =>
  getBrokerHoldings(input).pipe(Effect.map(normalizeBrokerHoldings));

export const getManualPortfolioPositions = (holdingsCsvPath: string) =>
  importManualHoldingsFromFile(holdingsCsvPath).pipe(Effect.map(normalizeBrokerHoldings));

export const getBrokerPortfolioSummary = (input: BrokerPortfolioWorkflowInput = {}) =>
  getBrokerPortfolioPositions(input).pipe(Effect.map(summarizePortfolioPositions));

export const summarizeBrokerHoldingsCollection = (holdings: readonly BrokerHolding[]) =>
  summarizePortfolioPositions(normalizeBrokerHoldings(holdings));

export const getManualPortfolioSummary = (holdingsCsvPath: string) =>
  getManualPortfolioPositions(holdingsCsvPath).pipe(Effect.map(summarizePortfolioPositions));

export const getBrokerPortfolioMemorySnapshot = (input: BrokerPortfolioWorkflowInput = {}) =>
  getBrokerPortfolioPositions(input).pipe(
    Effect.map((positions) => buildPortfolioMemorySnapshot(positions, "indstocks")),
  );

export const getManualPortfolioMemorySnapshot = (holdingsCsvPath: string) =>
  getManualPortfolioPositions(holdingsCsvPath).pipe(
    Effect.map((positions) => buildPortfolioMemorySnapshot(positions, "manual_csv")),
  );

export const persistBrokerPortfolioMemorySnapshot = (
  input: BrokerPortfolioWorkflowInput = {},
) =>
  Effect.gen(function* () {
    const snapshot = yield* getBrokerPortfolioMemorySnapshot(input);
    const fills = yield* getBrokerTradeBook({
      segment: "EQUITY",
      ...(input.accessToken ? { accessToken: input.accessToken } : {}),
    });
    const result = yield* Effect.tryPromise(() =>
      timed("app-services", "persistBrokerPortfolioMemorySnapshot", () =>
        persistPortfolioSnapshotToDatabase(snapshot, fills, input.databaseUrl),
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
) =>
  Effect.gen(function* () {
    const current = yield* getBrokerPortfolioMemorySnapshot(input);
    const previous = yield* Effect.tryPromise(() =>
      loadLatestPortfolioSnapshot("indstocks", input.databaseUrl),
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

export const syncBrokerPortfolio = (input: BrokerPortfolioWorkflowInput = {}) =>
  Effect.gen(function* () {
    const dbConfigured = canPersistPortfolioMemory(input.databaseUrl);
    log.info({ action: "syncBrokerPortfolio", dbConfigured }, "running portfolio sync");
    const current = yield* getBrokerPortfolioMemorySnapshot(input);
    const fills = yield* getBrokerTradeBook({
      segment: "EQUITY",
      ...(input.accessToken ? { accessToken: input.accessToken } : {}),
    });

    const previous = dbConfigured
      ? yield* Effect.tryPromise(() => loadLatestPortfolioSnapshot("indstocks", input.databaseUrl))
      : undefined;

    const persistence = dbConfigured
      ? yield* Effect.tryPromise(() =>
          timed("app-services", "syncBrokerPortfolio.persistSnapshot", () =>
            persistPortfolioSnapshotToDatabase(current, fills, input.databaseUrl),
          ),
        )
      : undefined;

    return buildPortfolioSyncReport(previous, current, fills.length, dbConfigured, persistence);
  });

export const importManualPortfolioSnapshot = (input: ManualPortfolioImportInput) =>
  Effect.gen(function* () {
    const positions = yield* getManualPortfolioPositions(input.holdingsCsvPath);
    const snapshot = buildPortfolioMemorySnapshot(positions, "manual_csv");
    const fills = input.tradesCsvPath
      ? yield* importManualTradeBookFromFile(input.tradesCsvPath)
      : [];
    const dbConfigured = shouldPersistPortfolioMemory(input.persistence);
    const previous = dbConfigured
      ? yield* Effect.tryPromise(() =>
          loadLatestPortfolioSnapshot("manual_csv", input.persistence?.databaseUrl),
        )
      : undefined;
    const persistence = dbConfigured
      ? yield* Effect.tryPromise(() =>
          persistPortfolioSnapshotToDatabase(snapshot, fills, input.persistence?.databaseUrl),
        )
      : undefined;

    return {
      snapshot,
      fills,
      report: buildPortfolioSyncReport(previous, snapshot, fills.length, dbConfigured, persistence),
    };
  });
