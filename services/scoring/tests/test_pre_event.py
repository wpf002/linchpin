from datetime import date

from validation.pre_event import pre_window, window_shares


def test_pre_window_ends_the_day_before_the_event() -> None:
    assert pre_window(date(2020, 4, 1)) == (date(2020, 1, 2), date(2020, 3, 31))


def test_shares_sum_to_one_across_the_roster() -> None:
    shares = window_shares({"a": 300.0, "b": 100.0})
    assert shares == {"a": 0.75, "b": 0.25}


def test_single_character_roster_has_no_share() -> None:
    assert window_shares({"a": 300.0}) == {}


def test_zero_total_has_no_share() -> None:
    assert window_shares({"a": 0.0, "b": 0.0}) == {}
