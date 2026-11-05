"""Database writes for the ingest pipeline.

Prisma generates ids and updatedAt in its client, not in the database, so every
insert here supplies both. All statements are parameterised; no SQL is built by
string concatenation.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from uuid import uuid4

from psycopg import Connection
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(tz=UTC)


def upsert_franchise(
    conn: Connection,
    *,
    canonical_name: str,
    medium: str,
    status: str,
    genres: list[str],
    primary_subs: list[str],
    first_release: date | None,
    wiki_title: str | None,
) -> str:
    sql = """
        INSERT INTO "Franchise" (
            id, "canonicalName", aliases, "wikiTitle", "primarySubs", genres,
            medium, "firstRelease", status, "rosterComplete", "createdAt", "updatedAt"
        )
        VALUES (%s, %s, ARRAY[]::text[], %s, %s, %s, %s, %s, %s, 0, %s, %s)
        ON CONFLICT ("canonicalName", medium) DO UPDATE SET
            "wikiTitle" = EXCLUDED."wikiTitle",
            "primarySubs" = EXCLUDED."primarySubs",
            genres = EXCLUDED.genres,
            "firstRelease" = EXCLUDED."firstRelease",
            status = EXCLUDED.status,
            "updatedAt" = EXCLUDED."updatedAt"
        RETURNING id
    """
    now = now_utc()
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql,
            (
                str(uuid4()),
                canonical_name,
                wiki_title,
                primary_subs,
                genres,
                medium,
                first_release,
                status,
                now,
                now,
            ),
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"franchise upsert returned no row for {canonical_name!r}")
    return str(row["id"])


def set_roster_complete(conn: Connection, franchise_id: str, value: float) -> None:
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "Franchise" SET "rosterComplete" = %s, "updatedAt" = %s WHERE id = %s',
            (value, now_utc(), franchise_id),
        )


def replace_releases(conn: Connection, franchise_id: str, releases: list[tuple[str, date]]) -> int:
    """Releases are derived entirely from the catalogue, so they are replaced wholesale."""
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "Release" WHERE "franchiseId" = %s', (franchise_id,))
        if not releases:
            return 0
        cur.executemany(
            'INSERT INTO "Release" (id, "franchiseId", title, "releasedOn")'
            " VALUES (%s, %s, %s, %s)",
            [(str(uuid4()), franchise_id, title, released_on) for title, released_on in releases],
        )
    return len(releases)


def upsert_character(
    conn: Connection,
    *,
    franchise_id: str,
    canonical_name: str,
    aliases: list[str],
    wiki_title: str | None,
    status: str = "ACTIVE",
) -> str:
    sql = """
        INSERT INTO "Character" (
            id, "franchiseId", "canonicalName", aliases, "wikiTitle", status
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT ("franchiseId", "canonicalName") DO UPDATE SET
            aliases = EXCLUDED.aliases,
            "wikiTitle" = COALESCE(EXCLUDED."wikiTitle", "Character"."wikiTitle")
        RETURNING id
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, (str(uuid4()), franchise_id, canonical_name, aliases, wiki_title, status))
        row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"character upsert returned no row for {canonical_name!r}")
    return str(row["id"])


def set_character_status(conn: Connection, character_id: str, status: str) -> None:
    with conn.cursor() as cur:
        cur.execute('UPDATE "Character" SET status = %s WHERE id = %s', (status, character_id))


def upsert_person(conn: Connection, *, canonical_name: str, role_type: str) -> str:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT id, "roleTypes" FROM "Person" WHERE "canonicalName" = %s LIMIT 1',
            (canonical_name,),
        )
        existing = cur.fetchone()
        if existing is not None:
            person_id = str(existing["id"])
            if role_type not in (existing["roleTypes"] or []):
                cur.execute(
                    'UPDATE "Person" SET "roleTypes" = array_append("roleTypes", %s) WHERE id = %s',
                    (role_type, person_id),
                )
            return person_id
        person_id = str(uuid4())
        cur.execute(
            'INSERT INTO "Person" (id, "canonicalName", aliases, "roleTypes") '
            'VALUES (%s, %s, ARRAY[]::text[], ARRAY[%s]::"RoleType"[])',
            (person_id, canonical_name, role_type),
        )
        return person_id


def upsert_person_link(
    conn: Connection,
    *,
    person_id: str,
    character_id: str | None,
    franchise_id: str,
    role_type: str,
    billing_order: int | None,
) -> None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT id FROM "PersonLink" WHERE "personId" = %s AND "franchiseId" = %s '
            'AND "characterId" IS NOT DISTINCT FROM %s AND "roleType" = %s LIMIT 1',
            (person_id, franchise_id, character_id, role_type),
        )
        existing = cur.fetchone()
        if existing is not None:
            cur.execute(
                'UPDATE "PersonLink" SET "billingOrder" = %s WHERE id = %s',
                (billing_order, str(existing["id"])),
            )
            return
        cur.execute(
            'INSERT INTO "PersonLink" (id, "personId", "characterId", "franchiseId", '
            '"roleType", "billingOrder", confidence) VALUES (%s, %s, %s, %s, %s, %s, 1.0)',
            (str(uuid4()), person_id, character_id, franchise_id, role_type, billing_order),
        )


def insert_signals(
    conn: Connection,
    character_id: str,
    source: str,
    points: list[tuple[date, float, bool]],
) -> int:
    """Insert raw signals. Existing rows are never overwritten: raw values are immutable."""
    if not points:
        return 0
    sql = """
        INSERT INTO "AttentionSignal" (
            id, "characterId", source, "measuredOn", "rawValue", "isOffCycle", confidence
        )
        VALUES (%s, %s, %s, %s, %s, %s, 1.0)
        ON CONFLICT ("characterId", source, "measuredOn") DO NOTHING
    """
    rows = [
        (str(uuid4()), character_id, source, measured_on, raw_value, is_off_cycle)
        for measured_on, raw_value, is_off_cycle in points
    ]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


def upsert_exit_event(
    conn: Connection,
    *,
    franchise_id: str,
    character_id: str | None,
    person_id: str | None,
    exit_type: str,
    event_date: date,
    announced_date: date | None,
    source_url: str,
    verified: bool,
    notes: str | None,
) -> str:
    sql = """
        INSERT INTO "ExitEvent" (
            id, "franchiseId", "characterId", "personId", "exitType", "eventDate",
            "announcedDate", "sourceUrl", verified, notes
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT ("franchiseId", "characterId", "exitType", "eventDate") DO UPDATE SET
            "personId" = EXCLUDED."personId",
            "announcedDate" = EXCLUDED."announcedDate",
            "sourceUrl" = EXCLUDED."sourceUrl",
            verified = EXCLUDED.verified,
            notes = EXCLUDED.notes
        RETURNING id
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql,
            (
                str(uuid4()),
                franchise_id,
                character_id,
                person_id,
                exit_type,
                event_date,
                announced_date,
                source_url,
                verified,
                notes,
            ),
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError("exit event upsert returned no row")
    return str(row["id"])
