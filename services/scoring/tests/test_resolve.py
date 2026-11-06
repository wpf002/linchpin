"""Acceptance rules for character-to-article resolution.

Each rejected case below was a link the resolver actually stored: the franchise
then reported another article's pageviews as that character's carry.
"""

from __future__ import annotations

import pytest

from ingest.resolve import (
    TitleClaim,
    _accept,
    _Page,
    lead_names_character,
    title_names_character,
    verify_titles,
)


def page(title: str, extract: str, description: str = "") -> _Page:
    return _Page(title=title, description=description, extract=extract, missing=False)


SERIES_EXTRACT = (
    "Grey's Anatomy is an American medical drama television series. The series focuses on "
    "the lives of surgical interns, residents and attendings. The title character is "
    "Dr. Meredith Grey."
)


def test_series_article_is_not_a_character() -> None:
    verdict = _accept(
        page("Grey's Anatomy", SERIES_EXTRACT),
        'Dr. Atticus "Link" Lincoln',
        "Grey's Anatomy",
        "Chris Carmack",
    )
    assert verdict.title is None


def test_disambiguated_series_article_is_rejected_by_title_shape() -> None:
    verdict = _accept(
        page(
            "House (TV series)",
            "House is an American medical drama. The main character is Dr. Gregory House. "
            "Dr. Eric Foreman is a member of his team.",
        ),
        "Dr. Eric Foreman",
        "House",
        "Omar Epps",
    )
    assert verdict.title is None
    assert "title shape" in verdict.reason


def test_stranger_sharing_a_first_name_is_rejected() -> None:
    verdict = _accept(
        page(
            "Lenny Kravitz",
            "Leonard Albert Kravitz is an American singer. His music is characterized by "
            "elements of rock and funk. He voiced a character in The Simpsons.",
        ),
        "Lenny Leonard",
        "The Simpsons",
        "Harry Shearer",
    )
    assert verdict.title is None


def test_word_inside_another_word_is_not_a_fiction_marker() -> None:
    verdict = _accept(
        page("John Locke", "John Locke was an English philosopher, characterized as a liberal."),
        "John Locke",
        "Lost",
        "Terry O'Quinn",
    )
    assert verdict.title is None
    assert "fictional" in verdict.reason


@pytest.mark.parametrize(
    ("title", "extract", "character", "franchise"),
    [
        (
            "Gus Fring",
            "Gustavo Fring is a fictional character in Breaking Bad and Better Call Saul.",
            'Gustavo "Gus" Fring',
            "Better Call Saul",
        ),
        (
            "Dana Scully",
            "Dana Katherine Scully is a fictional character in the series The X-Files.",
            "Special Agent Dana Scully",
            "The X-Files",
        ),
        (
            "Vecna (Stranger Things)",
            "Vecna is a fictional character and the main antagonist of Stranger Things.",
            "Henry Creel / Vecna",
            "Stranger Things",
        ),
        (
            "Mandalorian (character)",
            "Din Djarin is a fictional character in the Star Wars franchise.",
            "Mandalorian",
            "The Mandalorian",
        ),
        (
            "Fifteenth Doctor",
            "The Fifteenth Doctor is an incarnation of the Doctor, the protagonist of Doctor Who.",
            "The Fifteenth Doctor",
            "Doctor Who",
        ),
    ],
)
def test_character_articles_are_accepted(
    title: str, extract: str, character: str, franchise: str
) -> None:
    assert _accept(page(title, extract), character, franchise, None).title == title


def test_franchise_mention_ignores_a_leading_article() -> None:
    """ "The Simpsons" used to match on the word "the", so every article scored 1.0."""
    unrelated = _accept(
        page("Homer Simpson", "Homer is a fictional character and the father of a family."),
        "Homer Simpson",
        "The Simpsons",
        None,
    )
    related = _accept(
        page("Homer Simpson", "Homer is a fictional character in The Simpsons."),
        "Homer Simpson",
        "The Simpsons",
        None,
    )
    assert unrelated.confidence == 0.75
    assert related.confidence == 1.0


def test_single_shared_name_needs_the_franchise() -> None:
    assert not title_names_character("Angel Batista", "Angel", "Buffy the Vampire Slayer")
    assert title_names_character(
        "Hank Schrader", "Hank", "Breaking Bad", context="a character in breaking bad"
    )


class FakeClient:
    """Stands in for ThrottledClient: returns one canned Action API payload."""

    def __init__(self, payload: dict | None) -> None:
        self.payload = payload

    def get_json(self, url: str, params: dict | None = None) -> dict | None:
        return self.payload


CLAIMS = [
    TitleClaim("Lenny Leonard", "The Simpsons", "Harry Shearer", "Lenny Kravitz"),
    TitleClaim("Homer Simpson", "The Simpsons", "Dan Castellaneta", "Homer Simpson"),
    TitleClaim("Moe Szyslak", "The Simpsons", "Hank Azaria", "Moe Szyslak"),
]


def test_verify_titles_rejects_wrong_links_and_keeps_right_ones() -> None:
    payload = {
        "query": {
            "pages": [
                {"title": "Lenny Kravitz", "extract": "Lenny Kravitz is an American singer."},
                {
                    "title": "Homer Simpson",
                    "extract": "Homer Simpson is a fictional character in The Simpsons.",
                },
                {"title": "Moe Szyslak", "missing": True},
            ]
        }
    }
    verdicts = verify_titles(CLAIMS, FakeClient(payload))  # type: ignore[arg-type]
    assert [verdict.status for verdict in verdicts] == ["rejected", "accepted", "rejected"]


def test_verify_titles_never_rejects_on_a_failed_lookup() -> None:
    """A dead network must not look like three wrong links: --write deletes on rejection."""
    verdicts = verify_titles(CLAIMS, FakeClient(None))  # type: ignore[arg-type]
    assert [verdict.status for verdict in verdicts] == ["unchecked"] * 3


@pytest.mark.parametrize(
    ("extract", "character"),
    [
        (
            'James Morgan "Jimmy" McGill, better known as Saul Goodman, is a fictional character.',
            "Jimmy McGill",
        ),
        ("Kimberly 'Kim' Bauer is a fictional character on the series 24.", "Kimberly Bauer"),
        ("James Morgan McGill, better known as Saul Goodman, is a character.", "Jimmy McGill"),
        ("The Owl (Leland Owlsley) is a supervillain in Marvel Comics.", "Leland Owlsley"),
        ("Joan P. Holloway Harris is a fictional character on Mad Men.", "Joan Holloway"),
    ],
)
def test_lead_sentence_subject_names_an_aliased_character(extract: str, character: str) -> None:
    assert lead_names_character(extract, character)


@pytest.mark.parametrize(
    ("extract", "character"),
    [
        ("David Palmer is a fictional character. His wife is Sherry Palmer.", "Sherry Palmer"),
        ("Nathan Royal Scott is a fictional character.", "Haley James Scott"),
        (
            "The F\u00fcnke family is a fictional family including Tobias F\u00fcnke.",
            "Tobias F\u00fcnke",
        ),
        ("King Ezekiel is a fictional character.", "Ezekiel"),
        ("", "Jimmy McGill"),
    ],
)
def test_lead_sentence_ignores_names_outside_the_subject(extract: str, character: str) -> None:
    assert not lead_names_character(extract, character)


def test_superheroine_counts_as_fiction() -> None:
    page = _Page(
        title="Nia Nal",
        description="Superheroine from the TV series Supergirl",
        extract="Nia Nal, also known as Dreamer, is a superheroine from Supergirl.",
        missing=False,
    )
    assert _accept(page, "Nia Nal / Dreamer", "Supergirl", "Nicole Maines").title == "Nia Nal"
