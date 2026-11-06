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
