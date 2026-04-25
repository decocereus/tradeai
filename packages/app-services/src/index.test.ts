import { describe, expect, it } from "bun:test";

import {
  createTradeAiWorkflowService,
  summarizeDailyResearch,
} from "./index.ts";

describe("app-services barrel", () => {
  it("exports the public workflow service and report formatters", () => {
    expect(createTradeAiWorkflowService).toBeFunction();
    expect(summarizeDailyResearch).toBeFunction();
  });
});
