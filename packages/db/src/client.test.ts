import { describe, expect, it } from "bun:test";

import {
  hasConfiguredDatabaseUrl,
  resolveDatabaseUrl,
} from "./client.ts";

describe("db client config", () => {
  it("treats an explicit database URL as configured", () => {
    expect(hasConfiguredDatabaseUrl("postgresql://postgres:postgres@localhost:5433/tradeai")).toBe(true);
  });

  it("still resolves explicit database URLs through the runtime connection path", () => {
    expect(resolveDatabaseUrl("postgresql://user:pass@localhost:5432/example")).toBe(
      "postgresql://user:pass@localhost:5432/example",
    );
  });
});
