from ingest.images import first_images
from ingest.tvmaze import TvMazeCastEntry, image_url_of

PORTRAIT = "https://static.tvmaze.com/uploads/images/medium_portrait/45/113922.jpg"


def _member(
    character: str,
    person: str,
    order: int,
    *,
    character_image: str | None = None,
    person_image: str | None = None,
) -> TvMazeCastEntry:
    return TvMazeCastEntry(
        person_name=person,
        character_name=character,
        billing_order=order,
        is_main=True,
        character_image_url=character_image,
        person_image_url=person_image,
    )


def test_medium_image_is_read() -> None:
    assert image_url_of({"image": {"medium": PORTRAIT, "original": "ignored"}}) == PORTRAIT


def test_missing_image_is_none() -> None:
    assert image_url_of({"image": None}) is None
    assert image_url_of({}) is None


def test_other_hosts_and_plain_http_are_rejected() -> None:
    assert image_url_of({"image": {"medium": "https://example.com/a.jpg"}}) is None
    assert image_url_of({"image": {"medium": PORTRAIT.replace("https", "http")}}) is None
    assert image_url_of({"image": {"medium": "javascript:alert(1)"}}) is None


def test_first_credit_with_an_image_wins() -> None:
    second = PORTRAIT.replace("113922", "2")
    cast = [
        _member("Aunt Viv", "First Actor", 1, character_image=PORTRAIT, person_image=PORTRAIT),
        _member("Aunt Viv", "Second Actor", 2, character_image=second, person_image=second),
        _member("Carlton", "Third Actor", 3),
    ]
    characters, people = first_images(cast)
    assert characters == {"Aunt Viv": PORTRAIT}
    assert people == {"First Actor": PORTRAIT, "Second Actor": second}
