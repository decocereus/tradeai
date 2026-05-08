import { describe, expect, it } from "bun:test";

import {
  buildKnowledgeDocument,
  retrieveKnowledgeContext,
} from "./index.ts";

describe("knowledge", () => {
  it("normalizes source material into stable knowledge documents", () => {
    const first = buildKnowledgeDocument(
      {
        sourceType: "buffett_letter",
        title: "  Margin of Safety  ",
        body: " Durable businesses require a margin of safety before capital is committed. ",
        metadata: { tags: ["capital preservation"] },
      },
      new Date("2026-05-08T00:00:00.000Z"),
    );
    const second = buildKnowledgeDocument(
      {
        sourceType: "buffett_letter",
        title: "Margin of Safety",
        body: "Durable businesses require a margin of safety before capital is committed.",
      },
      new Date("2026-05-09T00:00:00.000Z"),
    );

    expect(first.id).toBe(second.id);
    expect(first.title).toBe("Margin of Safety");
    expect(first.createdAt).toBe("2026-05-08T00:00:00.000Z");
  });

  it("retrieves claims by query terms without inventing matches", () => {
    const document = buildKnowledgeDocument(
      {
        sourceType: "personal_note",
        title: "Banking thesis",
        body: [
          "A bank thesis should require deposit stability, conservative underwriting, and clean asset quality before adding exposure.",
          "Short-term price momentum alone should not override a weak balance sheet or fragile governance record.",
        ].join(" "),
        metadata: { tags: ["banks", "risk"] },
      },
      new Date("2026-05-08T00:00:00.000Z"),
    );

    const context = retrieveKnowledgeContext({
      query: "bank deposit stability",
      documents: [document],
    });

    expect(context.claims).toHaveLength(1);
    expect(context.claims[0]?.claim).toContain("deposit stability");
    expect(context.claims[0]?.tags).toEqual(["banks", "risk"]);

    const empty = retrieveKnowledgeContext({
      query: "gold allocation",
      documents: [document],
    });
    expect(empty.claims).toEqual([]);
    expect(empty.notes[0]).toContain("No persisted knowledge claims matched");
  });
});
