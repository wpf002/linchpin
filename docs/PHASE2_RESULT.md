# Phase 2 Result

**Gate: FAIL.** Model `v0.1.0`. Recorded as a deliverable per the roadmap. No weights were changed after seeing these numbers.

## Kill Criteria

| Criterion | Required | Observed | Status |
| --- | --- | --- | --- |
| minExitEvents | ≥ 200 verified exits | 70 matched to rosters | Fail |
| minRankIC | Carry rank IC ≥ 0.15 | −0.429, n=23 pairs | Fail |
| rankICInterval | Interval excludes zero | [−0.734, 0.046] | Fail |
| beatsBaseline | Carry IC > billing-order IC | −0.429 vs −0.325 | Fail |
| minRosterCompleteness | Median ≥ 0.70 | 0.75 | Pass |

## Why It Failed

- **Too few verified exits.** The corpus holds 165 events: 95 verified, 70 staged by `stage-exits` and awaiting review. 140 match a roster character; 70 of those are verified.
- **Carry ranks exits backwards.** 41 events produced a difference-in-differences estimate, giving 23 within-franchise pairs. Carry rank IC is −0.429 and billing order is −0.325. Both are negative and neither interval excludes zero.
- **Run 1 (4 studies) was a pipeline bug.** Control franchises only fetched pageviews for their own event windows, so most controls had no observations. Fixed in `ingest/pipeline.py` with a regression test.

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

1. Review the 70 staged events (`verified: false`, each with an `evidence` sentence and `sourceUrl`) and flip the ones that hold.
2. Extend the exit corpus past 200 verified events, weighted to post-2016 exits so pageview coverage exists. The current universe can't reach 200; this needs the Phase 2 universe expansion.
3. Wire a second attention source (AO3 or Reddit counts) so pre-2015 exits have signal.
4. Re-run `validate` without touching weights.
