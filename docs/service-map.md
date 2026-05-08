# Service Map

## At A Glance

This is the shortest readable map of the system.

| Service | What it does | Depends on |
| --- | --- | --- |
| `apps/tui` | Terminal UI for running research and reviewing results | `app-services` workflow service |
| `app-services` | Exposes `createTradeAiWorkflowService()` as the stable UI/API/plugin port | all core packages |
| `data-sources` | Pulls market, broker, fund, and event data | external APIs and files |
| `research-engine` | Converts provider payloads into scored research packets | `domain`, `strategy-engine` |
| `knowledge` | Normalizes source material and retrieves reusable claims | `db`, persisted documents |
| `db` | Stores facts, runs, trades, and persisted state | Postgres now, pgvector later |
| `strategy-engine` | Scores sectors and instruments deterministically | `db`, `domain` |
| `portfolio-engine` | Checks fit, concentration, and allocation sanity | `db`, `domain` |
| `memory` | Retrieves prior runs, notes, and similar cases | `db` |
| `agent-runtime` | Turns scored packets into recommendations and explanations | `memory`, `strategy-engine`, `pi-coding-agent` |

## Main Connections

```mermaid
flowchart LR
    TUI["apps/tui"] --> APP["app-services<br/>createTradeAiWorkflowService"]
    APP --> STRAT["strategy-engine"]
    APP --> PORT["portfolio-engine"]
    APP --> MEM["memory"]
    APP --> AGENT["agent-runtime"]
    APP --> SRC["data-sources"]
    APP --> RE["research-engine"]
    APP --> KNOW["knowledge"]
    SRC --> DB["db"]
    KNOW --> DB
    STRAT --> DB
    PORT --> DB
    MEM --> DB
    AGENT --> MEM
    AGENT --> STRAT
```

## How To Read The System

- `data-sources` gets facts into the system
- `db` stores them
- `strategy-engine` turns facts into scores
- `memory` adds prior review history
- `knowledge` adds retrieved reference claims as separate `knowledgeContext`
- `agent-runtime` turns all of that into a readable recommendation
- `app-services` exposes the UI-agnostic workflow service and keeps lower-level workflow modules internal
- `apps/tui` is one consumer of that service, not the owner of workflow logic

## Public Integration Boundary

New interfaces should depend on:

```ts
import { createTradeAiWorkflowService } from "@tradeai/app-services";

const tradeAi = createTradeAiWorkflowService({
  config: {
    brokerAccessToken,
    marketAccessToken,
    databaseUrl,
    persistPortfolioSnapshots,
  },
});
```

The service is the supported boundary for TUI, future API routes, web UI, and plugin/agent integrations. Runtime config, repositories, knowledge retrieval, and source adapters are injected at service construction. Internal modules such as `research-workflows`, `portfolio-workflows`, and `review-workflows` remain useful for focused package tests and implementation work, but interface code should not import them directly.

## First Runnable Slice

The first meaningful vertical slice was:

1. fetch one set of instrument data
2. score it
3. retrieve any prior context
4. generate one recommendation
5. show it in the TUI
