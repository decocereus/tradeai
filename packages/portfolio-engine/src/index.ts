import type {
  AssetType,
  BrokerHolding,
  DailyResearchResult,
  HoldingResearchReview,
  PortfolioExposure,
  PortfolioFit,
  PortfolioPositionChange,
  PortfolioPositionSnapshot,
  PortfolioSnapshotDiff,
  PortfolioSummary,
} from "@tradeai/domain";

export const scorePortfolioFit = (
  targetSectorSlug: string,
  exposures: readonly PortfolioExposure[],
): PortfolioFit => {
  const existingExposure = exposures.find((exposure) => exposure.sectorSlug === targetSectorSlug)?.percentage ?? 0;
  const total = Math.max(0, 90 - existingExposure);

  if (existingExposure >= 35) {
    return {
      total,
      label: "crowded",
      reasons: [`Existing exposure to ${targetSectorSlug} is already ${existingExposure}%`],
    };
  }

  if (existingExposure >= 15) {
    return {
      total,
      label: "acceptable",
      reasons: [`Existing exposure to ${targetSectorSlug} is moderate at ${existingExposure}%`],
    };
  }

  return {
    total,
    label: "good_fit",
    reasons: [`Existing exposure to ${targetSectorSlug} is low at ${existingExposure}%`],
  };
};

export const inferHoldingAssetType = (holding: BrokerHolding): AssetType => {
  if (holding.assetType) return holding.assetType;
  if (holding.exchangeSegment === "MF") return "mutual_fund";

  const symbol = holding.tradingSymbol.toUpperCase();
  const name = holding.instrumentName?.toUpperCase() ?? "";
  const isin = holding.isin.toUpperCase();

  if (symbol.includes("GOLD") || name.includes("GOLD")) return "gold";
  if (symbol.endsWith("BEES") || isin.startsWith("INF")) return "etf";
  return "stock";
};

export const normalizeBrokerHoldings = (
  holdings: readonly BrokerHolding[],
): PortfolioPositionSnapshot[] =>
  holdings.map((holding) => ({
    symbol: holding.tradingSymbol,
    assetType: inferHoldingAssetType(holding),
    ...(holding.securityId ? { securityId: holding.securityId } : {}),
    ...(holding.instrumentName ? { instrumentName: holding.instrumentName } : {}),
    isin: holding.isin,
    exchangeSegment: holding.exchangeSegment,
    quantity: holding.quantity,
    averagePrice: holding.averagePrice,
    lastTradedPrice: holding.lastTradedPrice,
    closePrice: holding.closePrice,
    marketValue: holding.marketValue,
    pnlAbsolute: holding.pnlAbsolute,
    pnlPercent: holding.pnlPercent,
    sourceBroker: holding.broker,
    ...(holding.priceProvenance ? { priceProvenance: holding.priceProvenance } : {}),
  }));

export const summarizePortfolioPositions = (
  positions: readonly PortfolioPositionSnapshot[],
): PortfolioSummary => {
  const holdingsCount = positions.length;
  const totalMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const totalPnlAbsolute = positions.reduce((sum, position) => sum + position.pnlAbsolute, 0);
  const weightedPnlPercent =
    totalMarketValue > 0 ? (totalPnlAbsolute / totalMarketValue) * 100 : 0;

  const sortedByPnl = [...positions].sort((left, right) => right.pnlPercent - left.pnlPercent);

  return {
    holdingsCount,
    totalMarketValue,
    totalPnlAbsolute,
    weightedPnlPercent,
    ...(sortedByPnl[0] ? { topWinnerSymbol: sortedByPnl[0].symbol } : {}),
    ...(sortedByPnl.at(-1) ? { topLoserSymbol: sortedByPnl.at(-1)?.symbol } : {}),
  };
};

export const assessPositionAgainstResearch = (
  position: PortfolioPositionSnapshot,
  research: DailyResearchResult,
) => {
  const normalizeSymbol = (symbol: string) =>
    symbol
      .replace(/-[A-Z]{2,3}$/i, "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();

  const isinMatches =
    Boolean(position.isin) &&
    Boolean(research.instrumentIsin) &&
    position.isin.toUpperCase() === research.instrumentIsin?.toUpperCase();

  const normalizedPositionSymbol = normalizeSymbol(position.symbol);
  const normalizedResearchSymbol = normalizeSymbol(research.instrument.symbol);
  const symbolMatches =
    normalizedPositionSymbol === normalizedResearchSymbol ||
    normalizedPositionSymbol.includes(normalizedResearchSymbol) ||
    normalizedResearchSymbol.includes(normalizedPositionSymbol);

  if (!isinMatches && !symbolMatches) {
    return {
      symbol: position.symbol,
      status: "unmatched" as const,
      reason: "Position did not match the research instrument by ISIN or normalized symbol.",
    };
  }

  if (research.recommendation.verdict === "strong_buy" || research.recommendation.verdict === "buy") {
    return {
      symbol: position.symbol,
      status: "aligned" as const,
      reason: `Research still supports the holding with verdict ${research.recommendation.verdict}${isinMatches ? " (ISIN matched)" : ""}.`,
    };
  }

  if (research.recommendation.verdict === "watch") {
    return {
      symbol: position.symbol,
      status: "review" as const,
      reason: "Research downgraded the holding to watch.",
    };
  }

  return {
    symbol: position.symbol,
    status: "conflict" as const,
    reason: "Research would currently reject this holding.",
  };
};

export const deriveResearchQueryFromPositionSymbol = (symbol: string): string =>
  symbol.replace(/-[A-Z]{2,3}$/i, "").trim();

export const summarizeHoldingResearchReviews = (
  reviews: readonly HoldingResearchReview[],
) => ({
  holdingsReviewed: reviews.length,
  alignedCount: reviews.filter((review) => review.status === "aligned").length,
  reviewCount: reviews.filter((review) => review.status === "review").length,
  conflictCount: reviews.filter((review) => review.status === "conflict").length,
  unmatchedCount: reviews.filter((review) => review.status === "unmatched").length,
  errorCount: reviews.filter((review) => review.status === "error").length,
});

export const diffPortfolioPositions = (
  previous: readonly PortfolioPositionSnapshot[],
  current: readonly PortfolioPositionSnapshot[],
): PortfolioSnapshotDiff => {
  const previousBySymbol = new Map(previous.map((position) => [position.symbol, position]));
  const currentBySymbol = new Map(current.map((position) => [position.symbol, position]));

  const allSymbols = new Set([...previousBySymbol.keys(), ...currentBySymbol.keys()]);
  const changes: PortfolioPositionChange[] = [];

  for (const symbol of allSymbols) {
    const previousPosition = previousBySymbol.get(symbol);
    const currentPosition = currentBySymbol.get(symbol);

    if (!previousPosition && currentPosition) {
      changes.push({
        symbol,
        status: "new",
        currentQuantity: currentPosition.quantity,
      });
      continue;
    }

    if (previousPosition && !currentPosition) {
      changes.push({
        symbol,
        status: "exited",
        previousQuantity: previousPosition.quantity,
      });
      continue;
    }

    if (previousPosition && currentPosition) {
      const quantityDelta = currentPosition.quantity - previousPosition.quantity;
      if (quantityDelta !== 0) {
        changes.push({
          symbol,
          status: "quantity_changed",
          previousQuantity: previousPosition.quantity,
          currentQuantity: currentPosition.quantity,
          quantityDelta,
        });
      } else {
        changes.push({
          symbol,
          status: "unchanged",
          previousQuantity: previousPosition.quantity,
          currentQuantity: currentPosition.quantity,
          quantityDelta: 0,
        });
      }
    }
  }

  return {
    newPositions: changes.filter((change) => change.status === "new").length,
    exitedPositions: changes.filter((change) => change.status === "exited").length,
    changedPositions: changes.filter((change) => change.status === "quantity_changed").length,
    unchangedPositions: changes.filter((change) => change.status === "unchanged").length,
    changes: changes.sort((left, right) => left.symbol.localeCompare(right.symbol)),
  };
};
