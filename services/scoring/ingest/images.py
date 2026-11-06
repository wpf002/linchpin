"""Posters and portraits for catalogue franchises.

A separate pass from the roster ingest: it reads the same TVMaze responses
(cached after the first ingest) and writes only the imageUrl columns, so it can
run at any time without touching roster, link or signal rows.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from psycopg import Connection

from db import connection
from ingest.corpus import CorpusFranchise, load_franchises
from ingest.tvmaze import TvMazeCastEntry, fetch_cast, search_show

logger = logging.getLogger("linchpin.images")


@dataclass(slots=True)
class ImageReport:
    franchises: int = 0
    characters: int = 0
    people: int = 0


def first_images(cast: list[TvMazeCastEntry]) -> tuple[dict[str, str], dict[str, str]]:
    """Character and person image URLs by name. The first credit with an image wins,
    which keeps the original actor's portrait for a recast character."""
    characters: dict[str, str] = {}
    people: dict[str, str] = {}
    for member in cast:
        if member.character_image_url:
            characters.setdefault(member.character_name, member.character_image_url)
        if member.person_image_url:
            people.setdefault(member.person_name, member.person_image_url)
    return characters, people


def run_image_pass(*, only: list[str] | None = None) -> ImageReport:
    report = ImageReport()
    franchises = [
        franchise
        for franchise in load_franchises()
        if franchise.uses_catalogue and (only is None or franchise.canonical_name in only)
    ]
    with connection() as conn:
        for franchise in franchises:
            _store_franchise_images(conn, franchise, report)
            conn.commit()
    return report


def _store_franchise_images(
    conn: Connection, franchise: CorpusFranchise, report: ImageReport
) -> None:
    show = search_show(franchise.query_name)
    if show is None:
        return
    characters, people = first_images(fetch_cast(show.tvmaze_id))
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id FROM "Franchise" WHERE "canonicalName" = %s AND medium = %s',
            (franchise.canonical_name, franchise.medium),
        )
        row = cur.fetchone()
        if row is None:
            logger.info("%s is not ingested yet; no images stored", franchise.canonical_name)
            return
        franchise_id = row["id"]
        if show.image_url:
            cur.execute(
                'UPDATE "Franchise" SET "imageUrl" = %s WHERE id = %s',
                (show.image_url, franchise_id),
            )
            report.franchises += cur.rowcount
        for name, url in characters.items():
            cur.execute(
                'UPDATE "Character" SET "imageUrl" = %s '
                'WHERE "franchiseId" = %s AND "canonicalName" = %s',
                (url, franchise_id, name),
            )
            report.characters += cur.rowcount
        for name, url in people.items():
            # Only people credited on this franchise: a name alone could match a namesake.
            cur.execute(
                'UPDATE "Person" SET "imageUrl" = %s WHERE "canonicalName" = %s AND id IN ('
                'SELECT "personId" FROM "PersonLink" WHERE "franchiseId" = %s)',
                (url, name, franchise_id),
            )
            report.people += cur.rowcount
