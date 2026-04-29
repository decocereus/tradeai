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
  const brokerAccessToken = readEnvValue("INDSTOCKS_ACCESS_TOKEN");
  const marketAccessToken = readEnvValue("UPSTOX_ACCESS_TOKEN");
  const marketDataProvider = readEnvValue("TRADEAI_MARKET_DATA_PROVIDER");
  const trueDataUserId = readEnvValue("TRUEDATA_USER_ID");
  const trueDataPassword = readEnvValue("TRUEDATA_PASSWORD");
  const databaseUrl = readEnvValue("DATABASE_URL");
  const allowPublicResearchFallback = readEnvBoolean(
    "TRADEAI_ALLOW_PUBLIC_RESEARCH_FALLBACK",
  );
  const persistPortfolioSnapshots = readEnvBoolean("TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS");

  return {
    ...(brokerAccessToken ? { brokerAccessToken } : {}),
    ...(marketAccessToken ? { marketAccessToken } : {}),
    ...(marketDataProvider === "truedata" || marketDataProvider === "upstox"
      ? { marketDataProvider }
      : {}),
    ...(trueDataUserId ? { trueDataUserId } : {}),
    ...(trueDataPassword ? { trueDataPassword } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(allowPublicResearchFallback !== undefined ? { allowPublicResearchFallback } : {}),
    ...(persistPortfolioSnapshots !== undefined ? { persistPortfolioSnapshots } : {}),
  };
};
