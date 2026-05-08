import { describe, expect, it } from "bun:test";

import { buildRuntimeConfigFromEnv } from "./runtime-config.ts";

describe("app-services / runtime config", () => {
  it("builds the shared runtime config from explicit env values", () => {
    const config = buildRuntimeConfigFromEnv({
      GROWW_ACCESS_TOKEN: " groww-token ",
      INDSTOCKS_ACCESS_TOKEN: "broker-token",
      TRADEAI_BROKER_DATA_PROVIDER: "indstocks",
      TRADEAI_MARKET_DATA_PROVIDER: "groww",
      TRADEAI_RESEARCH_DATA_PROVIDER: "aftermarkets",
      AFTERMARKETS_API_KEY: "aftermarkets-key",
      DATABASE_URL: "postgres://tradeai",
      TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS: "yes",
    });

    expect(config).toEqual({
      growwAccessToken: "groww-token",
      brokerAccessToken: "broker-token",
      marketAccessToken: "groww-token",
      brokerDataProvider: "indstocks",
      marketDataProvider: "groww",
      researchDataProvider: "aftermarkets",
      aftermarketsApiKey: "aftermarkets-key",
      databaseUrl: "postgres://tradeai",
      persistPortfolioSnapshots: true,
    });
  });

  it("ignores unsupported provider values instead of smuggling them into config", () => {
    const config = buildRuntimeConfigFromEnv({
      TRADEAI_BROKER_DATA_PROVIDER: "unknown",
      TRADEAI_MARKET_DATA_PROVIDER: "unknown",
      TRADEAI_RESEARCH_DATA_PROVIDER: "unknown",
    });

    expect(config).toEqual({});
  });
});
