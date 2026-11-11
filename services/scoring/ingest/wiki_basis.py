"""Record whether each stored wikiTitle is an article or a redirect.

A redirect title's pageviews count only readers who typed that exact name.
Search engines and internal links send everyone else straight to the target
page. On 2026-11-11 the median redirect title drew 2,516 views a year against
70,135 for a character with its own article, so the two kinds of count can't
share one roster total. Scoring reads only ARTICLE characters.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from psycopg import Connection
from psycopg.rows import dict_row

from config import get_settings
from ingest.http import ThrottledClient
from ingest.names import normalise
from ingest.resolve import API_URL, MAX_TITLES_PER_QUERY, MIN_INTERVAL_SECONDS

logger = logging.getLogger(__name__)

WikiBasis = Literal["ARTICLE", "REDIRECT"]


@dataclass(slots=True)
class BasisReport:
    article: int = 0
    redirect: int = 0
    #: The lookup returned nothing for the title. Its basis is left unset.
    unchecked: int = 0


def parse_title_kinds(payload: Mapping, requested: Sequence[str]) -> dict[str, WikiBasis]:
    """Basis per requested title, keyed by the title as asked.

    Titles the API reports as missing, or doesn't mention, are left out.
    """
    query = payload.get("query") or {}
    normalised_from = {
        str(item.get("from")): str(item.get("to")) for item in query.get("normalized", [])
    }
    redirect_sources = {normalise(str(item.get("from"))) for item in query.get("redirects", [])}
    present = {
        normalise(str(page.get("title")))
        for page in query.get("pages", [])
        if page.get("title") and not page.get("missing")
    }
    kinds: dict[str, WikiBasis] = {}
    for title in requested:
        key = normalise(normalised_from.get(title, title))
        if key in redirect_sources:
            kinds[title] = "REDIRECT"
        elif key in present:
            kinds[title] = "ARTICLE"
    return kinds


def refresh_wiki_basis(
    conn: Connection, client: ThrottledClient, *, franchise_id: str | None = None
) -> BasisReport:
    """Look up every stored title (or one franchise's) and write its basis."""
    stored = _stored_titles(conn, franchise_id)
    kinds = _lookup(sorted(set(stored.values())), client)
    report = BasisReport()
    with conn.cursor() as cur:
        for character_id, title in stored.items():
            basis = kinds.get(title)
            if basis is None:
                report.unchecked += 1
                logger.info("basis unchecked for %s", title)
                continue
            if basis == "ARTICLE":
                report.article += 1
            else:
                report.redirect += 1
            cur.execute(
                'UPDATE "Character" SET "wikiBasis" = %s WHERE id = %s', (basis, character_id)
            )
    return report


def open_client() -> ThrottledClient:
    settings = get_settings()
    return ThrottledClient(
        namespace="wikipedia-basis",
        min_interval_seconds=MIN_INTERVAL_SECONDS,
        headers={"User-Agent": settings.wikimedia_user_agent, "Accept": "application/json"},
    )


def _lookup(titles: Sequence[str], client: ThrottledClient) -> dict[str, WikiBasis]:
    kinds: dict[str, WikiBasis] = {}
    for chunk in _chunks(titles, MAX_TITLES_PER_QUERY):
        # Uncached: a redirect can be turned into an article at any time.
        payload = client.get_json(
            API_URL,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "redirects": "1",
                "titles": "|".join(chunk),
            },
            use_cache=False,
        )
        if not payload or payload.get("__missing__"):
            logger.warning("basis lookup failed for %d titles", len(chunk))
            continue
        kinds.update(parse_title_kinds(payload, chunk))
    return kinds


def _stored_titles(conn: Connection, franchise_id: str | None) -> dict[str, str]:
    sql = 'SELECT id, "wikiTitle" AS title FROM "Character" WHERE "wikiTitle" IS NOT NULL'
    params: tuple[str, ...] = ()
    if franchise_id is not None:
        sql += ' AND "franchiseId" = %s'
        params = (franchise_id,)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return {str(row["id"]): str(row["title"]) for row in cur.fetchall()}


def _chunks(values: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]
