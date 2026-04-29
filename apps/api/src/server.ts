import type { BrokerSource } from "@tradeai/domain";
import {
  createTradeAiWorkflowService,
  type CreateTradeAiWorkflowServiceOptions,
  type TradeAiWorkflowService,
} from "@tradeai/app-services";
import { Effect } from "effect";
import { timingSafeEqual } from "node:crypto";

import { buildRuntimeConfigFromEnv } from "./runtime-config.ts";

const API_AUTH_TOKEN_ENV = "TRADEAI_API_TOKEN";

export interface ApiServerOptions extends CreateTradeAiWorkflowServiceOptions {
  service?: TradeAiWorkflowService;
  apiAuthToken?: string;
}

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });

const errorResponse = (status: number, message: string) =>
  jsonResponse({ error: message }, { status });

const contractResponse = (command: string, data: unknown) =>
  jsonResponse({
    ok: true,
    command,
    schemaVersion: "tradeai.cli.v1",
    generatedAt: new Date().toISOString(),
    data,
  });

const contractErrorResponse = (command: string, status: number, error: string) =>
  jsonResponse(
    {
      ok: false,
      command,
      schemaVersion: "tradeai.cli.v1",
      generatedAt: new Date().toISOString(),
      error,
    },
    { status },
  );

const parseBroker = (value: string | null): BrokerSource | undefined => {
  if (value === null || value === "") return undefined;
  return value === "groww" || value === "indstocks" || value === "manual_csv"
    ? value
    : undefined;
};

const requireQueryParam = (url: URL, name: string): string | Response => {
  const value = url.searchParams.get(name)?.trim();
  return value ? value : errorResponse(400, `Missing required query parameter: ${name}`);
};

const resolveService = (options: ApiServerOptions = {}) =>
  options.service ??
  createTradeAiWorkflowService(
    {
      config: {
        ...buildRuntimeConfigFromEnv(),
        ...options.config,
      },
      ...(options.brokerSources ? { brokerSources: options.brokerSources } : {}),
      ...(options.marketSources ? { marketSources: options.marketSources } : {}),
      ...(options.researchSources ? { researchSources: options.researchSources } : {}),
      ...(options.memorySource ? { memorySource: options.memorySource } : {}),
      ...(options.repositories ? { repositories: options.repositories } : {}),
    },
  );

const readApiAuthToken = (options: ApiServerOptions): string | undefined => {
  const token = options.apiAuthToken?.trim() || process.env[API_AUTH_TOKEN_ENV]?.trim();
  return token ? token : undefined;
};

const constantTimeEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const parseBasicAuthPassword = (authorization: string): string | undefined => {
  if (!authorization.toLowerCase().startsWith("basic ")) return undefined;

  try {
    const decoded = Buffer.from(authorization.slice("basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    return separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : undefined;
  } catch {
    return undefined;
  }
};

const readRequestAuthToken = (request: Request): string | undefined => {
  const headerToken = request.headers.get("x-tradeai-api-token")?.trim();
  if (headerToken) return headerToken;

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return undefined;

  if (authorization.toLowerCase().startsWith("bearer ")) {
    const bearer = authorization.slice("bearer ".length).trim();
    return bearer || undefined;
  }

  return parseBasicAuthPassword(authorization);
};

const authRequiredResponse = (status: number, message: string) =>
  jsonResponse(
    { error: message },
    {
      status,
      headers: {
        "www-authenticate": 'Basic realm="TradeAI Operator", Bearer',
      },
    },
  );

const authorizeApiRequest = (request: Request, configuredToken: string | undefined) => {
  if (!configuredToken) {
    return errorResponse(
      503,
      `TradeAI API auth is not configured. Set ${API_AUTH_TOKEN_ENV} before serving operator or finance routes.`,
    );
  }

  const requestToken = readRequestAuthToken(request);
  if (!requestToken || !constantTimeEquals(requestToken, configuredToken)) {
    return authRequiredResponse(401, "Unauthorized");
  }

  return undefined;
};

const runJson = async <T>(effect: Effect.Effect<T, Error>) => {
  try {
    const result = await Effect.runPromise(effect);
    return jsonResponse({ data: result });
  } catch (error) {
    return errorResponse(500, error instanceof Error ? error.message : String(error));
  }
};

const runContractJson = async <T>(command: string, effect: Effect.Effect<T, Error>) => {
  try {
    const result = await Effect.runPromise(effect);
    return contractResponse(command, result);
  } catch (error) {
    return contractErrorResponse(
      command,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
};

export const createApiRequestHandler = (options: ApiServerOptions = {}) => {
  const tradeAi = resolveService(options);
  const apiAuthToken = readApiAuthToken(options);

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return errorResponse(405, "Method not allowed");
    }

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" });
    }

    const unauthorized = authorizeApiRequest(request, apiAuthToken);
    if (unauthorized) return unauthorized;

    if (url.pathname === "/portfolio/dashboard") {
      const broker = parseBroker(url.searchParams.get("broker"));
      if (url.searchParams.has("broker") && !broker) {
        return errorResponse(400, "Invalid broker. Expected groww, indstocks, or manual_csv.");
      }
      return runJson(tradeAi.getPortfolioDashboard(broker ? { broker } : {}));
    }

    if (url.pathname === "/operator/health") {
      return runContractJson("provider-health", tradeAi.getProviderHealth());
    }

    if (url.pathname === "/operator/daily") {
      const raw = url.searchParams.get("raw") === "true";
      const broker = parseBroker(url.searchParams.get("broker"));
      if (url.searchParams.has("broker") && !broker) {
        return errorResponse(400, "Invalid broker. Expected groww, indstocks, or manual_csv.");
      }
      const input = broker ? { broker } : {};
      return raw
        ? runContractJson("daily", tradeAi.getDailyOperatorReadOnlyReport(input))
        : runContractJson("daily", tradeAi.getDailyOperatorReadOnlyViewModel(input));
    }

    if (url.pathname === "/market/equities/search") {
      const query = requireQueryParam(url, "q");
      if (query instanceof Response) return query;
      return runJson(tradeAi.searchEquities(query));
    }

    if (url.pathname === "/market/quotes") {
      const instrumentKeys = url.searchParams
        .getAll("instrumentKey")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean);
      if (instrumentKeys.length === 0) {
        return errorResponse(400, "Missing required query parameter: instrumentKey");
      }
      return runJson(tradeAi.getEquityQuoteSnapshots({ instrumentKeys }));
    }

    if (url.pathname === "/research/equity") {
      const query = requireQueryParam(url, "q");
      if (query instanceof Response) return query;
      return runJson(tradeAi.runEquityResearch({ query }));
    }

    return errorResponse(404, "Not found");
  };
};
