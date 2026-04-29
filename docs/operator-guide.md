# Operator Guide

## Setup

1. Copy `.env.example` to `.env`
2. Set:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tradeai
TRADEAI_BROKER_DATA_PROVIDER=indstocks
INDSTOCKS_ACCESS_TOKEN=...
TRADEAI_MARKET_DATA_PROVIDER=groww
GROWW_ACCESS_TOKEN=...
TRADEAI_RESEARCH_DATA_PROVIDER=aftermarkets
AFTERMARKETS_API_KEY=...
LOG_LEVEL=info
LOG_PRETTY=true
```

Instead of a daily `GROWW_ACCESS_TOKEN`, you can set:

```bash
GROWW_API_KEY=...
GROWW_API_SECRET=...
```

Token caveat:

- INDstocks and Groww access tokens expire daily around 6 AM IST.
- Refresh `INDSTOCKS_ACCESS_TOKEN` before running live broker workflows each day.
- Prefer `GROWW_API_KEY` plus `GROWW_API_SECRET` over a manually copied `GROWW_ACCESS_TOKEN`; TradeAI can use those credentials to generate a fresh Groww access token.
- If live broker workflows fail with `401`, first assume the daily token rolled over and refresh the provider token.

Optional:

```bash
TRADEAI_ALLOW_PUBLIC_RESEARCH_FALLBACK=true
TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS=true
```

3. Start local Postgres:

```bash
bun run db:start
bun run db:push
```

## Recommended Test Order

### 1. Check provider health

```bash
bun run dev:tui -- --provider-health
```

This checks INDstocks, Groww, AMFI NAV, Aftermarkets research, and local database readiness without printing secret values.

### 2. Run the daily operator report

```bash
bun run dev:tui -- --daily
```

This runs provider health, syncs and reviews the live INDstocks portfolio, and prints the current dashboard/action list. If a required provider is down, it stops before portfolio decisioning and tells you what token/provider needs attention.

### 3. Confirm live holdings

```bash
bun run dev:tui -- --holdings
```

You should see:

- live holdings from INDstocks
- symbols plus company/instrument names
- Groww-enriched prices where quote lookup succeeds
- explicit price fallback markers where quote lookup misses or is unavailable

### 4. Persist a fresh broker snapshot

```bash
bun run dev:tui -- --sync-portfolio
```

This should:

- fetch current holdings
- persist a new snapshot
- compare against the last snapshot

### 5. Run live portfolio review

```bash
bun run dev:tui -- --portfolio-decision
```

This should:

- sync broker holdings
- run the current review logic
- persist review history

### 6. Inspect the dashboard

```bash
bun run dev:tui -- --dashboard --dashboard-broker indstocks
```

### 7. Inspect one holding over time

```bash
bun run dev:tui -- --holding-history NIFTYBEES --holding-history-broker indstocks
```

## Day-To-Day Use

### Quick home screen

```bash
bun run dev:tui
```

### Daily operator commands

```bash
bun run dev:tui -- --provider-health
bun run dev:tui -- --daily
```

### Broker-focused commands

```bash
bun run dev:tui -- --holdings
bun run dev:tui -- --trade-book EQUITY
bun run dev:tui -- --sync-portfolio
bun run dev:tui -- --portfolio-decision
```

### Manual import commands

```bash
bun run dev:tui -- --import-holdings /path/to/holdings.csv
bun run dev:tui -- --manual-decision --import-holdings /path/to/holdings.csv --import-trades /path/to/trades.csv
```

### Research commands

```bash
bun run dev:tui -- --equity-research "RELIANCE"
bun run dev:tui -- --events "VEDANTA"
bun run dev:tui -- --amfi "parag parikh"
```

### API server

```bash
bun run dev:api
```

Initial read-only endpoints:

- `GET /health`
- `GET /portfolio/dashboard?broker=indstocks`
- `GET /market/equities/search?q=RELIANCE`
- `GET /market/quotes?instrumentKey=NSE_EQ|INE002A01018`
- `GET /research/equity?q=RELIANCE`

### Pi session path

```bash
bun run dev:tui -- --pi "What changed in my portfolio today?"
```

## Quality Gates

Use these before trusting a change:

```bash
bun run test
bun run typecheck:tsc
bun run lint
bun run check
```

Live integration checks are separate from the default deterministic suite:

```bash
TRADEAI_RUN_INTEGRATION_TESTS=1 bun run test:integration
```

Each live case still requires its own env:

- `INDSTOCKS_ACCESS_TOKEN` for broker holdings and trade book
- `GROWW_ACCESS_TOKEN`, or `GROWW_API_KEY` plus `GROWW_API_SECRET`, for market quotes
- `DATABASE_URL` for persisted dashboard loading
- optional `TRADEAI_INTEGRATION_INSTRUMENT_KEY` to override the default quote instrument

## What To Expect Right Now

### Good

- real broker holdings
- real broker-backed snapshots
- real dashboard persistence
- real holding review history
- Groww quote enrichment on top of INDstocks-held positions
- explicit unsupported/unavailable trade-book status in sync reports

### Still evolving

- Groww does not currently provide trade-book/history through this adapter; INDstocks remains the broker history source
- chat/operator experience still needs to replace the command-first TUI
- some review sections still show symbols rather than full display names
