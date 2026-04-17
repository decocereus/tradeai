import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  importManualHoldingsFromFile,
  importManualTradeBookFromFile,
  parseManualHoldingsCsv,
  parseManualTradeBookCsv,
} from "./manual-import.ts";

describe("data-sources / manual import", () => {
  const holdingsCsv = [
    "symbol,isin,exchange_segment,quantity,average_price,last_traded_price,close_price,market_value,pnl_absolute,pnl_percent",
    "RELIANCE-EQ,INE002A01018,NSE_EQ,50,2200,2505.1,2495,125255,15255,13.87",
  ].join("\n");

  const tradeCsv = [
    "order_id,quantity,price,trade_date,trade_serial_no,symbol",
    "2400000124991381,2425,1.55,2025-11-11T17:48:23+05:30,17628437030186581215,99133",
  ].join("\n");

  it("parses manual holdings csv into normalized holdings", () => {
    const holdings = parseManualHoldingsCsv(holdingsCsv);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.broker).toBe("manual_csv");
    expect(holdings[0]?.tradingSymbol).toBe("RELIANCE-EQ");
  });

  it("parses manual trade csv into normalized fills", () => {
    const fills = parseManualTradeBookCsv(tradeCsv);
    expect(fills).toHaveLength(1);
    expect(fills[0]?.broker).toBe("manual_csv");
    expect(fills[0]?.exchangeOrderId).toBe("2400000124991381");
  });

  it("imports manual holdings from file", async () => {
    const path = "/tmp/tradeai-holdings.csv";
    await Bun.write(path, holdingsCsv);

    const holdings = await Effect.runPromise(importManualHoldingsFromFile(path));
    expect(holdings).toHaveLength(1);
  });

  it("imports manual trade fills from file", async () => {
    const path = "/tmp/tradeai-trades.csv";
    await Bun.write(path, tradeCsv);

    const fills = await Effect.runPromise(importManualTradeBookFromFile(path));
    expect(fills).toHaveLength(1);
  });
});
