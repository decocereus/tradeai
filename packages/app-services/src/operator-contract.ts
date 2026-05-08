export const TRADEAI_OPERATOR_SCHEMA_VERSION = "tradeai.cli.v1";

export type TradeAiOperatorSchemaVersion = typeof TRADEAI_OPERATOR_SCHEMA_VERSION;

export type TradeAiOperatorEnvelope<T> =
  | {
      ok: true;
      command: string;
      schemaVersion: TradeAiOperatorSchemaVersion;
      generatedAt: string;
      data: T;
    }
  | {
      ok: false;
      command: string;
      schemaVersion: TradeAiOperatorSchemaVersion;
      generatedAt: string;
      error: string;
    };

const formatUnknownError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const buildOperatorSuccessEnvelope = <T>(
  command: string,
  data: T,
  generatedAt = new Date().toISOString(),
): TradeAiOperatorEnvelope<T> => ({
  ok: true,
  command,
  schemaVersion: TRADEAI_OPERATOR_SCHEMA_VERSION,
  generatedAt,
  data,
});

export const buildOperatorErrorEnvelope = (
  command: string,
  error: unknown,
  generatedAt = new Date().toISOString(),
): TradeAiOperatorEnvelope<never> => ({
  ok: false,
  command,
  schemaVersion: TRADEAI_OPERATOR_SCHEMA_VERSION,
  generatedAt,
  error: formatUnknownError(error),
});
