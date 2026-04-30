import type { BrokerHolding, BrokerTradeFill } from "@tradeai/domain";
import { Effect } from "effect";

import { parseCsv, readCsvTextFromFile, rowsToObjects } from "./csv.ts";

const toNumber = (value: string): number | undefined => {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getValue = (record: Record<string, string>, keys: readonly string[]): string =>
  keys.map((key) => record[key]).find((value) => value !== undefined && value !== "") ?? "";

export const mapManualHoldingRecord = (
  record: Record<string, string>,
): BrokerHolding | null => {
  const tradingSymbol = getValue(record, ["trading_symbol", "symbol"]);
  const isin = getValue(record, ["isin"]);
  const exchangeSegment = getValue(record, ["exchange_segment", "exchange"]);
  const quantity = toNumber(getValue(record, ["quantity", "qty"]));
  const averagePrice = toNumber(getValue(record, ["average_price", "avg_price"]));
  const lastTradedPrice = toNumber(getValue(record, ["last_traded_price", "ltp"]));
  const closePrice = toNumber(getValue(record, ["close_price", "prev_close"]));
  const marketValue = toNumber(getValue(record, ["market_value", "market_val"]));
  const pnlAbsolute = toNumber(getValue(record, ["pnl_absolute", "pnl"]));
  const pnlPercent = toNumber(getValue(record, ["pnl_percent", "pnl_pct"]));
  const securityId = getValue(record, ["security_id", "securityid"]) || tradingSymbol;

  if (
    !tradingSymbol ||
    !isin ||
    !exchangeSegment ||
    quantity === undefined ||
    averagePrice === undefined
  ) {
    return null;
  }

  return {
    broker: "manual_csv",
    securityId,
    tradingSymbol,
    exchangeSegment,
    isin,
    quantity,
    averagePrice,
    ...(lastTradedPrice !== undefined ? { lastTradedPrice } : {}),
    ...(closePrice !== undefined ? { closePrice } : {}),
    ...(marketValue !== undefined ? { marketValue } : {}),
    ...(pnlAbsolute !== undefined ? { pnlAbsolute } : {}),
    ...(pnlPercent !== undefined ? { pnlPercent } : {}),
  };
};

export const mapManualTradeFillRecord = (
  record: Record<string, string>,
  index: number,
): BrokerTradeFill | null => {
  const exchangeOrderId = getValue(record, ["exchange_order_id", "order_id"]);
  const quantity = toNumber(getValue(record, ["quantity", "qty"]));
  const price = toNumber(getValue(record, ["price"]));
  const tradeDate = getValue(record, ["trade_date", "date"]);
  const tradeSerialNumber =
    getValue(record, ["trade_serial_number", "trade_serial_no"]) || `${index + 1}`;
  const scripCode = getValue(record, ["scrip_code", "symbol", "trading_symbol"]);
  const fillId = toNumber(getValue(record, ["fill_id"])) ?? index + 1;

  if (
    !exchangeOrderId ||
    quantity === undefined ||
    price === undefined ||
    !tradeDate ||
    !tradeSerialNumber ||
    !scripCode
  ) {
    return null;
  }

  return {
    broker: "manual_csv",
    fillId,
    exchangeOrderId,
    quantity,
    price,
    tradeDate,
    tradeSerialNumber,
    scripCode,
  };
};

export const parseManualHoldingsCsv = (text: string): BrokerHolding[] =>
  rowsToObjects(parseCsv(text))
    .map(mapManualHoldingRecord)
    .filter((entry): entry is BrokerHolding => entry !== null);

export const parseManualTradeBookCsv = (text: string): BrokerTradeFill[] =>
  rowsToObjects(parseCsv(text))
    .map((record, index) => mapManualTradeFillRecord(record, index))
    .filter((entry): entry is BrokerTradeFill => entry !== null);

export const importManualHoldingsFromFile = (path: string) =>
  Effect.tryPromise(async () => parseManualHoldingsCsv(await readCsvTextFromFile(path)));

export const importManualTradeBookFromFile = (path: string) =>
  Effect.tryPromise(async () => parseManualTradeBookCsv(await readCsvTextFromFile(path)));
