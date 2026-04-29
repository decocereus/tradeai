# tradeai

Foundational project docs live in [docs/README.md](/Users/amartyasingh/Documents/projects/tradeai/docs/README.md).

Best starting docs right now:

- [Current State](/Users/amartyasingh/Documents/projects/tradeai/docs/current-state.md)
- [Operator Guide](/Users/amartyasingh/Documents/projects/tradeai/docs/operator-guide.md)

Current scaffold commands:

- `bun run dev:tui`
- `bun run dev:api`
- `bun run dev:tui -- --dashboard`
- `bun run dev:tui -- --manual-decision --import-holdings /path/to/holdings.csv --import-trades /path/to/trades.csv`
- `bun run dev:tui -- --holding-history RELIANCE-EQ --holding-history-broker manual_csv`
- `bun run dev:tui -- --pi "What files are in the current directory?"`
- `bun run typecheck`
- `bun run lint`
- `bun run test:integration` for opt-in live broker/market/DB checks

Local setup:

- Copy `.env.example` to `.env`
- Set `GROWW_ACCESS_TOKEN` from your Groww Trading API subscription, or set `GROWW_API_KEY` and `GROWW_API_SECRET` so TradeAI can generate the daily access token
- Optional: set `TRADEAI_BROKER_DATA_PROVIDER=indstocks` with `INDSTOCKS_ACCESS_TOKEN` for the legacy broker adapter
- Optional: set `TRADEAI_RESEARCH_DATA_PROVIDER=aftermarkets` with `AFTERMARKETS_API_KEY`
- Set `LOG_LEVEL` and `LOG_PRETTY` as desired
- Start Postgres: `bun run db:start`
- Push schema: `bun run db:push`
- Run checks: `bun run check`
