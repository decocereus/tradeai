# Architecture

## Goal

This document shows the current architecture in one place:

- what runs where
- what each module does
- how data moves through the system
- where `Effect`, `pi-mono`, Postgres, and the TUI fit

This is intentionally concise and implementation-oriented.

## One-Screen View

```mermaid
flowchart LR
    U["User"] --> T["apps/tui"]
    U --> API["apps/api"]
    T --> S["app-services workflow service"]
    API --> S
    S --> DS["data-sources"]
    S --> RE["research-engine"]
    S --> K["knowledge"]
    DS --> DB["db (Postgres now, pgvector later)"]
    K --> DB
    DB --> ST["strategy-engine"]
    DB --> M["memory"]
    ST --> A["agent-runtime"]
    M --> A
    A --> S
    S --> T
```

## Architecture Layers

```mermaid
flowchart TB
    UI["Interface layer<br/>apps/tui, later apps/web/API"]
    APP["Application layer<br/>createTradeAiWorkflowService"]
    AGENT["Agent layer<br/>pi-coding-agent SDK"]
    CORE["Core logic layer<br/>strategy-engine, portfolio-engine, research-engine, memory, knowledge"]
    DATA["Data layer<br/>db, data-sources"]

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
| Interface | Displays runs, scores, diffs, trade forms | Import internal workflow modules |
| Application | Exposes `createTradeAiWorkflowService()` and orchestrates use cases with Effect | Recompute strategy logic ad hoc |
| Agent | Synthesizes recommendations and explanations | Be the source of truth for raw metrics |
| Core logic | Scores sectors and instruments, checks portfolio fit, compares runs | Talk directly to the UI |
| Data | Stores facts, retrieves history, ingests source material | Decide recommendations by itself |

## Current Package Map

```mermaid
flowchart TB
    subgraph Apps
        TUI["apps/tui"]
        API["apps/api"]
    end

    subgraph Packages
        DOMAIN["packages/domain"]
        DB["packages/db"]
        SOURCES["packages/data-sources"]
        KNOW["packages/knowledge"]
        RESEARCH["packages/research-engine"]
        STRAT["packages/strategy-engine"]
        PORT["packages/portfolio-engine"]
        MEM["packages/memory"]
        AGENT["packages/agent-runtime"]
        APPSVC["packages/app-services<br/>workflow service port"]
    end

    TUI --> APPSVC
    API --> APPSVC
    APPSVC --> STRAT
    APPSVC --> PORT
    APPSVC --> RESEARCH
    APPSVC --> MEM
    APPSVC --> KNOW
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
| `apps/tui` | Operator UI for runs and review | `createTradeAiWorkflowService()`, state | commands, trade entries |
| `apps/api` | HTTP interface for workflow reads | `createTradeAiWorkflowService()`, request params | JSON workflow results |
| `app-services` | Public workflow port plus internal workflow modules | typed workflow inputs | completed workflows |
| `data-sources` | Pulls market and source data | APIs, feeds, files | normalized raw records |
| `research-engine` | Shapes provider detail into research packets | provider payloads, events | `ResearchPacket` |
| `knowledge` | Normalizes source material and retrieves matching claims | notes, transcripts, letters | `KnowledgeDocument`, `KnowledgeContext` |
| `db` | Persists facts and history | domain records | queries and storage |
| `strategy-engine` | Scores sectors and instruments | snapshots, metrics | scores and labels |
| `portfolio-engine` | Checks diversification and fit | holdings, candidates | fit score, allocation guidance |
| `memory` | Retrieves prior runs and similar cases | history, claims, notes | context for comparison |
| `agent-runtime` | Produces structured recommendations | scores, memory, packets | verdicts, reasons, diffs |

## Main User Flow

```mermaid
sequenceDiagram
    participant U as User in TUI
    participant S as app-services workflow service
    participant D as data-sources
    participant DB as db
    participant SE as strategy-engine
    participant M as memory
    participant A as agent-runtime

    U->>S: runEquityResearch / review / dashboard input
    S->>D: Fetch latest data
    D->>DB: Save snapshots
    S->>SE: Score sectors and instruments
    SE->>DB: Save scores
    S->>M: Load prior runs
    S->>DB: Load persisted knowledge documents
    S->>A: Build recommendation run with memory and knowledge context
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
    K --> C["retrieved claims"]
    C --> DB["relational tables now, pgvector later"]
    DB --> S["app-services research workflow"]
    S --> A["agent-runtime"]
```

## Design Rules

1. `The UI stays behind the workflow service.`
   TUI, future web UI, API routes, and extensions should call `createTradeAiWorkflowService()` rather than importing internal workflow modules. Runtime config and external adapters belong at service construction, not inside UI command handlers.

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

## Current Runtime Decision

The current runtime is:

- `apps/tui`
- backed by `createTradeAiWorkflowService()` from `@tradeai/app-services`
- using `pi-coding-agent` as the default harness and `pi-tui` for custom components only
- persisting to Postgres
- using `INDstocks` for live broker data
- using Groww, AMFI, BSE, and Aftermarkets for enrichment
- exposing persisted knowledge as first-class `knowledgeContext`

`apps/api` is now a thin HTTP interface over `createTradeAiWorkflowService()`. It should remain read-first until background scheduling, writes, or external hooks need explicit product rules.
