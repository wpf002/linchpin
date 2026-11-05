"""Does franchise attention redistribute when a character is absent?

For each character we find windows where they do not appear, then compare the
rest of the roster's attention in those windows against windows where they do.
High absorption by other characters means the character is replaceable.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True, slots=True)
class SubstitutabilityResult:
    """score is 0..1; 1.0 means the roster fully absorbed the absence."""

    score: float | None
    absence_days: int
    presence_days: int
    reason: str | None = None


MIN_WINDOW_DAYS = 30


def substitutability(
    *,
    character_series: Mapping[date, float],
    roster_series: Mapping[date, float],
    absence_days: Sequence[date],
) -> SubstitutabilityResult:
    """roster_series is total franchise attention excluding the character."""
    absent = set(absence_days)
    present_days = [day for day in roster_series if day not in absent]
    absent_days = [day for day in roster_series if day in absent]

    if len(absent_days) < MIN_WINDOW_DAYS or len(present_days) < MIN_WINDOW_DAYS:
        # Two-hander shows and permanent-cast franchises have no usable absence
        # window. Flag and exclude rather than impute.
        return SubstitutabilityResult(
            score=None,
            absence_days=len(absent_days),
            presence_days=len(present_days),
            reason="insufficient absence or presence window",
        )

    rest_present = _mean(roster_series[day] for day in present_days)
    rest_absent = _mean(roster_series[day] for day in absent_days)
    own_present = _mean(character_series.get(day, 0.0) for day in present_days)

    if own_present <= 0:
        return SubstitutabilityResult(
            score=None,
            absence_days=len(absent_days),
            presence_days=len(present_days),
            reason="character carries no measurable attention while present",
        )

    absorbed = rest_absent - rest_present
    score = absorbed / own_present
    return SubstitutabilityResult(
        score=min(1.0, max(0.0, score)),
        absence_days=len(absent_days),
        presence_days=len(present_days),
    )


def _mean(values) -> float:
    collected = list(values)
    if not collected:
        return 0.0
    return sum(collected) / len(collected)
