"""Wikimedia Pageviews. Free, no key, long daily history. The best single signal."""

from __future__ import annotations

import logging
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date, datetime
from urllib.parse import quote

from config import get_settings
from ingest.http import ThrottledClient

logger = logging.getLogger("linchpin.wikimedia")

PAGEVIEWS_BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
# Generous limits, but a descriptive User-Agent and a steady pace are the terms.
# At 0.12s the API answered with Retry-After headers of 20s and more, which made
# a full run slower than simply asking less often.
MIN_INTERVAL_SECONDS = 0.3


@dataclass(frozen=True, slots=True)
class PageviewPoint:
    measured_on: date
    views: int


def _client() -> ThrottledClient:
    settings = get_settings()
    return ThrottledClient(
        namespace="wikimedia",
        min_interval_seconds=MIN_INTERVAL_SECONDS,
        headers={"User-Agent": settings.wikimedia_user_agent, "Accept": "application/json"},
    )


def fetch_pageviews(
    article: str,
    start: date,
    end: date,
    *,
    project: str = "en.wikipedia.org",
    client: ThrottledClient | None = None,
) -> list[PageviewPoint]:
    """Daily pageviews for one article. Returns [] when the article has no data."""
    owned = client is None
    active = client or _client()
    try:
        url = (
            f"{PAGEVIEWS_BASE}/{project}/all-access/user/"
            f"{quote(article.replace(' ', '_'), safe='')}/daily/"
            f"{start.strftime('%Y%m%d')}/{end.strftime('%Y%m%d')}"
        )
        payload = active.get_json(url)
        if not payload or payload.get("__missing__") or "items" not in payload:
            logger.info("no pageview data for %s", article)
            return []
        return list(_parse_items(payload["items"]))
    finally:
        if owned:
            active.close()


def _parse_items(items: Iterable[dict]) -> Iterator[PageviewPoint]:
    for item in items:
        timestamp = item.get("timestamp")
        views = item.get("views")
        if not isinstance(timestamp, str) or not isinstance(views, int):
            continue
        try:
            measured_on = datetime.strptime(timestamp[:8], "%Y%m%d").date()
        except ValueError:
            continue
        yield PageviewPoint(measured_on=measured_on, views=views)


def resolve_article_title(
    query: str, *, project: str = "en.wikipedia.org", client: ThrottledClient | None = None
) -> str | None:
    """Resolve a name to a canonical article title via the search API.

    Returns None rather than guessing, so an unresolved character is recorded as
    unresolved instead of being silently linked to the wrong page.
    """
    owned = client is None
    active = client or _client()
    try:
        payload = active.get_json(
            f"https://{project}/w/api.php",
            {
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 1,
                "format": "json",
            },
        )
        if not payload:
            return None
        results = payload.get("query", {}).get("search", [])
        if not results:
            return None
        return results[0].get("title")
    finally:
        if owned:
            active.close()
