import { describe, expect, it } from "bun:test";

import { scoreInstrument, scoreSector } from "./index.ts";

describe("strategy-engine", () => {
  it("scores a strong sector as favored", () => {
    const result = scoreSector({
      slug: "defense",
      name: "Defense",
      macroTailwind: 90,
      policySupport: 92,
      geopoliticalEffect: 80,
      upcomingCatalysts: 78,
      sectorSentiment: 76,
      structuralDurability: 88,
      regulatoryRisk: 15,
    });

    expect(result.total).toBeGreaterThanOrEqual(80);
    expect(result.label).toBe("favored");
    expect(result.reasons.length).toBe(3);
  });

  it("scores a weak instrument as avoid", () => {
    const result = scoreInstrument({
      symbol: "WEAK",
      name: "Weak Co",
      sectorSlug: "bad-sector",
      assetType: "stock",
      financialQuality: 20,
      businessQuality: 25,
      managementGovernance: 15,
      sectorAlignment: 30,
      stabilityProfile: 20,
      upsidePotential: 15,
      currentEventContext: 10,
    });

    expect(result.total).toBeLessThan(40);
    expect(result.label).toBe("avoid");
  });
});
