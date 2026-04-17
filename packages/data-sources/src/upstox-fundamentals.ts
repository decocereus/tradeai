import type {
  UpstoxFundamentalMetric,
  UpstoxFundamentalsSnapshot,
  UpstoxRevenueStatementRow,
} from "@tradeai/domain";
import { Effect } from "effect";

export const buildUpstoxStockPageUrl = (isin: string) =>
  `https://upstox.com/stocks/company-share-price/${isin}/`;

const extractSection = (html: string, startMarker: string, endMarker: string): string => {
  const startIndex = html.indexOf(startMarker);
  if (startIndex < 0) return "";
  const endIndex = html.indexOf(endMarker, startIndex);
  if (endIndex < 0) return html.slice(startIndex);
  return html.slice(startIndex, endIndex);
};

const stripHtmlComments = (html: string): string => html.replace(/<!--\s*-->/g, "");

export const parseCroreNumber = (value: string): number | undefined => {
  const normalized = value.replace(/[₹,%]/g, "").replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parsePercentNumber = (value: string): number | undefined => {
  const normalized = value.replace(/%/g, "").replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseUpstoxFundamentalMetrics = (html: string): UpstoxFundamentalMetric[] => {
  const section = extractSection(html, 'id="Fundamentals"', 'id="Shareholder returns"');
  const metricMatches = section.matchAll(
    /text-gray-accent3">([^<]+)<\/div>\s*<div class="text-sm font-medium leading-5 text-light-black">([^<]+)<\/div>/g,
  );

  return Array.from(metricMatches, ([, label, value]) => ({
    label: (label ?? "").trim(),
    value: stripHtmlComments(value ?? "").trim(),
  }));
};

export const parseUpstoxRevenueStatement = (html: string): UpstoxRevenueStatementRow[] => {
  const section = extractSection(html, 'id="Revenue statement"', 'id="Cash flow"');
  const cleaned = stripHtmlComments(section);
  const rowMatches = cleaned.matchAll(
    /<tr>\s*<td[^>]*><div[^>]*>([^<]+)<\/div><\/td>\s*<td[^>]*><div[^>]*>₹([^<]+)<\/div><\/td>\s*<td[^>]*><div[^>]*>₹([^<]+)<\/div><\/td>\s*<td[^>]*><div[^>]*>₹([^<]+)<\/div><\/td>\s*<\/tr>/g,
  );

  return Array.from(rowMatches, ([, year, revenue, operatingProfit, netProfit]) => ({
    year: (year ?? "").trim(),
    revenueCrores: parseCroreNumber(revenue ?? "") ?? 0,
    operatingProfitCrores: parseCroreNumber(operatingProfit ?? "") ?? 0,
    netProfitCrores: parseCroreNumber(netProfit ?? "") ?? 0,
  }));
};

export const parseUpstoxCompanyName = (html: string): string | undefined => {
  const match = html.match(/<h2[^>]*>([^<]+) Fundamentals<\/h2>/);
  return match?.[1]?.trim() || undefined;
};

export const parseUpstoxMarketCapCrores = (html: string): number | undefined => {
  const match = html.match(/market capitalization of [^₹]*₹([\d,]+(?:\.\d+)?) Crs/i);
  return match ? parseCroreNumber(match[1] ?? "") : undefined;
};

export const parseUpstoxFundamentalsSnapshot = (
  html: string,
  isin: string,
): UpstoxFundamentalsSnapshot => ({
  isin,
  companyName: parseUpstoxCompanyName(html),
  marketCapCrores: parseUpstoxMarketCapCrores(html),
  fundamentalMetrics: parseUpstoxFundamentalMetrics(html),
  revenueStatement: parseUpstoxRevenueStatement(html),
});

export const fetchUpstoxFundamentalsSnapshot = (
  isin: string,
  fetchImpl: typeof fetch = fetch,
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(buildUpstoxStockPageUrl(isin));
      if (!response.ok) {
        throw new Error(`Upstox fundamentals page fetch failed with status ${response.status}`);
      }

      const html = await response.text();
      return parseUpstoxFundamentalsSnapshot(html, isin);
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
