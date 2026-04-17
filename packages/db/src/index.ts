import { integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const recommendationRuns = pgTable("recommendation_runs", {
  id: text("id").primaryKey(),
  runLabel: text("run_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const recommendations = pgTable("recommendations", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  symbol: text("symbol").notNull(),
  verdict: text("verdict").notNull(),
  conviction: numeric("conviction", { precision: 6, scale: 2 }).notNull(),
  payload: jsonb("payload").notNull(),
});

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  metadata: jsonb("metadata").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const portfolioPositions = pgTable("portfolio_positions", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull(),
  broker: text("broker").notNull(),
  symbol: text("symbol").notNull(),
  isin: text("isin").notNull(),
  exchangeSegment: text("exchange_segment").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  averagePrice: numeric("average_price", { precision: 18, scale: 4 }).notNull(),
  lastTradedPrice: numeric("last_traded_price", { precision: 18, scale: 4 }).notNull(),
  closePrice: numeric("close_price", { precision: 18, scale: 4 }).notNull(),
  marketValue: numeric("market_value", { precision: 18, scale: 4 }).notNull(),
  pnlAbsolute: numeric("pnl_absolute", { precision: 18, scale: 4 }).notNull(),
  pnlPercent: numeric("pnl_percent", { precision: 10, scale: 4 }).notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const brokerTradeFills = pgTable("broker_trade_fills", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull(),
  broker: text("broker").notNull(),
  fillId: integer("fill_id").notNull(),
  exchangeOrderId: text("exchange_order_id").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  price: numeric("price", { precision: 18, scale: 4 }).notNull(),
  tradeDate: timestamp("trade_date", { withTimezone: true }).notNull(),
  tradeSerialNumber: text("trade_serial_number").notNull(),
  scripCode: text("scrip_code").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const holdingReviews = pgTable("holding_reviews", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull(),
  broker: text("broker").notNull(),
  symbol: text("symbol").notNull(),
  query: text("query").notNull(),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  verdict: text("verdict"),
  conviction: numeric("conviction", { precision: 6, scale: 2 }),
  runLabel: text("run_label"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export * from "./portfolio.ts";
export * from "./review-history.ts";
export * from "./client.ts";
export * from "./repository.ts";
