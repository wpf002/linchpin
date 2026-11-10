"""Bluesky mention counts per character, stored as BLUESKY attention signals.

Mentions are counted, never scored for sentiment. One row is a character's
post count for one UTC day: posts that contain both the character's name and
the franchise's name as exact phrases. Each run fills the trailing days not yet
stored. Rows are inserted with ON CONFLICT DO NOTHING, so a raw value is never
rewritten.
"""

from __future__ import annotations

import logging
from collections.abc import Collection
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Final

from psycopg import Connection
from psycopg.rows import dict_row

from db import connection
from ingest import repository
from ingest.bluesky import FIRST_SEARCHABLE_DAY, BlueskyClient, BlueskyFetchError, build_query
from ingest.corpus import CorpusFranchise, load_franchises
from metrics.constants import SIGNAL_SOURCE_BY_SHARE
from metrics.windows import is_off_cycle

logger = logging.getLogger(__name__)

SOURCE: Final = SIGNAL_SOURCE_BY_SHARE["discourseShare"]

#: Trailing days a run fills by default. One request per character per day.
DEFAULT_DAYS: Final = 30


@dataclass(slots=True)
class DiscourseReport:
    franchises: int = 0
    characters: int = 0
    rows_written: int = 0
    skipped: list[str] = field(default_factory=list)
    stopped: str | None = None


@dataclass(frozen=True, slots=True)
class _Character:
    character_id: str
    name: str


def trailing_days(last_day: date, days: int) -> list[date]:
    """The `days` days ending on last_day, oldest first, never before Bluesky existed."""
    first_day = max(last_day - timedelta(days=days - 1), FIRST_SEARCHABLE_DAY)
    span = (last_day - first_day).days + 1
    return [first_day + timedelta(days=offset) for offset in range(max(span, 0))]


def days_to_fetch(wanted: list[date], stored: Collection[date]) -> list[date]:
    return [day for day in wanted if day not in stored]


def run_discourse_ingest(
    *, only: list[str] | None = None, days: int = DEFAULT_DAYS
) -> DiscourseReport:
    report = DiscourseReport()
    # Today is still being posted; the last full day is yesterday in UTC.
    wanted = trailing_days(datetime.now(UTC).date() - timedelta(days=1), days)
    if not wanted:
        report.stopped = "no searchable days in range"
        return report
    franchises = [
        franchise
        for franchise in load_franchises()
        if only is None or franchise.canonical_name in only
    ]
    with connection() as conn, BlueskyClient() as client:
        for franchise in franchises:
            try:
                _ingest_franchise(conn, client, franchise, wanted, report)
            except BlueskyFetchError as error:
                # A refusal outside the retried 429/5xx set means search is
                # blocked for this client, so later franchises would fail too.
                conn.rollback()
                report.stopped = f"{franchise.canonical_name}: {error}"
                return report
    return report


def _ingest_franchise(
    conn: Connection,
    client: BlueskyClient,
    franchise: CorpusFranchise,
    wanted: list[date],
    report: DiscourseReport,
) -> None:
    franchise_id = _franchise_id(conn, franchise)
    if franchise_id is None:
        report.skipped.append(f"{franchise.canonical_name}: not ingested")
        return
    characters = _characters(conn, franchise_id)
    if not characters:
        report.skipped.append(f"{franchise.canonical_name}: no characters")
        return

    release_dates = _release_dates(conn, franchise_id)
    written = 0
    for character in characters:
        stored = _stored_days(conn, character.character_id, wanted[0], wanted[-1])
        query = build_query(character.name, franchise.canonical_name)
        points = [
            (day, float(client.count_posts(query, day)), is_off_cycle(day, release_dates))
            for day in days_to_fetch(wanted, stored)
        ]
        written += repository.insert_signals(conn, character.character_id, SOURCE, points)
        # Commit per character so an interrupted run keeps what it fetched.
        conn.commit()
    report.franchises += 1
    report.characters += len(characters)
    report.rows_written += written
    logger.info(
        "%s: %s..%s, %d characters, %d new rows",
        franchise.canonical_name,
        wanted[0],
        wanted[-1],
        len(characters),
        written,
    )


def _franchise_id(conn: Connection, franchise: CorpusFranchise) -> str | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT id FROM "Franchise" WHERE "canonicalName" = %s AND medium = %s',
            (franchise.canonical_name, franchise.medium),
        )
        row = cur.fetchone()
    return str(row["id"]) if row else None


def _characters(conn: Connection, franchise_id: str) -> list[_Character]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT id, "canonicalName" FROM "Character" WHERE "franchiseId" = %s ORDER BY id',
            (franchise_id,),
        )
        rows = cur.fetchall()
    return [
        _Character(str(row["id"]), str(row["canonicalName"]).strip())
        for row in rows
        if str(row["canonicalName"]).strip()
    ]


def _stored_days(conn: Connection, character_id: str, start: date, end: date) -> set[date]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT "measuredOn"::date AS day FROM "AttentionSignal" '
            'WHERE "characterId" = %s AND source = %s AND "measuredOn" BETWEEN %s AND %s',
            (character_id, SOURCE, start, end),
        )
        return {row["day"] for row in cur.fetchall()}


def _release_dates(conn: Connection, franchise_id: str) -> list[date]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT "releasedOn"::date AS day FROM "Release" WHERE "franchiseId" = %s ORDER BY 1',
            (franchise_id,),
        )
        return [row["day"] for row in cur.fetchall()]
