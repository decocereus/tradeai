import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import { createTradeAiWorkflowService } from "./workflow-service.ts";

describe("app-services / workflow service", () => {
  it("exposes a stable UI-agnostic workflow port", async () => {
    const tradeAi = createTradeAiWorkflowService();

    expect(tradeAi.runEquityResearch).toBeFunction();
    expect(tradeAi.syncBrokerPortfolio).toBeFunction();
    expect(tradeAi.reviewBrokerHoldingsAgainstResearch).toBeFunction();
    expect(tradeAi.getPortfolioDashboard).toBeFunction();
    expect(tradeAi.importManualPortfolioSnapshot).toBeFunction();
  });

  it("runs the explicit demo snapshot through the service port", async () => {
    const tradeAi = createTradeAiWorkflowService();
    const result = await Effect.runPromise(tradeAi.runDemoResearchSnapshot());

    expect(result.instrument.symbol).toBe("DEMO");
    expect(result.researchQuality.source).toBe("demo");
  });
});
