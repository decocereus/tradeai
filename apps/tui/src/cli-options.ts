import {
  MAX_EQUITY_QUOTE_KEYS,
  normalizeEquityQuoteKeys,
} from "@tradeai/app-services";

type BrokerSource = "groww" | "indstocks" | "manual_csv";

export interface TuiCliOptions {
  piPrompt: string | undefined;
  amfiQuery: string | undefined;
  equitySearchQuery: string | undefined;
  quoteKeys: readonly string[] | undefined;
  quoteKeysError: string | undefined;
  equityResearchQuery: string | undefined;
  eventsQuery: string | undefined;
  holdingsFlag: boolean;
  tradeBookSegment: string | undefined;
  persistHoldingsFlag: boolean;
  diffHoldingsFlag: boolean;
  syncPortfolioFlag: boolean;
  reviewHoldingsFlag: boolean;
  portfolioDecisionFlag: boolean;
  providerHealthFlag: boolean;
  dailyFlag: boolean;
  dashboardFlag: boolean;
  dashboardBroker: BrokerSource | undefined;
  holdingHistorySymbol: string | undefined;
  holdingHistoryBroker: BrokerSource | undefined;
  importHoldingsPath: string | undefined;
  importTradesPath: string | undefined;
  manualDecisionFlag: boolean;
  jsonFlag: boolean;
  rawFlag: boolean;
  hasExplicitPrimaryAction: boolean;
}

const readTrailingText = (
  args: readonly string[],
  flag: string,
  defaultValue: string,
): string | undefined => {
  const index = args.findIndex((arg) => arg === flag);
  if (index < 0) return undefined;
  return args.slice(index + 1).join(" ").trim() || defaultValue;
};

const readNextValue = (
  args: readonly string[],
  flag: string,
  defaultValue: string,
): string | undefined => {
  const index = args.findIndex((arg) => arg === flag);
  if (index < 0) return undefined;
  return args[index + 1]?.trim() || defaultValue;
};

const parseBrokerSource = (value: string | undefined): BrokerSource | undefined => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "groww" || normalized === "indstocks" || normalized === "manual_csv"
    ? normalized
    : undefined;
};

export const parseTuiCliOptions = (args: readonly string[]): TuiCliOptions => {
  const piPrompt = readTrailingText(args, "--pi", "Summarize this repo.");
  const amfiQuery = readTrailingText(args, "--amfi", "parag parikh");
  const equitySearchQuery = readNextValue(args, "--equity-search", "reliance");
  const quoteRaw = readNextValue(args, "--quote", "");
  const parsedQuoteKeys = quoteRaw ? normalizeEquityQuoteKeys(quoteRaw.split(",")) : [];
  const quoteKeysError =
    parsedQuoteKeys.length > MAX_EQUITY_QUOTE_KEYS
      ? `Too many quote keys. Maximum allowed is ${MAX_EQUITY_QUOTE_KEYS}.`
      : undefined;
  const quoteKeys = parsedQuoteKeys.length > 0 && !quoteKeysError ? parsedQuoteKeys : undefined;
  const equityResearchQuery = readTrailingText(args, "--equity-research", "reliance");
  const eventsQuery = readTrailingText(args, "--events", "reliance");
  const tradeBookSegment = readTrailingText(args, "--trade-book", "EQUITY")?.toUpperCase();
  const holdingHistorySymbol = readNextValue(args, "--holding-history", "RELIANCE-EQ");
  const importHoldingsPath = readNextValue(args, "--import-holdings", "");
  const importTradesPath = readNextValue(args, "--import-trades", "");
  const jsonFlag = args.includes("--json");
  const rawFlag = args.includes("--raw");
  const holdingsFlag = args.includes("--holdings");
  const persistHoldingsFlag = args.includes("--persist-holdings");
  const diffHoldingsFlag = args.includes("--diff-holdings");
  const syncPortfolioFlag = args.includes("--sync-portfolio");
  const reviewHoldingsFlag = args.includes("--review-holdings");
  const portfolioDecisionFlag = args.includes("--portfolio-decision");
  const providerHealthFlag = args.includes("--provider-health");
  const dailyFlag = args.includes("--daily");
  const dashboardFlag = args.includes("--dashboard");
  const manualDecisionFlag = args.includes("--manual-decision");
  const dashboardBroker = parseBrokerSource(readNextValue(args, "--dashboard-broker", ""));
  const holdingHistoryBroker = parseBrokerSource(
    readNextValue(args, "--holding-history-broker", ""),
  );

  const hasExplicitPrimaryAction =
    Boolean(piPrompt) ||
    Boolean(amfiQuery) ||
    Boolean(equitySearchQuery) ||
    Boolean(quoteKeysError) ||
    Boolean(quoteKeys?.length) ||
    Boolean(equityResearchQuery) ||
    Boolean(eventsQuery) ||
    holdingsFlag ||
    Boolean(tradeBookSegment) ||
    persistHoldingsFlag ||
    diffHoldingsFlag ||
    syncPortfolioFlag ||
    reviewHoldingsFlag ||
    portfolioDecisionFlag ||
    providerHealthFlag ||
    dailyFlag ||
    Boolean(holdingHistorySymbol) ||
    Boolean(importHoldingsPath) ||
    manualDecisionFlag;

  return {
    piPrompt,
    amfiQuery,
    equitySearchQuery,
    quoteKeys,
    quoteKeysError,
    equityResearchQuery,
    eventsQuery,
    holdingsFlag,
    tradeBookSegment,
    persistHoldingsFlag,
    diffHoldingsFlag,
    syncPortfolioFlag,
    reviewHoldingsFlag,
    portfolioDecisionFlag,
    providerHealthFlag,
    dailyFlag,
    dashboardFlag,
    dashboardBroker,
    holdingHistorySymbol,
    holdingHistoryBroker,
    importHoldingsPath,
    importTradesPath,
    manualDecisionFlag,
    jsonFlag,
    rawFlag,
    hasExplicitPrimaryAction,
  };
};
