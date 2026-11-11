"""Absence windows from exit events.

A character's absence window is the post-window of their own exit; the presence
window is the pre-window of the same event. Characters who never left have no
absence window. They are flagged and left unscored, never imputed: a two-hander
or a permanent cast gives no evidence about who absorbs whose attention.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Final

from psycopg import Connection

from metrics.constants import EVENT_WINDOWS, SCORED_WIKI_BASIS, SIGNAL_SOURCE_BY_SHARE
from metrics.substitutability import SubstitutabilityResult, substitutability

#: Exits that remove the character from the story. A recast keeps the character
#: on screen, and a showrunner exit removes nobody from the roster.
ABSENCE_EXIT_TYPES: Final = ("CHARACTER_DEATH", "ACTOR_DEPARTURE")

NO_ABSENCE_WINDOW: Final = "no absence window"


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def presence_days(event_date: date) -> list[date]:
    return _days(
        event_date + timedelta(days=EVENT_WINDOWS["preStart"]),
        event_date + timedelta(days=EVENT_WINDOWS["preEnd"]),
    )


def absence_days(event_date: date) -> list[date]:
    return _days(
        event_date + timedelta(days=EVENT_WINDOWS["postStart"]),
        event_date + timedelta(days=EVENT_WINDOWS["postEnd"]),
    )


def load_substitutability(conn: Connection) -> dict[str, SubstitutabilityResult]:
    """One result per character with an exit event, keyed by character id.

    A character with several exits is scored on the earliest one that yields a
    score. Characters absent from the result have no absence window at all.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT e."characterId" AS character_id,
                   e."franchiseId" AS franchise_id,
                   e."eventDate"   AS event_date
            FROM "ExitEvent" e
            WHERE e."characterId" IS NOT NULL AND e."exitType"::text = ANY(%s)
            ORDER BY e."eventDate"
            """,
            (list(ABSENCE_EXIT_TYPES),),
        )
        events = cur.fetchall()

    results: dict[str, SubstitutabilityResult] = {}
    for event in events:
        character_id = str(event["character_id"])
        existing = results.get(character_id)
        if existing is not None and existing.score is not None:
            continue
        results[character_id] = _score_event(
            conn, character_id, str(event["franchise_id"]), event["event_date"]
        )
    return results


def _score_event(
    conn: Connection, character_id: str, franchise_id: str, event_date: date
) -> SubstitutabilityResult:
    present = presence_days(event_date)
    absent = absence_days(event_date)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s."measuredOn" AS day,
                   COALESCE(SUM(s."rawValue") FILTER (WHERE s."characterId" = %s), 0) AS own,
                   COALESCE(SUM(s."rawValue") FILTER (WHERE s."characterId" <> %s), 0) AS rest
            FROM "AttentionSignal" s
            JOIN "Character" c ON c.id = s."characterId"
            WHERE c."franchiseId" = %s
              AND s.source = %s
              AND c."wikiBasis" = %s
              AND (s."measuredOn" BETWEEN %s AND %s OR s."measuredOn" BETWEEN %s AND %s)
            GROUP BY s."measuredOn"
            """,
            (
                character_id,
                character_id,
                franchise_id,
                SIGNAL_SOURCE_BY_SHARE["wikiShare"],
                SCORED_WIKI_BASIS,
                present[0],
                present[-1],
                absent[0],
                absent[-1],
            ),
        )
        rows = cur.fetchall()
    return substitutability(
        character_series={row["day"]: float(row["own"]) for row in rows},
        roster_series={row["day"]: float(row["rest"]) for row in rows},
        absence_days=absent,
    )
