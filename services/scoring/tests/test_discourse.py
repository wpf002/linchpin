"""Bluesky mention ingest: query shape, hit parsing, day selection and shares."""

from __future__ import annotations

from datetime import date

import pytest

from ingest.bluesky import FIRST_SEARCHABLE_DAY, build_query, parse_hits
from ingest.discourse import days_to_fetch, is_title_character, trailing_days
from metrics.scoring import discourse_shares


def test_build_query_quotes_both_names_and_drops_inner_quotes() -> None:
    assert build_query("Fiona Gallagher", "Shameless") == '"Fiona Gallagher" "Shameless"'
    assert build_query('Jim "Hop" Hopper', "Stranger Things") == (
        '"Jim Hop Hopper" "Stranger Things"'
    )


def test_parse_hits_prefers_hits_total_and_falls_back_to_posts() -> None:
    assert parse_hits({"hitsTotal": 58, "posts": [{}]}) == 58
    assert parse_hits({"posts": [{}, {}]}) == 2
    assert parse_hits({"hitsTotal": 0, "posts": []}) == 0


@pytest.mark.parametrize("payload", [None, [], {"cursor": "x"}, {"hitsTotal": -1}])
def test_parse_hits_rejects_malformed_responses(payload: object) -> None:
    with pytest.raises(ValueError):
        parse_hits(payload)


def test_trailing_days_ends_on_last_day_oldest_first() -> None:
    assert trailing_days(date(2026, 11, 9), 3) == [
        date(2026, 11, 7),
        date(2026, 11, 8),
        date(2026, 11, 9),
    ]


def test_trailing_days_never_starts_before_bluesky_existed() -> None:
    days = trailing_days(date(2023, 1, 2), 10)
    assert days == [FIRST_SEARCHABLE_DAY, date(2023, 1, 2)]
    assert trailing_days(date(2022, 6, 1), 10) == []


def test_days_to_fetch_skips_stored_days() -> None:
    wanted = trailing_days(date(2026, 11, 9), 3)
    assert days_to_fetch(wanted, {date(2026, 11, 8)}) == [date(2026, 11, 7), date(2026, 11, 9)]


def test_discourse_shares_sum_to_one_and_skip_silent_franchises() -> None:
    shares = discourse_shares({"c1": 3.0, "c2": 1.0})
    assert shares == {"c1": 0.75, "c2": 0.25}
    assert discourse_shares({"c1": 0.0, "c2": 0.0}) == {}


def test_title_characters_are_detected_case_insensitively() -> None:
    # Regression: "Angel" in Angel counted 61,153 posts, every mention of the show.
    assert is_title_character("Angel", "Angel")
    assert is_title_character("Ted Lasso ", "ted lasso")
    assert not is_title_character("Fiona Gallagher", "Shameless")
