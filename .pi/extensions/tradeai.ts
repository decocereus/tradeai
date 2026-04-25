import {
  createTradeAiWorkflowService,
  summarizeDailyResearch,
  summarizeBrokerHolding,
  summarizeHoldingsReview,
  summarizeHoldingReviewTrendReport,
  summarizePortfolioDashboardReport,
  summarizePortfolioDecisionReport,
  summarizePortfolioDiff,
  summarizePortfolioSyncReport,
  summarizeBrokerTradeFill,
} from "../../packages/app-services/src/index.ts";
import { Type } from "@mariozechner/pi-ai";
import { Effect } from "effect";
import {
  defineTool,
  type ExtensionCommandContext,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";

const tradeAi = createTradeAiWorkflowService();

const tradeAiSnapshotTool = defineTool({
  name: "tradeai_daily_research_snapshot",
  label: "TradeAI Snapshot",
  description: "Return the explicit demo TradeAI research snapshot and recommendation summary.",
  parameters: Type.Object({}),
  async execute() {
    const result = await Effect.runPromise(tradeAi.runDemoResearchSnapshot());
    const summary = summarizeDailyResearch(result);

    return {
      content: [{ type: "text", text: summary }],
      details: {
        runLabel: result.runLabel,
        verdict: result.recommendation.verdict,
        conviction: result.recommendation.conviction,
        instrument: result.instrument.symbol,
      },
    };
  },
});

const tradeAiAmfiNavLookupTool = defineTool({
  name: "tradeai_amfi_nav_lookup",
  label: "TradeAI AMFI NAV",
  description: "Look up Indian mutual fund NAV data from the official AMFI NAV feed.",
  parameters: Type.Object({
    query: Type.String({ description: "Scheme code or part of the scheme name." }),
  }),
  async execute(_toolCallId, params) {
    const entries = await Effect.runPromise(tradeAi.lookupAmfiNav(params.query));
    const summary =
      entries.length === 0
        ? "No AMFI schemes matched the query."
        : entries
            .map(
              (entry) =>
                `${entry.schemeCode} | ${entry.schemeName} | NAV ${entry.netAssetValue} | ${entry.date}`,
            )
            .join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        query: params.query,
        count: entries.length,
      },
    };
  },
});

const tradeAiEquitySearchTool = defineTool({
  name: "tradeai_equity_search",
  label: "TradeAI Equity Search",
  description: "Search Indian equity instruments through the Upstox market API.",
  parameters: Type.Object({
    query: Type.String({ description: "Company or trading symbol to search for." }),
  }),
  async execute(_toolCallId, params) {
    const entries = await Effect.runPromise(tradeAi.searchEquities(params.query));
    const summary =
      entries.length === 0
        ? "No equity instruments matched the query."
        : entries
            .slice(0, 10)
            .map(
              (entry) =>
                `${entry.instrumentKey} | ${entry.tradingSymbol} | ${entry.shortName} | ${entry.exchange}`,
            )
            .join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        query: params.query,
        count: entries.length,
      },
    };
  },
});

const tradeAiEquityQuoteTool = defineTool({
  name: "tradeai_equity_quote_snapshot",
  label: "TradeAI Equity Quote",
  description: "Fetch quote snapshots for one or more Indian equity instrument keys through Upstox.",
  parameters: Type.Object({
    instrumentKeys: Type.Array(Type.String({ description: "Upstox instrument key." })),
  }),
  async execute(_toolCallId, params) {
    const snapshots = await Effect.runPromise(tradeAi.getEquityQuoteSnapshots({ instrumentKeys: params.instrumentKeys }));
    const summary =
      snapshots.length === 0
        ? "No quote snapshots were returned."
        : snapshots
            .map(
              (snapshot) =>
                `${snapshot.instrumentKey} | ${snapshot.tradingSymbol} | last ${snapshot.lastPrice}`,
            )
            .join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        count: snapshots.length,
      },
    };
  },
});

const tradeAiEquityResearchTool = defineTool({
  name: "tradeai_equity_research",
  label: "TradeAI Equity Research",
  description: "Run the current TradeAI market-driven equity research flow for an Indian stock query.",
  parameters: Type.Object({
    query: Type.String({ description: "Company or trading symbol to research." }),
  }),
  async execute(_toolCallId, params) {
    const result = await Effect.runPromise(tradeAi.runEquityResearch({ query: params.query }));
    const summary = summarizeDailyResearch(result);

    return {
      content: [{ type: "text", text: summary }],
      details: {
        runLabel: result.runLabel,
        verdict: result.recommendation.verdict,
        conviction: result.recommendation.conviction,
        instrument: result.instrument.symbol,
      },
    };
  },
});

const tradeAiCorporateEventsTool = defineTool({
  name: "tradeai_corporate_events",
  label: "TradeAI Corporate Events",
  description: "Search recent BSE corporate announcement events for an Indian company or query.",
  parameters: Type.Object({
    query: Type.String({ description: "Company name, symbol, or event query." }),
  }),
  async execute(_toolCallId, params) {
    const events = await Effect.runPromise(tradeAi.lookupCorporateEvents(params.query));
    const summary =
      events.length === 0
        ? "No corporate events matched the query."
        : events
            .slice(0, 10)
            .map((event) => `${event.publishedAt} | ${event.title} | ${event.description}`)
            .join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        query: params.query,
        count: events.length,
      },
    };
  },
});

const tradeAiBrokerHoldingsTool = defineTool({
  name: "tradeai_broker_holdings",
  label: "TradeAI Broker Holdings",
  description: "Fetch current INDstocks or INDmoney-linked holdings.",
  parameters: Type.Object({}),
  async execute() {
    const holdings = await Effect.runPromise(tradeAi.getBrokerHoldings());
    const summary =
      holdings.length === 0
        ? "No broker holdings returned."
        : holdings
            .slice(0, 20)
            .map((holding) =>
              summarizeBrokerHolding(
                holding.tradingSymbol,
                holding.instrumentName,
                holding.quantity,
                holding.averagePrice,
                holding.pnlPercent,
              ),
            )
            .join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: { count: holdings.length },
    };
  },
});

const tradeAiBrokerTradeBookTool = defineTool({
  name: "tradeai_broker_trade_book",
  label: "TradeAI Broker Trade Book",
  description: "Fetch same-day INDstocks trade-book fills for a segment.",
  parameters: Type.Object({
    segment: Type.String({ description: "EQUITY or DERIVATIVE" }),
  }),
  async execute(_toolCallId, params) {
    const segment = params.segment === "DERIVATIVE" ? "DERIVATIVE" : "EQUITY";
    const fills = await Effect.runPromise(tradeAi.getBrokerTradeBook({ segment }));
    const summary =
      fills.length === 0
        ? "No broker trade fills returned."
        : fills
            .slice(0, 20)
            .map((fill) =>
              summarizeBrokerTradeFill(fill.tradeDate, fill.scripCode, fill.quantity, fill.price),
            )
            .join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: { count: fills.length, segment },
    };
  },
});

const tradeAiBrokerSyncTool = defineTool({
  name: "tradeai_broker_sync",
  label: "TradeAI Broker Sync",
  description: "Fetch holdings and trade fills, compare against the latest persisted snapshot, and persist the new snapshot when DATABASE_URL is configured.",
  parameters: Type.Object({}),
  async execute() {
    const report = await Effect.runPromise(tradeAi.syncBrokerPortfolio());
    const summary = [
      summarizePortfolioSyncReport(report),
      summarizePortfolioDiff(
        report.diff.newPositions,
        report.diff.exitedPositions,
        report.diff.changedPositions,
        report.diff.unchangedPositions,
      ),
    ].join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        snapshotId: report.currentSnapshotId,
        persisted: report.persisted,
      },
    };
  },
});

const tradeAiHoldingsReviewTool = defineTool({
  name: "tradeai_holdings_review",
  label: "TradeAI Holdings Review",
  description: "Run current research against live broker holdings and classify each holding as aligned, review, or conflict.",
  parameters: Type.Object({}),
  async execute() {
    const report = await Effect.runPromise(tradeAi.reviewBrokerHoldingsAgainstResearch());
    const summary = [
      summarizeHoldingsReview(report),
      ...report.reviews.slice(0, 10).map((review) => `${review.symbol} | ${review.status} | ${review.reason}`),
    ].join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        reviewed: report.holdingsReviewed,
        conflicts: report.conflictCount,
      },
    };
  },
});

const tradeAiPortfolioDecisionTool = defineTool({
  name: "tradeai_portfolio_decision",
  label: "TradeAI Portfolio Decision",
  description: "Run the full broker portfolio sync and holdings review workflow and summarize the decision state.",
  parameters: Type.Object({}),
  async execute() {
    const report = await Effect.runPromise(tradeAi.reviewSyncedBrokerPortfolio());
    const summary = [
      summarizePortfolioDecisionReport(report),
      summarizePortfolioDiff(
        report.sync.diff.newPositions,
        report.sync.diff.exitedPositions,
        report.sync.diff.changedPositions,
        report.sync.diff.unchangedPositions,
      ),
      ...report.review.reviews
        .slice(0, 10)
        .map((review) => `${review.symbol} | ${review.status} | ${review.reason}`),
    ].join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        reviewed: report.review.holdingsReviewed,
        conflicts: report.review.conflictCount,
      },
    };
  },
});

const tradeAiHoldingHistoryTool = defineTool({
  name: "tradeai_holding_history",
  label: "TradeAI Holding History",
  description: "Load persisted holdings review history for one symbol and summarize the current trend.",
  parameters: Type.Object({
    symbol: Type.String({ description: "Held broker symbol, for example RELIANCE-EQ" }),
  }),
  async execute(_toolCallId, params) {
    const trend = await Effect.runPromise(tradeAi.getHoldingReviewTrend({ symbol: params.symbol }));
    const summary = trend
      ? [
          summarizeHoldingReviewTrendReport(trend),
          ...trend.history.slice(0, 10).map((entry) => `${entry.reviewedAt} | ${entry.status} | ${entry.reason}`),
        ].join("\n")
      : "No persisted review history found.";

    return {
      content: [{ type: "text", text: summary }],
      details: {
        symbol: params.symbol,
        found: Boolean(trend),
      },
    };
  },
});

const tradeAiPortfolioDashboardTool = defineTool({
  name: "tradeai_portfolio_dashboard",
  label: "TradeAI Portfolio Dashboard",
  description: "Load the latest persisted portfolio dashboard with current review counts, conflicts, and streaks.",
  parameters: Type.Object({}),
  async execute() {
    const report = await Effect.runPromise(tradeAi.getPortfolioDashboard());
    const summary = [
      summarizePortfolioDashboardReport(report),
      ...report.topConflicts.slice(0, 5).map((review) => `${review.symbol} | ${review.status}`),
      ...report.streakLeaders
        .slice(0, 5)
        .map((trend) => summarizeHoldingReviewTrendReport(trend)),
    ].join("\n");

    return {
      content: [{ type: "text", text: summary }],
      details: {
        broker: report.broker,
        recentSnapshots: report.recentSnapshots.length,
      },
    };
  },
});

export default function tradeAiExtension(pi: ExtensionAPI) {
  pi.registerTool(tradeAiSnapshotTool);
  pi.registerTool(tradeAiAmfiNavLookupTool);
  pi.registerTool(tradeAiEquitySearchTool);
  pi.registerTool(tradeAiEquityQuoteTool);
  pi.registerTool(tradeAiEquityResearchTool);
  pi.registerTool(tradeAiCorporateEventsTool);
  pi.registerTool(tradeAiBrokerHoldingsTool);
  pi.registerTool(tradeAiBrokerTradeBookTool);
  pi.registerTool(tradeAiBrokerSyncTool);
  pi.registerTool(tradeAiHoldingsReviewTool);
  pi.registerTool(tradeAiPortfolioDecisionTool);
  pi.registerTool(tradeAiHoldingHistoryTool);
  pi.registerTool(tradeAiPortfolioDashboardTool);

  pi.registerCommand("tradeai-status", {
    description: "Show the explicit demo TradeAI research snapshot.",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const result = await Effect.runPromise(tradeAi.runDemoResearchSnapshot());
      ctx.ui.notify(summarizeDailyResearch(result), "info");
    },
  });

  pi.registerCommand("tradeai-amfi", {
    description: "Look up mutual fund NAV data from the AMFI feed.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const entries = await Effect.runPromise(tradeAi.lookupAmfiNav(args));
      const message =
        entries.length === 0
          ? "No AMFI schemes matched the query."
          : entries
              .slice(0, 5)
              .map((entry) => `${entry.schemeCode} | ${entry.schemeName} | NAV ${entry.netAssetValue}`)
              .join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-equity-search", {
    description: "Search Indian equities through Upstox.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const entries = await Effect.runPromise(tradeAi.searchEquities(args));
      const message =
        entries.length === 0
          ? "No equity instruments matched the query."
          : entries
              .slice(0, 5)
              .map((entry) => `${entry.instrumentKey} | ${entry.tradingSymbol} | ${entry.shortName}`)
              .join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-equity-research", {
    description: "Run the current equity research flow through TradeAI.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const result = await Effect.runPromise(tradeAi.runEquityResearch({ query: args }));
      ctx.ui.notify(summarizeDailyResearch(result), "info");
    },
  });

  pi.registerCommand("tradeai-events", {
    description: "Search recent BSE corporate announcement events.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const events = await Effect.runPromise(tradeAi.lookupCorporateEvents(args));
      const message =
        events.length === 0
          ? "No corporate events matched the query."
          : events
              .slice(0, 5)
              .map((event) => `${event.publishedAt} | ${event.title}`)
              .join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-holdings", {
    description: "Fetch current broker holdings from INDstocks.",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const holdings = await Effect.runPromise(tradeAi.getBrokerHoldings());
      const message =
        holdings.length === 0
          ? "No holdings returned."
          : holdings
              .slice(0, 5)
              .map((holding) =>
                summarizeBrokerHolding(
                  holding.tradingSymbol,
                  holding.instrumentName,
                  holding.quantity,
                  holding.averagePrice,
                  holding.pnlPercent,
                ),
              )
              .join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-review-holdings", {
    description: "Run research against current broker holdings and classify the results.",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const report = await Effect.runPromise(tradeAi.reviewBrokerHoldingsAgainstResearch());
      const message = [
        summarizeHoldingsReview(report),
        ...report.reviews.slice(0, 5).map((review) => `${review.symbol} | ${review.status}`),
      ].join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-sync", {
    description: "Run the broker holdings snapshot sync and diff flow.",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const report = await Effect.runPromise(tradeAi.syncBrokerPortfolio());
      const message = [
        summarizePortfolioSyncReport(report),
        summarizePortfolioDiff(
          report.diff.newPositions,
          report.diff.exitedPositions,
          report.diff.changedPositions,
          report.diff.unchangedPositions,
        ),
      ].join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-portfolio-decision", {
    description: "Run the combined sync and holdings review workflow.",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const report = await Effect.runPromise(tradeAi.reviewSyncedBrokerPortfolio());
      const message = [
        summarizePortfolioDecisionReport(report),
        summarizePortfolioDiff(
          report.sync.diff.newPositions,
          report.sync.diff.exitedPositions,
          report.sync.diff.changedPositions,
          report.sync.diff.unchangedPositions,
        ),
        ...report.review.reviews.slice(0, 5).map((review) => `${review.symbol} | ${review.status}`),
      ].join("\n");
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-holding-history", {
    description: "Show persisted holdings review history for one symbol.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trend = await Effect.runPromise(tradeAi.getHoldingReviewTrend({ symbol: args }));
      const message = trend
        ? [
            summarizeHoldingReviewTrendReport(trend),
            ...trend.history.slice(0, 5).map((entry) => `${entry.reviewedAt} | ${entry.status}`),
          ].join("\n")
        : "No persisted review history found.";
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("tradeai-dashboard", {
    description: "Show the latest persisted portfolio dashboard.",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const broker =
        args.trim() === "manual_csv" || args.trim() === "indstocks"
          ? (args.trim() as "manual_csv" | "indstocks")
          : undefined;
      const report = await Effect.runPromise(
        tradeAi.getPortfolioDashboard(broker ? { broker } : {}),
      );
      const message = [
        summarizePortfolioDashboardReport(report),
        ...report.topConflicts.slice(0, 5).map((review) => `${review.symbol} | ${review.status}`),
        ...report.streakLeaders
          .slice(0, 5)
          .map((trend) => summarizeHoldingReviewTrendReport(trend)),
      ].join("\n");
      ctx.ui.notify(message, "info");
    },
  });
}
