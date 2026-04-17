import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  AMFI_NAV_URL,
  filterAmfiNavEntries,
  fetchAmfiNavEntries,
  parseAmfiNavLine,
  parseAmfiNavText,
} from "./index.ts";

describe("data-sources / AMFI", () => {
  const sampleText = `
Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

119550;INF209K01YN0;-;Aditya Birla Sun Life Banking & PSU Debt Fund- Direct Plan-Growth;395.7707;16-Apr-2026
122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;92.3456;16-Apr-2026
`.trim();

  it("parses a valid AMFI NAV line", () => {
    const parsed = parseAmfiNavLine(
      "122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;92.3456;16-Apr-2026",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.schemeCode).toBe("122639");
    expect(parsed?.schemeName).toContain("Parag Parikh");
  });

  it("parses AMFI NAV text into entries", () => {
    const entries = parseAmfiNavText(sampleText);

    expect(entries).toHaveLength(2);
    expect(entries[1]?.schemeName).toContain("Parag Parikh");
  });

  it("filters AMFI NAV entries by scheme name", () => {
    const entries = parseAmfiNavText(sampleText);
    const filtered = filterAmfiNavEntries("parag parikh", entries);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.schemeCode).toBe("122639");
  });

  it("uses injected fetch for NAV retrieval", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(input).toBe(AMFI_NAV_URL);
      return new Response(sampleText, { status: 200 });
    }) as unknown as typeof fetch;

    const entries = await Effect.runPromise(fetchAmfiNavEntries(fetchStub));

    expect(entries).toHaveLength(2);
  });
});
