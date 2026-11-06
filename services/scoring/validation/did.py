"""Difference-in-differences on franchise attention around an exit event.

The question is whether franchise attention fell after a character left, over
and above what matched control franchises did in the same calendar window. The
estimate is on log attention, so it reads as a proportional change and is not
dominated by the largest franchise in the sample.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from psycopg import Connection

from metrics.constants import EVENT_WINDOWS, SIGNAL_SOURCE_BY_SHARE

PRE_START = timedelta(days=abs(EVENT_WINDOWS["preStart"]))
PRE_END = timedelta(days=abs(EVENT_WINDOWS["preEnd"]))
POST_START = timedelta(days=EVENT_WINDOWS["postStart"])
POST_END = timedelta(days=EVENT_WINDOWS["postEnd"])

#: Below this many daily observations in either window the estimate is noise.
MIN_WINDOW_OBSERVATIONS = 20


@dataclass(frozen=True, slots=True)
class DidEstimate:
    pre_mean: float
    post_mean: float
    control_pre: float
    control_post: float
    estimate: float
    std_error: float
    reason: str | None = None

    @property
    def usable(self) -> bool:
        return self.reason is None


def franchise_daily_totals(
    conn: Connection, franchise_ids: Sequence[str], start: date, end: date
) -> dict[str, dict[date, float]]:
    """Franchise pageviews per day, summed across its characters.

    Pageviews only. Trends rows are in anchor units and cannot be added to counts.
    """
    if not franchise_ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c."franchiseId" AS franchise_id,
                   s."measuredOn"  AS measured_on,
                   SUM(s."rawValue") AS total
            FROM "AttentionSignal" s
            JOIN "Character" c ON c.id = s."characterId"
            WHERE c."franchiseId" = ANY(%s)
              AND s.source = %s
              AND s."measuredOn" BETWEEN %s AND %s
            GROUP BY c."franchiseId", s."measuredOn"
            """,
            (list(franchise_ids), SIGNAL_SOURCE_BY_SHARE["wikiShare"], start, end),
        )
        rows = cur.fetchall()

    series: dict[str, dict[date, float]] = {}
    for row in rows:
        series.setdefault(str(row["franchise_id"]), {})[row["measured_on"]] = float(row["total"])
    return series


def estimate(
    *,
    event_date: date,
    treated: Mapping[date, float],
    controls: Sequence[Mapping[date, float]],
) -> DidEstimate:
    pre_window = (event_date - PRE_START, event_date - PRE_END)
    post_window = (event_date + POST_START, event_date + POST_END)

    treated_pre = _log_values(treated, pre_window)
    treated_post = _log_values(treated, post_window)
    if len(treated_pre) < MIN_WINDOW_OBSERVATIONS or len(treated_post) < MIN_WINDOW_OBSERVATIONS:
        return DidEstimate(0, 0, 0, 0, 0, 0, reason="treated franchise has too few observations")

    control_pre: list[float] = []
    control_post: list[float] = []
    for series in controls:
        control_pre.extend(_log_values(series, pre_window))
        control_post.extend(_log_values(series, post_window))
    if len(control_pre) < MIN_WINDOW_OBSERVATIONS or len(control_post) < MIN_WINDOW_OBSERVATIONS:
        return DidEstimate(0, 0, 0, 0, 0, 0, reason="controls have too few observations")

    pre_mean = _mean(treated_pre)
    post_mean = _mean(treated_post)
    ctrl_pre_mean = _mean(control_pre)
    ctrl_post_mean = _mean(control_post)
    point = (post_mean - pre_mean) - (ctrl_post_mean - ctrl_pre_mean)

    std_error = math.sqrt(
        _variance_of_mean(treated_post)
        + _variance_of_mean(treated_pre)
        + _variance_of_mean(control_post)
        + _variance_of_mean(control_pre)
    )
    return DidEstimate(
        pre_mean=pre_mean,
        post_mean=post_mean,
        control_pre=ctrl_pre_mean,
        control_post=ctrl_post_mean,
        estimate=point,
        std_error=std_error,
    )


def _log_values(series: Mapping[date, float], window: tuple[date, date]) -> list[float]:
    start, end = window
    return [
        math.log1p(value) for day, value in series.items() if start <= day <= end and value >= 0
    ]


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _variance_of_mean(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = _mean(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
    return variance / len(values)
