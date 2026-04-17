import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/tradeai";

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
