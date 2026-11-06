"""Regression: the DiD outcome is pageviews only.

Search rows are in anchor units. Before v0.2.0 the franchise total summed every
source, so storing one TRENDS row would have shifted the outcome series.
"""

from datetime import date
from typing import Any

from metrics.constants import SIGNAL_SOURCE_BY_SHARE
from validation.did import franchise_daily_totals


class _Cursor:
    def __init__(self) -> None:
        self.sql = ""
        self.params: tuple[Any, ...] = ()

    def __enter__(self) -> "_Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...]) -> None:
        self.sql, self.params = sql, params

    def fetchall(self) -> list[dict[str, Any]]:
        return [{"franchise_id": "f1", "measured_on": date(2020, 1, 1), "total": 12}]


class _Connection:
    def __init__(self) -> None:
        self.last = _Cursor()

    def cursor(self) -> _Cursor:
        return self.last


def test_franchise_totals_are_restricted_to_the_pageview_source() -> None:
    conn = _Connection()
    series = franchise_daily_totals(conn, ["f1"], date(2020, 1, 1), date(2020, 1, 2))  # type: ignore[arg-type]
    assert "s.source = %s" in conn.last.sql
    assert SIGNAL_SOURCE_BY_SHARE["wikiShare"] in conn.last.params
    assert SIGNAL_SOURCE_BY_SHARE["searchShare"] not in conn.last.params
    assert series == {"f1": {date(2020, 1, 1): 12.0}}
