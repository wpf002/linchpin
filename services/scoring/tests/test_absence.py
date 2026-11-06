from datetime import date, timedelta

from metrics.absence import absence_days, presence_days
from metrics.substitutability import substitutability

EVENT = date(2020, 6, 1)


def _series(present_value: float, absent_value: float) -> dict[date, float]:
    series = {day: present_value for day in presence_days(EVENT)}
    series.update({day: absent_value for day in absence_days(EVENT)})
    return series


def test_windows_bracket_the_event_and_skip_the_first_month_after() -> None:
    assert presence_days(EVENT)[-1] == EVENT - timedelta(days=1)
    assert absence_days(EVENT)[0] == EVENT + timedelta(days=30)
    assert not set(presence_days(EVENT)) & set(absence_days(EVENT))


def test_full_absorption_scores_one() -> None:
    result = substitutability(
        character_series=_series(100.0, 0.0),
        roster_series=_series(400.0, 500.0),
        absence_days=absence_days(EVENT),
    )
    assert result.score == 1.0


def test_no_absorption_scores_zero() -> None:
    result = substitutability(
        character_series=_series(100.0, 0.0),
        roster_series=_series(400.0, 400.0),
        absence_days=absence_days(EVENT),
    )
    assert result.score == 0.0


def test_character_who_never_left_is_flagged_not_imputed() -> None:
    # Open question 5: a permanent cast has presence days only.
    series = {day: 100.0 for day in presence_days(EVENT)}
    result = substitutability(
        character_series=series, roster_series=series, absence_days=absence_days(EVENT)
    )
    assert result.score is None
    assert result.reason is not None
