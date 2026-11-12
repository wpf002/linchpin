"""TMDB fills what TVmaze left empty: the stored id, a cast, and dated episodes."""

from __future__ import annotations

from datetime import date

import pytest

from ingest import pipeline
from ingest.corpus import CorpusFranchise
from ingest.tmdb import CastMember, ReleaseRecord


def _member(name: str, person: str, order: int | None, episodes: int | None) -> CastMember:
    return CastMember(
        tmdb_person_id=1,
        person_name=person,
        character_name=name,
        billing_order=order,
        episode_count=episodes,
    )


def test_tmdb_roster_ranks_by_episodes_and_dedupes_recasts() -> None:
    cast = [
        _member("Daario Naharis", "Ed Skrein", 30, 3),
        _member("Daario Naharis", "Michiel Huisman", 31, 20),
        _member("Jon Snow", "Kit Harington", 0, 62),
        _member("Extra", "Nobody", None, None),
    ]
    roster = pipeline.tmdb_roster(cast, "TV")
    assert [entry.character_name for entry in roster] == ["Jon Snow", "Daario Naharis", "Extra"]
    assert roster[1].person_name == "Michiel Huisman"
    assert all(entry.role_type == "ACTOR" for entry in roster)


def test_tmdb_release_rows_keep_season_and_episode() -> None:
    rows = pipeline.tmdb_release_rows(
        [
            ReleaseRecord(
                title="Winter Is Coming", season_no=1, episode_no=1, released_on=date(2011, 4, 17)
            )
        ]
    )
    assert rows[0].season_no == 1
    assert rows[0].episode_no == 1
    assert rows[0].released_on == date(2011, 4, 17)


def test_describe_falls_back_to_tmdb_when_tvmaze_has_no_show(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    franchise = CorpusFranchise.model_validate({"canonicalName": "Lost Show", "medium": "TV"})
    monkeypatch.setattr(pipeline, "search_show", lambda _name: None)
    monkeypatch.setattr(pipeline, "_tmdb_id_for", lambda _name: 42)
    monkeypatch.setattr(pipeline, "fetch_tv_cast", lambda _id: [_member("Lead", "Someone", 0, 10)])
    monkeypatch.setattr(
        pipeline,
        "fetch_tv_releases",
        lambda _id: [ReleaseRecord("Pilot", 1, 1, date(2020, 1, 5))],
    )

    described = pipeline._describe(franchise)

    assert described.tmdb_id == 42
    assert described.roster is not None
    assert [entry.character_name for entry in described.roster] == ["Lead"]
    assert described.first_release == date(2020, 1, 5)
    assert described.releases[0].season_no == 1


def test_describe_skips_tmdb_when_key_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    franchise = CorpusFranchise.model_validate({"canonicalName": "Lost Show", "medium": "TV"})
    monkeypatch.setattr(pipeline, "search_show", lambda _name: None)
    monkeypatch.setattr(pipeline, "_tmdb_id_for", lambda _name: None)

    described = pipeline._describe(franchise)

    assert described.roster is None
    assert described.tmdb_id is None


class _FakeTmdbClient:
    """Serves canned TMDB payloads keyed by URL path suffix."""

    def __init__(self, payloads: dict[str, dict]) -> None:
        self._payloads = payloads
        self.requested: list[str] = []

    def get_json(self, url: str, params: dict) -> dict | None:
        self.requested.append(url)
        for suffix, payload in self._payloads.items():
            if url.endswith(suffix):
                return payload
        return None

    def close(self) -> None:
        return None


def test_fetch_tv_releases_skips_specials_season() -> None:
    from ingest.tmdb import fetch_tv_releases

    episode = {"name": "Pilot", "episode_number": 1, "air_date": "2011-01-09"}
    special = {"name": "Preview", "episode_number": 1, "air_date": "2010-12-12"}
    client = _FakeTmdbClient(
        {
            "/tv/7": {"seasons": [{"season_number": 0}, {"season_number": 1}]},
            "/tv/7/season/0": {"episodes": [special]},
            "/tv/7/season/1": {"episodes": [episode]},
        }
    )
    releases = fetch_tv_releases(7, client=client)  # type: ignore[arg-type]
    assert [(r.season_no, r.released_on.isoformat()) for r in releases] == [(1, "2011-01-09")]
    assert not any(url.endswith("/season/0") for url in client.requested)


def test_describe_uses_pinned_tvmaze_id_instead_of_name_search(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: "Doctor Who" by name finds the 2023 series, so the 2005 entry pins id 210."""
    franchise = CorpusFranchise.model_validate(
        {
            "canonicalName": "Doctor Who (2005)",
            "searchName": "Doctor Who",
            "tvmazeId": 210,
            "medium": "TV",
        }
    )
    fetched_ids: list[int] = []

    def fake_fetch_show(show_id: int) -> None:
        fetched_ids.append(show_id)

    def fail_search(_name: str) -> None:
        raise AssertionError("name search must not run when tvmazeId is set")

    monkeypatch.setattr(pipeline, "fetch_show", fake_fetch_show)
    monkeypatch.setattr(pipeline, "search_show", fail_search)
    monkeypatch.setattr(pipeline, "_tmdb_id_for", lambda _name: None)

    pipeline._describe(franchise)

    assert fetched_ids == [210]
