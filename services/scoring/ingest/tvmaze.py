"""TVMaze: free, keyless episode air dates and cast. Used as the roster and
release-calendar source of truth for TV, with TMDB as the cross-check."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from urllib.parse import urlsplit

from ingest.http import ThrottledClient

logger = logging.getLogger("linchpin.tvmaze")

BASE = "https://api.tvmaze.com"
MIN_INTERVAL_SECONDS = 0.55  # TVMaze allows ~20 calls / 10s; stay well under.
# Long-running shows list hundreds of credited actors. Past the main cast the
# entries are guests, and including them makes the HHI denominator meaningless.
MAIN_CAST_CAP = 20
#: The only host image URLs are accepted from. The web app renders them as-is.
IMAGE_HOST = "static.tvmaze.com"


@dataclass(frozen=True, slots=True)
class TvMazeShow:
    tvmaze_id: int
    name: str
    premiered: date | None
    ended: date | None
    status: str
    genres: list[str]
    image_url: str | None = None


@dataclass(frozen=True, slots=True)
class TvMazeEpisode:
    season: int
    number: int | None
    title: str
    airdate: date


@dataclass(frozen=True, slots=True)
class TvMazeCastEntry:
    person_name: str
    character_name: str
    billing_order: int
    is_main: bool
    character_image_url: str | None = None
    person_image_url: str | None = None


def image_url_of(node: dict[str, Any]) -> str | None:
    """The medium image of a show, character or person, if it is an https TVMaze URL."""
    image = node.get("image")
    if not isinstance(image, dict):
        return None
    url = image.get("medium")
    if not isinstance(url, str):
        return None
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != IMAGE_HOST:
        logger.warning("ignoring image URL outside %s: %r", IMAGE_HOST, url)
        return None
    return url


def open_client() -> ThrottledClient:
    return ThrottledClient(
        namespace="tvmaze",
        min_interval_seconds=MIN_INTERVAL_SECONDS,
        headers={
            "User-Agent": "linchpin/0.1 (https://github.com/wpf002/linchpin)",
            "Accept": "application/json",
        },
    )


def search_show(name: str, *, client: ThrottledClient | None = None) -> TvMazeShow | None:
    owned = client is None
    active = client or open_client()
    try:
        payload = active.get_json(f"{BASE}/singlesearch/shows", {"q": name})
        if not payload or payload.get("__missing__"):
            logger.info("TVMaze has no show matching %r", name)
            return None
        return TvMazeShow(
            tvmaze_id=int(payload["id"]),
            name=str(payload.get("name", name)),
            premiered=_parse_date(payload.get("premiered")),
            ended=_parse_date(payload.get("ended")),
            status=str(payload.get("status", "Unknown")),
            genres=[str(genre) for genre in payload.get("genres", [])],
            image_url=image_url_of(payload),
        )
    finally:
        if owned:
            active.close()


def fetch_cast(show_id: int, *, client: ThrottledClient | None = None) -> list[TvMazeCastEntry]:
    owned = client is None
    active = client or open_client()
    try:
        payload = active.get_json(f"{BASE}/shows/{show_id}/cast")
        if not payload or not isinstance(payload, list):
            return []
        entries: list[TvMazeCastEntry] = []
        for order, entry in enumerate(payload):
            person = entry.get("person") or {}
            character = entry.get("character") or {}
            person_name = person.get("name")
            character_name = character.get("name")
            if not person_name or not character_name:
                continue
            entries.append(
                TvMazeCastEntry(
                    person_name=str(person_name),
                    character_name=str(character_name),
                    billing_order=order + 1,
                    is_main=order < MAIN_CAST_CAP,
                    character_image_url=image_url_of(character),
                    person_image_url=image_url_of(person),
                )
            )
        return entries
    finally:
        if owned:
            active.close()


def fetch_episode_dates(show_id: int, *, client: ThrottledClient | None = None) -> list[date]:
    return sorted({episode.airdate for episode in fetch_episodes(show_id, client=client)})


def fetch_episodes(
    show_id: int, *, include_specials: bool = False, client: ThrottledClient | None = None
) -> list[TvMazeEpisode]:
    """Aired episodes. Specials carry no episode number.

    The release calendar excludes specials, so the default keeps the request
    (and its cache key) identical to what ingest has always fetched.
    """
    owned = client is None
    active = client or open_client()
    try:
        payload = active.get_json(
            f"{BASE}/shows/{show_id}/episodes", {"specials": "1"} if include_specials else None
        )
        if not payload or not isinstance(payload, list):
            return []
        episodes: list[TvMazeEpisode] = []
        for row in payload:
            airdate = _parse_date(row.get("airdate"))
            season = row.get("season")
            if airdate is None or season is None:
                continue
            number = row.get("number")
            episodes.append(
                TvMazeEpisode(
                    season=int(season),
                    number=int(number) if number is not None else None,
                    title=str(row.get("name") or ""),
                    airdate=airdate,
                )
            )
        return episodes
    finally:
        if owned:
            active.close()


def fetch_season_premieres(
    show_id: int, *, client: ThrottledClient | None = None
) -> list[tuple[int, date]]:
    owned = client is None
    active = client or open_client()
    try:
        payload = active.get_json(f"{BASE}/shows/{show_id}/seasons")
        if not payload or not isinstance(payload, list):
            return []
        seasons: list[tuple[int, date]] = []
        for season in payload:
            premiere = _parse_date(season.get("premiereDate"))
            number = season.get("number")
            if premiere is None or number is None:
                continue
            seasons.append((int(number), premiere))
        return sorted(seasons)
    finally:
        if owned:
            active.close()


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
