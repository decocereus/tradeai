import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  buildUpstoxStockPageUrl,
  fetchUpstoxFundamentalsSnapshot,
  parseCroreNumber,
  parsePercentNumber,
  parseUpstoxCompanyName,
  parseUpstoxFundamentalMetrics,
  parseUpstoxFundamentalsSnapshot,
  parseUpstoxMarketCapCrores,
  parseUpstoxRevenueStatement,
} from "./upstox-fundamentals.ts";

describe("data-sources / upstox fundamentals", () => {
  const sampleHtml = `
    <div id="Fundamentals">
      <h2>HDFC Bank Fundamentals</h2>
      <div class="text-sm font-medium leading-5 text-gray-accent3">P/E ratio</div>
      <div class="text-sm font-medium leading-5 text-light-black">17.06</div>
      <div class="text-sm font-medium leading-5 text-gray-accent3">ROE</div>
      <div class="text-sm font-medium leading-5 text-light-black">13.47%</div>
      <div class="text-sm font-medium leading-5 text-gray-accent3">Debt/Equity ratio</div>
      <div class="text-sm font-medium leading-5 text-light-black">0</div>
    </div>
    <div id="Shareholder returns"></div>
    <p>The market capitalization of HDFC Bank is ₹12,24,540 Crs, with a P/E ratio of 17.1 and a dividend yield of 1.35%.</p>
    <div id="Revenue statement">
      <tr><td><div>Mar-25</div></td><td><div>₹<!-- -->4,70,915.93</div></td><td><div>₹<!-- -->96,242.05</div></td><td><div>₹<!-- -->73,440.17</div></td></tr>
      <tr><td><div>Mar-24</div></td><td><div>₹<!-- -->4,07,994.77</div></td><td><div>₹<!-- -->76,568.60</div></td><td><div>₹<!-- -->65,446.50</div></td></tr>
    </div>
    <div id="Cash flow"></div>
  `;

  it("builds the stock page url from ISIN", () => {
    expect(buildUpstoxStockPageUrl("INE040A01034")).toContain("INE040A01034");
  });

  it("parses raw number helpers", () => {
    expect(parseCroreNumber("₹12,24,540")).toBe(1224540);
    expect(parsePercentNumber("13.47%")).toBe(13.47);
  });

  it("parses the company name and market cap", () => {
    expect(parseUpstoxCompanyName(sampleHtml)).toBe("HDFC Bank");
    expect(parseUpstoxMarketCapCrores(sampleHtml)).toBe(1224540);
  });

  it("parses fundamentals and revenue rows from html", () => {
    const metrics = parseUpstoxFundamentalMetrics(sampleHtml);
    const rows = parseUpstoxRevenueStatement(sampleHtml);

    expect(metrics).toHaveLength(3);
    expect(metrics[1]?.label).toBe("ROE");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.netProfitCrores).toBe(73440.17);
  });

  it("builds a fundamentals snapshot from html", () => {
    const snapshot = parseUpstoxFundamentalsSnapshot(sampleHtml, "INE040A01034");

    expect(snapshot.isin).toBe("INE040A01034");
    expect(snapshot.companyName).toBe("HDFC Bank");
    expect(snapshot.fundamentalMetrics[0]?.label).toBe("P/E ratio");
  });

  it("fetches and parses fundamentals from the stock page", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("INE040A01034");
      return new Response(sampleHtml, { status: 200 });
    }) as unknown as typeof fetch;

    const snapshot = await Effect.runPromise(
      fetchUpstoxFundamentalsSnapshot("INE040A01034", fetchStub),
    );

    expect(snapshot.companyName).toBe("HDFC Bank");
    expect(snapshot.revenueStatement).toHaveLength(2);
  });
});
