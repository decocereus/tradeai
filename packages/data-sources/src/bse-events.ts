import type { CorporateEvent } from "@tradeai/domain";
import { Effect } from "effect";

export const BSE_ANNOUNCEMENTS_FEED_URL = "https://www.bseindia.com/data/xml/announcements.xml";

const decodeXmlEntities = (text: string): string =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const matchTag = (input: string, tag: string): string | undefined => {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeXmlEntities(match[1].trim()) : undefined;
};

export const parseBseAnnouncementsXml = (xml: string): CorporateEvent[] => {
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  return itemMatches
    .map((item): CorporateEvent | null => {
      const title = matchTag(item, "title");
      const link = matchTag(item, "link");
      const description = matchTag(item, "description");
      const pubDate = matchTag(item, "pubDate");

      if (!title || !link || !description || !pubDate) {
        return null;
      }

      return {
        source: "bse_announcements",
        title,
        link,
        scripCode: matchTag(item, "scripcode"),
        description,
        publishedAt: pubDate,
      };
    })
    .filter((event): event is CorporateEvent => event !== null);
};

export const filterCorporateEvents = (
  query: string,
  events: readonly CorporateEvent[],
  limit = 20,
): CorporateEvent[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return events.slice(0, limit);

  return events
    .filter(
      (event) =>
        event.title.toLowerCase().includes(normalizedQuery) ||
        event.description.toLowerCase().includes(normalizedQuery) ||
        (event.scripCode?.toLowerCase().includes(normalizedQuery) ?? false),
    )
    .slice(0, limit);
};

export const fetchBseAnnouncements = (
  fetchImpl: typeof fetch = fetch,
  url = BSE_ANNOUNCEMENTS_FEED_URL,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`BSE announcements feed fetch failed with status ${response.status}`);
      }

      const xml = await response.text();
      return parseBseAnnouncementsXml(xml);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const searchBseAnnouncements = (query: string, fetchImpl: typeof fetch = fetch) =>
  fetchBseAnnouncements(fetchImpl).pipe(
    Effect.map((events) => filterCorporateEvents(query, events)),
  );

export const scoreCorporateEventSignal = (events: readonly CorporateEvent[]): number => {
  const signalWords = [
    "financial results",
    "board meeting",
    "joint venture",
    "settlement agreement",
    "allotment",
    "press release",
    "annual report",
    "acquisition",
  ];

  return events.reduce((score, event) => {
    const haystack = `${event.title} ${event.description}`.toLowerCase();
    const hitCount = signalWords.filter((word) => haystack.includes(word)).length;
    return score + hitCount;
  }, 0);
};
