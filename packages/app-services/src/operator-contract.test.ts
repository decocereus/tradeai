import { describe, expect, it } from "bun:test";

import {
  buildOperatorErrorEnvelope,
  buildOperatorSuccessEnvelope,
} from "./operator-contract.ts";

describe("app-services / operator contract", () => {
  it("builds stable success and error envelopes", () => {
    expect(buildOperatorSuccessEnvelope("daily", { holdings: 3 }, "2026-05-07T00:00:00.000Z")).toEqual({
      ok: true,
      command: "daily",
      schemaVersion: "tradeai.cli.v1",
      generatedAt: "2026-05-07T00:00:00.000Z",
      data: { holdings: 3 },
    });

    expect(buildOperatorErrorEnvelope("daily", new Error("provider failed"), "2026-05-07T00:00:00.000Z")).toEqual({
      ok: false,
      command: "daily",
      schemaVersion: "tradeai.cli.v1",
      generatedAt: "2026-05-07T00:00:00.000Z",
      error: "provider failed",
    });
  });
});
