# Scoring Matrix And System Blueprint

## Purpose

This document converts the discussion so far into an implementable decision framework.

The system should not rely on free-form model intuition alone. It should compute structured scores, then let the agent reason over them.

## Scoring Philosophy

- top-down first
- risk-averse by default
- stable capital compounds the portfolio
- growth ideas earn smaller allocations
- governance and thesis breaks matter more than surface-level popularity

## Decision Flow

1. Score sectors.
2. Select favored sectors.
3. Score instruments inside those sectors.
4. Classify each instrument by risk bucket.
5. Check portfolio fit.
6. Produce recommendation and conviction.
7. Compare against prior runs for stability.

## Sector Scoring Matrix

Suggested score range: `0-100`

| Dimension | Description | Weight |
| --- | --- | ---: |
| Macro tailwind | Whether broader economic conditions support the sector | 20 |
| Government or policy support | Alignment with Indian policy direction and incentives | 20 |
| Geopolitical effect | Whether global or regional events help or hurt the sector | 15 |
| Upcoming catalysts | Known upcoming triggers that could change sentiment or fundamentals | 15 |
| Sector sentiment | Whether the sector is currently strengthening or deteriorating | 10 |
| Structural durability | Whether the tailwind is durable versus temporary hype | 10 |
| Regulatory risk | Penalty for uncertainty or negative policy exposure | 10 |

Interpretation:

- `80-100`: favored
- `60-79`: research further
- `40-59`: neutral or watch only
- `0-39`: avoid

## Instrument Scoring Matrix

Suggested score range: `0-100`

| Dimension | Description | Weight |
| --- | --- | ---: |
| Financial quality | Quarter and multi-year health, profitability, debt, and trend quality | 25 |
| Business quality | Durability, competitive position, and operating quality | 15 |
| Management and governance | Credibility, scandals, capital allocation, and trustworthiness | 20 |
| Sector alignment | How well the instrument fits the selected sector thesis | 10 |
| Stability profile | Drawdown behavior, maturity, and reliability | 10 |
| Growth or upside potential | Room for upside if thesis works | 10 |
| Current event context | Event-driven positives or negatives affecting the instrument now | 10 |

Interpretation:

- `80-100`: strong candidate
- `65-79`: candidate
- `50-64`: watchlist
- `0-49`: reject

## Stable Company Heuristic

This is a classification, not a guarantee.

| Signal | Meaning |
| --- | --- |
| Consistent recent quarter performance | Lower fragility |
| Multi-year earnings or cash-flow support | Better operating durability |
| Acceptable leverage | Less balance-sheet stress |
| Cleaner governance profile | Lower hidden blow-up risk |
| Lower event fragility | Less likely to be broken by one headline |
| Reasonable volatility and drawdown behavior | Better fit for the capital-preservation bucket |

## Bad Company Heuristic

This is also a classification, not a permanent label.

| Signal | Meaning |
| --- | --- |
| Governance scandal | High-severity red flag |
| CEO or promoter controversy with real business impact | Can override otherwise strong numbers |
| Earnings deterioration | Thesis weakening |
| Debt stress | Capital impairment risk |
| Repeated negative event pattern | Signals instability |
| Severe mismatch between narrative and actual financials | Avoid hype traps |

Important note:

- public image alone should be low-weight
- serious governance or promoter events should be high-weight

## Instrument-Type Specific Rubrics

Different instruments require different analysis logic.

### Direct Stocks

Primary focus:

- company quality
- management quality
- sector fit
- event risk
- upside versus downside

### ETFs

Primary focus:

- theme exposure
- concentration
- liquidity
- overlap with current portfolio
- whether diversified exposure is safer than stock selection

### Mutual Funds

Primary focus:

- mandate and category
- quality of exposure
- consistency
- overlap with existing holdings
- suitability as a lower-friction diversification tool

### Gold Or Defensive Instruments

Primary focus:

- macro hedge role
- diversification contribution
- fit inside the defensive bucket

## Portfolio Allocation Blueprint

This is a starting framework, not a locked allocation model.

| Bucket | Purpose | Suggested Range |
| --- | --- | ---: |
| Core stable equities | Safer compounding base | 50-60% |
| Diversified funds or ETFs | Broader exposure and reduced single-name risk | 20-25% |
| Defensive exposure | Gold or similar stability buffer | 10-15% |
| Growth or higher-upside positions | Controlled risk-taking | 10-15% |

## Portfolio Fit Rules

Every recommendation should also receive a portfolio-fit score.

| Check | Why it matters |
| --- | --- |
| Sector concentration | Avoid overexposure |
| Instrument overlap | Avoid disguised duplication |
| Risk-bucket balance | Keep speculative allocation controlled |
| Defensive balance | Preserve downside protection |
| Position-size suitability | Avoid oversized bets |

## Recommendation Output Schema

Each recommendation should include:

| Field | Meaning |
| --- | --- |
| `verdict` | `strong_buy`, `buy`, `watch`, `reject` |
| `conviction` | Confidence score, ideally `0-100` |
| `stability` | Whether the thesis is consistent across reruns |
| `risk_bucket` | `stable`, `moderate`, `growth`, or `speculative` |
| `sector_score` | Computed sector attractiveness |
| `instrument_score` | Computed instrument score |
| `portfolio_fit_score` | How well it fits current holdings |
| `key_reasons` | Main reasons supporting the idea |
| `main_risks` | Main reasons it could fail |
| `invalidation_conditions` | What would break the thesis |

## Daily Thesis Comparison Model

The system should compare each instrument's latest decision to its previous decision.

| Prior | Current | Interpretation |
| --- | --- | --- |
| Yes | Yes | Thesis remains valid; stronger if conviction rises |
| Yes | No | Thesis likely broke or materially weakened |
| No | Yes | New activation; understand what changed |
| No | No | Still not investable |

We should not rely only on binary labels. We should also compare:

- conviction delta
- score delta
- event delta
- portfolio-fit delta

## Learning Loops

### Loop 1: Recommendation Memory

Store:

- date
- instrument
- verdict
- conviction
- reasons
- risks
- invalidation conditions

### Loop 2: User Trade Memory

Store:

- user-selected instrument
- amount
- date
- optional user note
- whether the system agreed or disagreed at the time

### Loop 3: Outcome Memory

Store:

- later thesis outcome
- whether the recommendation improved or degraded
- which signals were most predictive

### Loop 4: Knowledge Memory

Store:

- transcript-derived heuristics
- Buffett-derived principles
- source provenance
- confidence and tags

## Module-By-Module System Blueprint

| Module | Inputs | Outputs | Key responsibility |
| --- | --- | --- | --- |
| `sector-intelligence` | Macro news, policy events, geopolitical inputs | Sector scores and ranked sectors | Decide where attention should go |
| `instrument-intelligence` | Financials, events, price history, sector context | Instrument scores and risk labels | Decide what is investable |
| `portfolio-engine` | Current holdings and recommendation candidates | Portfolio-fit score and sizing guidance | Keep allocations sane |
| `memory-engine` | Prior runs, user trades, notes | Similar cases and thesis history | Support learning and consistency |
| `knowledge-engine` | Transcripts, Buffett letters, distilled claims | Retrieved heuristics and supporting principles | Add long-form wisdom without prompt chaos |
| `research-agent` | Normalized packets plus retrieved memory | Final recommendation payload | Explain and synthesize |

## Tables We Will Eventually Need In The Database

Suggested first-pass tables:

| Table | Purpose |
| --- | --- |
| `sectors` | Sector definitions |
| `instruments` | Unified instrument catalog |
| `sector_snapshots` | Point-in-time sector facts and scores |
| `instrument_snapshots` | Point-in-time instrument facts and scores |
| `recommendation_runs` | One execution of the research process |
| `recommendations` | Recommendation outputs per run |
| `portfolio_positions` | Current holdings |
| `user_trades` | Manual user trade entries |
| `knowledge_documents` | Raw transcripts, letters, and notes |
| `knowledge_claims` | Distilled principles and heuristics |
| `thesis_changes` | Why a recommendation changed |

## V1 Build Order

1. Freeze domain types and scoring schema.
2. Build sector and instrument score calculation.
3. Build recommendation payload generation.
4. Build memory and rerun comparison.
5. Add knowledge ingestion for transcripts and Buffett letters.
6. Add private UI.
7. Add optional broker integration later.
