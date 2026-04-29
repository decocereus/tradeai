# Current State

## Summary

TradeAI is no longer just a design exercise. It is now a working private investing/research system with:

- a Bun monorepo
- local Postgres persistence
- a terminal operator UI
- live INDstocks holdings sync
- Groww market quote enrichment for broker-held stocks
- persisted portfolio snapshots and review history
- deterministic recommendation logic
- a Pi-based harness path for future chat/operator experiences

## What Is Working Today

### Live broker data

The system can now use a real `INDSTOCKS_ACCESS_TOKEN` to fetch broker/account data:

- live holdings from `/portfolio/holdings`
- live trade-book data from `/trade-book`
- live historical candles from `/market/historical/{interval}`

It uses Groww as the market-data provider for general NSE instruments and quote enrichment:

- `TRADEAI_MARKET_DATA_PROVIDER=groww`
- `GROWW_ACCESS_TOKEN`, or `GROWW_API_KEY` plus `GROWW_API_SECRET`

INDstocks and Groww access tokens expire daily around 6 AM IST. Groww can be refreshed from API key/secret; INDstocks still requires a fresh broker token in `INDSTOCKS_ACCESS_TOKEN`.

Important nuance:

- the holdings payload returned by the real account did not match the fully documented shape
- the adapter now supports both:
  - documented full holdings payloads
  - compact holdings payloads actually returned by the account

### Broker workflows

These flows are live and backed by the real INDstocks account:

- `--provider-health`
- `--daily`
- `--holdings`
- `--sync-portfolio`
- `--portfolio-decision`
- `--dashboard --dashboard-broker indstocks`
- `--holding-history <SYMBOL> --holding-history-broker indstocks`

Portfolio snapshots preserve `sourceBroker: "indstocks"` while carrying per-position price provenance. If Groww quote enrichment misses a symbol, reports mark that holding as a price fallback instead of hiding it.

### Persistence

The local Postgres path is live and working.

The app persists:

- broker portfolio snapshots
- broker trade fills
- holding review history

### Research and review

The system currently combines:

- deterministic scoring
- public fundamentals enrichment
- BSE events
- memory/history comparison

For INDstocks-held positions specifically, the live review flow now uses:

- Groww live quotes for portfolio price enrichment
- INDstocks historical data
- public fundamentals
- public events

This means the live broker review path is now much more grounded than the earlier fallback-only version.

### Terminal UX

The TUI has three practical modes:

1. Home mode
   Running `bun run dev:tui` opens a dashboard-first home screen when persisted data exists.

2. Daily operator mode
   Running `bun run dev:tui -- --daily` checks provider health, syncs/reviews the live portfolio, and prints the dashboard/action list.

3. JSON backend mode
   Running `bun run dev:tui -- --daily --json`, `--provider-health --json`, or `--dashboard --json` returns a parseable `tradeai.cli.v1` envelope for a future UI. Daily JSON now returns a UI-ready view model by default; use `--daily --json --raw` for the internal workflow report.

4. Explicit command mode
   Running explicit flags still exposes the detailed operator flows.

## Current Commands

### Main operator flows

```bash
bun run dev:tui
bun run dev:tui -- --provider-health
bun run dev:tui -- --provider-health --json
bun run dev:tui -- --daily
bun run dev:tui -- --daily --json
bun run dev:tui -- --daily --json --raw
bun run dev:tui -- --holdings
bun run dev:tui -- --sync-portfolio
bun run dev:tui -- --portfolio-decision
bun run dev:tui -- --dashboard --dashboard-broker indstocks
bun run dev:tui -- --holding-history NIFTYBEES --holding-history-broker indstocks
```

### Manual import flows

```bash
bun run dev:tui -- --manual-decision --import-holdings /path/to/holdings.csv --import-trades /path/to/trades.csv
```

### Pi harness path

```bash
bun run dev:tui -- --pi "Summarize the current portfolio state."
```

## What Data Is Real Vs Derived

### Real

- INDstocks holdings
- INDstocks trade-book
- INDstocks historical candles
- Groww market quotes
- public BSE events
- public fundamentals pages

### Derived by TradeAI

- portfolio summaries
- snapshot diffs
- top winners / losers
- review streaks
- status changes
- action lists

### System judgment, not market truth

- `aligned`
- `review`
- `conflict`
- recommendation verdicts
- conviction/stability labels

## Current Limitations

### The chat experience is not the main UI yet

The system has Pi wiring and a TUI harness path, but the main experience is still command-driven with a dashboard home screen, not a full conversational operator console.

### Research is still mixed-source

The live broker-held review path uses INDstocks for portfolio identity/history and Groww for quote enrichment. Broader research still combines Aftermarkets/public sources.

### Groww trade-book/history is explicitly unsupported

Groww is currently treated as market data, not the primary broker ledger. Sync reports mark Groww trade-book/history as unsupported rather than pretending that fills exist.

### Review sections are only partially name-enriched

Position-based dashboard sections show company/instrument names, but review records still mostly surface symbols because the review model does not yet carry display names through every layer.

## What We Should Build Next

1. Improve the mixed-source research contract around Aftermarkets plus broker-held positions.
2. Build the real chat/operator console on top of Pi so commands are no longer the main interaction style.
3. Carry display names all the way through review records and history surfaces.
