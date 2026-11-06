from validation.blend import BlendRow, assign_split, blended, compare, fit_wiki_weight
from validation.rank_ic import MIN_PAIRS


def _rows(count: int, *, search_tracks_outcome: bool) -> list[BlendRow]:
    rows = []
    for index in range(count):
        outcome = index / count
        # Wiki share is deliberately uninformative: it alternates. The swing is
        # wide enough that any wiki weight above zero reorders the search ranking.
        wiki = 0.1 if index % 2 else 0.9
        search = outcome if search_tracks_outcome else wiki
        rows.append(BlendRow(f"event-{index}", wiki, search, outcome))
    return rows


def test_split_is_stable_and_uses_both_sides() -> None:
    splits = [assign_split(f"event-{index}") for index in range(200)]
    assert splits == [assign_split(f"event-{index}") for index in range(200)]
    assert 60 < splits.count("train") < 140


def test_blend_renormalises_to_the_weights_given() -> None:
    row = BlendRow("e", wiki_share=0.6, search_share=0.2, outcome=0.0)
    assert blended(row, 1.0) == 0.6
    assert blended(row, 0.0) == 0.2
    assert abs(blended(row, 0.5) - 0.4) < 1e-12


def test_fit_needs_the_minimum_number_of_training_events() -> None:
    assert fit_wiki_weight(_rows(MIN_PAIRS - 1, search_tracks_outcome=True)) is None


def test_fit_prefers_search_when_only_search_tracks_the_outcome() -> None:
    assert fit_wiki_weight(_rows(40, search_tracks_outcome=True)) == 0.0


def test_fit_ties_go_to_wiki() -> None:
    # Search equals wiki, so every weight gives the same ranking.
    assert fit_wiki_weight(_rows(40, search_tracks_outcome=False)) == 1.0


def test_too_few_events_is_inconclusive_not_a_loss_for_the_blend() -> None:
    result = compare(_rows(6, search_tracks_outcome=True))
    assert result.verdict == "INCONCLUSIVE"
    assert result.wiki_weight is None


def test_blend_wins_held_out_when_search_carries_the_signal() -> None:
    result = compare(_rows(120, search_tracks_outcome=True))
    assert result.verdict == "BLEND"
    assert result.blend_rank_ic is not None and result.wiki_rank_ic is not None
    assert result.blend_rank_ic.coefficient > result.wiki_rank_ic.coefficient


def test_wiki_only_when_search_adds_nothing() -> None:
    assert compare(_rows(120, search_tracks_outcome=False)).verdict == "WIKI_ONLY"
