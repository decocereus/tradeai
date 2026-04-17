import { Effect } from "effect";

export const knowledgeBootstrap = Effect.succeed({
  sources: ["YouTube transcripts", "Warren Buffett letters", "personal notes"],
  status: "knowledge pipeline scaffolded",
} as const);

