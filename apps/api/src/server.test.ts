import { describe, expect, it } from "bun:test";
import type {
  EquityInstrumentProfile,
  EquityQuoteSnapshot,
  ResearchPacket,
} from "@tradeai/domain";
import { Effect } from "effect";

import { createApiRequestHandler } from "./server.ts";
import { operatorPageHtml } from "./operator-page.ts";

const readJson = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

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

  it("serves the operator dashboard page", async () => {
    const handler = createApiRequestHandler();
    const response = await handler(new Request("http://localhost/operator"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("TradeAI Operator");
    expect(body).toContain("/operator/daily");
  });

  it("keeps operator page rendering away from HTML sinks", () => {
    expect(operatorPageHtml).not.toContain("innerHTML");
    expect(operatorPageHtml).not.toContain("outerHTML");
    expect(operatorPageHtml).not.toContain("insertAdjacentHTML");
    expect(operatorPageHtml).toContain("textContent");
    expect(operatorPageHtml).toContain("replaceChildren");
  });

  it("validates required query params", async () => {
    const handler = createApiRequestHandler();
    const response = await handler(new Request("http://localhost/market/equities/search"));

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
      marketSources: {
        searchEquityProfiles: (query) =>
          query === "reliance" ? Effect.succeed([profile]) : Effect.succeed([]),
      },
    });

    const response = await handler(
      new Request("http://localhost/market/equities/search?q=reliance"),
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
      marketSources: {
        searchEquityInstruments: () => Effect.succeed([]),
        fetchEquityQuotes: () => Effect.succeed([]),
        buildEquityQuoteSnapshot: () => [quote],
      },
    });

    const response = await handler(
      new Request("http://localhost/market/quotes?instrumentKey=NSE_EQ|INE002A01018"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([quote]);
  });

  it("serves operator health through the shared contract envelope", async () => {
    const handler = createApiRequestHandler({
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

    const response = await handler(new Request("http://localhost/operator/health"));
    const payload = await readJson(response);
    const data = payload.data as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("provider-health");
    expect(payload.schemaVersion).toBe("tradeai.cli.v1");
    expect(data.status).toBe("failed");
  });

  it("serves the daily operator view model by default", async () => {
    const handler = createApiRequestHandler({
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

    const response = await handler(new Request("http://localhost/operator/daily"));
    const payload = await readJson(response);
    const data = payload.data as Record<string, unknown>;
    const portfolio = data.portfolio as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("daily");
    expect(data.providerHealth).toBeDefined();
    expect(data.health).toBeUndefined();
    expect(portfolio.holdingsCount).toBe(0);
  });

  it("serves the raw daily operator report when requested", async () => {
    const handler = createApiRequestHandler({
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

    const response = await handler(new Request("http://localhost/operator/daily?raw=true"));
    const payload = await readJson(response);
    const data = payload.data as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.command).toBe("daily");
    expect(data.health).toBeDefined();
    expect(data.providerHealth).toBeUndefined();
  });
});
