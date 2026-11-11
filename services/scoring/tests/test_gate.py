"""Which exit events the gate counts and tests."""

from __future__ import annotations

from datetime import date

from metrics.constants import KILL_CRITERIA
from validation.did import DidEstimate
from validation.gate import EventRow, _evaluate, _Study, headline_studies

EVENT_DATE = date(2020, 3, 1)


def _study(index: int, *, verified: bool, pre_carry: float | None) -> _Study:
    event = EventRow(
        exit_event_id=f"event-{index}",
        franchise_id=f"franchise-{index}",
        character_id=f"character-{index}",
        event_date=EVENT_DATE,
        exit_type="ACTOR_DEPARTURE",
        verified=verified,
        announced=False,
        pre_carry=pre_carry,
        pre_search_share=None,
        billing_order=index + 1,
    )
    estimate = DidEstimate(
        pre_mean=1.0,
        post_mean=1.0,
        control_pre=1.0,
        control_post=1.0,
        estimate=-float(index),
        std_error=0.1,
    )
    return _Study(event=event, estimate=estimate, control_set_id=f"controls-{index}")


def test_unverified_and_unshared_events_stay_out_of_the_headline() -> None:
    kept = _study(0, verified=True, pre_carry=0.2)
    studies = [
        kept,
        _study(1, verified=False, pre_carry=0.3),
        _study(2, verified=True, pre_carry=None),
    ]
    assert headline_studies(studies) == [kept]


def test_min_exit_events_counts_tested_verified_events_only() -> None:
    # 2026-11-11: 71 exits were verified but only 15 had an article-basis
    # pre-window share. The old count passed on verified exits it never tested.
    required = int(KILL_CRITERIA["minExitEvents"])
    tested = [_study(index, verified=True, pre_carry=0.1 * (index + 1)) for index in range(10)]
    untested = [_study(index, verified=True, pre_carry=None) for index in range(10, required + 10)]
    studies = tested + untested
    result = _evaluate([study.event for study in studies], studies, median_roster=0.9)
    failure = next(f for f in result.failures if f.criterion == "minExitEvents")
    assert "tested verified exit events 10" in failure.detail
    assert result.verified_event_count == required + 10
