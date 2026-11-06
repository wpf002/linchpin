# Phase 3 result

**Gate: FAIL.** Model `v0.2.0`. This is a corrected-spec re-run on the same 140 matched events. The registered Phase 2 result is still the `v0.1.0` FAIL in [PHASE2_RESULT.md](PHASE2_RESULT.md).

The analysis code was committed at `fdd26e2` before any `v0.2.0` number existed. `validate` ran once, on 2026-11-06. Raw output: [results/validate_v0.2.0.txt](results/validate_v0.2.0.txt).

## What changed from v0.1.0

| Item | v0.1.0 | v0.2.0 |
| --- | --- | --- |
| Predictor | Carry score from the current scoring window | Character's wiki share in the event's own pre-window (−90 to −1 days) |
| Headline sample | Every studied exit | Unannounced exits, recasts excluded |
| Strata | None | Unannounced, announced, one per exit type |
| Second signal | None | Google Trends pre-window interest, tested as a blend on a held-out split |
| Weights | `WIKI_ONLY_WEIGHTS` | Unchanged |

## Kill criteria

| Criterion | Required | Observed | Status |
| --- | --- | --- | --- |
| minExitEvents | ≥ 200 verified exits | 70 | Fail |
| minRankIC | Rank IC ≥ 0.15 | −0.450, n=22 | Fail |
| rankICInterval | Interval excludes zero | [−0.751, 0.011] | Fail |
| beatsBaseline | Rank IC > billing-order IC | −0.450 vs −0.370 | Fail |
| minRosterCompleteness | Median ≥ 0.70 | 0.75 | Pass |

Of 140 matched events, 41 produced an estimate. 70 had too few treated-franchise observations (mostly exits before pageview data starts in July 2015) and 29 had fewer than two comparable controls. 12 of the 41 had no wiki share for the character in the pre-window, which leaves 29 across the strata below.

## Strata

Rank IC needs 12 usable events in a stratum. Mean change is the difference-in-differences estimate in log pageviews; negative is a fall.

| Stratum | Events | Mean change | Rank IC | Interval |
| --- | --- | --- | --- | --- |
| Unannounced (headline) | 22 | −0.363 | −0.450 | [−0.751, 0.011] |
| Announced | 7 | −0.054 | Not computed | 7 events |
| Character death | 16 | −0.420 | −0.422 | [−0.729, 0.061] |
| Actor departure | 6 | −0.211 | Not computed | 6 events |

Announced exits differ from unannounced ones at z = 2.23 (threshold 1.96). The fall after an announced exit is about a seventh the size. Mixing the two would have pulled the headline mean toward zero.

## Blend test

**Verdict: INCONCLUSIVE.** 12 events have both a wiki share and a Trends value: 5 in the training split, 7 held out. Fitting needs 12 in training.

Google Trends returned 9 complete windows of 28, 2 incomplete (Doctor Who, 2022 and 2025), then HTTP 429 at Grey's Anatomy 2016-05-19. The ingest stopped there.

Scoring stays wiki-only. The roadmap's rule to delete the other extractors applies when the blend is tested and loses. It wasn't tested, so the Trends extractor stays. Phase 3's exit condition (multi-signal beats wiki-only on held-out rank IC) is not met.

## Phase 4 outputs

| Output | Count |
| --- | --- |
| Characters scored | 335 across 37 franchises |
| Characters with a substitutability score | 30 |
| Flagged "no absence window" | 232 |
| Flagged "insufficient absence or presence window" | 72 |
| Flagged "character carries no measurable attention while present" | 1 |
| Franchises with a substitutability figure | 7 |

Fragility for Friends (−0.48), House (−0.54), Sherlock (2.58) and The Mandalorian (1.46) is identical to `v0.1.0`. The z-score population is unchanged, so the open methodology question in PHASE2_RESULT.md still stands.

## Creator layer

Zero creator scores were written. No person in the database has three completed projects with a peer baseline, so every person is suppressed by `minCreatorProjects`. The table, API field and Vantage rows exist and are empty.

## What would move the gate

1. Review the 70 staged exit events and mark the ones that hold as verified.
2. Expand the universe. 200 verified exits and 3 projects per creator both need more franchises than the current 39.
3. Re-run `ingest-search` on later days until all 28 windows are stored, then re-run `validate` without changing code.
