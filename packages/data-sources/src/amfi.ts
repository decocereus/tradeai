import type { AmfiNavEntry } from "@tradeai/domain";
import { Effect } from "effect";

export const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export const parseAmfiNavLine = (line: string): AmfiNavEntry | null => {
  const parts = line.split(";");
  if (parts.length !== 6) return null;
  const normalizedParts = parts.map((part) => part.trim());
  const schemeCode = normalizedParts[0] ?? "";
  const isinDivPayoutOrGrowth = normalizedParts[1] ?? "";
  const isinDivReinvestment = normalizedParts[2] ?? "";
  const schemeName = normalizedParts[3] ?? "";
  const netAssetValue = normalizedParts[4] ?? "";
  const date = normalizedParts[5] ?? "";

  if (!schemeCode || !schemeName || !netAssetValue || !date) return null;
  if (schemeCode.toLowerCase() === "scheme code") return null;

  return {
    schemeCode,
    isinDivPayoutOrGrowth,
    isinDivReinvestment,
    schemeName,
    netAssetValue,
    date,
  };
};

export const parseAmfiNavText = (text: string): AmfiNavEntry[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseAmfiNavLine)
    .filter((entry): entry is AmfiNavEntry => entry !== null);

export const filterAmfiNavEntries = (
  query: string,
  entries: readonly AmfiNavEntry[],
  limit = 20,
): AmfiNavEntry[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return entries.slice(0, limit);

  return entries
    .filter(
      (entry) =>
        entry.schemeCode === normalizedQuery ||
        entry.schemeCode.includes(normalizedQuery) ||
        entry.schemeName.toLowerCase().includes(normalizedQuery) ||
        entry.isinDivPayoutOrGrowth.toLowerCase() === normalizedQuery ||
        entry.isinDivReinvestment.toLowerCase() === normalizedQuery,
    )
    .slice(0, limit);
};

export const fetchAmfiNavEntries = (
  fetchImpl: typeof fetch = fetch,
  url = AMFI_NAV_URL,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`AMFI NAV request failed with status ${response.status}`);
      }

      const text = await response.text();
      return parseAmfiNavText(text);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const searchAmfiNavEntries = (query: string) =>
  fetchAmfiNavEntries().pipe(
    Effect.map((entries) => filterAmfiNavEntries(query, entries)),
  );
