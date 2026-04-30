import type { EquityQuoteEntry, EquityQuoteSnapshot } from "@tradeai/domain";
import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const defaultDependencies = createTradeAiWorkflowDependencies();
export const MAX_EQUITY_QUOTE_KEYS = 50;

export const normalizeEquityQuoteKeys = (instrumentKeys: readonly string[]): readonly string[] => {
  const normalizedByKey = new Map<string, string>();
  for (const instrumentKey of instrumentKeys) {
    const trimmed = instrumentKey.trim();
    if (!trimmed) continue;
    const dedupeKey = trimmed.toUpperCase();
    if (!normalizedByKey.has(dedupeKey)) {
      normalizedByKey.set(dedupeKey, trimmed);
    }
  }
  return [...normalizedByKey.values()];
};

interface PartialQuoteFetchError extends Error {
  quotes: readonly EquityQuoteEntry[];
  failures?: readonly {
    instrumentKey: string;
    message: string;
  }[];
}

const isPartialQuoteFetchError = (error: Error): error is PartialQuoteFetchError =>
  Array.isArray((error as PartialQuoteFetchError).quotes);

export interface EquityQuoteSnapshotFailure {
  instrumentKey: string;
  message: string;
}

export class PartialEquityQuoteSnapshotsError extends Error {
  readonly snapshots: readonly EquityQuoteSnapshot[];
  readonly failures: readonly EquityQuoteSnapshotFailure[];

  constructor(
    snapshots: readonly EquityQuoteSnapshot[],
    failures: readonly EquityQuoteSnapshotFailure[],
  ) {
    super(`Equity quote snapshots partially failed for ${failures.length} instrument(s).`);
    this.name = "PartialEquityQuoteSnapshotsError";
    this.snapshots = snapshots;
    this.failures = failures;
  }
}

export const lookupAmfiNav = (
  query: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.marketSources.searchAmfiNav(query);

export const lookupCorporateEvents = (
  query: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.marketSources.searchCorporateEvents(query);

export const getCorporateEvents = (
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.marketSources.fetchCorporateEvents();

export const searchEquities = (
  query: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.marketSources.searchEquityProfiles(query);

export const getEquityProfiles = (
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) => dependencies.marketSources.fetchNseInstrumentProfiles();

export const getEquityQuoteSnapshots = (
  instrumentKeys: readonly string[],
  accessToken?: string,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
) =>
  Effect.gen(function* () {
    const normalizedInstrumentKeys = normalizeEquityQuoteKeys(instrumentKeys);
    if (normalizedInstrumentKeys.length === 0) {
      return [];
    }
    if (normalizedInstrumentKeys.length > MAX_EQUITY_QUOTE_KEYS) {
      return yield* Effect.fail(
        new Error(`Too many instrument keys. Maximum allowed is ${MAX_EQUITY_QUOTE_KEYS}.`),
      );
    }

    const searchResults = yield* Effect.forEach(
      normalizedInstrumentKeys,
      (instrumentKey) => dependencies.marketSources.searchEquityInstruments(instrumentKey, accessToken),
      { concurrency: 5 },
    ).pipe(Effect.map((groups) => groups.flat()));
    const quoteResult = yield* dependencies.marketSources
      .fetchEquityQuotes(normalizedInstrumentKeys, accessToken)
      .pipe(Effect.either);
    if (quoteResult._tag === "Right") {
      return dependencies.marketSources.buildEquityQuoteSnapshot(searchResults, quoteResult.right);
    }
    if (!isPartialQuoteFetchError(quoteResult.left)) {
      return yield* Effect.fail(quoteResult.left);
    }

    const snapshots = dependencies.marketSources.buildEquityQuoteSnapshot(
      searchResults,
      quoteResult.left.quotes,
    );
    return yield* Effect.fail(
      new PartialEquityQuoteSnapshotsError(snapshots, quoteResult.left.failures ?? []),
    );
  });
