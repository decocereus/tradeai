# Use Cases

## Primary Use Cases

### 1. Daily Market Review

The user wants the system to review the latest macro, policy, and market context and identify:

- favored sectors
- neutral sectors
- avoid sectors
- new catalysts and new risks

Output:

- a ranked sector view
- short explanation per sector
- what changed since the last review

### 2. Sector-To-Company Research

The user selects or accepts a favored sector and wants the system to identify the best candidate instruments inside it.

Output:

- ranked companies or funds in that sector
- stable versus growth classification
- key financial and governance notes
- recommendation and conviction

### 3. Full Instrument Dossier

The user asks, "Should I buy this?"

The system should perform a full review of one instrument and return:

- verdict
- conviction
- major reasons
- major risks
- invalidation triggers
- whether it is better as a direct stock pick or whether a fund/ETF route is safer

### 4. Portfolio-Aware Recommendation

The user already holds positions and wants the system to decide whether a new idea fits the current portfolio.

Output:

- portfolio-fit judgment
- exposure impact
- diversification impact
- overlap with existing holdings
- suggested bucket or allocation class

### 5. Daily Rerun Consistency Check

The system reevaluates yesterday's recommendations using fresh data.

Output:

- stronger thesis
- unchanged thesis
- weaker thesis
- broken thesis

This powers the yes/yes, yes/no, and no/yes logic that the product is built around.

### 6. Manual Trade Reflection

The user manually buys or tracks an instrument outside the agent's recommendation flow.

The system should:

- store the trade
- run its own independent analysis
- compare the user's action to the system's current view
- infer likely reasons only when clearly marked as inference

### 7. Stable Allocation Discovery

The user wants safer places to park capital.

The system should favor:

- stable companies
- broad or sector funds where appropriate
- defensive allocations such as gold exposure

Output:

- low-risk candidate list
- reasoned trade-offs
- why each is considered more stable

### 8. Growth Allocation Discovery

The user wants a limited set of higher-upside positions.

The system should:

- identify higher-volatility opportunities
- explicitly label them as growth or speculative
- size them differently from stable allocations

### 9. Mutual Fund Or ETF Comparison

The user wants to know whether to prefer a direct stock, ETF, or mutual fund for a given theme.

Output:

- direct-stock route
- ETF route
- mutual-fund route
- recommended choice with rationale

### 10. Knowledge-Grounded Research

The user wants the system to use prior learning from:

- YouTube videos
- Buffett letters
- the user's own notes

Output:

- recommendation that cites retrieved principles
- clear separation between facts, heuristics, and inference

## Secondary Use Cases

### 11. Thesis Audit

The user wants to understand why a recommendation changed.

Output:

- exact data or event differences
- score changes by dimension
- explanation of the thesis break or strengthening

### 12. Red-Flag Monitoring

The user wants alerts when a previously acceptable company becomes risky.

Examples:

- governance scandal
- earnings deterioration
- sector reversal
- concentration risk

### 13. Watchlist Monitoring

The user wants the system to maintain a list of instruments that are not buys yet but deserve ongoing monitoring.

Output:

- watchlist rank
- activation triggers
- latest reasons it has not yet become a buy

### 14. Personal Style Adaptation

The user wants the system to become better aligned with their own style over time.

This should happen by:

- observing actual trades
- observing accepted versus rejected recommendations
- storing explicit notes
- retrieving similar prior cases during future analysis

## Use Cases Not In Scope For V1

- autonomous live order execution
- social sharing or public publishing
- multi-user collaboration
- intraday scalping workflows
- high-frequency or low-latency trading
- options and futures decisioning
