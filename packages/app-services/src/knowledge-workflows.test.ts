import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import { ingestKnowledgeDocument } from "./knowledge-workflows.ts";
import { createTradeAiWorkflowDependencies } from "./ports.ts";

describe("app-services / knowledge workflows", () => {
  it("persists a normalized knowledge document through the repository port", async () => {
    const persistedIds: string[] = [];
    const dependencies = createTradeAiWorkflowDependencies({
      config: {
        databaseUrl: "postgres://tradeai-test",
      },
      repositories: {
        hasConfiguredDatabaseUrl: (databaseUrl) => databaseUrl === "postgres://tradeai-test",
        persistKnowledgeDocument: async (document, databaseUrl) => {
          persistedIds.push(`${document.id}:${databaseUrl}`);
          return {
            documentId: document.id,
            documentsInserted: 1,
          };
        },
      },
    });

    const report = await Effect.runPromise(
      ingestKnowledgeDocument(
        {
          sourceType: "personal_note",
          title: "  Capital preservation note ",
          body: "Position size should stay small when thesis evidence is incomplete.",
          metadata: { tags: ["risk"] },
        },
        dependencies,
      ),
    );

    expect(report.document.title).toBe("Capital preservation note");
    expect(report.document.metadata).toEqual({ tags: ["risk"] });
    expect(report.persistence.documentsInserted).toBe(1);
    expect(persistedIds).toEqual([`${report.document.id}:postgres://tradeai-test`]);
  });

  it("fails closed when no explicit database is configured", async () => {
    const dependencies = createTradeAiWorkflowDependencies({
      repositories: {
        hasConfiguredDatabaseUrl: () => false,
        persistKnowledgeDocument: async () => {
          throw new Error("unexpected persistence");
        },
      },
    });

    await expect(
      Effect.runPromise(
        ingestKnowledgeDocument(
          {
            sourceType: "personal_note",
            title: "No database",
            body: "This should not be persisted without DATABASE_URL.",
          },
          dependencies,
        ),
      ),
    ).rejects.toThrow("DATABASE_URL is required");
  });
});
