import type {
  KnowledgeDocument,
  KnowledgeSourceType,
} from "@tradeai/domain";
import { buildKnowledgeDocument } from "@tradeai/knowledge";
import { Effect } from "effect";

import {
  createTradeAiWorkflowDependencies,
  type KnowledgeDocumentPersistenceResult,
  type TradeAiWorkflowDependencies,
} from "./ports.ts";

const defaultDependencies = createTradeAiWorkflowDependencies();

export interface KnowledgeDocumentIngestionInput {
  sourceType: KnowledgeSourceType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  databaseUrl?: string;
}

export interface KnowledgeDocumentIngestionReport {
  document: KnowledgeDocument;
  persistence: KnowledgeDocumentPersistenceResult;
}

export const ingestKnowledgeDocument = (
  input: KnowledgeDocumentIngestionInput,
  dependencies: TradeAiWorkflowDependencies = defaultDependencies,
): Effect.Effect<KnowledgeDocumentIngestionReport, Error> =>
  Effect.gen(function* () {
    const databaseUrl = input.databaseUrl ?? dependencies.config.databaseUrl;
    if (!dependencies.repositories.hasConfiguredDatabaseUrl(databaseUrl)) {
      return yield* Effect.fail(
        new Error("DATABASE_URL is required to ingest persisted knowledge documents."),
      );
    }

    const document = buildKnowledgeDocument({
      sourceType: input.sourceType,
      title: input.title,
      body: input.body,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
    const persistence = yield* Effect.tryPromise(() =>
      dependencies.repositories.persistKnowledgeDocument(document, databaseUrl),
    );

    return {
      document,
      persistence,
    };
  });
