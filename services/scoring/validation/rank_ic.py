"""Spearman rank information coefficient with a bootstrapped confidence interval.

The claim under test is that pre-event carry score ranks exit impact better than
billing order does. Both are ranked against the same realised difference-in-
differences estimates, so the comparison is like for like.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass

from scipy import stats

#: Resamples for the interval. Enough for a stable 95% bound at this sample size.
BOOTSTRAP_SAMPLES = 2000

CONFIDENCE_LEVEL = 0.95

#: Below this, a rank correlation is not worth reporting.
MIN_PAIRS = 12

#: Fixed so a re-run of the same data reproduces the same interval.
BOOTSTRAP_SEED = 20260101


@dataclass(frozen=True, slots=True)
class RankIC:
    coefficient: float | None
    lower: float | None
    upper: float | None
    pairs: int
    reason: str | None = None


def rank_ic(predictor: Sequence[float], outcome: Sequence[float]) -> RankIC:
    """Spearman correlation of predictor against outcome, both same length."""
    if len(predictor) != len(outcome):
        raise ValueError("predictor and outcome must be the same length")
    pairs = len(predictor)
    if pairs < MIN_PAIRS:
        return RankIC(None, None, None, pairs, reason=f"only {pairs} usable event pairs")

    coefficient = _spearman(predictor, outcome)
    if coefficient is None:
        return RankIC(None, None, None, pairs, reason="predictor or outcome has no variation")

    lower, upper = _bootstrap_interval(predictor, outcome)
    return RankIC(coefficient, lower, upper, pairs)


def _spearman(predictor: Sequence[float], outcome: Sequence[float]) -> float | None:
    result = stats.spearmanr(predictor, outcome)
    value = float(result.statistic)
    if value != value:  # NaN: one side is constant.
        return None
    return value


def _bootstrap_interval(
    predictor: Sequence[float], outcome: Sequence[float]
) -> tuple[float | None, float | None]:
    rng = random.Random(BOOTSTRAP_SEED)
    size = len(predictor)
    samples: list[float] = []
    for _ in range(BOOTSTRAP_SAMPLES):
        indexes = [rng.randrange(size) for _ in range(size)]
        resampled_predictor = [predictor[index] for index in indexes]
        resampled_outcome = [outcome[index] for index in indexes]
        value = _spearman(resampled_predictor, resampled_outcome)
        if value is not None:
            samples.append(value)
    if len(samples) < BOOTSTRAP_SAMPLES // 2:
        return None, None
    samples.sort()
    tail = (1 - CONFIDENCE_LEVEL) / 2
    lower_index = int(tail * len(samples))
    upper_index = min(len(samples) - 1, int((1 - tail) * len(samples)))
    return samples[lower_index], samples[upper_index]
