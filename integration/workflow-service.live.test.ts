import { describe, expect, it } from "bun:test";
import { createTradeAiWorkflowService } from "@tradeai/app-services";
import { Effect } from "effect";

const LIVE_TEST_ENV = "TRADEAI_RUN_INTEGRATION_TESTS";
const INTEGRATION_ENABLED = process.env[LIVE_TEST_ENV] === "1";

const readEnvValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const buildLiveService = () =>
  createTradeAiWorkflowService({
    config: {
      marketDataProvider: "groww",
      ...(readEnvValue("INDSTOCKS_ACCESS_TOKEN")
        ? { brokerAccessToken: readEnvValue("INDSTOCKS_ACCESS_TOKEN") }
        : {}),
      ...(readEnvValue("GROWW_ACCESS_TOKEN")
        ? {
            brokerDataProvider: "groww",
            growwAccessToken: readEnvValue("GROWW_ACCESS_TOKEN"),
            marketAccessToken: readEnvValue("GROWW_ACCESS_TOKEN"),
          }
        : {}),
      ...(readEnvValue("DATABASE_URL") ? { databaseUrl: readEnvValue("DATABASE_URL") } : {}),
    },
  });

const skipReason = (missing: readonly string[]) =>
  `skipped: set ${LIVE_TEST_ENV}=1 and ${missing.join(", ")} to run this live integration test`;

const hasRequiredEnv = (names: readonly string[]) =>
  INTEGRATION_ENABLED && names.every((name) => Boolean(readEnvValue(name)));

const hasGrowwAuthEnv = () =>
  INTEGRATION_ENABLED &&
  (Boolean(readEnvValue("GROWW_ACCESS_TOKEN")) ||
    (Boolean(readEnvValue("GROWW_API_KEY")) && Boolean(readEnvValue("GROWW_API_SECRET"))));

describe("integration / workflow service live adapters", () => {
  it("fetches live broker holdings through the service boundary", async () => {
    if (!hasGrowwAuthEnv()) {
      console.log(skipReason(["GROWW_ACCESS_TOKEN or GROWW_API_KEY/GROWW_API_SECRET"]));
      return;
    }

    const tradeAi = buildLiveService();
    const holdings = await Effect.runPromise(tradeAi.getBrokerHoldings());

    expect(Array.isArray(holdings)).toBe(true);
    expect(holdings.every((holding) => holding.broker === "groww")).toBe(true);
  });

  it("fetches live market quotes through the service boundary", async () => {
    if (!hasGrowwAuthEnv()) {
      console.log(skipReason(["GROWW_ACCESS_TOKEN or GROWW_API_KEY/GROWW_API_SECRET"]));
      return;
    }

    const instrumentKey = readEnvValue("TRADEAI_INTEGRATION_INSTRUMENT_KEY") ?? "RELIANCE";
    const tradeAi = buildLiveService();
    const quotes = await Effect.runPromise(
      tradeAi.getEquityQuoteSnapshots({ instrumentKeys: [instrumentKey] }),
    );

    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.some((quote) => quote.tradingSymbol === instrumentKey)).toBe(true);
  });

  it("loads a persisted dashboard through the repository boundary", async () => {
    const required = ["DATABASE_URL"];
    if (!hasRequiredEnv(required)) {
      console.log(skipReason(required));
      return;
    }

    const tradeAi = buildLiveService();
    const dashboard = await Effect.runPromise(tradeAi.getPortfolioDashboard());

    expect(["groww", "indstocks", "manual_csv"].includes(dashboard.broker)).toBe(true);
    expect(Array.isArray(dashboard.recentSnapshots)).toBe(true);
  });
});
