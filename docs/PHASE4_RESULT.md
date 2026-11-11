# v0.4.0 result

**Gate: FAIL. Decision: kill.** Model `v0.4.0`. `validate` ran once, on 2026-11-11. Raw output: [results/validate_v0.4.0.txt](results/validate_v0.4.0.txt).

This is the third failed run of the gate, after `v0.1.0` ([PHASE2_RESULT.md](PHASE2_RESULT.md)) and `v0.2.0` ([PHASE3_RESULT.md](PHASE3_RESULT.md)). Each run's rank IC estimate was negative.

## What changed from v0.2.0

| Item | v0.2.0 | v0.4.0 |
| --- | --- | --- |
| Characters scored | Every character with a wikiTitle | Only characters whose wikiTitle is an article (`wikiBasis = ARTICLE`) |
| Gate event count | Every verified exit | Verified exits that reached the headline test |
| Corpus | 70 verified, 0 queued | 71 verified, 33 queued unverified |

The 33 queued exits were not verified before this run. They don't count toward the gate.

## Kill criteria

| Criterion | Required | Observed | Status |
| --- | --- | --- | --- |
| minExitEvents | ≥ 200 tested verified exits | 6 | Fail |
| minRankIC | Rank IC ≥ 0.15 | Not computable, 6 pairs | Fail |
| minRosterCompleteness | Median ≥ 0.70 | 0.714 | Pass |

## Strata (exploratory)

| Stratum | n | Mean DiD | Rank IC | 95% interval |
| --- | --- | --- | --- | --- |
| Unannounced | 35 | −0.289 | −0.251 | [−0.583, 0.119] |
| Character death | 21 | −0.348 | −0.311 | [−0.677, 0.162] |
| Actor departure | 14 | −0.200 | −0.073 | [−0.777, 0.587] |
| Announced | 6 | −0.131 | n/a | |

## Why kill instead of another run

| Reason | Number |
| --- | --- |
| Rank IC estimates with a computable value | Every one is negative, across three model versions |
| Testable article-basis exits in the whole corpus | 52 (2026-11-11), against 200 required |
| Characters with their own Wikipedia article | 933 of 2,788 |
| Franchises needed at the current yield to reach 200 | About 600 more |

Pageviews fall for the whole franchise when a character leaves. A character's pre-exit share doesn't predict which franchises fall further. Wikipedia covers too few characters to test this at the required sample size.

## What stays

- Raw signals, rosters and the exit corpus stay in the database and in `data/corpus`.
- The UI keeps showing scores as exploratory, with their confidence flags.
- No more `validate` runs under `v0.4.0`.
