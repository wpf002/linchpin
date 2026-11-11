"""Article-versus-redirect classification of stored Wikipedia titles."""

from __future__ import annotations

from ingest.wiki_basis import parse_title_kinds

# Shape of the API answer for the Shameless titles on 2026-11-11.
PAYLOAD = {
    "query": {
        "normalized": [{"from": "ian_Gallagher", "to": "Ian Gallagher"}],
        "redirects": [
            {
                "from": "Fiona Gallagher",
                "to": "List of Shameless (British TV series) characters",
                "tofragment": "Fiona McBride",
            }
        ],
        "pages": [
            {"title": "List of Shameless (British TV series) characters"},
            {"title": "Ian Gallagher"},
            {"title": "Nobody Here", "missing": True},
        ],
    }
}


def test_redirect_title_is_marked_redirect() -> None:
    # Fiona's views counted only readers typing her name: 3,868 a year against
    # 103,812 for Ian, who has an article.
    kinds = parse_title_kinds(PAYLOAD, ["Fiona Gallagher"])
    assert kinds == {"Fiona Gallagher": "REDIRECT"}


def test_article_title_is_marked_article_after_normalisation() -> None:
    kinds = parse_title_kinds(PAYLOAD, ["ian_Gallagher"])
    assert kinds == {"ian_Gallagher": "ARTICLE"}


def test_missing_or_unmentioned_titles_are_left_unset() -> None:
    kinds = parse_title_kinds(PAYLOAD, ["Nobody Here", "Never Asked"])
    assert kinds == {}
