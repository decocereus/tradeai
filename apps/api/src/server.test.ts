import { describe, expect, it } from "bun:test";
import type {
  EquityInstrumentProfile,
  EquityQuoteSnapshot,
  ResearchPacket,
} from "@tradeai/domain";
import { Effect } from "effect";

import { createApiRequestHandler } from "./server.ts";

const readJson = async (response: Response) => response.json() as Promise<Record<string, unknown>>;
const apiAuthToken = "test-api-token";
const authenticatedRequest = (url: string) =>
  new Request(url, {
    headers: {
      authorization: `Bearer ${apiAuthToken}`,
    },
  });

const researchPacket = {
  runLabel: "api-test-packet",
  source: "aftermarkets",
  sector: {
    slug: "unclassified",
    name: "Unclassified",
    macroTailwind: 50,
    policySupport: 50,
    geopoliticalEffect: 50,
    upcomingCatalysts: 50,
    sectorSentiment: 50,
    structuralDurability: 50,
    regulatoryRisk: 50,
  },
  instrument: {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sectorSlug: "unclassified",
    assetType: "stock",
    financialQuality: 50,
    businessQuality: 50,
    managementGovernance: 50,
    sectorAlignment: 50,
    stabilityProfile: 50,
    upsidePotential: 50,
    currentEventContext: 50,
  },
  portfolioExposures: [],
} satisfies ResearchPacket;

describe("api server", () => {
  it("serves health", async () => {
    const handler = createApiRequestHandler();
    const response = await handler(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ status: "ok" });
  });

  it("validates required query params", async () => {
    const handler = createApiRequestHandler({ apiAuthToken });
    const response = await handler(authenticatedRequest("http://localhost/market/equities/search"));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      error: "Missing required query parameter: q",
    });
  });

  it("routes equity search through injected market sources", async () => {
    const profile: EquityInstrumentProfile = {
      instrumentKey: "NSE_EQ|INE002A01018",
      exchange: "NSE",
      tradingSymbol: "RELIANCE",
      name: "Reliance Industries",
      instrumentType: "EQ",
    };
    const handler = createApiRequestHandler({
      apiAuthToken,
      marketSources: {
        searchEquityProfiles: (query) =>
          query === "reliance" ? Effect.succeed([profile]) : Effect.succeed([]),
      },
    });

    const response = await handler(
      authenticatedRequest("http://localhost/market/equities/search?q=reliance"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([profile]);
  });

  it("routes quote lookups through injected market sources", async () => {
    const quote: EquityQuoteSnapshot = {
      instrumentKey: "NSE_EQ|INE002A01018",
      exchange: "NSE",
      tradingSymbol: "RELIANCE",
      shortName: "Reliance",
      instrumentType: "EQ",
      lastPrice: 2500,
    };
    const handler = createApiRequestHandler({
      apiAuthToken,
      marketSources: {
        searchEquityInstruments: () => Effect.succeed([]),
        fetchEquityQuotes: () => Effect.succeed([]),
        buildEquityQuoteSnapshot: () => [quote],
      },
    });

    const response = await handler(
      authenticatedRequest("http://localhost/market/quotes?instrumentKey=NSE_EQ|INE002A01018"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([quote]);
  });

  it("surfaces partial quote lookup failures with successful rows", async () => {
    const quote: EquityQuoteSnapshot = {
      instrumentKey: "NSE_RELIANCE",
      exchange: "NSE",
      tradingSymbol: "RELIANCE",
      shortName: "Reliance",
      instrumentType: "EQ",
      lastPrice: 2500,
    };
    const handler = createApiRequestHandler({
      apiAuthToken,
      marketSources: {
        searchEquityInstruments: (query) =>
          Effect.succeed([
            {
              instrumentKey: `NSE_${query}`,
              exchange: "NSE",
              tradingSymbol: query,
              shortName: query === "RELIANCE" ? "Reliance" : query,
              instrumentType: "EQ",
            },
          ]),
        fetchEquityQuotes: () =>
          Effect.fail(
            Object.assign(new Error("partial Groww quote failure"), {
              quotes: [
                {
                  instrumentKey: "NSE_RELIANCE",
                  tradingSymbol: "RELIANCE",
                  lastPrice: 2500,
                },
              ],
              failures: [
                {
                  instrumentKey: "BROKEN",
                  message: "Groww quote failed for BROKEN",
                },
              ],
            }),
          ),
        buildEquityQuoteSnapshot: () => [quote],
      },
    });

    const response = await handler(
      authenticatedRequest("http://localhost/market/quotes?instrumentKey=RELIANCE,BROKEN"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(206);
    expect(payload.data).toEqual([quote]);
    expect(payload.warnings).toEqual([
      {
        instrumentKey: "BROKEN",
        message: "Groww quote failed for BROKEN",
      },
    ]);
  });

  it("rejects unbounded quote lookup requests", async () => {
    const handler = createApiRequestHandler({ apiAuthToken });
    const instrumentKeys = Array.from({ length: 51 }, (_, index) => `NSE_TEST_${index}`)
      .map((key) => `instrumentKey=${key}`)
      .join("&");

    const response = await handler(authenticatedRequest(`http://localhost/market/quotes?${instrumentKeys}`));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Too many instrumentKey values");
  });

  it("deduplicates quote lookup keys before calling market sources", async () => {
    const seenKeys: string[][] = [];
    const handler = createApiRequestHandler({
      apiAuthToken,
      marketSources: {
        searchEquityInstruments: () => Effect.succeed([]),
        fetchEquityQuotes: (instrumentKeys) => {
          seenKeys.push([...instrumentKeys]);
          return Effect.succeed([]);
        },
        buildEquityQuoteSnapshot: () => [],
      },
    });

    const response = await handler(
      authenticatedRequest("http://localhost/market/quotes?instrumentKey=RELIANCE,RELIANCE&instrumentKey=TCS"),
    );

    expect(response.status).toBe(200);
    expect(seenKeys).toEqual([["RELIANCE", "TCS"]]);
  });

  it("serves operator health through the shared contract envelope", async () => {
    const handler = createApiRequestHandler({
      apiAuthToken,
      brokerSources: {
        fetchBrokerHoldings: () => Effect.fail(new Error("expired indstocks token")),
      },
      marketSources: {
        fetchEquityQuotes: () => Effect.succeed([]),
        searchAmfiNav: () => Effect.succeed([]),
      },
      researchSources: {
        buildEquityResearchPacket: () => Effect.succeed(researchPacket),
      },
    });

    const response = await handler(authenticatedRequest("http://localhost/operator/health"));
    const payload = await readJson(response);
    const data = payload.data as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("provider-health");
    expect(payload.schemaVersion).toBe("tradeai.cli.v1");
    expect(data.status).toBe("failed");
  });

  it("serves the daily operator view model by default", async () => {
    const calls: string[] = [];
    const handler = createApiRequestHandler({
      apiAuthToken,
      brokerSources: {
        fetchBrokerHoldings: () => {
          calls.push("broker");
          return Effect.fail(new Error("unexpected broker sync"));
        },
      },
      marketSources: {
        fetchEquityQuotes: () => {
          calls.push("market");
          return Effect.succeed([]);
        },
        searchAmfiNav: () => {
          calls.push("amfi");
          return Effect.succeed([]);
        },
      },
      researchSources: {
        buildEquityResearchPacket: () => {
          calls.push("research");
          return Effect.succeed(researchPacket);
        },
      },
      repositories: {
        hasConfiguredDatabaseUrl: () => false,
      },
    });

    const response = await handler(authenticatedRequest("http://localhost/operator/daily"));
    const payload = await readJson(response);
    const data = payload.data as Record<string, unknown>;
    const portfolio = data.portfolio as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("daily");
    expect(data.providerHealth).toBeDefined();
    expect(data.health).toBeUndefined();
    expect(portfolio.holdingsCount).toBe(0);
    expect(calls).toEqual([]);
  });

  it("serves the raw daily operator report when requested", async () => {
    const calls: string[] = [];
    const handler = createApiRequestHandler({
      apiAuthToken,
      brokerSources: {
        fetchBrokerHoldings: () => {
          calls.push("broker");
          return Effect.fail(new Error("unexpected broker sync"));
        },
      },
      marketSources: {
        fetchEquityQuotes: () => {
          calls.push("market");
          return Effect.succeed([]);
        },
        searchAmfiNav: () => {
          calls.push("amfi");
          return Effect.succeed([]);
        },
      },
      researchSources: {
        buildEquityResearchPacket: () => {
          calls.push("research");
          return Effect.succeed(researchPacket);
        },
      },
      repositories: {
        hasConfiguredDatabaseUrl: () => false,
      },
    });

    const response = await handler(authenticatedRequest("http://localhost/operator/daily?raw=true"));
    const payload = await readJson(response);
    const data = payload.data as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.command).toBe("daily");
    expect(data.health).toBeDefined();
    expect(data.providerHealth).toBeUndefined();
    expect(data.decision).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("requires API auth for operator and finance routes", async () => {
    const handler = createApiRequestHandler({ apiAuthToken });

    const missing = await handler(new Request("http://localhost/operator/daily"));
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("TradeAI Operator");

    const invalid = await handler(
      new Request("http://localhost/market/quotes?instrumentKey=NSE_EQ|INE002A01018", {
        headers: { authorization: "Bearer wrong-token" },
      }),
    );
    expect(invalid.status).toBe(401);
  });

  it("fails closed when API auth is not configured", async () => {
    const handler = createApiRequestHandler();
    const response = await handler(new Request("http://localhost/portfolio/dashboard"));

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      error:
        "TradeAI API auth is not configured. Set TRADEAI_API_TOKEN before serving operator or finance routes.",
    });
  });
});
