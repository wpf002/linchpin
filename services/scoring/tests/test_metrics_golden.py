"""Python metrics against the shared golden fixture."""

from __future__ import annotations

from typing import Any

import pytest

from metrics.shares import (
    ZStats,
    carry_score,
    fragility,
    hhi,
    simulate_removal,
    to_shares,
    top_n_share,
)

TOLERANCE = 1e-9


def test_to_shares(golden: dict[str, Any]) -> None:
    for case in golden["toShares"]:
        assert to_shares(case["raw"]) == pytest.approx(case["shares"], abs=TOLERANCE)


def test_concentration(golden: dict[str, Any]) -> None:
    for case in golden["hhi"]:
        scores = case["carryScores"]
        assert hhi(scores) == pytest.approx(case["hhi"], abs=TOLERANCE)
        assert top_n_share(scores, 1) == pytest.approx(case["top1Share"], abs=TOLERANCE)
        assert top_n_share(scores, 3) == pytest.approx(case["top3Share"], abs=TOLERANCE)


def test_carry_score(golden: dict[str, Any]) -> None:
    for case in golden["carryScore"]:
        assert carry_score(case["shares"]) == pytest.approx(case["carryScore"], abs=TOLERANCE)


def test_fragility(golden: dict[str, Any]) -> None:
    for case in golden["fragility"]:
        population = case["population"]
        value = fragility(
            hhi_value=case["input"]["hhi"],
            top1_share=case["input"]["top1Share"],
            substitutability=case["input"]["substitutability"],
            hhi_stats=_stats(population["hhi"]),
            top1_stats=_stats(population["top1Share"]),
            substitutability_stats=_stats(population["substitutability"]),
        )
        assert value == pytest.approx(case["fragility"], abs=TOLERANCE), case["label"]


def test_simulate_removal(golden: dict[str, Any]) -> None:
    for case in golden["simulateRemoval"]:
        result = simulate_removal(case["carryScores"], case["removeIndex"])
        assert result["hhi"] == pytest.approx(case["hhi"], abs=TOLERANCE)
        assert result["top1Share"] == pytest.approx(case["top1Share"], abs=TOLERANCE)
        assert result["remaining"] == pytest.approx(case["remaining"], abs=TOLERANCE)


def _stats(entry: dict[str, float]) -> ZStats:
    return ZStats(mean=entry["mean"], std_dev=entry["stdDev"])
