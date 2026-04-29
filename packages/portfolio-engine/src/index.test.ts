import { describe, expect, it } from "bun:test";

import type { BrokerHolding, DailyResearchResult } from "@tradeai/domain";

import {
  assessPositionAgainstResearch,
  deriveResearchQueryFromPositionSymbol,
  diffPortfolioPositions,
  inferHoldingAssetType,
  normalizeBrokerHoldings,
  scorePortfolioFit,
  summarizeHoldingResearchReviews,
  summarizePortfolioPositions,
} from "./index.ts";

describe("portfolio-engine", () => {
  it("marks low exposure sectors as a good fit", () => {
    const result = scorePortfolioFit("defense", [
      { sectorSlug: "banks", percentage: 30 },
      { sectorSlug: "it", percentage: 20 },
    ]);

    expect(result.label).toBe("good_fit");
    expect(result.total).toBe(90);
  });

  it("marks high exposure sectors as crowded", () => {
    const result = scorePortfolioFit("banks", [{ sectorSlug: "banks", percentage: 40 }]);

    expect(result.label).toBe("crowded");
    expect(result.total).toBe(50);
  });

  it("normalizes broker holdings into portfolio positions", () => {
    const holdings: BrokerHolding[] = [
      {
        broker: "indstocks",
        securityId: "12345",
        tradingSymbol: "RELIANCE-EQ",
        instrumentName: "Reliance Industries Limited",
        exchangeSegment: "NSE_EQ",
        isin: "INE002A01018",
        quantity: 50,
        averagePrice: 2200,
        lastTradedPrice: 2505.1,
        closePrice: 2495,
        marketValue: 125255,
        pnlAbsolute: 15255,
        pnlPercent: 13.87,
      },
    ];

    const positions = normalizeBrokerHoldings(holdings);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.symbol).toBe("RELIANCE-EQ");
    expect(positions[0]?.assetType).toBe("stock");
    expect(positions[0]?.securityId).toBe("12345");
    expect(positions[0]?.instrumentName).toBe("Reliance Industries Limited");
  });

  it("classifies ETFs, gold, and mutual funds from broker holdings", () => {
    const baseHolding: BrokerHolding = {
      broker: "indstocks",
      securityId: "id",
      tradingSymbol: "NIFTYBEES",
      exchangeSegment: "NSE_EQ",
      isin: "INF204KB14I2",
      quantity: 1,
      averagePrice: 1,
      lastTradedPrice: 1,
      closePrice: 1,
      marketValue: 1,
      pnlAbsolute: 0,
      pnlPercent: 0,
    };

    expect(inferHoldingAssetType(baseHolding)).toBe("etf");
    expect(inferHoldingAssetType({ ...baseHolding, tradingSymbol: "TATAGOLD" })).toBe("gold");
    expect(inferHoldingAssetType({ ...baseHolding, exchangeSegment: "MF" })).toBe("mutual_fund");
  });

  it("summarizes normalized positions", () => {
    const summary = summarizePortfolioPositions([
      {
        symbol: "RELIANCE-EQ",
        isin: "INE002A01018",
        exchangeSegment: "NSE_EQ",
        quantity: 50,
        averagePrice: 2200,
        lastTradedPrice: 2505.1,
        closePrice: 2495,
        marketValue: 125255,
        pnlAbsolute: 15255,
        pnlPercent: 13.87,
        sourceBroker: "indstocks",
      },
      {
        symbol: "INFY-EQ",
        isin: "INE009A01021",
        exchangeSegment: "NSE_EQ",
        quantity: 10,
        averagePrice: 1500,
        lastTradedPrice: 1400,
        closePrice: 1410,
        marketValue: 14000,
        pnlAbsolute: -1000,
        pnlPercent: -7.14,
        sourceBroker: "indstocks",
      },
    ]);

    expect(summary.holdingsCount).toBe(2);
    expect(summary.topWinnerSymbol).toBe("RELIANCE-EQ");
    expect(summary.topLoserSymbol).toBe("INFY-EQ");
  });

  it("assesses a holding against research output", () => {
    const position = {
      symbol: "RELIANCE-EQ",
      isin: "INE002A01018",
      exchangeSegment: "NSE_EQ",
      quantity: 50,
      averagePrice: 2200,
      lastTradedPrice: 2505.1,
      closePrice: 2495,
      marketValue: 125255,
      pnlAbsolute: 15255,
      pnlPercent: 13.87,
      sourceBroker: "indstocks",
    } as const;

    const research = {
      runLabel: "live-run",
      sector: {
        slug: "unclassified",
        name: "Unclassified",
        macroTailwind: 50,
        policySupport: 50,
        geopoliticalEffect: 50,
        upcomingCatalysts: 50,
        sectorSentiment: 50,
        structuralDurability: 50,
        regulatoryRisk: 50,
      },
      sectorScore: { total: 50, label: "watch", reasons: [] },
      instrument: {
        symbol: "RELIANCE",
        name: "Reliance Industries",
        sectorSlug: "unclassified",
        assetType: "stock",
        financialQuality: 60,
        businessQuality: 60,
        managementGovernance: 60,
        sectorAlignment: 50,
        stabilityProfile: 60,
        upsidePotential: 60,
        currentEventContext: 60,
      },
      instrumentScore: { total: 60, label: "research_further", reasons: [] },
      portfolioFit: { total: 90, label: "good_fit", reasons: [] },
      memoryContext: { previousVerdict: "watch", previousConviction: 50, notes: [] },
      recommendation: {
        verdict: "buy",
        conviction: 70,
        stability: "strengthening",
        riskBucket: "moderate",
        keyReasons: [],
        mainRisks: [],
        invalidationConditions: [],
      },
      researchQuality: {
        source: "market",
        completeness: "complete",
        missingSignals: [],
        fallbacksUsed: [],
      },
    } satisfies DailyResearchResult;

    const assessment = assessPositionAgainstResearch(position, research);
    expect(assessment.status).toBe("aligned");
  });

  it("diffs portfolio position snapshots", () => {
    const diff = diffPortfolioPositions(
      [
        {
          symbol: "RELIANCE-EQ",
          isin: "INE002A01018",
          exchangeSegment: "NSE_EQ",
          quantity: 50,
          averagePrice: 2200,
          lastTradedPrice: 2505.1,
          closePrice: 2495,
          marketValue: 125255,
          pnlAbsolute: 15255,
          pnlPercent: 13.87,
          sourceBroker: "indstocks",
        },
        {
          symbol: "INFY-EQ",
          isin: "INE009A01021",
          exchangeSegment: "NSE_EQ",
          quantity: 10,
          averagePrice: 1500,
          lastTradedPrice: 1400,
          closePrice: 1410,
          marketValue: 14000,
          pnlAbsolute: -1000,
          pnlPercent: -7.14,
          sourceBroker: "indstocks",
        },
      ],
      [
        {
          symbol: "RELIANCE-EQ",
          isin: "INE002A01018",
          exchangeSegment: "NSE_EQ",
          quantity: 55,
          averagePrice: 2200,
          lastTradedPrice: 2505.1,
          closePrice: 2495,
          marketValue: 137780.5,
          pnlAbsolute: 16780.5,
          pnlPercent: 13.87,
          sourceBroker: "indstocks",
        },
        {
          symbol: "TCS-EQ",
          isin: "INE467B01029",
          exchangeSegment: "NSE_EQ",
          quantity: 5,
          averagePrice: 3600,
          lastTradedPrice: 3700,
          closePrice: 3690,
          marketValue: 18500,
          pnlAbsolute: 500,
          pnlPercent: 2.77,
          sourceBroker: "indstocks",
        },
      ],
    );

    expect(diff.newPositions).toBe(1);
    expect(diff.exitedPositions).toBe(1);
    expect(diff.changedPositions).toBe(1);
    expect(diff.unchangedPositions).toBe(0);
  });

  it("derives a research query from a held broker symbol", () => {
    expect(deriveResearchQueryFromPositionSymbol("RELIANCE-EQ")).toBe("RELIANCE");
    expect(deriveResearchQueryFromPositionSymbol("M&M-EQ")).toBe("M&M");
  });

  it("summarizes holding research review statuses", () => {
    const summary = summarizeHoldingResearchReviews([
      { symbol: "RELIANCE-EQ", query: "RELIANCE", status: "aligned", reason: "ok" },
      { symbol: "INFY-EQ", query: "INFY", status: "conflict", reason: "reject" },
      { symbol: "TCS-EQ", query: "TCS", status: "error", reason: "token missing" },
    ]);

    expect(summary.holdingsReviewed).toBe(3);
    expect(summary.alignedCount).toBe(1);
    expect(summary.conflictCount).toBe(1);
    expect(summary.errorCount).toBe(1);
  });
});
