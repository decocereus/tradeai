import {
  createPiTradeAiSession,
  inspectPiResources,
} from "@tradeai/agent-runtime";
import {
  createTradeAiWorkflowService,
  summarizeBrokerHolding,
  summarizeHoldingsReview,
  summarizeHoldingReviewTrendReport,
  summarizePortfolioDecisionReport,
  summarizePortfolioSyncReport,
  summarizePortfolioDiff,
  summarizePortfolioSummary,
  summarizeBrokerTradeFill,
  summarizeCorporateEvent,
  summarizeDailyResearch,
  summarizeQuoteSnapshot,
  type TradeAiRuntimeConfig,
} from "@tradeai/app-services";
import { Effect } from "effect";
import { parseTuiCliOptions } from "./cli-options.ts";
import {
  renderDailyOperatorReport,
  renderDashboardSection,
  renderDivider,
  renderList,
  renderProviderHealthSection,
} from "./render.ts";

const {
  piPrompt,
  amfiQuery,
  equitySearchQuery,
  quoteKeys,
  equityResearchQuery,
  eventsQuery,
  holdingsFlag,
  tradeBookSegment,
  persistHoldingsFlag,
  diffHoldingsFlag,
  syncPortfolioFlag,
  reviewHoldingsFlag,
  portfolioDecisionFlag,
  providerHealthFlag,
  dailyFlag,
  dashboardFlag,
  dashboardBroker,
  holdingHistorySymbol,
  holdingHistoryBroker,
  importHoldingsPath,
  importTradesPath,
  manualDecisionFlag,
  jsonFlag,
  hasExplicitPrimaryAction,
} = parseTuiCliOptions(process.argv.slice(2));

interface JsonEnvelope<T> {
  ok: boolean;
  command: string;
  schemaVersion: "tradeai.cli.v1";
  generatedAt: string;
  data?: T;
  error?: string;
}

const writeJson = <T>(envelope: JsonEnvelope<T>) => {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
};

const writeJsonData = <T>(command: string, data: T) => {
  writeJson({
    ok: true,
    command,
    schemaVersion: "tradeai.cli.v1",
    generatedAt: new Date().toISOString(),
    data,
  });
};

const writeJsonError = (command: string, error: unknown) => {
  writeJson({
    ok: false,
    command,
    schemaVersion: "tradeai.cli.v1",
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  });
};

const readEnvValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const readEnvBoolean = (name: string): boolean | undefined => {
  const value = readEnvValue(name)?.toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
};

const buildTuiRuntimeConfig = (): TradeAiRuntimeConfig => {
  const brokerAccessToken = readEnvValue("INDSTOCKS_ACCESS_TOKEN");
  const growwAccessToken = readEnvValue("GROWW_ACCESS_TOKEN");
  const marketAccessToken = readEnvValue("GROWW_ACCESS_TOKEN");
  const brokerDataProvider = readEnvValue("TRADEAI_BROKER_DATA_PROVIDER");
  const marketDataProvider = readEnvValue("TRADEAI_MARKET_DATA_PROVIDER");
  const researchDataProvider = readEnvValue("TRADEAI_RESEARCH_DATA_PROVIDER");
  const aftermarketsApiKey = readEnvValue("AFTERMARKETS_API_KEY");
  const databaseUrl = readEnvValue("DATABASE_URL");
  const allowPublicResearchFallback = readEnvBoolean(
    "TRADEAI_ALLOW_PUBLIC_RESEARCH_FALLBACK",
  );
  const persistPortfolioSnapshots = readEnvBoolean("TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS");

  return {
    ...(growwAccessToken ? { growwAccessToken } : {}),
    ...(brokerAccessToken ? { brokerAccessToken } : {}),
    ...(marketAccessToken ? { marketAccessToken } : {}),
    ...(brokerDataProvider === "groww" || brokerDataProvider === "indstocks"
      ? { brokerDataProvider }
      : {}),
    ...(marketDataProvider === "groww"
      ? { marketDataProvider }
      : {}),
    ...(researchDataProvider === "aftermarkets"
      ? { researchDataProvider }
      : {}),
    ...(aftermarketsApiKey ? { aftermarketsApiKey } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(allowPublicResearchFallback !== undefined ? { allowPublicResearchFallback } : {}),
    ...(persistPortfolioSnapshots !== undefined ? { persistPortfolioSnapshots } : {}),
  };
};

const tradeAi = createTradeAiWorkflowService({
  config: buildTuiRuntimeConfig(),
});
const shouldAutoRenderDashboard =
  !dashboardFlag && !hasExplicitPrimaryAction && tradeAi.canPersistPortfolioMemory();
const shouldRenderDashboard = dashboardFlag || shouldAutoRenderDashboard;

const main = Effect.gen(function* () {
  if (shouldAutoRenderDashboard) {
    if (jsonFlag) {
      const report = yield* tradeAi.getPortfolioDashboard(
        dashboardBroker ? { broker: dashboardBroker } : {},
      ).pipe(
        Effect.catchAll((error) => {
          writeJsonError("dashboard", error);
          return Effect.succeed(undefined);
        }),
      );
      if (report) writeJsonData("dashboard", report);
      return;
    }

    console.log("TradeAI Home");
    console.log("============");
    renderDivider("Portfolio Dashboard");
    const report = yield* tradeAi.getPortfolioDashboard(
      dashboardBroker ? { broker: dashboardBroker } : {},
    ).pipe(
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

  if (dashboardFlag && jsonFlag) {
    const report = yield* tradeAi.getPortfolioDashboard(
      dashboardBroker ? { broker: dashboardBroker } : {},
    ).pipe(
      Effect.catchAll((error) => {
        writeJsonError("dashboard", error);
        return Effect.succeed(undefined);
      }),
    );
    if (report) writeJsonData("dashboard", report);
    return;
  }

  if (dailyFlag) {
    if (jsonFlag) {
      const report = yield* tradeAi.getDailyOperatorReport().pipe(
        Effect.catchAll((error) => {
          writeJsonError("daily", error);
          return Effect.succeed(undefined);
        }),
      );
      if (report) writeJsonData("daily", report);
      return;
    }

    console.log("TradeAI Daily Operator Report");
    console.log("=============================");
    const report = yield* tradeAi.getDailyOperatorReport().pipe(
      Effect.catchAll((error) => {
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed(undefined);
      }),
    );

    if (!report) {
      console.log("No daily operator report was produced.");
    } else {
      renderDailyOperatorReport(report);
    }
    return;
  }

  if (providerHealthFlag) {
    if (jsonFlag) {
      const report = yield* tradeAi.getProviderHealth();
      writeJsonData("provider-health", report);
      return;
    }

    console.log("TradeAI Provider Health");
    console.log("=======================");
    const report = yield* tradeAi.getProviderHealth();
    renderProviderHealthSection(report);
    return;
  }

  if (jsonFlag) {
    writeJsonError(
      "tui",
      new Error("JSON output is currently supported for --daily, --provider-health, and --dashboard."),
    );
    return;
  }

  const piResources = yield* inspectPiResources();

  console.log("TradeAI Research Cockpit");
  console.log("========================");

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
    const amfiEntries = yield* tradeAi.lookupAmfiNav(amfiQuery).pipe(
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

  if (equitySearchQuery) {
    const equitySearchResults = yield* tradeAi.searchEquities(equitySearchQuery).pipe(
      Effect.catchAll((error) => {
        console.log("\nEquity search error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Equity Search");
    console.log(`Query: ${equitySearchQuery}`);
    if (equitySearchResults.length === 0) {
      console.log("No matching equity instruments found.");
    } else {
      for (const entry of equitySearchResults.slice(0, 5)) {
        console.log(`- ${entry.instrumentKey} | ${entry.tradingSymbol} | ${entry.shortName}`);
      }
    }
  } else {
    console.log("Hint: run with `--equity-search <query>` to search equities.");
  }

  if (quoteKeys?.length) {
    const quoteResults = yield* tradeAi.getEquityQuoteSnapshots({
      instrumentKeys: quoteKeys,
    }).pipe(
      Effect.catchAll((error) => {
        console.log("\nQuote error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );

    renderDivider("Quote Snapshots");
    console.log(`Instrument keys: ${quoteKeys.join(", ")}`);
    if (quoteResults.length === 0) {
      console.log("No quote snapshots returned.");
    } else {
      for (const entry of quoteResults.slice(0, 5)) {
        console.log(`- ${summarizeQuoteSnapshot(entry.instrumentKey, entry.tradingSymbol, entry.lastPrice)}`);
      }
    }
  } else {
    console.log("Hint: run with `--quote <symbol[,symbol]>` to fetch quote snapshots.");
  }

  if (equityResearchQuery) {
    const equityResearchResult = yield* tradeAi.runEquityResearch({
      query: equityResearchQuery,
    }).pipe(
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
    const events = yield* tradeAi.lookupCorporateEvents(eventsQuery).pipe(
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
    const holdings = yield* tradeAi.getBrokerHoldings().pipe(
      Effect.catchAll((error) => {
        console.log("\nBroker holdings error");
        console.log(error instanceof Error ? error.message : String(error));
        return Effect.succeed([]);
      }),
    );
    const portfolioSummary =
      holdings.length > 0 ? tradeAi.summarizeBrokerHoldingsCollection(holdings) : undefined;

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
            holding.instrumentName,
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
    if (!tradeAi.canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. Snapshot persistence is unavailable.");
    } else {
      const persisted = yield* tradeAi.persistBrokerPortfolioMemorySnapshot().pipe(
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
    const fills = yield* tradeAi.getBrokerTradeBook({ segment }).pipe(
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
    if (!tradeAi.canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. Snapshot diffing is unavailable.");
    } else {
      const diffResult = yield* tradeAi.diffBrokerPortfolioAgainstLatestSnapshot().pipe(
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
    const report = yield* tradeAi.syncBrokerPortfolio().pipe(
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
    const report = yield* tradeAi.reviewBrokerHoldingsAgainstResearch().pipe(
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
    const report = yield* tradeAi.reviewSyncedBrokerPortfolio().pipe(
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

  console.log("Hint: run with `--provider-health` to check broker, market, NAV, research, and database providers.");
  console.log("Hint: run with `--daily` to run provider health, live portfolio decisioning, and dashboard output.");

  if (shouldRenderDashboard) {
    renderDivider("Portfolio Dashboard");
    if (!tradeAi.canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. The dashboard needs persisted local data.");
    } else {
      if (shouldAutoRenderDashboard) {
        console.log("Auto mode: showing the latest persisted portfolio dashboard.");
      }
      const report = yield* tradeAi.getPortfolioDashboard(
        dashboardBroker ? { broker: dashboardBroker } : {},
      ).pipe(
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
    if (!tradeAi.canPersistPortfolioMemory()) {
      console.log("DATABASE_URL is not configured. Review history is unavailable.");
    } else {
      const trend = yield* tradeAi.getHoldingReviewTrend({
        symbol: holdingHistorySymbol,
        ...(holdingHistoryBroker ? { broker: holdingHistoryBroker } : {}),
      }).pipe(
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
    const imported = yield* tradeAi.importManualPortfolioSnapshot({
      holdingsCsvPath: importHoldingsPath,
      ...(importTradesPath ? { tradesCsvPath: importTradesPath } : {}),
    }).pipe(
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
      const report = yield* tradeAi.reviewImportedPortfolioDecision({
        holdingsCsvPath: importHoldingsPath,
        ...(importTradesPath ? { tradesCsvPath: importTradesPath } : {}),
      }).pipe(
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
  if (jsonFlag) {
    writeJsonError("tui", error);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
