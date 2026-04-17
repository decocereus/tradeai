# Service Map

## At A Glance

This is the shortest readable map of the system.

| Service | What it does | Depends on |
| --- | --- | --- |
| `apps/tui` | Terminal UI for running research and reviewing results | `app-services` |
| `app-services` | Coordinates use cases like daily scan, thesis diff, and trade logging | all core packages |
| `data-sources` | Pulls market, company, event, and source-material data | external APIs and files |
| `knowledge` | Converts transcripts and Buffett letters into reusable claims | `db` |
| `db` | Stores facts, runs, trades, and vectorized knowledge | Postgres, pgvector |
| `strategy-engine` | Scores sectors and instruments deterministically | `db`, `domain` |
| `portfolio-engine` | Checks fit, concentration, and allocation sanity | `db`, `domain` |
| `memory` | Retrieves prior runs, notes, and similar cases | `db` |
| `agent-runtime` | Turns scored packets into recommendations and explanations | `memory`, `strategy-engine`, `pi-coding-agent` |

## Main Connections

```mermaid
flowchart LR
    TUI["apps/tui"] --> APP["app-services"]
    APP --> STRAT["strategy-engine"]
    APP --> PORT["portfolio-engine"]
    APP --> MEM["memory"]
    APP --> AGENT["agent-runtime"]
    APP --> SRC["data-sources"]
    SRC --> DB["db"]
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
- `memory` adds history and retrieved knowledge
- `agent-runtime` turns all of that into a readable recommendation
- `app-services` stitches the workflow together
- `apps/tui` is how the user operates the system

## First Runnable Slice

The first meaningful vertical slice should be:

1. fetch one set of instrument data
2. score it
3. retrieve any prior context
4. generate one recommendation
5. show it in the TUI
