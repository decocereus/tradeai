import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { gzipSync } from "node:zlib";

import {
  UPSTOX_NSE_BOD_URL,
  decodeGzipJsonText,
  fetchUpstoxNseInstrumentProfiles,
  filterUpstoxInstrumentProfiles,
  mapUpstoxInstrumentProfile,
  parseUpstoxInstrumentProfiles,
  searchUpstoxInstrumentProfiles,
  selectPreferredUpstoxInstrumentProfile,
} from "./upstox-instruments.ts";

describe("data-sources / upstox instruments", () => {
  const samplePayload = [
    {
      segment: "NSE_EQ",
      name: "RELIANCE INDUSTRIES LTD",
      exchange: "NSE",
      isin: "INE002A01018",
      instrument_type: "EQ",
      instrument_key: "NSE_EQ|INE002A01018",
      lot_size: 1,
      freeze_quantity: 100000,
      exchange_token: "2885",
      tick_size: 10,
      trading_symbol: "RELIANCE",
      short_name: "Reliance Industries",
      mtf_enabled: true,
      mtf_bracket: 26.5,
      security_type: "NORMAL",
      intraday_margin: 20,
      intraday_leverage: 5,
    },
    {
      segment: "NSE_EQ",
      name: "RELIANCE POWER LTD",
      exchange: "NSE",
      isin: "INE614G01033",
      instrument_type: "EQ",
      instrument_key: "NSE_EQ|INE614G01033",
      trading_symbol: "RPOWER",
      short_name: "Reliance Power",
    },
  ];

  it("maps a BOD record into a profile", () => {
    const profile = mapUpstoxInstrumentProfile(samplePayload[0] ?? {});

    expect(profile?.instrumentKey).toBe("NSE_EQ|INE002A01018");
    expect(profile?.mtfEnabled).toBe(true);
  });

  it("parses instrument profiles from JSON payload", () => {
    const profiles = parseUpstoxInstrumentProfiles(samplePayload);

    expect(profiles).toHaveLength(2);
    expect(profiles[0]?.tradingSymbol).toBe("RELIANCE");
  });

  it("filters instrument profiles by name and symbol", () => {
    const profiles = parseUpstoxInstrumentProfiles(samplePayload);
    const filtered = filterUpstoxInstrumentProfiles("reliance", profiles);

    expect(filtered).toHaveLength(2);
  });

  it("selects a preferred instrument profile by exact symbol match", () => {
    const profiles = parseUpstoxInstrumentProfiles(samplePayload);
    const selected = selectPreferredUpstoxInstrumentProfile("reliance", profiles);

    expect(selected?.instrumentKey).toBe("NSE_EQ|INE002A01018");
  });

  it("decodes gzipped JSON text", () => {
    const compressed = gzipSync(Buffer.from(JSON.stringify(samplePayload)));
    const text = decodeGzipJsonText(
      compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength),
    );

    expect(text).toContain("RELIANCE INDUSTRIES LTD");
  });

  it("fetches and parses gzipped BOD instrument profiles", async () => {
    const compressed = gzipSync(Buffer.from(JSON.stringify(samplePayload)));
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(UPSTOX_NSE_BOD_URL);
      return new Response(compressed, { status: 200 });
    }) as unknown as typeof fetch;

    const profiles = await Effect.runPromise(fetchUpstoxNseInstrumentProfiles(fetchStub));

    expect(profiles).toHaveLength(2);
    expect(profiles[1]?.tradingSymbol).toBe("RPOWER");
  });

  it("searches instrument profiles from the public BOD file", async () => {
    const compressed = gzipSync(Buffer.from(JSON.stringify(samplePayload)));
    const fetchStub = (async () => new Response(compressed, { status: 200 })) as unknown as typeof fetch;

    const profiles = await Effect.runPromise(searchUpstoxInstrumentProfiles("power", fetchStub));

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.tradingSymbol).toBe("RPOWER");
  });
});
