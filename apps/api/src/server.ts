import type { BrokerSource } from "@tradeai/domain";
import {
  createTradeAiWorkflowService,
  type CreateTradeAiWorkflowServiceOptions,
  type TradeAiWorkflowService,
} from "@tradeai/app-services";
import { Effect } from "effect";

import { buildRuntimeConfigFromEnv } from "./runtime-config.ts";
import { operatorPageHtml } from "./operator-page.ts";

export interface ApiServerOptions extends CreateTradeAiWorkflowServiceOptions {
  service?: TradeAiWorkflowService;
}

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });

const htmlResponse = (html: string) =>
  new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
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
  return value === "indstocks" || value === "manual_csv" ? value : undefined;
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

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return errorResponse(405, "Method not allowed");
    }

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" });
    }

    if (url.pathname === "/" || url.pathname === "/operator") {
      return htmlResponse(operatorPageHtml);
    }

    if (url.pathname === "/portfolio/dashboard") {
      const broker = parseBroker(url.searchParams.get("broker"));
      if (url.searchParams.has("broker") && !broker) {
        return errorResponse(400, "Invalid broker. Expected indstocks or manual_csv.");
      }
      return runJson(tradeAi.getPortfolioDashboard(broker ? { broker } : {}));
    }

    if (url.pathname === "/operator/health") {
      return runContractJson("provider-health", tradeAi.getProviderHealth());
    }

    if (url.pathname === "/operator/daily") {
      const raw = url.searchParams.get("raw") === "true";
      return raw
        ? runContractJson("daily", tradeAi.getDailyOperatorReport())
        : runContractJson("daily", tradeAi.getDailyOperatorViewModel());
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
