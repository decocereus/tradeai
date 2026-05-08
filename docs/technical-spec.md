# Technical Spec

## Stack Contract

The implemented system is built in TypeScript and uses:

- `Bun` for workspace management, script running, and the default runtime
- `Effect` for application architecture, services, jobs, errors, and orchestration
- `pi-mono` as the agent and TUI harness
- `PostgreSQL` for structured storage
- `pgvector` planned for retrieval over transcripts, Buffett letters, and notes
- `Drizzle` for schema and migrations
- `Schema` from the `effect` package for internal domain schemas

`Zod` should only be added if a specific dependency forces it at an integration boundary.

## Harness Direction

Reference harness:

- [badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- [Pi coding-agent README](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#readme)
- [Pi coding-agent docs](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs)

We are not adopting `pi-mono` as the whole application framework. We are using it for:

- the `@mariozechner/pi-coding-agent` SDK and session model
- model abstraction and built-in tools
- resource loading for skills, prompts, extensions, themes, and context files
- terminal workflows and optional custom TUI components

The application itself should remain Effect-native.

## Runtime Shape

The runtime split should be:

- `Effect` runs the application and services
- `pi-coding-agent` provides the primary SDK, session runtime, and resource loader
- `pi-tui` is used only when we need custom interactive components or overlays
- lower-level Pi packages remain implementation details unless we need deeper control

This keeps the product logic independent from the UI while still letting us move fast with a usable operator console.

## Current Runtime State

The system now has a real working runtime, not just a proposed one.

Implemented pieces:

- Bun workspace monorepo
- Effect-based orchestration
- local Postgres persistence
- Pi harness integration
- terminal-first operator UI
- INDstocks broker connectivity
- persisted dashboard/review flows

## High-Level Architecture

The system is split into deterministic pipelines and agent reasoning layers.

Deterministic layers:

- data ingestion
- normalization
- scoring
- portfolio calculations
- state tracking

Agent layers:

- research synthesis
- thesis comparison
- explanation generation
- retrieval over strategy memory and reference material

## Proposed Modules

| Module | Responsibility | Notes |
| --- | --- | --- |
| `data-sources` | Price, funds, announcements, broker payloads, market APIs | Raw ingestion only |
| `research-engine` | Provider payload to research packet mapping | Keeps provider adapters thin |
| `knowledge` | Document normalization and deterministic claim retrieval | Reference memory, not raw prompt dumping |
| `strategy-engine` | Sector and instrument scoring | Deterministic first |
| `portfolio-engine` | Allocation and fit checks | Keeps recommendations sane |
| `memory` | Recommendation history, trades, retrieval | Powers yes/yes and yes/no logic |
| `agent-runtime` | Pi agent workflows and tools | Synthesis and explanation |
| `app-services` | Effect services coordinating runs | The app orchestration layer |
| `db` | Drizzle schema and persistence | Postgres now, pgvector later |
| `tui` | Terminal operator cockpit | First interface layer |

## Monorepo Shape

This is the current implemented layout.

| Path | Purpose |
| --- | --- |
| `apps/tui` | Customized Pi-based operator console |
| `apps/api` | Thin HTTP interface over `createTradeAiWorkflowService()` |
| `packages/domain` | Shared types, schemas, enums, recommendation contracts |
| `packages/db` | Drizzle schema, migrations, and queries |
| `packages/data-sources` | Connectors for market, broker, funds, and event feeds |
| `packages/research-engine` | Converts provider detail into `ResearchPacket` values |
| `packages/knowledge` | Builds persisted knowledge documents and retrieves matching claims |
| `packages/strategy-engine` | Deterministic scoring and ranking logic |
| `packages/agent-runtime` | Pi-agent orchestration, tools, and prompting |
| `packages/portfolio-engine` | Allocation and portfolio-fit logic |
| `packages/memory` | Retrieval, embeddings, and recommendation history |
| `packages/app-services` | Effect services for workflows and jobs |
| `packages/observability` | Logging and operational instrumentation |

## pi-mono Usage Plan

The current intended package usage is:

| pi-mono package | Planned role |
| --- | --- |
| `@mariozechner/pi-coding-agent` | Primary SDK entrypoint, session lifecycle, resources, tools, and extension model |
| `@mariozechner/pi-tui` | Custom interactive components and overlays when the built-in session UI is not enough |

We do not need `pi-web-ui` in the current system.

We should keep the TUI thin:

- render runs, scores, diffs, and trade logs
- call Effect services and agent workflows
- avoid putting business logic in the UI layer

## Data Model

The core entities now include:

| Entity | Purpose |
| --- | --- |
| `Sector` | Market theme or sector being tracked |
| `Instrument` | Stock, ETF, mutual fund, gold-linked instrument, or other supported asset |
| `InstrumentSnapshot` | Point-in-time factual packet for one instrument |
| `SectorSnapshot` | Point-in-time sector-level research packet |
| `RecommendationRun` | One full evaluation run for a date or time |
| `Recommendation` | Verdict for one instrument inside a run |
| `PortfolioPosition` | What the user actually holds |
| `UserTrade` | Manual trade entered by the user |
| `ThesisChange` | Why a prior recommendation changed |
| `KnowledgeDocument` | Transcript, Buffett letter, note, or distilled memo |
| `KnowledgeClaim` | Structured heuristic extracted from a document |

Implemented broker/runtime entities now also include:

- `BrokerHolding`
- `BrokerTradeFill`
- `PortfolioMemorySnapshot`
- `PortfolioSyncReport`
- `HoldingResearchReview`
- `HoldingReviewTrend`
- `PortfolioDashboardReport`

## Core Storage Needs

Preferred direction:

- PostgreSQL for structured facts and recommendation history
- `pgvector` is still the preferred next step for retrieval over notes, transcripts, and reference material

This keeps the system simple and TypeScript-friendly.

## Recommendation Pipeline

### 1. Ingestion

Collect:

- price history
- instrument metadata
- company financials
- company events and announcements
- macro and geopolitical events
- mutual fund or ETF metadata
- transcript and letter source material
- user-entered trades and notes

### 2. Normalization

Normalize raw source data into structured records:

- sector tags
- governance flags
- quarter-over-quarter trend stats
- year-over-year trend stats
- market-image signals
- event severity markers

### 3. Scoring

Compute deterministic scores before the LLM sees anything:

- sector attractiveness
- stability score
- governance score
- growth/upside score
- event-risk score
- portfolio-fit score

### 4. Research Synthesis

The agent receives the normalized packet and produces:

- verdict
- conviction
- stability label
- rationale
- risk summary
- invalidation conditions
- comparison versus previous run

### 5. Portfolio Fit

The system should then decide:

- whether the recommendation fits current exposure
- whether a fund/ETF is better than a direct stock
- whether the position belongs in the stable bucket or growth bucket

## Knowledge Ingestion Strategy

We should not "train the model" on raw transcripts first. We should distill knowledge into structured memory.

Implemented first pass:

1. `--knowledge-file` reads a note/transcript/letter/memo from disk.
2. `app-services` normalizes it into a `KnowledgeDocument`.
3. `db` persists it in `knowledge_documents`.
4. equity research retrieves matching claims and returns them as `knowledgeContext`, separate from prior-run `memoryContext`.

The current retrieval is deterministic keyword matching over persisted documents. `pgvector` remains the next step for semantic retrieval, not a prerequisite for truthful source attribution.

### YouTube Workflow

1. Fetch or generate transcript.
2. Clean the transcript.
3. Chunk it into semantically meaningful sections.
4. Extract structured claims:
   - investment heuristics
   - warning signs
   - risk principles
   - portfolio rules
   - sector-selection ideas
5. Store:
   - raw transcript
   - cleaned transcript
   - extracted claims
   - source metadata
   - timestamps

### Warren Buffett Letters Workflow

1. Ingest letter text.
2. Distill it into a reusable principle library.
3. Tag each principle by category:
   - management quality
   - business quality
   - capital allocation
   - valuation discipline
   - risk and patience
4. Use these principles as supporting heuristics during company analysis.

Important rule:

- Buffett letters should influence evaluation frameworks, not override India-specific market context or the user's own strategy.

## Agent Design

The system should use specialized agent roles or workflows, even if they run inside a single harness.

| Agent workflow | Job |
| --- | --- |
| `macro-analyst` | Build daily sector context |
| `company-analyst` | Evaluate a company or instrument packet |
| `portfolio-analyst` | Judge fit against current holdings |
| `memory-analyst` | Compare today versus prior runs |
| `knowledge-analyst` | Retrieve relevant heuristics from transcripts and letters |

These can be logical workflows first, and separate runtime agents later if needed.

## Pi Integration Strategy

The default integration path should be:

1. Use `createAgentSession()` from `@mariozechner/pi-coding-agent`.
2. Use `DefaultResourceLoader` so project skills, prompts, extensions, and `AGENTS.md` are discovered automatically.
3. Use `SessionManager` when we want persisted or branchable Pi sessions.
4. Add extensions for custom tools, commands, and lightweight UI behavior.
5. Use `ctx.ui.custom()` and `@mariozechner/pi-tui` only when we need richer terminal interaction.

This is better than rebuilding a custom harness directly on top of `pi-agent-core`.

## Interface Strategy

The first usable product should be terminal-first.

Use the Pi TUI as:

- daily research cockpit
- recommendation review surface
- thesis-diff browser
- trade logging interface
- knowledge-inspection surface

Later, if the product proves itself, we can add a private web UI without changing the core runtime.

## Execution Policy

For v1:

- the system recommends
- the user confirms
- the system tracks the resulting position

This keeps us clear of unnecessary execution complexity early on.

## Non-Goals For V1

- model fine-tuning
- GPU-dependent training pipelines
- high-frequency trading
- intraday execution automation
- public multi-user product concerns
- full broker execution

## Initial Milestones

| Milestone | Outcome |
| --- | --- |
| `M1` | Docs, stack contract, and scoring rubric are frozen |
| `M2` | Bun monorepo and Effect services are scaffolded |
| `M3` | Ingestion and normalized research packets exist |
| `M4` | Sector and instrument scoring works deterministically |
| `M5` | Agent synthesis produces structured recommendations |
| `M6` | Memory, thesis comparison, and TUI workflow work end-to-end |
| `M7` | Knowledge documents can be ingested and retrieved as first-class research context |

## Open Questions

- Which broker or market-data source should become the primary source for v1?
- How much daily automation should run versus manual triggers?
- How opinionated should Buffett-derived principles be inside the scoring engine?
- Should the HTTP API stay read-only, or should selected authenticated write workflows move there after the TUI path settles?
