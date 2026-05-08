import type { TradeAiRuntimeConfig } from "./ports.ts";

export type RuntimeEnv = Record<string, string | undefined>;

const readEnvValue = (env: RuntimeEnv, name: string): string | undefined => {
  const value = env[name]?.trim();
  return value ? value : undefined;
};

const readEnvBoolean = (env: RuntimeEnv, name: string): boolean | undefined => {
  const value = readEnvValue(env, name)?.toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
};

export const buildRuntimeConfigFromEnv = (
  env: RuntimeEnv = process.env,
): TradeAiRuntimeConfig => {
  const growwAccessToken = readEnvValue(env, "GROWW_ACCESS_TOKEN");
  const brokerAccessToken = readEnvValue(env, "INDSTOCKS_ACCESS_TOKEN");
  const marketAccessToken = readEnvValue(env, "GROWW_ACCESS_TOKEN");
  const brokerDataProvider = readEnvValue(env, "TRADEAI_BROKER_DATA_PROVIDER");
  const marketDataProvider = readEnvValue(env, "TRADEAI_MARKET_DATA_PROVIDER");
  const researchDataProvider = readEnvValue(env, "TRADEAI_RESEARCH_DATA_PROVIDER");
  const aftermarketsApiKey = readEnvValue(env, "AFTERMARKETS_API_KEY");
  const databaseUrl = readEnvValue(env, "DATABASE_URL");
  const persistPortfolioSnapshots = readEnvBoolean(env, "TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS");

  return {
    ...(growwAccessToken ? { growwAccessToken } : {}),
    ...(brokerAccessToken ? { brokerAccessToken } : {}),
    ...(marketAccessToken ? { marketAccessToken } : {}),
    ...(brokerDataProvider === "groww" || brokerDataProvider === "indstocks"
      ? { brokerDataProvider }
      : {}),
    ...(marketDataProvider === "groww" ? { marketDataProvider } : {}),
    ...(researchDataProvider === "aftermarkets" ? { researchDataProvider } : {}),
    ...(aftermarketsApiKey ? { aftermarketsApiKey } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(persistPortfolioSnapshots !== undefined ? { persistPortfolioSnapshots } : {}),
  };
};
