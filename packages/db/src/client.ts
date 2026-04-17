import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createLogger } from "@tradeai/observability";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DATABASE_URL_ENV = "DATABASE_URL";
const log = createLogger("db");
const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/tradeai";

const readEnvFileValue = (name: string): string | undefined => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return undefined;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key?.trim() === name) {
      return rest.join("=").trim();
    }
  }
  return undefined;
};

export const resolveDatabaseUrl = (databaseUrl?: string): string => {
  const resolved =
    databaseUrl?.trim() ||
    process.env[DATABASE_URL_ENV]?.trim() ||
    readEnvFileValue(DATABASE_URL_ENV) ||
    DEFAULT_LOCAL_DATABASE_URL;
  if (!resolved) {
    throw new Error(`Missing database URL. Set ${DATABASE_URL_ENV} or pass one explicitly.`);
  }
  return resolved;
};

export const hasDatabaseUrl = (databaseUrl?: string): boolean =>
  Boolean(
    databaseUrl?.trim() ||
      process.env[DATABASE_URL_ENV]?.trim() ||
      readEnvFileValue(DATABASE_URL_ENV) ||
      DEFAULT_LOCAL_DATABASE_URL,
  );

export const createDatabaseConnection = (databaseUrl?: string) => {
  const connectionString = resolveDatabaseUrl(databaseUrl);
  log.info({ action: "connect", databaseUrlConfigured: true }, "creating database connection");
  const parsed = new URL(connectionString);
  const pool = new Pool({
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: parsed.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzle(pool);
  return { pool, db };
};
