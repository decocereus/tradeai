---
name: tradeai
description: TradeAI project guidance for the private Indian-market research agent. Use when working on architecture, scoring, Pi integration, memory, or deterministic research workflows in this repo.
---

# TradeAI

Use this skill when working on the TradeAI project.

## Purpose

TradeAI is a private, single-user AI investment research system for Indian markets.

The product is:

- terminal-first in v1
- TypeScript + Bun
- Effect-native
- Pi-powered through `@mariozechner/pi-coding-agent`
- focused on research, scoring, memory, and recommendation quality before execution

## Product Rules

- Prefer deterministic scoring before free-form model reasoning.
- Treat the LLM as a research synthesizer, not the raw source of truth for metrics.
- Keep capital-preservation and diversification as the default stance.
- Manual confirmation comes before any execution automation.
- Separate facts, heuristics, and inference clearly.

## Architecture Shape

Main modules:

- `packages/data-sources`
- `packages/strategy-engine`
- `packages/portfolio-engine`
- `packages/memory`
- `packages/agent-runtime`
- `packages/app-services`
- `apps/tui`

## Important Docs

Read these first when needed:

- `docs/what-we-are-building.md`
- `docs/technical-spec.md`
- `docs/use-cases.md`
- `docs/scoring-matrix-and-system-blueprint.md`
- `docs/architecture.md`
- `docs/service-map.md`

## Current Strategy Shape

- Score sectors first.
- Score instruments second.
- Check portfolio fit separately.
- Track daily thesis changes.
- Learn through recommendation history, user trades, and reference knowledge.

## Pi Integration Guidance

- Use `@mariozechner/pi-coding-agent` as the main harness.
- Use `DefaultResourceLoader` so local skills, prompts, extensions, and `AGENTS.md` are discovered.
- Use project-local Pi resources in `.pi/`.
- Use `@mariozechner/pi-tui` only when custom components or overlays are necessary.

## Implementation Bias

- Prefer small vertical slices.
- Keep the TUI thin.
- Keep business logic in packages, not the interface.
- Avoid introducing Python.
