"""Bluesky post counts from the public search API. Counting only; no sentiment scoring."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from typing import Final

from ingest.http import ThrottledClient

logger = logging.getLogger("linchpin.bluesky")

SEARCH_URL: Final = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"

#: Unauthenticated search is rate limited per IP; three requests a second stays under it.
MIN_INTERVAL_SECONDS: Final = 0.34

#: Bluesky's search API reports at most this many hits for one query.
HITS_CAP: Final = 10_000

#: No Bluesky posts exist before the network's 2023 beta.
FIRST_SEARCHABLE_DAY: Final = date(2023, 1, 1)

USER_AGENT: Final = "linchpin/0.1"


class BlueskyFetchError(RuntimeError):
    """Bluesky refused or failed a search. The query is named in the message."""


def build_query(character_name: str, franchise_name: str) -> str:
    """Both names as exact phrases. Search ANDs the two, so a bare first name like
    "Fiona" only counts posts that also name the franchise."""
    return f'"{_strip_quotes(character_name)}" "{_strip_quotes(franchise_name)}"'


def _strip_quotes(text: str) -> str:
    return text.replace('"', "").strip()


def _utc_midnight(day: date) -> str:
    return datetime.combine(day, time.min, tzinfo=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_hits(payload: object) -> int:
    """Post count from a search response: hitsTotal when present, else the posts returned."""
    if not isinstance(payload, dict):
        raise ValueError("search response is not an object")
    hits = payload.get("hitsTotal")
    if isinstance(hits, int) and hits >= 0:
        return hits
    posts = payload.get("posts")
    if isinstance(posts, list):
        return len(posts)
    raise ValueError("search response has neither hitsTotal nor posts")


class BlueskyClient:
    def __init__(self) -> None:
        self._client = ThrottledClient(
            namespace="bluesky",
            min_interval_seconds=MIN_INTERVAL_SECONDS,
            headers={"User-Agent": USER_AGENT},
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> BlueskyClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def count_posts(self, query: str, day: date) -> int:
        """Posts matching the query created on one UTC day."""
        params = {
            "q": query,
            "since": _utc_midnight(day),
            "until": _utc_midnight(day + timedelta(days=1)),
            "limit": 1,
        }
        # Uncached: stored rows already mark which days are done, and a cached
        # refusal would block the day for good.
        payload = self._client.get_json(SEARCH_URL, params, use_cache=False)
        if payload is None:
            raise BlueskyFetchError(f"search refused for {query} on {day}")
        try:
            hits = parse_hits(payload)
        except ValueError as error:
            raise BlueskyFetchError(f"{query} on {day}: {error}") from error
        if hits >= HITS_CAP:
            logger.warning("%s on %s hit the %d cap", query, day, HITS_CAP)
        return hits
