import {
  buildUpstoxQuoteSnapshot,
  fetchBseAnnouncements,
  fetchUpstoxNseInstrumentProfiles,
  fetchUpstoxQuoteSnapshot,
  searchAmfiNavEntries,
  searchBseAnnouncements,
  searchUpstoxInstrumentProfiles,
  searchUpstoxInstruments,
} from "@tradeai/data-sources";
import { Effect } from "effect";

export const lookupAmfiNav = (query: string) => searchAmfiNavEntries(query);
export const lookupCorporateEvents = (query: string) => searchBseAnnouncements(query);
export const getCorporateEvents = () => fetchBseAnnouncements();
export const searchEquities = (query: string) => searchUpstoxInstrumentProfiles(query);
export const getEquityProfiles = () => fetchUpstoxNseInstrumentProfiles();

export const getEquityQuoteSnapshots = (
  instrumentKeys: readonly string[],
  accessToken?: string,
) =>
  Effect.gen(function* () {
    const searchResults = yield* Effect.forEach(
      instrumentKeys,
      (instrumentKey) => searchUpstoxInstruments({ query: instrumentKey }, accessToken),
      { concurrency: 5 },
    ).pipe(Effect.map((groups) => groups.flat()));
    const quotes = yield* fetchUpstoxQuoteSnapshot(instrumentKeys, accessToken);
    return buildUpstoxQuoteSnapshot(searchResults, quotes);
  });
