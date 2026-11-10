"""TMDB: cast, crew, credits, air dates. Backbone of the entity graph."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime

from config import get_settings
from ingest.http import ThrottledClient

logger = logging.getLogger("linchpin.tmdb")

BASE = "https://api.themoviedb.org/3"
MIN_INTERVAL_SECONDS = 0.06
#: TMDB files specials, previews and promos under season 0. They are not
#: release-cycle episodes, and TVmaze leaves them out too.
SPECIALS_SEASON = 0


class TmdbNotConfigured(RuntimeError):
    """Raised instead of returning empty data, so a missing key is never mistaken
    for a franchise with no cast."""


@dataclass(frozen=True, slots=True)
class CastMember:
    tmdb_person_id: int
    person_name: str
    character_name: str
    billing_order: int | None
    episode_count: int | None


@dataclass(frozen=True, slots=True)
class ReleaseRecord:
    title: str
    season_no: int | None
    episode_no: int | None
    released_on: date


def _client() -> ThrottledClient:
    settings = get_settings()
    if not settings.tmdb_api_key:
        raise TmdbNotConfigured("TMDB_API_KEY is empty; set it in .env before running TMDB ingest")
    return ThrottledClient(
        namespace="tmdb",
        min_interval_seconds=MIN_INTERVAL_SECONDS,
        headers={"Accept": "application/json"},
    )


def _params(extra: dict | None = None) -> dict:
    params = {"api_key": get_settings().tmdb_api_key}
    if extra:
        params.update(extra)
    return params


def fetch_tv_cast(tmdb_id: int, *, client: ThrottledClient | None = None) -> list[CastMember]:
    owned = client is None
    active = client or _client()
    try:
        payload = active.get_json(f"{BASE}/tv/{tmdb_id}/aggregate_credits", _params())
        if not payload or payload.get("__missing__"):
            return []
        members: list[CastMember] = []
        for entry in payload.get("cast", []):
            roles = entry.get("roles") or []
            character_name = roles[0].get("character") if roles else entry.get("character")
            if not character_name:
                continue
            members.append(
                CastMember(
                    tmdb_person_id=int(entry["id"]),
                    person_name=str(entry.get("name", "")),
                    character_name=str(character_name),
                    billing_order=entry.get("order"),
                    episode_count=roles[0].get("episode_count") if roles else None,
                )
            )
        return members
    finally:
        if owned:
            active.close()


def fetch_tv_releases(
    tmdb_id: int, *, client: ThrottledClient | None = None
) -> list[ReleaseRecord]:
    owned = client is None
    active = client or _client()
    try:
        show = active.get_json(f"{BASE}/tv/{tmdb_id}", _params())
        if not show or show.get("__missing__"):
            return []
        releases: list[ReleaseRecord] = []
        for season in show.get("seasons", []):
            season_no = season.get("season_number")
            if season_no is None or season_no == SPECIALS_SEASON:
                continue
            detail = active.get_json(f"{BASE}/tv/{tmdb_id}/season/{season_no}", _params())
            if not detail or detail.get("__missing__"):
                continue
            for episode in detail.get("episodes", []):
                air_date = _parse_date(episode.get("air_date"))
                if air_date is None:
                    continue
                releases.append(
                    ReleaseRecord(
                        title=str(
                            episode.get("name") or f"S{season_no}E{episode.get('episode_number')}"
                        ),
                        season_no=season_no,
                        episode_no=episode.get("episode_number"),
                        released_on=air_date,
                    )
                )
        return releases
    finally:
        if owned:
            active.close()


def search_tv(name: str, *, client: ThrottledClient | None = None) -> int | None:
    owned = client is None
    active = client or _client()
    try:
        payload = active.get_json(f"{BASE}/search/tv", _params({"query": name}))
        results = (payload or {}).get("results") or []
        if not results:
            return None
        return int(results[0]["id"])
    finally:
        if owned:
            active.close()


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
