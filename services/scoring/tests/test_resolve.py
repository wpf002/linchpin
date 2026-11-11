"""Acceptance rules for character-to-article resolution.

Each rejected case below was a link the resolver actually stored: the franchise
then reported another article's pageviews as that character's carry.
"""

from __future__ import annotations

import pytest

from ingest.resolve import (
    REDIRECT_TARGET_CONFIDENCE,
    REDIRECT_TITLE_CONFIDENCE,
    TitleClaim,
    _accept,
    _Page,
    _parse_query,
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


KILLING_EVE_EXTRACT = (
    "Killing Eve is a British spy thriller television series. It follows Eve Polastri, "
    "an investigator tasked with capturing the assassin Villanelle."
)


def redirected(title: str, extract: str) -> _Page:
    return _Page(title=title, description="", extract=extract, missing=False, via_redirect=True)


def test_redirect_into_the_series_article_keeps_the_redirect_title() -> None:
    verdict = _accept(
        redirected("Killing Eve", KILLING_EVE_EXTRACT),
        "Carolyn Martens",
        "Killing Eve",
        "Fiona Shaw",
        asked_title="Carolyn Martens",
    )
    assert verdict.title == "Carolyn Martens"
    assert verdict.confidence == REDIRECT_TITLE_CONFIDENCE


def test_redirect_into_the_character_list_keeps_the_redirect_title() -> None:
    verdict = _accept(
        redirected(
            "List of Grey's Anatomy characters",
            "Grey's Anatomy is an American medical drama. This is a list of its characters.",
        ),
        "Dr. Levi Schmitt",
        "Grey's Anatomy",
        "Jake Borelli",
        asked_title="Levi Schmitt",
    )
    assert verdict.title == "Levi Schmitt"


def test_series_article_reached_without_a_redirect_is_still_rejected() -> None:
    verdict = _accept(
        page("Killing Eve", KILLING_EVE_EXTRACT),
        "Carolyn Martens",
        "Killing Eve",
        "Fiona Shaw",
        asked_title="Killing Eve",
    )
    assert verdict.title is None


def test_redirect_into_another_franchise_is_rejected() -> None:
    verdict = _accept(
        redirected("List of Lost characters", "This is a list of characters in Lost."),
        "Carolyn Martens",
        "Killing Eve",
        "Fiona Shaw",
        asked_title="Carolyn Martens",
    )
    assert verdict.title is None


def test_redirect_to_a_differently_spelled_character_article_is_accepted() -> None:
    verdict = _accept(
        redirected(
            "Krusty the Clown",
            "Herschel Krustofsky, better known as Krusty the Clown, is a recurring character "
            "on the animated television series The Simpsons.",
        ),
        "Krusty the Klown",
        "The Simpsons",
        "Dan Castellaneta",
        asked_title="Krusty the Klown",
    )
    assert verdict.title == "Krusty the Clown"
    assert verdict.confidence == REDIRECT_TARGET_CONFIDENCE


def test_redirect_to_a_character_of_another_work_is_rejected() -> None:
    verdict = _accept(
        redirected(
            "Deathstroke",
            "Deathstroke is a supervillain appearing in comic books published by DC Comics.",
        ),
        "Slade Wilson",
        "Supergirl",
        "Manu Bennett",
        asked_title="Slade Wilson",
    )
    assert verdict.title is None


@pytest.mark.parametrize(
    ("target", "character", "franchise", "asked"),
    [
        (
            "Veronica Mars (character)",
            "Veronica Mars",
            "Veronica Mars",
            "Veronica Mars (Veronica Mars)",
        ),
        ("Angel (Buffy the Vampire Slayer)", "Angel", "Angel", "Angel (Angel)"),
    ],
)
def test_title_character_article_is_not_the_franchise_page(
    target: str, character: str, franchise: str, asked: str
) -> None:
    # Both were stored as redirect titles, so their views were counted on a
    # redirect that search engines skip. The article itself carries the traffic.
    verdict = _accept(
        redirected(target, f"{character} is a fictional character in the series {franchise}."),
        character,
        franchise,
        None,
        asked_title=asked,
    )
    assert verdict.title == target


def test_redirect_into_a_qualified_series_article_keeps_the_redirect_title() -> None:
    verdict = _accept(
        redirected("Westworld (TV series)", "Westworld is an American science fiction series."),
        "Charlotte Hale",
        "Westworld",
        "Tessa Thompson",
        asked_title="Charlotte Hale",
    )
    assert verdict.title == "Charlotte Hale"
    assert verdict.confidence == REDIRECT_TITLE_CONFIDENCE


def test_parse_query_marks_only_redirected_titles() -> None:
    payload = {
        "query": {
            "normalized": [{"from": "killing_Eve", "to": "Killing Eve"}],
            "redirects": [{"from": "Carolyn Martens", "to": "Killing Eve"}],
            "pages": [{"title": "Killing Eve", "extract": KILLING_EVE_EXTRACT}],
        }
    }
    pages = _parse_query(payload, ["Carolyn Martens", "killing_Eve"])
    assert pages["carolyn martens"].via_redirect is True
    assert pages["killing eve"].via_redirect is False
