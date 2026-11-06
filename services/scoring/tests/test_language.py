from validation.language import (
    LANGUAGE_AGREEMENT_FLOOR,
    MIN_ROSTER_FOR_AGREEMENT,
    agreement,
    decide,
)

ENGLISH = {"a": 400.0, "b": 300.0, "c": 200.0, "d": 100.0}


def test_proportional_other_languages_leave_ranks_unchanged() -> None:
    result = agreement("Show", ENGLISH, {key: value / 2 for key, value in ENGLISH.items()})
    assert result is not None
    assert result.rank_agreement == 1.0
    assert result.top_character_changes is False
    assert abs(result.other_language_fraction - 1 / 3) < 1e-12


def test_a_character_big_abroad_changes_the_top_rank() -> None:
    result = agreement("Show", ENGLISH, {"d": 5000.0})
    assert result is not None
    assert result.top_character_changes is True
    assert result.rank_agreement < LANGUAGE_AGREEMENT_FLOOR


def test_small_rosters_are_not_compared() -> None:
    small = dict(list(ENGLISH.items())[: MIN_ROSTER_FOR_AGREEMENT - 1])
    assert agreement("Show", small, {}) is None


def test_decision_follows_the_pre_registered_floor() -> None:
    assert decide([1.0, 0.95, 0.92]) == (0.95, "ENGLISH_ONLY")
    assert decide([0.5, 0.6, 0.95])[1] == "SUM_ALL"
    assert decide([]) == (None, "INCONCLUSIVE")
