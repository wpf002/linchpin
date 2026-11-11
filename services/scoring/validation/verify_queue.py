"""Unverified exit events the gate could test once a human verifies them.

An exit is testable when its full pre- and post-window fall inside pageview
coverage and the exiting character, plus at least MIN_ARTICLE_PEERS others in
the franchise, have article-basis titles. Verifying anything else adds to the
corpus but not to the rank IC sample.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Final

from psycopg import Connection

from ingest.corpus import EXIT_EVENTS_FILE, CorpusExitEvent
from ingest.pipeline import PAGEVIEW_EPOCH
from metrics.constants import EVENT_WINDOWS, SCORED_WIKI_BASIS
from validation.gate import HEADLINE_EXCLUDED_EXIT_TYPES

#: A share needs other characters to be a share of. Two peers is the least
#: that keeps one co-lead from owning the whole remainder.
MIN_ARTICLE_PEERS: Final = 2


@dataclass(frozen=True, slots=True)
class QueueItem:
    franchise: str
    character: str
    event_date: date
    exit_type: str
    source_url: str
    evidence: str | None


def coverable_event_dates(last_signal_day: date) -> tuple[date, date]:
    """Earliest and latest event date whose whole window has pageview data."""
    earliest = PAGEVIEW_EPOCH - timedelta(days=EVENT_WINDOWS["preStart"])
    latest = last_signal_day - timedelta(days=EVENT_WINDOWS["postEnd"])
    return earliest, latest


def build_queue(
    corpus: tuple[CorpusExitEvent, ...], testable_keys: set[tuple[str, str, date]]
) -> list[QueueItem]:
    """Unverified headline-type events whose (franchise, character, date) is testable."""
    items = [
        QueueItem(
            franchise=event.franchise,
            character=event.character,
            event_date=event.event_date,
            exit_type=event.exit_type,
            source_url=event.source_url,
            evidence=event.evidence,
        )
        for event in corpus
        if not event.verified
        and event.exit_type not in HEADLINE_EXCLUDED_EXIT_TYPES
        and (event.franchise, event.character, event.event_date) in testable_keys
    ]
    return sorted(items, key=lambda item: (item.event_date, item.franchise, item.character))


def load_testable_keys(conn: Connection) -> set[tuple[str, str, date]]:
    with conn.cursor() as cur:
        cur.execute('SELECT MAX("measuredOn") AS last_day FROM "AttentionSignal"')
        row = cur.fetchone()
        if row is None or row["last_day"] is None:
            return set()
        earliest, latest = coverable_event_dates(row["last_day"])
        cur.execute(
            """
            SELECT f."canonicalName" AS franchise, c."canonicalName" AS character,
                   e."eventDate" AS event_date
            FROM "ExitEvent" e
            JOIN "Character" c ON c.id = e."characterId"
            JOIN "Franchise" f ON f.id = e."franchiseId"
            WHERE e."eventDate" BETWEEN %s AND %s
              AND c."wikiBasis" = %s
              AND (
                SELECT count(*) FROM "Character" peer
                WHERE peer."franchiseId" = e."franchiseId"
                  AND peer.id <> c.id
                  AND peer."wikiBasis" = %s
              ) >= %s
            """,
            (earliest, latest, SCORED_WIKI_BASIS, SCORED_WIKI_BASIS, MIN_ARTICLE_PEERS),
        )
        return {(str(r["franchise"]), str(r["character"]), r["event_date"]) for r in cur.fetchall()}


def mark_verified(item: QueueItem, target: Path = EXIT_EVENTS_FILE) -> None:
    """Set verified=true on the one corpus event matching this queue item."""
    payload = json.loads(target.read_text(encoding="utf-8"))
    matches = [
        row
        for row in payload["events"]
        if row["franchise"] == item.franchise
        and row["character"] == item.character
        and row["eventDate"] == item.event_date.isoformat()
    ]
    if len(matches) != 1:
        raise ValueError(f"expected one corpus event for {item}, found {len(matches)}")
    matches[0]["verified"] = True
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
