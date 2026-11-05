from datetime import date, datetime

from validation.controls import _age_comparable, as_date


def test_as_date_strips_time_from_timestamp_columns() -> None:
    assert as_date(datetime(1987, 9, 28, 0, 0)) == date(1987, 9, 28)
    assert as_date(date(1994, 9, 22)) == date(1994, 9, 22)
    assert as_date(None) is None


def test_age_comparison_accepts_normalised_timestamps() -> None:
    # Regression: firstRelease arrived as datetime and raised TypeError against a date.
    treated = as_date(datetime(1987, 9, 28))
    candidate = as_date(datetime(1984, 9, 22))
    assert _age_comparable(candidate, treated, date(1988, 4, 25)) is True
