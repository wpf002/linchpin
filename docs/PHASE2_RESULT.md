# Phase 2 Result

**Gate: FAIL.** Model `v0.1.0`. Recorded as a deliverable per the roadmap. No weights were changed after seeing these numbers.

## Kill Criteria

| Criterion | Required | Observed | Status |
| --- | --- | --- | --- |
| minExitEvents | ≥ 200 verified exits | 70 | Fail |
| minRankIC | Carry rank IC ≥ 0.15 | Not computable (2 usable pairs) | Fail |
| rankICInterval | Interval excludes zero | Not computable | Not Run |
| beatsBaseline | Carry IC > billing-order IC | Not computable | Not Run |
| minRosterCompleteness | Median ≥ 0.70 | 0.75 | Pass |

## Why It Failed

- **Too few exits.** The hand-verified corpus has 70 events. The gate needs 200.
- **Too few usable studies.** 4 of 70 events produced a difference-in-differences estimate. The rest had no pageview coverage around the exit date (Wikimedia's per-article series starts July 2015) or no control set matching on medium, genre, roster size and franchise age.
- **Rank IC needs pairs.** With 4 studies, only 2 within-franchise pairs survive. No interval can be formed.

## Sanity Checks Against Roadmap Expectations

| Franchise | Expected | Fragility | rosterComplete | Matches |
| --- | --- | --- | --- | --- |
| Friends | Low | −0.48 | 1.00 | Yes |
| House | High | −0.54 | 0.92 | No |
| Sherlock | High | 2.58 | 1.00 | Yes |
| The Mandalorian | High | 1.46 | 1.00 | Yes |

House scores as an ensemble. Its Wikipedia attention splits across Gregory House, Wilson, Cuddy and the rotating fellows, so HHI is low. Pageviews alone may not capture lead concentration for procedurals. This is a finding, not something to tune away.

## Open Methodology Question

Fragility z-scores are computed over every franchise, including those suppressed for `rosterComplete` < 0.70 (Two and a Half Men at 0.08, Star Trek: TNG at 0.22). Low-coverage rosters inflate HHI and stretch the distribution. Restricting the z population to scored franchises is a model change. It needs a `MODEL_VERSION` bump and a fresh validation run, decided before looking at new results.

## What Would Move The Gate

1. Extend the exit corpus past 200 verified events, weighted to post-2016 exits so pageview coverage exists.
2. Wire a second attention source (AO3 or Reddit counts) so pre-2015 exits have signal.
3. Re-run `validate` without touching weights.
