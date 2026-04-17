import {
  createPiTradeAiSession,
  inspectPiResources,
} from "@tradeai/agent-runtime";
import type { PortfolioDashboardReport } from "@tradeai/domain";
import {
  canPersistPortfolioMemory,
  diffBrokerPortfolioAgainstLatestSnapshot,
  getBrokerHoldings,
  getBrokerPortfolioSummary,
  getBrokerTradeBook,
  getEquityQuoteSnapshots,
  getHoldingReviewTrend,
  getPortfolioDashboard,
  importManualPortfolioSnapshot,
  lookupCorporateEvents,
  lookupAmfiNav,
  persistBrokerPortfolioMemorySnapshot,
  reviewSyncedBrokerPortfolio,
  reviewBrokerHoldingsAgainstResearch,
  reviewImportedPortfolioDecision,
  syncBrokerPortfolio,
  runDailyResearch,
  runEquityResearch,
  searchEquities,
  summarizeBrokerHolding,
  summarizeHoldingsReview,
  summarizeHoldingReviewTrendReport,
  summarizePortfolioDashboardReport,
  summarizePortfolioDecisionReport,
  summarizePortfolioSyncReport,
  summarizePortfolioDiff,
  summarizePortfolioSummary,
  summarizeBrokerTradeFill,
  summarizeCorporateEvent,
  summarizeDailyResearch,
  summarizeQuoteSnapshot,
} from "@tradeai/app-services";
import { Effect } from "effect";

const renderList = (title: string, items: readonly string[]) => {
  console.log(`\n${title}`);
  for (const item of items) {
    console.log(`- ${item}`);
  }
};

const renderDivider = (title: string) => {
  console.log(`\n== ${title} ==`);
};

const args = process.argv.slice(2);
const piPromptIndex = args.findIndex((arg) => arg === "--pi");
const amfiQueryIndex = args.findIndex((arg) => arg === "--amfi");
const upstoxSearchIndex = args.findIndex((arg) => arg === "--upstox-search");
const upstoxQuoteIndex = args.findIndex((arg) => arg === "--upstox-quote");
const eventsIndex = args.findIndex((arg) => arg === "--events");
const holdingsFlag = args.includes("--holdings");
const tradeBookIndex = args.findIndex((arg) => arg === "--trade-book");
const persistHoldingsFlag = args.includes("--persist-holdings");
const diffHoldingsFlag = args.includes("--diff-holdings");
const syncPortfolioFlag = args.includes("--sync-portfolio");
const reviewHoldingsFlag = args.includes("--review-holdings");
const portfolioDecisionFlag = args.includes("--portfolio-decision");
const dashboardFlag = args.includes("--dashboard");
const dashboardBrokerIndex = args.findIndex((arg) => arg === "--dashboard-broker");
const holdingHistoryIndex = args.findIndex((arg) => arg === "--holding-history");
const holdingHistoryBrokerIndex = args.findIndex((arg) => arg === "--holding-history-broker");
const importHoldingsIndex = args.findIndex((arg) => arg === "--import-holdings");
const importTradesIndex = args.findIndex((arg) => arg === "--import-trades");
const manualDecisionFlag = args.includes("--manual-decision");
const piPrompt =
  piPromptIndex >= 0 ? args.slice(piPromptIndex + 1).join(" ").trim() || "Summarize this repo." : undefined;
const amfiQuery =
  amfiQueryIndex >= 0 ? args.slice(amfiQueryIndex + 1).join(" ").trim() || "parag parikh" : undefined;
const upstoxSearchQuery =
  upstoxSearchIndex >= 0
    ? args.slice(upstoxSearchIndex + 1).join(" ").trim() || "reliance"
    : undefined;
const equityResearchIndex = args.findIndex((arg) => arg === "--equity-research");
const upstoxQuoteKeys =
  upstoxQuoteIndex >= 0
    ? args
        .slice(upstoxQuoteIndex + 1)
        .join(" ")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
const equityResearchQuery =
  equityResearchIndex >= 0
    ? args.slice(equityResearchIndex + 1).join(" ").trim() || "reliance"
    : undefined;
const eventsQuery =
  eventsIndex >= 0 ? args.slice(eventsIndex + 1).join(" ").trim() || "reliance" : undefined;
const tradeBookSegment =
  tradeBookIndex >= 0
    ? (args.slice(tradeBookIndex + 1).join(" ").trim().toUpperCase() || "EQUITY")
    : undefined;
const holdingHistorySymbol =
  holdingHistoryIndex >= 0
    ? args[holdingHistoryIndex + 1]?.trim() || "RELIANCE-EQ"
    : undefined;
const dashboardBrokerRaw =
  dashboardBrokerIndex >= 0 ? args[dashboardBrokerIndex + 1]?.trim().toLowerCase() : undefined;
const dashboardBroker =
  dashboardBrokerRaw === "indstocks" || dashboardBrokerRaw === "manual_csv"
    ? dashboardBrokerRaw
    : undefined;
const holdingHistoryBrokerRaw =
  holdingHistoryBrokerIndex >= 0
    ? args[holdingHistoryBrokerIndex + 1]?.trim().toLowerCase()
    : undefined;
const holdingHistoryBroker =
  holdingHistoryBrokerRaw === "indstocks" || holdingHistoryBrokerRaw === "manual_csv"
    ? holdingHistoryBrokerRaw
    : undefined;
const importHoldingsPath =
  importHoldingsIndex >= 0 ? args[importHoldingsIndex + 1] : undefined;
const importTradesPath =
  importTradesIndex >= 0 ? args[importTradesIndex + 1] : undefined;

const hasExplicitPrimaryAction =
  Boolean(piPrompt) ||
  Boolean(amfiQuery) ||
  Boolean(upstoxSearchQuery) ||
  Boolean(upstoxQuoteKeys?.length) ||
  Boolean(equityResearchQuery) ||
  Boolean(eventsQuery) ||
  holdingsFlag ||
  Boolean(tradeBookSegment) ||
  persistHoldingsFlag ||
  diffHoldingsFlag ||
  syncPortfolioFlag ||
  reviewHoldingsFlag ||
  portfolioDecisionFlag ||
  Boolean(holdingHistorySymbol) ||
  Boolean(importHoldingsPath) ||
  manualDecisionFlag;

const shouldAutoRenderDashboard = !dashboardFlag && !hasExplicitPrimaryAction && canPersistPortfolioMemory();
const shouldRenderDashboard = dashboardFlag || shouldAutoRenderDashboard;

const renderDashboardSection = (
  report: PortfolioDashboardReport,
  options?: {
    autoHome?: boolean;
  },
) => {
  console.log(summarizePortfolioDashboardReport(report));
  if (report.latestSnapshot) {
    console.log(
      summarizePortfolioSummary(
        report.latestSnapshot.summary.holdingsCount,
        report.latestSnapshot.summary.totalMarketValue,
        report.latestSnapshot.summary.weightedPnlPercent,
      ),
    );
  }

  if (report.recentSnapshots.length > 0) {
    renderList(
      "Recent snapshots",
      report.recentSnapshots.map(
        (snapshot) => `${snapshot.capturedAt} | ${snapshot.broker} | ${snapshot.snapshotId}`,
      ),
    );
  }

  if (report.latestReview) {
    console.log(summarizeHoldingsReview(report.latestReview));
  }

  if (report.latestDiff) {
    console.log(
      summarizePortfolioDiff(
        report.latestDiff.newPositions,
        report.latestDiff.exitedPositions,
        report.latestDiff.changedPositions,
        report.latestDiff.unchangedPositions,
      ),
    );
  }

  if (report.reviewSnapshot && report.reviewSnapshot.snapshotId !== report.latestSnapshot?.snapshotId) {
    console.log(
      `Review snapshot: ${report.reviewSnapshot.capturedAt} | ${report.reviewSnapshot.snapshotId}`,
    );
  }

  if (report.todaysActions.length > 0) {
    renderList(
      "Today's action list",
      report.todaysActions.map(
        (action) => `[${action.priority}] ${action.title} | ${action.detail}`,
      ),
    );
  }

  if (report.topWinners.length > 0) {
    renderList(
      "Top winners",
      report.topWinners.map(
        (position) =>
          `${position.symbol} | pnl ${position.pnlPercent.toFixed(2)}% | value ${position.marketValue.toFixed(2)}`,
      ),
    );
  }

  if (report.topLosers.length > 0) {
    renderList(
      "Top losers",
      report.topLosers.map(
        (position) =>
          `${position.symbol} | pnl ${position.pnlPercent.toFixed(2)}% | value ${position.marketValue.toFixed(2)}`,
      ),
    );
  }

  if (report.topConflicts.length > 0) {
    renderList(
      "Top conflicts",
      report.topConflicts.map(
        (review) => `${review.symbol} | ${review.status} | ${review.reason}`,
      ),
    );
  }

  if (report.topReviewCandidates.length > 0) {
    renderList(
      "Top review candidates",
      report.topReviewCandidates.map(
        (review) => `${review.symbol} | ${review.status} | ${review.reason}`,
      ),
    );
  }

  if (report.statusChanges.length > 0) {
    renderList(
      "Status changes",
      report.statusChanges.map((change) =>
        change.changeType === "newly_reviewed"
          ? `${change.symbol} | ${change.currentStatus} | newly reviewed`
          : `${change.symbol} | ${change.previousStatus} -> ${change.currentStatus}`,
      ),
    );
  }

  if (report.unreviewedPositions.length > 0) {
    renderList(
      "New positions without review",
      report.unreviewedPositions.map(
        (position) =>
          `${position.symbol} | pnl ${position.pnlPercent.toFixed(2)}% | value ${position.marketValue.toFixed(2)}`,
      ),
    );
  }

  if (report.streakLeaders.length > 0) {
    renderList(
      "Longest active streaks",
      report.streakLeaders.map(summarizeHoldingReviewTrendReport),
    );
  }

  if (options?.autoHome) {
    renderList("Quick commands", [
      "bun run dev:tui -- --manual-decision --import-holdings /path/to/holdings.csv --import-trades /path/to/trades.csv",
      "bun run dev:tui -- --holding-history RELIANCE-EQ --holding-history-broker manual_csv",
      "bun run dev:tui -- --dashboard",
    ]);
  }
};

const main = Effect.gen(function* () {
  if (shouldAutoRenderDashboard) {
    console.log("TradeAI Home");
    console.log("============");
    renderDivider("Portfolio Dashboard");
    const report = yield* getPortfolioDashboard(dashboardBroker).pipe(
      Effect.catchAll((error) => {
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    if (!report) {
      console.log("No dashboard report was produced.");
    } else {
      console.log("Auto mode: showing the latest persisted portfolio dashboard.");
      renderDashboardSection(report, { autoHome: true });
    }
    return;
  }

  const result = yield* runDailyResearch;
  const piResources = yield* inspectPiResources();

  console.log("TradeAI Research Cockpit");
  console.log("========================");

  renderDivider("Baseline Research");
  console.log(`Run label: ${result.runLabel}`);
  console.log(summarizeDailyResearch(result));
  console.log(`Sector score: ${result.sectorScore.total}/100 (${result.sectorScore.label})`);
  console.log(`Instrument score: ${result.instrumentScore.total}/100 (${result.instrumentScore.label})`);
  console.log(`Portfolio fit: ${result.portfolioFit.total}/100 (${result.portfolioFit.label})`);

  renderList("Why it scored well", result.recommendation.keyReasons);
  renderList("Main risks", result.recommendation.mainRisks);
  renderList("Invalidation conditions", result.recommendation.invalidationConditions);
  renderList("Memory context", result.memoryContext.notes);
  if (result.technicalAnalysis) {
    renderDivider("Technical Analysis");
    console.log(`Trend: ${result.technicalAnalysis.trend}`);
    console.log(`Latest close: ${result.technicalAnalysis.latestClose}`);
    if (result.technicalAnalysis.sma20 !== undefined) {
      console.log(`SMA20: ${result.technicalAnalysis.sma20.toFixed(2)}`);
    }
    if (result.technicalAnalysis.sma50 !== undefined) {
      console.log(`SMA50: ${result.technicalAnalysis.sma50.toFixed(2)}`);
    }
    if (result.technicalAnalysis.rsi14 !== undefined) {
      console.log(`RSI14: ${result.technicalAnalysis.rsi14.toFixed(2)}`);
    }
    if (result.technicalAnalysis.oneMonthReturnPct !== undefined) {
      console.log(`1M return: ${result.technicalAnalysis.oneMonthReturnPct.toFixed(2)}%`);
    }
  }

  renderDivider("Pi Resources");
  console.log(`Extensions discovered: ${piResources.extensionCount}`);
  console.log(`Skills discovered: ${piResources.skillCount}`);
  console.log(`Prompts discovered: ${piResources.promptCount}`);
  console.log(`Themes discovered: ${piResources.themeCount}`);
  console.log(`AGENTS files discovered: ${piResources.agentsFileCount}`);
  if (piResources.diagnostics.length > 0) {
    renderList("Pi resource diagnostics", piResources.diagnostics);
  } else {
    console.log("- Pi resource discovery is clean");
  }

  if (piPrompt) {
    renderDivider("Pi Live Session");
    console.log(`Prompt: ${piPrompt}`);
    const piSession = yield* createPiTradeAiSession({ prompt: piPrompt }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({
          sessionId: "unavailable",
          sessionFile: undefined,
          modelId: undefined,
          diagnostics: [error instanceof Error ? error.message : String(error)],
          modelFallbackMessage: undefined,
          output: "",
          finalError: undefined,
        }),
      ),
    );

    console.log(`Session id: ${piSession.sessionId}`);
    console.log(`Model: ${piSession.modelId ?? "not resolved"}`);
    if (piSession.modelFallbackMessage) {
      console.log(`Model fallback: ${piSession.modelFallbackMessage}`);
    }
    renderList("Pi session diagnostics", piSession.diagnostics);
    if (piSession.finalError) {
      console.log("\nPi final error");
      console.log(piSession.finalError);
    }
    if (piSession.output) {
      console.log("\nPi output");
      console.log(piSession.output);
    }
  } else {
    console.log("\nHint: run with `--pi <prompt>` to attempt a live Pi SDK session.");
  }

  if (amfiQuery) {
    const amfiEntries = yield* lookupAmfiNav(amfiQuery).pipe(
      Effect.catchAll((error) => {
        console.log("\nAMFI lookup error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("AMFI Lookup");
    console.log(`Query: ${amfiQuery}`);
    if (amfiEntries.length === 0) {
      console.log("No matching schemes found.");
    } else {
      for (const entry of amfiEntries.slice(0, 5)) {
        console.log(`- ${entry.schemeCode} | ${entry.schemeName} | NAV ${entry.netAssetValue} | ${entry.date}`);
      }
    }
  } else {
    console.log("Hint: run with `--amfi <scheme name or code>` to query the AMFI NAV feed.");
  }

  if (upstoxSearchQuery) {
    const upstoxSearchResults = yield* searchEquities(upstoxSearchQuery).pipe(
      Effect.catchAll((error) => {
        console.log("\nUpstox equity search error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Equity Search");
    console.log(`Query: ${upstoxSearchQuery}`);
    if (upstoxSearchResults.length === 0) {
      console.log("No matching equity instruments found.");
    } else {
      for (const entry of upstoxSearchResults.slice(0, 5)) {
        console.log(`- ${entry.instrumentKey} | ${entry.tradingSymbol} | ${entry.shortName}`);
      }
    }
  } else {
    console.log("Hint: run with `--upstox-search <query>` to search equities through Upstox.");
  }

  if (upstoxQuoteKeys?.length) {
    const upstoxQuoteResults = yield* getEquityQuoteSnapshots(upstoxQuoteKeys).pipe(
      Effect.catchAll((error) => {
        console.log("\nUpstox quote error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Quote Snapshots");
    console.log(`Instrument keys: ${upstoxQuoteKeys.join(", ")}`);
    if (upstoxQuoteResults.length === 0) {
      console.log("No quote snapshots returned.");
    } else {
      for (const entry of upstoxQuoteResults.slice(0, 5)) {
        console.log(`- ${summarizeQuoteSnapshot(entry.instrumentKey, entry.tradingSymbol, entry.lastPrice)}`);
      }
    }
  } else {
    console.log("Hint: run with `--upstox-quote <instrument_key[,instrument_key]>` to fetch quote snapshots.");
  }

  if (equityResearchQuery) {
    const equityResearchResult = yield* runEquityResearch(equityResearchQuery).pipe(
      Effect.catchAll((error) => {
        console.log("\nEquity research error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    renderDivider("Equity Research");
    console.log(`Query: ${equityResearchQuery}`);
    if (!equityResearchResult) {
      console.log("No equity research result was produced.");
    } else {
      console.log(summarizeDailyResearch(equityResearchResult));
      console.log(`Sector: ${equityResearchResult.sector.name}`);
      console.log(`Sector score: ${equityResearchResult.sectorScore.total}`);
      console.log(`Instrument score: ${equityResearchResult.instrumentScore.total}`);
      if (equityResearchResult.technicalAnalysis) {
        console.log(`Trend: ${equityResearchResult.technicalAnalysis.trend}`);
        if (equityResearchResult.technicalAnalysis.rsi14 !== undefined) {
          console.log(`RSI14: ${equityResearchResult.technicalAnalysis.rsi14.toFixed(2)}`);
        }
      }
    }
  } else {
    console.log("Hint: run with `--equity-research <query>` to build a live equity research packet.");
  }

  if (eventsQuery) {
    const events = yield* lookupCorporateEvents(eventsQuery).pipe(
      Effect.catchAll((error) => {
        console.log("\nCorporate events error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Corporate Events");
    console.log(`Query: ${eventsQuery}`);
    if (events.length === 0) {
      console.log("No matching corporate events found.");
    } else {
      for (const event of events.slice(0, 5)) {
        console.log(`- ${summarizeCorporateEvent(event.publishedAt, event.title)}`);
      }
    }
  } else {
    console.log("Hint: run with `--events <query>` to search recent corporate announcements.");
  }

  if (holdingsFlag) {
    const portfolioSummary = yield* getBrokerPortfolioSummary().pipe(
      Effect.catchAll(() => Effect.succeed(undefined)),
    );
    const holdings = yield* getBrokerHoldings().pipe(
      Effect.catchAll((error) => {
        console.log("\nBroker holdings error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Broker Holdings");
    if (portfolioSummary) {
      console.log(
        summarizePortfolioSummary(
          portfolioSummary.holdingsCount,
          portfolioSummary.totalMarketValue,
          portfolioSummary.weightedPnlPercent,
        ),
      );
      if (portfolioSummary.topWinnerSymbol) {
        console.log(`Top winner: ${portfolioSummary.topWinnerSymbol}`);
      }
      if (portfolioSummary.topLoserSymbol) {
        console.log(`Top loser: ${portfolioSummary.topLoserSymbol}`);
      }
    }
    if (holdings.length === 0) {
      console.log("No holdings returned.");
    } else {
      for (const holding of holdings.slice(0, 10)) {
        console.log(
          `- ${summarizeBrokerHolding(
            holding.tradingSymbol,
            holding.quantity,
            holding.averagePrice,
            holding.pnlPercent,
          )}`,
        );
      }
    }
  } else {
    console.log("Hint: run with `--holdings` to fetch current broker holdings.");
  }

  if (persistHoldingsFlag) {
    renderDivider("Persist Holdings Snapshot");
    if (!canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. Snapshot persistence is unavailable.");
    } else {
      const persisted = yield* persistBrokerPortfolioMemorySnapshot().pipe(
        Effect.catchAll((error) => {
          console.log(error instanceof Error ? error.message : String(error));
          return Effect.succeed(undefined);
        }),
      );

      if (!persisted) {
        console.log("No snapshot was persisted.");
      } else {
        console.log(`Snapshot: ${persisted.persistence.snapshotId}`);
        console.log(`Positions inserted: ${persisted.persistence.positionsInserted}`);
        console.log(`Trade fills inserted: ${persisted.persistence.tradeFillsInserted}`);
      }
    }
  } else {
    console.log("Hint: run with `--persist-holdings` to store a broker holdings snapshot.");
  }

  if (tradeBookSegment) {
    const segment = tradeBookSegment === "DERIVATIVE" ? "DERIVATIVE" : "EQUITY";
    const fills = yield* getBrokerTradeBook(segment).pipe(
      Effect.catchAll((error) => {
        console.log("\nBroker trade-book error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Broker Trade Book");
    console.log(`Segment: ${segment}`);
    if (fills.length === 0) {
      console.log("No trade fills returned.");
    } else {
      for (const fill of fills.slice(0, 10)) {
        console.log(
          `- ${summarizeBrokerTradeFill(fill.tradeDate, fill.scripCode, fill.quantity, fill.price)}`,
        );
      }
    }
  } else {
    console.log("Hint: run with `--trade-book <EQUITY|DERIVATIVE>` to fetch broker trade fills.");
  }

  if (diffHoldingsFlag) {
    renderDivider("Portfolio Diff");
    if (!canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. Snapshot diffing is unavailable.");
    } else {
      const diffResult = yield* diffBrokerPortfolioAgainstLatestSnapshot().pipe(
        Effect.catchAll((error) => {
          console.log(error instanceof Error ? error.message : String(error));
          return Effect.succeed(undefined);
        }),
      );

      if (!diffResult) {
        console.log("No diff result was produced.");
      } else {
        console.log(
          summarizePortfolioDiff(
            diffResult.diff.newPositions,
            diffResult.diff.exitedPositions,
            diffResult.diff.changedPositions,
            diffResult.diff.unchangedPositions,
          ),
        );
        for (const change of diffResult.diff.changes.slice(0, 10)) {
          console.log(`- ${change.symbol} | ${change.status}`);
        }
      }
    }
  } else {
    console.log("Hint: run with `--diff-holdings` to compare live holdings against the latest snapshot.");
  }

  if (syncPortfolioFlag) {
    renderDivider("Portfolio Sync");
    const report = yield* syncBrokerPortfolio().pipe(
      Effect.catchAll((error) => {
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    if (!report) {
      console.log("No sync report was produced.");
    } else {
      console.log(summarizePortfolioSyncReport(report));
      console.log(
        summarizePortfolioDiff(
          report.diff.newPositions,
          report.diff.exitedPositions,
          report.diff.changedPositions,
          report.diff.unchangedPositions,
        ),
      );
      for (const change of report.diff.changes.slice(0, 10)) {
        console.log(`- ${change.symbol} | ${change.status}`);
      }
    }
  } else {
    console.log("Hint: run with `--sync-portfolio` to fetch, diff, and optionally persist a portfolio snapshot.");
  }

  if (reviewHoldingsFlag) {
    renderDivider("Holdings Review");
    const report = yield* reviewBrokerHoldingsAgainstResearch().pipe(
      Effect.catchAll((error) => {
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    if (!report) {
      console.log("No holdings review report was produced.");
    } else {
      console.log(summarizeHoldingsReview(report));
      for (const review of report.reviews.slice(0, 10)) {
        console.log(`- ${review.symbol} | ${review.status} | ${review.reason}`);
      }
    }
  } else {
    console.log("Hint: run with `--review-holdings` to evaluate current holdings against today’s research.");
  }

  if (portfolioDecisionFlag) {
    renderDivider("Portfolio Decision");
    const report = yield* reviewSyncedBrokerPortfolio().pipe(
      Effect.catchAll((error) => {
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    if (!report) {
      console.log("No portfolio decision report was produced.");
    } else {
      console.log(summarizePortfolioDecisionReport(report));
      console.log(
        summarizePortfolioDiff(
          report.sync.diff.newPositions,
          report.sync.diff.exitedPositions,
          report.sync.diff.changedPositions,
          report.sync.diff.unchangedPositions,
        ),
      );
      console.log(summarizeHoldingsReview(report.review));
      for (const review of report.review.reviews.slice(0, 10)) {
        console.log(`- ${review.symbol} | ${review.status} | ${review.reason}`);
      }
    }
  } else {
    console.log("Hint: run with `--portfolio-decision` to sync, review, and summarize your live holdings.");
  }

  if (shouldRenderDashboard) {
    renderDivider("Portfolio Dashboard");
    if (!canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. The dashboard needs persisted local data.");
    } else {
      if (shouldAutoRenderDashboard) {
        console.log("Auto mode: showing the latest persisted portfolio dashboard.");
      }
      const report = yield* getPortfolioDashboard(dashboardBroker).pipe(
        Effect.catchAll((error) => {
          console.log(error instanceof Error ? error.message : String(error));
          return Effect.succeed(undefined);
        }),
      );

      if (!report) {
        console.log("No dashboard report was produced.");
      } else {
        renderDashboardSection(report);
      }
    }
  } else {
    console.log("Hint: run with `--dashboard` to see the latest persisted portfolio state, actions, conflicts, and streaks.");
  }

  if (holdingHistorySymbol) {
    renderDivider("Holding Review History");
    if (!canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. Review history is unavailable.");
    } else {
      const trend = yield* getHoldingReviewTrend(holdingHistorySymbol, holdingHistoryBroker).pipe(
        Effect.catchAll((error) => {
          console.log(error instanceof Error ? error.message : String(error));
          return Effect.succeed(undefined);
        }),
      );

      if (!trend) {
        console.log("No review history found.");
      } else {
        console.log(summarizeHoldingReviewTrendReport(trend));
        for (const entry of trend.history.slice(0, 10)) {
          console.log(`- ${entry.reviewedAt} | ${entry.status} | ${entry.reason}`);
        }
      }
    }
  } else {
    console.log("Hint: run with `--holding-history <SYMBOL>` and optional `--holding-history-broker <manual_csv|indstocks>` to inspect persisted review history.");
  }

  if (importHoldingsPath) {
    renderDivider("Manual Import");
    const imported = yield* importManualPortfolioSnapshot(importHoldingsPath, importTradesPath).pipe(
      Effect.catchAll((error) => {
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    if (!imported) {
      console.log("No manual import report was produced.");
    } else {
      console.log(`Snapshot: ${imported.snapshot.snapshotId}`);
      console.log(
        summarizePortfolioSummary(
          imported.snapshot.summary.holdingsCount,
          imported.snapshot.summary.totalMarketValue,
          imported.snapshot.summary.weightedPnlPercent,
        ),
      );
      console.log(summarizePortfolioSyncReport(imported.report));
      console.log(
        summarizePortfolioDiff(
          imported.report.diff.newPositions,
          imported.report.diff.exitedPositions,
          imported.report.diff.changedPositions,
          imported.report.diff.unchangedPositions,
        ),
      );
      console.log(`Imported trade fills: ${imported.fills.length}`);
    }
  } else {
    console.log("Hint: run with `--import-holdings <csv>` and optional `--import-trades <csv>` to import portfolio data manually.");
  }

  if (manualDecisionFlag) {
    renderDivider("Manual Portfolio Decision");
    if (!importHoldingsPath) {
      console.log("`--manual-decision` requires `--import-holdings <csv>`.");
    } else {
      const report = yield* reviewImportedPortfolioDecision(
        importHoldingsPath,
        importTradesPath,
      ).pipe(
        Effect.catchAll((error) => {
          console.log(error instanceof Error ? error.message : String(error));
          return Effect.succeed(undefined);
        }),
      );

      if (!report) {
        console.log("No manual portfolio decision report was produced.");
      } else {
        console.log(summarizePortfolioDecisionReport(report));
        console.log(
          summarizePortfolioDiff(
            report.sync.diff.newPositions,
            report.sync.diff.exitedPositions,
            report.sync.diff.changedPositions,
            report.sync.diff.unchangedPositions,
          ),
        );
        console.log(summarizeHoldingsReview(report.review));
        for (const review of report.review.reviews.slice(0, 10)) {
          console.log(`- ${review.symbol} | ${review.status} | ${review.reason}`);
        }
      }
    }
  } else {
    console.log("Hint: run with `--manual-decision --import-holdings <csv>` to import and review a portfolio in one step.");
  }
});

void Effect.runPromise(main).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
