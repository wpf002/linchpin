"""Reddit mention ingest: name matching, covered span and zero-filled daily rows."""

from __future__ import annotations

from datetime import date

from ingest.discourse import covered_span, daily_points, match_names
from ingest.reddit import SubredditScan, count_mentions
from metrics.scoring import discourse_shares


def _scan(
    sub: str, oldest: date, newest: date, counts: dict[str, dict[date, int]]
) -> SubredditScan:
    return SubredditScan(subreddit=sub, oldest_post=oldest, newest_post=newest, counts=counts)


def test_match_names_drops_short_and_duplicate_names() -> None:
    assert match_names("Al Swearengen", ["Al", "al swearengen", "Swearengen"]) == (
        "Al Swearengen",
        "Swearengen",
    )


def test_count_mentions_is_one_hit_per_post_and_whole_word() -> None:
    posts = ["Rick Grimes again, Rick Grimes forever", "Ricky is not Rick", "nothing here"]
    assert count_mentions(posts, ["Rick Grimes", "Rick"]) == 2


def test_covered_span_drops_edge_days_and_intersects_subreddits() -> None:
    first = _scan("a", date(2026, 10, 1), date(2026, 10, 20), {})
    second = _scan("b", date(2026, 10, 5), date(2026, 10, 30), {})
    assert covered_span([first]) == (date(2026, 10, 2), date(2026, 10, 19))
    assert covered_span([first, second]) == (date(2026, 10, 6), date(2026, 10, 19))


def test_covered_span_is_none_for_an_empty_or_one_day_scan() -> None:
    assert covered_span([_scan("a", None, None, {})]) is None
    assert covered_span([_scan("a", date(2026, 10, 1), date(2026, 10, 2), {})]) is None
    assert covered_span([]) is None


def test_daily_points_zero_fill_and_sum_across_subreddits() -> None:
    scans = [
        _scan("a", date(2026, 10, 1), date(2026, 10, 5), {"c1": {date(2026, 10, 2): 3}}),
        _scan("b", date(2026, 10, 1), date(2026, 10, 5), {"c1": {date(2026, 10, 2): 1}}),
    ]
    span = covered_span(scans)
    assert span is not None
    points = daily_points(scans, "c1", span, release_dates=[date(2026, 10, 3)])
    assert [(day, value) for day, value, _ in points] == [
        (date(2026, 10, 2), 4.0),
        (date(2026, 10, 3), 0.0),
        (date(2026, 10, 4), 0.0),
    ]
    off_cycle = [flag for _, _, flag in points]
    assert off_cycle[1] is False, "a release day is on-cycle"


def test_discourse_shares_sum_to_one_and_skip_silent_franchises() -> None:
    shares = discourse_shares({"c1": 3.0, "c2": 1.0})
    assert shares == {"c1": 0.75, "c2": 0.25}
    assert discourse_shares({"c1": 0.0, "c2": 0.0}) == {}
