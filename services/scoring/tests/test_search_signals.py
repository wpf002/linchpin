from datetime import date

from ingest.search_signals import roster_terms, search_term, window_timeframe
from ingest.trends import batch_terms, rescale_to_anchor


def test_search_term_keeps_the_disambiguator_words() -> None:
    assert search_term("Eleven_(Stranger_Things)") == "Eleven Stranger Things"
    assert search_term("Rick_Grimes") == "Rick Grimes"


def test_repeated_terms_keep_the_first_character() -> None:
    rows = [
        {"character_id": "a", "wiki_title": "Rick_Grimes"},
        {"character_id": "b", "wiki_title": "Rick Grimes"},
        {"character_id": "c", "wiki_title": "Daryl_Dixon"},
    ]
    assert [(term.character_id, term.term) for term in roster_terms(rows)] == [
        ("a", "Rick Grimes"),
        ("c", "Daryl Dixon"),
    ]


def test_timeframe_is_the_pre_window_and_rows_are_dated_at_its_end() -> None:
    timeframe, measured_on = window_timeframe(date(2020, 4, 1))
    assert timeframe == "2020-01-02 2020-03-31"
    assert measured_on == date(2020, 3, 31)


def test_every_batch_carries_the_anchor() -> None:
    batches = batch_terms(["anchor", "a", "b", "c", "d", "e"], "anchor")
    assert batches == [["anchor", "a", "b", "c", "d"], ["anchor", "e"]]


def test_batch_with_a_zero_anchor_is_dropped() -> None:
    assert rescale_to_anchor({"anchor": 0.0, "a": 12.0}, "anchor") == {}
    assert rescale_to_anchor({"anchor": 4.0, "a": 12.0}, "anchor") == {"a": 3.0}
