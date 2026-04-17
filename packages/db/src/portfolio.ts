import type {
  BrokerTradeFill,
  PortfolioMemorySnapshot,
  PortfolioPositionSnapshot,
} from "@tradeai/domain";

export interface PersistedPortfolioPositionRecord {
  id: string;
  snapshotId: string;
  broker: string;
  symbol: string;
  isin: string;
  exchangeSegment: string;
  quantity: string;
  averagePrice: string;
  lastTradedPrice: string;
  closePrice: string;
  marketValue: string;
  pnlAbsolute: string;
  pnlPercent: string;
  payload: PortfolioPositionSnapshot;
  createdAt: Date;
}

export interface PersistedBrokerTradeFillRecord {
  id: string;
  snapshotId: string;
  broker: string;
  fillId: number;
  exchangeOrderId: string;
  quantity: string;
  price: string;
  tradeDate: Date;
  tradeSerialNumber: string;
  scripCode: string;
  payload: BrokerTradeFill;
  createdAt: Date;
}

const toNumericString = (value: number): string => value.toFixed(4);

const safeDateFromIso = (value: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
};

export const createPortfolioSnapshotId = (broker: string, capturedAt = new Date()): string =>
  `${broker}:${capturedAt.toISOString()}`;

export const serializePortfolioPosition = (
  position: PortfolioPositionSnapshot,
  snapshotId: string,
  createdAt = new Date(),
): PersistedPortfolioPositionRecord => ({
  id: `${snapshotId}:${position.exchangeSegment}:${position.symbol}`,
  snapshotId,
  broker: position.sourceBroker,
  symbol: position.symbol,
  isin: position.isin,
  exchangeSegment: position.exchangeSegment,
  quantity: toNumericString(position.quantity),
  averagePrice: toNumericString(position.averagePrice),
  lastTradedPrice: toNumericString(position.lastTradedPrice),
  closePrice: toNumericString(position.closePrice),
  marketValue: toNumericString(position.marketValue),
  pnlAbsolute: toNumericString(position.pnlAbsolute),
  pnlPercent: toNumericString(position.pnlPercent),
  payload: position,
  createdAt,
});

export const serializeBrokerTradeFill = (
  fill: BrokerTradeFill,
  snapshotId: string,
  createdAt = new Date(),
): PersistedBrokerTradeFillRecord => ({
  id: `${snapshotId}:${fill.fillId}:${fill.tradeSerialNumber}`,
  snapshotId,
  broker: fill.broker,
  fillId: fill.fillId,
  exchangeOrderId: fill.exchangeOrderId,
  quantity: toNumericString(fill.quantity),
  price: toNumericString(fill.price),
  tradeDate: safeDateFromIso(fill.tradeDate),
  tradeSerialNumber: fill.tradeSerialNumber,
  scripCode: fill.scripCode,
  payload: fill,
  createdAt,
});

export const serializePortfolioSnapshot = (
  snapshot: PortfolioMemorySnapshot,
  createdAt = new Date(),
): PersistedPortfolioPositionRecord[] =>
  snapshot.positions.map((position) => serializePortfolioPosition(position, snapshot.snapshotId, createdAt));

export const serializeBrokerTradeBook = (
  fills: readonly BrokerTradeFill[],
  snapshotId: string,
  createdAt = new Date(),
): PersistedBrokerTradeFillRecord[] =>
  fills.map((fill) => serializeBrokerTradeFill(fill, snapshotId, createdAt));
