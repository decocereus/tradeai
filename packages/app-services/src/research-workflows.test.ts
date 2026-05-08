import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildResearchResult,
  runDailyResearch,
} from "./research-workflows.ts";
import { customResearchPacket } from "./test-fixtures.ts";

describe("app-services / research workflows", () => {
  it("runs daily research from an explicit packet", async () => {
    const result = await Effect.runPromise(runDailyResearch({ packet: customResearchPacket }));

    expect(result.runLabel).toBe("custom-packet");
    expect(result.recommendation.verdict).toBe("reject");
    expect(result.instrument.symbol).toBe("RELIANCE");
    expect(result.researchQuality.missingSignals).toEqual(["memory"]);
    expect(result.knowledgeContext.claims).toEqual([]);
  });

  it("builds a scored research result from an arbitrary packet", async () => {
    const result = await Effect.runPromise(
      buildResearchResult(
        customResearchPacket,
        {
          previousVerdict: "watch",
          previousConviction: 50,
          notes: ["prior packet"],
        },
      ),
    );

    expect(result.runLabel).toBe("custom-packet");
    expect(result.recommendation.verdict).toBe("reject");
    expect(result.instrument.symbol).toBe("RELIANCE");
    expect(result.knowledgeContext.query).toContain("RELIANCE");
  });
});
