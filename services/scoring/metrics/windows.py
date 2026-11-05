"""Off-cycle window computation. A day is off-cycle when it sits at least
EVENT_WINDOWS['offCycleGapDays'] away from every release in its franchise."""

from __future__ import annotations

import bisect
from collections.abc import Sequence
from datetime import date, timedelta

from metrics.constants import EVENT_WINDOWS

OFF_CYCLE_GAP = timedelta(days=EVENT_WINDOWS["offCycleGapDays"])


def is_off_cycle(day: date, release_dates: Sequence[date]) -> bool:
    if not release_dates:
        # No release calendar means no basis for the claim. Treat as on-cycle so
        # durability is never credited to a franchise we simply failed to date.
        return False
    index = bisect.bisect_left(release_dates, day)
    neighbours = []
    if index < len(release_dates):
        neighbours.append(release_dates[index])
    if index > 0:
        neighbours.append(release_dates[index - 1])
    return all(abs(day - release) >= OFF_CYCLE_GAP for release in neighbours)


def split_windows(
    days: Sequence[date], release_dates: Sequence[date]
) -> tuple[list[date], list[date]]:
    """Return (off_cycle_days, on_cycle_days)."""
    ordered = sorted(release_dates)
    off: list[date] = []
    on: list[date] = []
    for day in days:
        (off if is_off_cycle(day, ordered) else on).append(day)
    return off, on
