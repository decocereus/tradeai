# What We Are Building

## Summary

TradeAI is a private, single-user AI investment research system for Indian markets.

It is not a public brokerage app, not a social investing product, and not a high-frequency trading system. Its first job is to behave like a disciplined research analyst: gather evidence, score sectors and instruments, explain recommendations, track thesis changes over time, and learn from the user's decisions.

## Product Thesis

The product exists to solve a practical problem:

- Indian markets are complex
- there are many sectors and instrument types
- profitable investing requires consistent research, not just opinions
- most people cannot repeat that research every day with discipline

TradeAI turns that work into a repeatable agent workflow.

## Product Shape

The product is a top-down, risk-averse investing assistant with four core behaviors:

1. Understand macro and current-events context.
2. Rank sectors based on tailwinds, risks, and catalysts.
3. Evaluate stocks, funds, ETFs, and defensive instruments inside those sectors.
4. Track whether the thesis is getting stronger, weaker, or breaking over time.

## What The System Should Do

- Build a market view from macro, policy, geopolitical, and current-events inputs.
- Identify sectors worth watching, sectors worth avoiding, and sectors worth deeper research.
- Evaluate companies using financials, governance signals, public-image context, and business quality.
- Distinguish between stable companies and higher-upside growth bets.
- Recommend instruments with clear reasoning, conviction, and risk labeling.
- Learn from repeated daily reruns of the same thesis.
- Learn from the user's manual trades and notes.
- Use long-form knowledge sources such as YouTube transcripts and Warren Buffett letters as reference material, not as uncontrolled prompt stuffing.

## What The System Should Not Be

- A black-box bot that just browses the web and improvises trades
- A fine-tuned model project as the first milestone
- An intraday execution engine in v1
- A product that assumes equities, mutual funds, gold, and real-estate-linked instruments can all be scored identically

## First Product Principles

- Capital preservation first
- Diversification over concentration
- Manual execution first
- Structured evidence over vibes
- Repeatable scoring over ad hoc chat responses
- Learning through memory and retrieval over expensive retraining

## User Model

There is only one real user for now: the owner of the system.

That changes a few things in our favor:

- no multi-tenant architecture is needed
- no user-management complexity is needed
- the product can optimize for one workflow instead of generic UX
- personalization can be deep and explicit

## Asset Types In Scope

Initial scope:

- Indian listed equities
- ETFs and mutual funds
- gold exposure through market instruments
- selected real-estate-linked listed instruments where relevant

Later scope:

- direct broker execution
- more advanced portfolio automation
- broader instrument support

## Learning Model

The product should "learn" in three ways:

1. Strategy memory
   Store the actual investment framework, portfolio rules, and scoring logic.
2. Case memory
   Store daily recommendations, conviction, subsequent changes, and outcomes.
3. Reference memory
   Store distilled investment knowledge from external materials such as YouTube transcripts and Buffett letters.

This is retrieval-driven learning, not training a new foundation model.

## The Core Output

For each recommendation, the system should produce:

- verdict
- conviction
- stability across reruns
- key supporting reasons
- main risks
- invalidation conditions
- portfolio fit

That output should be stable enough to compare across days.
