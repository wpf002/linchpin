"""Carry score, concentration, and fragility. Pure functions; no I/O."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from metrics.constants import FRAGILITY_WEIGHTS, SIGNAL_WEIGHTS


def to_shares(raw: Sequence[float]) -> list[float]:
    """Within-franchise proportions. An all-zero roster yields zeros, never NaN."""
    clipped = [max(0.0, value) for value in raw]
    total = sum(clipped)
    if total <= 0:
        return [0.0 for _ in clipped]
    return [value / total for value in clipped]


def carry_score(shares: dict[str, float | None], weights: dict[str, float] | None = None) -> float:
    """Weighted blend of available shares, with missing signals renormalised out.

    A character measured on wiki alone scores its wiki share, not 0.35 of it.
    """
    active = weights or SIGNAL_WEIGHTS
    present: list[tuple[float, float]] = []
    for key, weight in active.items():
        value = shares.get(key)
        if value is None or weight <= 0 or math.isnan(value):
            continue
        present.append((value, weight))
    weight_sum = sum(weight for _, weight in present)
    if weight_sum <= 0:
        return 0.0
    return sum(value * weight for value, weight in present) / weight_sum


def hhi(carry_scores: Sequence[float]) -> float:
    """Herfindahl-Hirschman Index. 1.0 means one character is the franchise."""
    return sum(share * share for share in to_shares(carry_scores))


def top_n_share(carry_scores: Sequence[float], n: int) -> float:
    ordered = sorted(to_shares(carry_scores), reverse=True)
    return sum(ordered[:n])


@dataclass(frozen=True, slots=True)
class ZStats:
    mean: float
    std_dev: float


def z_stats(values: Sequence[float]) -> ZStats:
    if not values:
        return ZStats(0.0, 0.0)
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / max(1, len(values) - 1)
    return ZStats(mean, math.sqrt(variance))


def z(value: float, stats: ZStats) -> float:
    if stats.std_dev == 0:
        return 0.0
    return (value - stats.mean) / stats.std_dev


_FULL_ABS_WEIGHT = sum(abs(weight) for weight in FRAGILITY_WEIGHTS.values())


def fragility(
    *,
    hhi_value: float,
    top1_share: float,
    substitutability: float | None,
    hhi_stats: ZStats,
    top1_stats: ZStats,
    substitutability_stats: ZStats,
) -> float:
    """0.6 z(HHI) + 0.25 z(top1) - 0.15 z(substitutability).

    Substitutability is frequently unavailable. When it is, its weight is dropped
    and the rest rescaled, so the score keeps the same range instead of shrinking.
    """
    terms: list[tuple[float, float]] = [
        (z(hhi_value, hhi_stats), FRAGILITY_WEIGHTS["hhi"]),
        (z(top1_share, top1_stats), FRAGILITY_WEIGHTS["top1Share"]),
    ]
    if substitutability is not None:
        terms.append(
            (
                z(substitutability, substitutability_stats),
                FRAGILITY_WEIGHTS["substitutability"],
            )
        )
    abs_weight = sum(abs(weight) for _, weight in terms)
    if abs_weight <= 0:
        return 0.0
    scale = _FULL_ABS_WEIGHT / abs_weight
    return sum(value * weight for value, weight in terms) * scale


def durability_ratio(off_cycle_carry: float, on_cycle_carry: float) -> float | None:
    if on_cycle_carry <= 0:
        return None
    return off_cycle_carry / on_cycle_carry


def simulate_removal(carry_scores: Sequence[float], remove_index: int) -> dict[str, object]:
    """Redistribute a departing character's share proportionally, then rescore."""
    remaining = [value for index, value in enumerate(carry_scores) if index != remove_index]
    normalised = to_shares(remaining)
    return {
        "hhi": sum(share * share for share in normalised),
        "top1Share": max(normalised) if normalised else 0.0,
        "remaining": normalised,
    }
