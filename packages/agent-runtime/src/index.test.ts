import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import { buildRecommendation, describePiHarnessPlan } from "./index.ts";

describe("agent-runtime", () => {
  it("builds a buy recommendation from strong scores", async () => {
    const recommendation = await Effect.runPromise(
      buildRecommendation(
        { total: 82, label: "favored", reasons: ["macro", "policy", "durability"] },
        { total: 75, label: "research_further", reasons: ["financial", "governance", "alignment"] },
        { total: 90, label: "good_fit", reasons: ["low overlap"] },
        { previousVerdict: "buy", previousConviction: 68, notes: ["prior thesis"] },
      ),
    );

    expect(recommendation.verdict).toBe("buy");
    expect(recommendation.stability).toBe("strengthening");
    expect(recommendation.keyReasons.length).toBeGreaterThan(0);
  });

  it("describes the pi harness plan around pi-coding-agent", () => {
    const plan = describePiHarnessPlan();

    expect(plan.package).toBe("@mariozechner/pi-coding-agent");
    expect(plan.sessionFactory).toBe("createAgentSession");
  });
});
