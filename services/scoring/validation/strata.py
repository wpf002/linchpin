"""Per-stratum estimates for the open questions on announced exits and recasts.

An announced exit leaks into its own pre-window, and a recast keeps the
character on screen, so neither is the same shock as an unannounced death or
departure. Each gets its own estimate, and each is compared with the headline
stratum so a reader can see whether they diverge.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from validation.rank_ic import RankIC, rank_ic

#: Two-sided 95% threshold on the difference in mean DiD between two strata.
DIVERGENCE_Z = 1.96

#: A standard error needs at least two estimates.
MIN_EVENTS_FOR_STD_ERROR = 2


@dataclass(frozen=True, slots=True)
class StratumRow:
    predictor: float
    did_estimate: float


@dataclass(frozen=True, slots=True)
class Stratum:
    name: str
    events: int
    mean_did: float | None
    std_error: float | None
    rank_ic: RankIC


@dataclass(frozen=True, slots=True)
class Comparison:
    stratum: str
    against: str
    difference: float | None
    z_score: float | None
    diverges: bool | None


def summarise(name: str, rows: Sequence[StratumRow]) -> Stratum:
    estimates = [row.did_estimate for row in rows]
    return Stratum(
        name=name,
        events=len(rows),
        mean_did=_mean(estimates),
        std_error=_std_error(estimates),
        # A fall in attention is a negative estimate; flip it so a positive
        # coefficient means the predictor ranked the falls correctly.
        rank_ic=rank_ic([row.predictor for row in rows], [-value for value in estimates]),
    )


def compare(stratum: Stratum, against: Stratum) -> Comparison:
    """Difference in mean DiD. diverges is None when either side lacks a standard error."""
    if (
        stratum.mean_did is None
        or against.mean_did is None
        or stratum.std_error is None
        or against.std_error is None
    ):
        return Comparison(stratum.name, against.name, None, None, None)
    difference = stratum.mean_did - against.mean_did
    pooled = math.sqrt(stratum.std_error**2 + against.std_error**2)
    if pooled <= 0:
        return Comparison(stratum.name, against.name, difference, None, None)
    z_score = difference / pooled
    return Comparison(stratum.name, against.name, difference, z_score, abs(z_score) > DIVERGENCE_Z)


def _mean(values: Sequence[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _std_error(values: Sequence[float]) -> float | None:
    if len(values) < MIN_EVENTS_FOR_STD_ERROR:
        return None
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
    return math.sqrt(variance / len(values))
