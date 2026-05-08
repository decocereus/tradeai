import { buildAftermarketsResearchPacketFromStockDetail } from "@tradeai/research-engine";
import { Effect } from "effect";

export const AFTERMARKETS_API_KEY_ENV = "AFTERMARKETS_API_KEY";
export const AFTERMARKETS_MCP_URL = "https://mcp.aftermarkets.in/mcp";

export interface AftermarketsCredentials {
  apiKey?: string;
}

export interface AftermarketsToolInput extends AftermarketsCredentials {
  name: string;
  arguments?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

export interface AftermarketsResearchPacketInput extends AftermarketsCredentials {
  query: string;
  fetchImpl?: typeof fetch;
}

interface AftermarketsMcpResponse {
  result?: {
    content?: readonly {
      type?: string;
      text?: string;
    }[];
  };
  error?: {
    message?: string;
    code?: number | string;
  };
}

interface AftermarketsEnvelope<T> {
  data?: T;
  asOf?: string;
  freshness?: string;
  version?: string;
  error?: string;
  code?: string;
  hint?: string;
}

interface AftermarketsStockDetailData {
  stock?: {
    symbol?: string;
    name?: string;
    industry?: string;
    price?: number;
    prevClose?: number;
    changePct?: number;
    volume?: number;
    volumeRatio?: number;
    marketCap?: number;
    return1m?: number;
  };
  fundamentals?: {
    pe?: number;
    pb?: number;
    roce?: number;
    debtEquity?: number;
    roe?: number;
    npm?: number;
    opm?: number;
    eps?: number;
    dividendYield?: number;
    evEbitda?: number;
    quarterlySales?: number;
    quarterlyProfit?: number;
  };
  technicals?: {
    rsi14?: number;
    sma20?: number;
    sma50?: number;
    macdTrend?: string;
    volumeRatio?: number;
  };
  checklist?: {
    overallScore?: number;
    dimensions?: readonly {
      type?: string;
      score?: number;
      rating?: string;
    }[];
  };
}

export type AftermarketsStockDetailEnvelope = AftermarketsEnvelope<AftermarketsStockDetailData>;

export const resolveAftermarketsApiKey = (credentials: AftermarketsCredentials = {}): string => {
  const apiKey = credentials.apiKey?.trim() || process.env[AFTERMARKETS_API_KEY_ENV]?.trim();
  if (!apiKey) {
    throw new Error(`Missing Aftermarkets API key. Set ${AFTERMARKETS_API_KEY_ENV}.`);
  }
  return apiKey;
};

const parseMcpEventBody = (body: string): string => {
  const dataLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  return dataLine ? dataLine.slice("data:".length).trim() : body;
};

export const parseAftermarketsToolResponse = <T>(body: string): AftermarketsEnvelope<T> => {
  const rpcPayload = JSON.parse(parseMcpEventBody(body)) as AftermarketsMcpResponse;
  if (rpcPayload.error) {
    throw new Error(rpcPayload.error.message ?? `Aftermarkets MCP error ${rpcPayload.error.code}`);
  }

  const textContent = rpcPayload.result?.content?.find((item) => item.type === "text")?.text;
  if (!textContent) {
    throw new Error("Aftermarkets MCP response did not include text content.");
  }

  const envelope = JSON.parse(textContent) as AftermarketsEnvelope<T>;
  if (envelope.error) {
    throw new Error(
      envelope.hint
        ? `Aftermarkets tool error ${envelope.code ?? "UNKNOWN"}: ${envelope.error}. ${envelope.hint}`
        : `Aftermarkets tool error ${envelope.code ?? "UNKNOWN"}: ${envelope.error}`,
    );
  }

  return envelope;
};

export const callAftermarketsTool = <T>(input: AftermarketsToolInput) =>
  Effect.tryPromise({
    try: async () => {
      const apiKey = resolveAftermarketsApiKey(input);
      const response = await (input.fetchImpl ?? fetch)(AFTERMARKETS_MCP_URL, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: input.name,
            arguments: input.arguments ?? {},
          },
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`Aftermarkets MCP request failed with status ${response.status}`);
      }

      return parseAftermarketsToolResponse<T>(await response.text());
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const getAftermarketsStockDetail = (
  symbol: string,
  credentials: AftermarketsCredentials = {},
  fetchImpl: typeof fetch = fetch,
) =>
  callAftermarketsTool<AftermarketsStockDetailData>({
    name: "get_stock_detail",
    arguments: { symbol },
    ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
    fetchImpl,
  });

export const buildAftermarketsResearchPacket = (input: AftermarketsResearchPacketInput) =>
  Effect.gen(function* () {
    const detail = yield* getAftermarketsStockDetail(
      input.query.trim().toUpperCase(),
      input.apiKey ? { apiKey: input.apiKey } : {},
      input.fetchImpl ?? fetch,
    );
    return buildAftermarketsResearchPacketFromStockDetail(detail);
  });
