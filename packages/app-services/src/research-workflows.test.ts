import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildResearchResult,
  runDailyResearch,
  runDemoResearchSnapshot,
} from "./research-workflows.ts";
import { summarizeDailyResearch } from "./report-formatters.ts";
import { customResearchPacket } from "./test-fixtures.ts";

describe("app-services / research workflows", () => {
  it("runs daily research from an explicit packet", async () => {
    const result = await Effect.runPromise(runDailyResearch({ packet: customResearchPacket }));

    expect(result.runLabel).toBe("custom-packet");
    expect(result.recommendation.verdict).toBe("reject");
    expect(result.instrument.symbol).toBe("RELIANCE");
    expect(result.researchQuality.missingSignals).toEqual(["memory"]);
  });

  it("keeps demo research behind an explicit demo workflow", async () => {
    const result = await Effect.runPromise(runDemoResearchSnapshot);
    const summary = summarizeDailyResearch(result);

    expect(summary).toContain("DEMO");
    expect(summary).toContain("verdict=buy");
    expect(summary).toContain("conviction=");
    expect(summary).toContain("quality=minimal");
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
  });
});
