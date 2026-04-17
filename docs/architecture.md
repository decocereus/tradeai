# Architecture

## Goal

This document shows the current architecture thinking in one place:

- what runs where
- what each module does
- how data moves through the system
- where `Effect`, `pi-mono`, Postgres, and the TUI fit

This is intentionally concise and implementation-oriented.

## One-Screen View

```mermaid
flowchart LR
    U["User"] --> T["apps/tui"]
    T --> S["app-services"]
    S --> DS["data-sources"]
    DS --> DB["db (Postgres + pgvector)"]
    DB --> ST["strategy-engine"]
    DB --> M["memory"]
    ST --> A["agent-runtime"]
    M --> A
    A --> S
    S --> T
    S --> API["apps/api (optional)"]
```

## Architecture Layers

```mermaid
flowchart TB
    UI["Interface layer<br/>apps/tui, later apps/web"]
    APP["Application layer<br/>Effect services and workflows"]
    AGENT["Agent layer<br/>pi-coding-agent SDK"]
    CORE["Core logic layer<br/>strategy-engine, portfolio-engine, memory"]
    DATA["Data layer<br/>db, data-sources, knowledge ingestion"]

    UI --> APP
    APP --> AGENT
    APP --> CORE
    CORE --> DATA
    AGENT --> CORE
    AGENT --> DATA
```

## What Each Layer Does

| Layer | What it does | What it should not do |
| --- | --- | --- |
| Interface | Displays runs, scores, diffs, trade forms | Hold business logic |
| Application | Orchestrates jobs and use cases with Effect | Recompute strategy logic ad hoc |
| Agent | Synthesizes recommendations and explanations | Be the source of truth for raw metrics |
| Core logic | Scores sectors and instruments, checks portfolio fit, compares runs | Talk directly to the UI |
| Data | Stores facts, retrieves history, ingests source material | Decide recommendations by itself |

## Current Package Map

```mermaid
flowchart TB
    subgraph Apps
        TUI["apps/tui"]
        API["apps/api (optional)"]
    end

    subgraph Packages
        DOMAIN["packages/domain"]
        DB["packages/db"]
        SOURCES["packages/data-sources"]
        KNOW["packages/knowledge"]
        STRAT["packages/strategy-engine"]
        PORT["packages/portfolio-engine"]
        MEM["packages/memory"]
        AGENT["packages/agent-runtime"]
        APPSVC["packages/app-services"]
    end

    TUI --> APPSVC
    API --> APPSVC
    APPSVC --> STRAT
    APPSVC --> PORT
    APPSVC --> MEM
    APPSVC --> AGENT
    STRAT --> DB
    PORT --> DB
    MEM --> DB
    AGENT --> MEM
    AGENT --> STRAT
    SOURCES --> DB
    KNOW --> DB
    APPSVC --> DOMAIN
```

## Service Responsibilities

| Module | Responsibility | Main inputs | Main outputs |
| --- | --- | --- | --- |
| `apps/tui` | Operator UI for runs and review | workflows, state | commands, trade entries |
| `app-services` | Orchestrates end-to-end use cases | user intent, schedules | completed workflows |
| `data-sources` | Pulls market and source data | APIs, feeds, files | normalized raw records |
| `knowledge` | Distills transcripts and letters | transcript text, letters | `KnowledgeDocument`, `KnowledgeClaim` |
| `db` | Persists facts and history | domain records | queries and storage |
| `strategy-engine` | Scores sectors and instruments | snapshots, metrics | scores and labels |
| `portfolio-engine` | Checks diversification and fit | holdings, candidates | fit score, allocation guidance |
| `memory` | Retrieves prior runs and similar cases | history, claims, notes | context for comparison |
| `agent-runtime` | Produces structured recommendations | scores, memory, packets | verdicts, reasons, diffs |

## Main User Flow

```mermaid
sequenceDiagram
    participant U as User in TUI
    participant S as app-services
    participant D as data-sources
    participant DB as db
    participant SE as strategy-engine
    participant M as memory
    participant A as agent-runtime

    U->>S: Run daily research
    S->>D: Fetch latest data
    D->>DB: Save snapshots
    S->>SE: Score sectors and instruments
    SE->>DB: Save scores
    S->>M: Load prior runs and knowledge
    M-->>S: Context
    S->>A: Build recommendation run
    A-->>S: Structured recommendations
    S->>DB: Persist run
    S-->>U: Show sectors, candidates, and thesis diffs
```

## Knowledge Flow

```mermaid
flowchart LR
    Y["YouTube transcript"] --> K["knowledge"]
    B["Buffett letters"] --> K
    N["Personal notes"] --> K
    K --> C["distilled claims"]
    C --> DB["pgvector + relational tables"]
    DB --> M["memory retrieval"]
    M --> A["agent-runtime"]
```

## Design Rules

1. `The TUI stays thin.`
   It should call workflows, not own business logic.

2. `Effect owns orchestration.`
   Jobs, retries, dependencies, and service composition belong there.

3. `Pi SDK is the default harness.`
   Use `pi-coding-agent` sessions, resource loading, and extensions before reaching for lower-level packages.

4. `The agent does synthesis, not raw computation.`
   Scores and metrics should be computed before prompting.

5. `Memory is first-class.`
   Daily reruns, trade reflection, and reference retrieval are part of the product, not add-ons.

6. `Storage separates facts from heuristics.`
   Market facts, recommendation history, and transcript-derived claims should not be blurred together.

## V1 Runtime Decision

V1 should launch as:

- `apps/tui`
- backed by Effect services
- using `pi-coding-agent` as the default harness and `pi-tui` for custom components only
- persisting to Postgres and pgvector

`apps/api` should remain optional until we need background scheduling or external hooks.
