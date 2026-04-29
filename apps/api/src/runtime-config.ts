import type { TradeAiRuntimeConfig } from "@tradeai/app-services";

const readEnvValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const readEnvBoolean = (name: string): boolean | undefined => {
  const value = readEnvValue(name)?.toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
};

export const buildRuntimeConfigFromEnv = (): TradeAiRuntimeConfig => {
  const growwAccessToken = readEnvValue("GROWW_ACCESS_TOKEN");
  const brokerAccessToken = readEnvValue("INDSTOCKS_ACCESS_TOKEN");
  const marketAccessToken = readEnvValue("GROWW_ACCESS_TOKEN");
  const brokerDataProvider = readEnvValue("TRADEAI_BROKER_DATA_PROVIDER");
  const marketDataProvider = readEnvValue("TRADEAI_MARKET_DATA_PROVIDER");
  const researchDataProvider = readEnvValue("TRADEAI_RESEARCH_DATA_PROVIDER");
  const aftermarketsApiKey = readEnvValue("AFTERMARKETS_API_KEY");
  const databaseUrl = readEnvValue("DATABASE_URL");
  const allowPublicResearchFallback = readEnvBoolean(
    "TRADEAI_ALLOW_PUBLIC_RESEARCH_FALLBACK",
  );
  const persistPortfolioSnapshots = readEnvBoolean("TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS");

  return {
    ...(growwAccessToken ? { growwAccessToken } : {}),
    ...(brokerAccessToken ? { brokerAccessToken } : {}),
    ...(marketAccessToken ? { marketAccessToken } : {}),
    ...(brokerDataProvider === "groww" || brokerDataProvider === "indstocks"
      ? { brokerDataProvider }
      : {}),
    ...(marketDataProvider === "groww"
      ? { marketDataProvider }
      : {}),
    ...(researchDataProvider === "aftermarkets"
      ? { researchDataProvider }
      : {}),
    ...(aftermarketsApiKey ? { aftermarketsApiKey } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(allowPublicResearchFallback !== undefined ? { allowPublicResearchFallback } : {}),
    ...(persistPortfolioSnapshots !== undefined ? { persistPortfolioSnapshots } : {}),
  };
};
