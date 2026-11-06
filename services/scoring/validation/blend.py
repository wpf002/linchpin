"""Phase 3: does a wiki + search blend rank exits better than wiki alone?

The blend weight is fitted on a training split and judged once on held-out
events. The split is a hash of the event id, so it cannot be redrawn after the
result is seen. The roadmap's rule is binary: the blend ships only if it beats
wiki-only on the held-out split.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, Literal

from scipy import stats

from metrics.shares import carry_score
from validation.rank_ic import MIN_PAIRS, RankIC, rank_ic

Split = Literal["train", "test"]
Verdict = Literal["BLEND", "WIKI_ONLY", "INCONCLUSIVE"]

#: Fraction of events assigned to the training split.
TRAIN_SHARE: Final = 0.5

#: Candidate wiki weights; the search weight is the remainder.
WEIGHT_GRID: Final[tuple[float, ...]] = tuple(step / 10 for step in range(11))

_HASH_PREFIX_HEX_DIGITS = 8
_HASH_PREFIX_MAX = 16**_HASH_PREFIX_HEX_DIGITS


@dataclass(frozen=True, slots=True)
class BlendRow:
    exit_event_id: str
    wiki_share: float
    search_share: float
    #: Sign-flipped DiD estimate: bigger means a bigger fall in attention.
    outcome: float


@dataclass(frozen=True, slots=True)
class BlendResult:
    verdict: Verdict
    wiki_weight: float | None
    train_pairs: int
    held_out_pairs: int
    blend_rank_ic: RankIC | None
    wiki_rank_ic: RankIC | None
    reason: str | None = None


def assign_split(exit_event_id: str) -> Split:
    digest = hashlib.sha256(exit_event_id.encode("utf-8")).hexdigest()
    position = int(digest[:_HASH_PREFIX_HEX_DIGITS], 16) / _HASH_PREFIX_MAX
    return "train" if position < TRAIN_SHARE else "test"


def blended(row: BlendRow, wiki_weight: float) -> float:
    return carry_score(
        {"wikiShare": row.wiki_share, "searchShare": row.search_share},
        {"wikiShare": wiki_weight, "searchShare": 1.0 - wiki_weight},
    )


def fit_wiki_weight(train: Sequence[BlendRow]) -> float | None:
    """Wiki weight with the best training rank correlation. Ties go to more wiki."""
    if len(train) < MIN_PAIRS:
        return None
    outcomes = [row.outcome for row in train]
    best_weight: float | None = None
    best_value = float("-inf")
    for weight in WEIGHT_GRID:
        value = float(stats.spearmanr([blended(row, weight) for row in train], outcomes).statistic)
        if value != value:  # NaN: the predictor is constant at this weight.
            continue
        if value >= best_value:
            best_value, best_weight = value, weight
    return best_weight


def compare(rows: Sequence[BlendRow]) -> BlendResult:
    train = [row for row in rows if assign_split(row.exit_event_id) == "train"]
    held_out = [row for row in rows if assign_split(row.exit_event_id) == "test"]

    wiki_weight = fit_wiki_weight(train)
    if wiki_weight is None:
        return BlendResult(
            "INCONCLUSIVE",
            None,
            len(train),
            len(held_out),
            None,
            None,
            reason=f"training split has {len(train)} events with both signals; needs {MIN_PAIRS}",
        )

    outcomes = [row.outcome for row in held_out]
    blend_ic = rank_ic([blended(row, wiki_weight) for row in held_out], outcomes)
    wiki_ic = rank_ic([row.wiki_share for row in held_out], outcomes)
    if blend_ic.coefficient is None or wiki_ic.coefficient is None:
        return BlendResult(
            "INCONCLUSIVE",
            wiki_weight,
            len(train),
            len(held_out),
            blend_ic,
            wiki_ic,
            reason=blend_ic.reason or wiki_ic.reason,
        )
    verdict: Verdict = "BLEND" if blend_ic.coefficient > wiki_ic.coefficient else "WIKI_ONLY"
    return BlendResult(verdict, wiki_weight, len(train), len(held_out), blend_ic, wiki_ic)
