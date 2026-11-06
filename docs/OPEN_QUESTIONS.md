# Open questions

Roadmap section 13. Each decision was written into code before the `v0.2.0` validation run. Counts are from the run on 2026-11-06.

| # | Question | Decision | Evidence | Where |
| --- | --- | --- | --- | --- |
| 1 | Announced exits | Split by `announcedDate`. The headline uses unannounced exits only | Announced mean change −0.054 (7 events) vs unannounced −0.363 (22 events), z = 2.23 | `validation/strata.py`, `validation/gate.py` |
| 2 | Language weighting | English-only | Median within-franchise rank agreement 0.995 against a floor of 0.90, 29 franchises | `validation/language.py`, [results/language_test.json](results/language_test.json) |
| 3 | Comics roster explosion | Cap every roster by medium: 25 for comics, 20 elsewhere. Rank by appearance count, then billing order | Marvel and DC hold 30 characters between them | `ingest/roster.py` |
| 4 | Recast vs. departure | Recasts are a separate stratum and excluded from the headline | 10 recasts in the corpus, 0 produced an estimate | `validation/gate.py` |
| 5 | Ensemble redundancy | Flag and leave unscored. Nothing is imputed | 30 characters scored, 305 flagged | `metrics/absence.py` |

## 1. Announced exits

An announced exit is one with an `announcedDate` in the corpus. 30 of 140 events have one. The attention fall after an announced exit is about a seventh of the fall after an unannounced one, and the difference clears the 1.96 threshold. The announced stratum has 7 studied events, below the 12 needed for a rank IC.

## 2. Language weighting

Two definitions of share were compared over the scoring window (2025-11-03 to 2026-11-03): English pageviews, and English plus es, fr, de, ja, pt, ru and it. The decision rule and the 0.90 floor were fixed before the test ran.

| Measure | Value |
| --- | --- |
| Franchises compared | 29 |
| Median rank agreement | 0.995 |
| Lowest rank agreement | 0.829 (Friends) |
| Franchises where the top character changes | 1 (Better Call Saul) |
| Median share of views from the other editions | 25% |

Limits of the test:

- Regional weighting was not tested. It needs a per-franchise audience split by region, and no free source provides one.
- Some editions cover a character as a section of a list article. Section links have no pageview series, so those characters count zero views from that edition.
- Franchises with fewer than 4 characters with pageviews were left out.

## 3. Comics roster explosion

Shares are fractions of a roster total, so an uncapped publisher roster pushes every share toward zero and makes HHI incomparable with a TV cast. The catalogue sources carry no appearance counts, so TV rosters keep billing order. The two comics rosters in the corpus hold 30 characters together, so the cap doesn't bind yet.

## 4. Recast vs. departure

A recast keeps the character on screen, so it isn't an absence. Recasts are excluded from the headline rank IC and from absence windows. The recast stratum is empty in this run: none of the 10 recast events had both pageview coverage and two comparable controls. The comparison against departures can't be made until it has events.

## 5. Ensemble redundancy

Substitutability is measured only for a character with a death or departure event, using that event's post-window as the absence window.

| Flag | Characters |
| --- | --- |
| Scored | 30 |
| No absence window | 232 |
| Insufficient absence or presence window | 72 |
| Character carries no measurable attention while present | 1 |

A two-hander or a permanent cast has no absence window. Its franchise substitutability is null, and fragility for those franchises rests on concentration alone. 7 franchises have a substitutability figure.
