import type {
  KnowledgeClaim,
  KnowledgeContext,
  KnowledgeDocument,
  KnowledgeSourceType,
} from "@tradeai/domain";
import { createHash } from "node:crypto";
import { Effect } from "effect";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

export interface KnowledgeDocumentInput {
  id?: string;
  sourceType: KnowledgeSourceType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface KnowledgeRetrievalInput {
  query: string;
  documents: readonly KnowledgeDocument[];
  maxClaims?: number;
}

interface ScoredKnowledgeClaim {
  claim: KnowledgeClaim;
  score: number;
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const tokenize = (value: string): readonly string[] =>
  normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));

const uniqueTerms = (value: string): readonly string[] => [...new Set(tokenize(value))];

const metadataTags = (metadata: Record<string, unknown>): readonly string[] => {
  const tags = metadata.tags;
  if (!Array.isArray(tags)) return [];

  return [...new Set(tags.filter((tag): tag is string => typeof tag === "string").map(normalizeWhitespace))]
    .filter(Boolean);
};

const stableKnowledgeDocumentId = (input: KnowledgeDocumentInput): string => {
  const digest = createHash("sha256")
    .update(input.sourceType)
    .update("\0")
    .update(normalizeWhitespace(input.title))
    .update("\0")
    .update(normalizeWhitespace(input.body))
    .digest("hex")
    .slice(0, 16);
  return `knowledge:${input.sourceType}:${digest}`;
};

export const buildKnowledgeDocument = (
  input: KnowledgeDocumentInput,
  now = new Date(),
): KnowledgeDocument => {
  const title = normalizeWhitespace(input.title);
  const body = normalizeWhitespace(input.body);

  if (!title) throw new Error("Knowledge document title is required.");
  if (!body) throw new Error("Knowledge document body is required.");

  return {
    id: input.id ?? stableKnowledgeDocumentId(input),
    sourceType: input.sourceType,
    title,
    body,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? now.toISOString(),
  };
};

const sentenceCandidates = (body: string): readonly string[] =>
  body
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(normalizeWhitespace)
    .filter((sentence) => sentence.length >= 40);

const scoreText = (
  queryTerms: readonly string[],
  textTerms: readonly string[],
  titleTerms: readonly string[],
  tags: readonly string[],
) => {
  const textTermSet = new Set(textTerms);
  const titleTermSet = new Set(titleTerms);
  const tagSet = new Set(tags.flatMap(tokenize));

  return queryTerms.reduce((score, term) => {
    if (textTermSet.has(term)) return score + 3;
    if (titleTermSet.has(term)) return score + 2;
    if (tagSet.has(term)) return score + 2;
    return score;
  }, 0);
};

const claimConfidence = (score: number) => Math.min(0.95, Math.max(0.45, 0.45 + score * 0.08));

export const retrieveKnowledgeContext = (
  input: KnowledgeRetrievalInput,
): KnowledgeContext => {
  const query = normalizeWhitespace(input.query);
  const maxClaims = input.maxClaims ?? 5;
  const queryTerms = uniqueTerms(query);
  const scoredClaims: ScoredKnowledgeClaim[] = [];

  for (const document of input.documents) {
    const tags = metadataTags(document.metadata);
    const titleTerms = uniqueTerms(document.title);
    const candidates = sentenceCandidates(document.body);

    for (const sentence of candidates) {
      const score = queryTerms.length === 0
        ? 1
        : scoreText(queryTerms, uniqueTerms(sentence), titleTerms, tags);
      if (score <= 0) continue;

      scoredClaims.push({
        score,
        claim: {
          documentId: document.id,
          sourceType: document.sourceType,
          title: document.title,
          claim: sentence,
          tags,
          confidence: claimConfidence(score),
          provenance: `${document.title} (${document.sourceType})`,
        },
      });
    }
  }

  const claims = scoredClaims
    .sort((left, right) =>
      right.score - left.score || right.claim.confidence - left.claim.confidence,
    )
    .slice(0, maxClaims)
    .map((entry) => entry.claim);

  const notes =
    input.documents.length === 0
      ? ["No persisted knowledge documents were available for retrieval."]
      : claims.length === 0
        ? [`No persisted knowledge claims matched "${query}".`]
        : [`Retrieved ${claims.length} persisted knowledge claim${claims.length === 1 ? "" : "s"}.`];

  return {
    query,
    claims,
    notes,
  };
};

export const loadKnowledgeContext = (input: KnowledgeRetrievalInput) =>
  Effect.succeed(retrieveKnowledgeContext(input));
