import type {
  MemoryContext,
  PortfolioFit,
  Recommendation,
  ScoreBreakdown,
} from "@tradeai/domain";
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  createCodingTools,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";

const riskBucketForScore = (score: number): Recommendation["riskBucket"] => {
  if (score >= 80) return "stable";
  if (score >= 65) return "moderate";
  if (score >= 50) return "growth";
  return "speculative";
};

const verdictForScore = (score: number): Recommendation["verdict"] => {
  if (score >= 85) return "strong_buy";
  if (score >= 65) return "buy";
  if (score >= 50) return "watch";
  return "reject";
};

const stabilityForConviction = (
  currentConviction: number,
  previousConviction: number,
): Recommendation["stability"] => {
  if (currentConviction > previousConviction) return "strengthening";
  if (currentConviction < previousConviction) return "weakening";
  return "unchanged";
};

export const buildRecommendation = (
  sectorScore: ScoreBreakdown,
  instrumentScore: ScoreBreakdown,
  portfolioFit: PortfolioFit,
  memoryContext: MemoryContext,
) =>
  Effect.succeed<Recommendation>({
    verdict: verdictForScore(instrumentScore.total),
    conviction: Math.round(
      instrumentScore.total * 0.65 + sectorScore.total * 0.2 + portfolioFit.total * 0.15,
    ),
    stability: stabilityForConviction(
      Math.round(
        instrumentScore.total * 0.65 + sectorScore.total * 0.2 + portfolioFit.total * 0.15,
      ),
      memoryContext.previousConviction,
    ),
    riskBucket: riskBucketForScore(instrumentScore.total),
    keyReasons: [
      ...sectorScore.reasons.slice(0, 2),
      ...instrumentScore.reasons.slice(0, 2),
      ...portfolioFit.reasons.slice(0, 1),
    ],
    mainRisks: [
      "Macro and sector conditions can reverse quickly.",
      "A governance issue can override otherwise solid financial scores.",
      "Portfolio concentration needs monitoring as new sectors are added.",
    ],
    invalidationConditions: [
      "Sector score falls below 60 on a fresh run.",
      "Instrument score falls below 65 after new data arrives.",
      "A material governance or event risk is detected.",
    ],
  });

export interface PiHarnessPlan {
  package: "@mariozechner/pi-coding-agent";
  sessionFactory: "createAgentSession";
  resourceLoader: "DefaultResourceLoader";
  sessionManager: "SessionManager";
  notes: readonly string[];
}

// This keeps our architecture honest: the future harness integration should be
// built on pi-coding-agent's SDK/session model rather than re-implementing it
// directly on top of lower-level primitives.
export const describePiHarnessPlan = (): PiHarnessPlan => ({
  package: "@mariozechner/pi-coding-agent",
  sessionFactory: "createAgentSession",
  resourceLoader: "DefaultResourceLoader",
  sessionManager: "SessionManager",
  notes: [
    "Use createAgentSession() as the primary SDK entrypoint.",
    "Use DefaultResourceLoader to pick up AGENTS.md, skills, prompts, and extensions.",
    "Use SessionManager when we want persisted or branchable Pi sessions.",
    "Reach for pi-tui only when building custom components or overlays.",
  ],
});

export const assertPiSdkImports = () => {
  return {
    AuthStorage,
    DefaultResourceLoader,
    ModelRegistry,
    SessionManager,
    createCodingTools,
    createAgentSession,
  };
};

export interface PiResourceSnapshot {
  extensionCount: number;
  skillCount: number;
  promptCount: number;
  themeCount: number;
  agentsFileCount: number;
  diagnostics: readonly string[];
}

export const inspectPiResources = (cwd = process.cwd()) =>
  Effect.tryPromise(async () => {
    const resourceLoader = new DefaultResourceLoader({ cwd });
    await resourceLoader.reload();

    const extensions = resourceLoader.getExtensions();
    const skills = resourceLoader.getSkills();
    const prompts = resourceLoader.getPrompts();
    const themes = resourceLoader.getThemes();
    const agentsFiles = resourceLoader.getAgentsFiles();

    return {
      extensionCount: extensions.extensions.length,
      skillCount: skills.skills.length,
      promptCount: prompts.prompts.length,
      themeCount: themes.themes.length,
      agentsFileCount: agentsFiles.agentsFiles.length,
      diagnostics: [
        ...extensions.errors.map((diagnostic) => `[extensions] ${diagnostic.path}: ${diagnostic.error}`),
        ...skills.diagnostics.map((diagnostic) => `[skills] ${diagnostic.message}`),
        ...prompts.diagnostics.map((diagnostic) => `[prompts] ${diagnostic.message}`),
        ...themes.diagnostics.map((diagnostic) => `[themes] ${diagnostic.message}`),
      ],
    } satisfies PiResourceSnapshot;
  });

export interface PiSessionBootstrapResult {
  sessionId: string;
  sessionFile: string | undefined;
  modelId: string | undefined;
  diagnostics: readonly string[];
  modelFallbackMessage: string | undefined;
  output: string;
  finalError: string | undefined;
}

const extractTextFromMessage = (message: unknown): string => {
  if (!message || typeof message !== "object") return "";
  const maybeContent = Reflect.get(message, "content");
  if (!Array.isArray(maybeContent)) return "";

  return maybeContent
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const text = Reflect.get(item, "text");
      return typeof text === "string" ? [text] : [];
    })
    .join("");
};

export const createPiTradeAiSession = (options?: {
  cwd?: string;
  prompt?: string;
}) =>
  Effect.tryPromise(async () => {
    const cwd = options?.cwd ?? process.cwd();
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const resourceLoader = new DefaultResourceLoader({ cwd });
    await resourceLoader.reload();
    const skills = resourceLoader.getSkills();
    const prompts = resourceLoader.getPrompts();
    const themes = resourceLoader.getThemes();

    const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({
      cwd,
      authStorage,
      modelRegistry,
      resourceLoader,
      tools: createCodingTools(cwd),
      sessionManager: SessionManager.inMemory(),
    });

    let output = "";
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        output += event.assistantMessageEvent.delta;
      }
    });

    try {
      if (options?.prompt) {
        await session.prompt(options.prompt);
      }
    } finally {
      unsubscribe();
    }

    const lastMessage = session.messages.at(-1);
    const finalOutput = output || extractTextFromMessage(lastMessage);
    const finalError =
      lastMessage && typeof lastMessage === "object"
        ? typeof Reflect.get(lastMessage, "errorMessage") === "string"
          ? String(Reflect.get(lastMessage, "errorMessage"))
          : undefined
        : undefined;

    session.dispose();

    return {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      modelId: session.model?.id,
      diagnostics: [
        ...extensionsResult.errors.map((diagnostic) => `[extensions] ${diagnostic.path}: ${diagnostic.error}`),
        ...skills.diagnostics.map((diagnostic) => `[skills] ${diagnostic.message}`),
        ...prompts.diagnostics.map((diagnostic) => `[prompts] ${diagnostic.message}`),
        ...themes.diagnostics.map((diagnostic) => `[themes] ${diagnostic.message}`),
      ],
      modelFallbackMessage,
      output: finalOutput,
      finalError,
    } satisfies PiSessionBootstrapResult;
  });
