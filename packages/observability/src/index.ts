import pino from "pino";

const jsonOutputRequested = process.argv.includes("--json");
const tuiOutputRequested = process.argv.some((arg) => arg.includes("apps/tui/src/index.ts"));
const tuiLogsEnabled = process.env.TRADEAI_TUI_SHOW_LOGS === "true";
const logLevel =
  jsonOutputRequested || (tuiOutputRequested && !tuiLogsEnabled)
    ? "silent"
    : process.env.LOG_LEVEL ?? "info";
const pretty = process.env.LOG_PRETTY !== "false";

export const logger = pino(
  pretty
    ? {
        level: logLevel,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "SYS:standard",
          },
        },
      }
    : {
        level: logLevel,
      },
);

export const createLogger = (scope: string) => logger.child({ scope });

export const timed = async <T>(
  scope: string,
  action: string,
  task: () => Promise<T>,
): Promise<T> => {
  const scopedLogger = createLogger(scope);
  const startedAt = Date.now();
  scopedLogger.info({ action }, "start");
  try {
    const result = await task();
    scopedLogger.info({ action, durationMs: Date.now() - startedAt }, "done");
    return result;
  } catch (error) {
    scopedLogger.error({ action, durationMs: Date.now() - startedAt, error }, "failed");
    throw error;
  }
};
