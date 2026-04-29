# Operator Guide

## Setup

1. Copy `.env.example` to `.env`
2. Set:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tradeai
INDSTOCKS_ACCESS_TOKEN=...
LOG_LEVEL=info
LOG_PRETTY=true
```

Optional:

```bash
UPSTOX_ACCESS_TOKEN=...
TRADEAI_MARKET_DATA_PROVIDER=truedata
TRUEDATA_USER_ID=...
TRUEDATA_PASSWORD=...
TRADEAI_RESEARCH_DATA_PROVIDER=aftermarkets
AFTERMARKETS_API_KEY=...
TRADEAI_ALLOW_PUBLIC_RESEARCH_FALLBACK=true
TRADEAI_PERSIST_PORTFOLIO_SNAPSHOTS=true
```

3. Start local Postgres:

```bash
bun run db:start
bun run db:push
```

## Recommended Test Order

### 1. Confirm live holdings

```bash
bun run dev:tui -- --holdings
```

You should see:

- live holdings from INDstocks
- symbols plus company/instrument names

### 2. Persist a fresh broker snapshot

```bash
bun run dev:tui -- --sync-portfolio
```

This should:

- fetch current holdings
- persist a new snapshot
- compare against the last snapshot

### 3. Run live portfolio review

```bash
bun run dev:tui -- --portfolio-decision
```

This should:

- sync broker holdings
- run the current review logic
- persist review history

### 4. Inspect the dashboard

```bash
bun run dev:tui -- --dashboard --dashboard-broker indstocks
```

### 5. Inspect one holding over time

```bash
bun run dev:tui -- --holding-history NIFTYBEES --holding-history-broker indstocks
```

## Day-To-Day Use

### Quick home screen

```bash
bun run dev:tui
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

- `INDSTOCKS_ACCESS_TOKEN` for broker holdings
- `UPSTOX_ACCESS_TOKEN` for market quotes
- `DATABASE_URL` for persisted dashboard loading
- optional `TRADEAI_INTEGRATION_INSTRUMENT_KEY` to override the default quote instrument

## What To Expect Right Now

### Good

- real broker holdings
- real broker-backed snapshots
- real dashboard persistence
- real holding review history

### Still evolving

- general research/search still needs full INDstocks migration
- chat/operator experience still needs to replace the command-first TUI
- some review sections still show symbols rather than full display names
