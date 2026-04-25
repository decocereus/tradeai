import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const defaultDependencies = createTradeAiWorkflowDependencies();

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
    const searchResults = yield* Effect.forEach(
      instrumentKeys,
      (instrumentKey) => dependencies.marketSources.searchEquityInstruments(instrumentKey, accessToken),
      { concurrency: 5 },
    ).pipe(Effect.map((groups) => groups.flat()));
    const quotes = yield* dependencies.marketSources.fetchEquityQuotes(instrumentKeys, accessToken);
    return dependencies.marketSources.buildEquityQuoteSnapshot(searchResults, quotes);
  });
