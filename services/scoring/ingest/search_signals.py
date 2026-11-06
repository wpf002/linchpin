"""Search interest for each exit event's pre-window.

Google Trends has no absolute scale, so nothing here is a daily series. For each
(franchise, event date) one comparative query set is run over the pre-window,
with the franchise's top-billed character pinned as the anchor in every batch.
The result is one row per character: mean interest over the window, in anchor
units, dated at the window's last day. The anchor's own value is 1.0.

A window is stored only when every character in the roster came back. A share
computed over part of a roster is not comparable with one computed over all of it.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from psycopg import Connection

from db import connection
from ingest import repository
from ingest.pipeline import PAGEVIEW_EPOCH
from ingest.trends import TrendsUnavailable, fetch_comparative_interest
from metrics.constants import EVENT_WINDOWS, SIGNAL_SOURCE_BY_SHARE

logger = logging.getLogger(__name__)

#: By definition: every value is expressed as a multiple of the anchor.
ANCHOR_VALUE = 1.0

_PARENTHESES = re.compile(r"[()]")
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class RosterTerm:
    character_id: str
    term: str


@dataclass(slots=True)
class SearchIngestReport:
    windows: int = 0
    stored: int = 0
    incomplete: list[str] = field(default_factory=list)
    rows_written: int = 0
    stopped: str | None = None


def search_term(wiki_title: str) -> str:
    """Article title as a search query: "Eleven_(Stranger_Things)" -> "Eleven Stranger Things".

    Wikipedia adds a parenthetical exactly where the bare name is ambiguous, so
    keeping its words keeps the query on the character.
    """
    spaced = _PARENTHESES.sub(" ", wiki_title.replace("_", " "))
    return _WHITESPACE.sub(" ", spaced).strip()


def roster_terms(rows: list[dict]) -> list[RosterTerm]:
    """One term per character, in billing order. A repeated term keeps its first character."""
    seen: set[str] = set()
    terms: list[RosterTerm] = []
    for row in rows:
        term = search_term(str(row["wiki_title"]))
        if not term or term in seen:
            continue
        seen.add(term)
        terms.append(RosterTerm(character_id=str(row["character_id"]), term=term))
    return terms


def window_timeframe(event_date: date) -> tuple[str, date]:
    """pytrends timeframe for the pre-window, and the day its rows are dated."""
    start = event_date + timedelta(days=EVENT_WINDOWS["preStart"])
    end = event_date + timedelta(days=EVENT_WINDOWS["preEnd"])
    return f"{start.isoformat()} {end.isoformat()}", end


def run_search_ingest() -> SearchIngestReport:
    report = SearchIngestReport()
    with connection() as conn:
        windows = _event_windows(conn)
        report.windows = len(windows)
        rosters: dict[str, list[RosterTerm]] = {}
        for franchise_id, franchise_name, event_date in windows:
            if franchise_id not in rosters:
                rosters[franchise_id] = roster_terms(_roster_rows(conn, franchise_id))
            label = f"{franchise_name} {event_date}"
            try:
                written = _ingest_window(conn, rosters[franchise_id], event_date)
            except TrendsUnavailable as error:
                # Rate limits clear on their own. Everything fetched so far is
                # cached, so the next run resumes from this window.
                report.stopped = f"{label}: {error}"
                logger.warning("stopping search ingest at %s", report.stopped)
                break
            if written is None:
                report.incomplete.append(label)
                continue
            report.stored += 1
            report.rows_written += written
            conn.commit()
    return report


def _ingest_window(conn: Connection, roster: list[RosterTerm], event_date: date) -> int | None:
    """Rows written, or None when the window did not come back whole."""
    if len(roster) < 2:
        return None
    anchor, others = roster[0], roster[1:]
    timeframe, measured_on = window_timeframe(event_date)
    interest = fetch_comparative_interest(
        [entry.term for entry in roster], anchor.term, timeframe=timeframe
    )
    if any(entry.term not in interest for entry in others):
        return None

    source = SIGNAL_SOURCE_BY_SHARE["searchShare"]
    written = repository.insert_signals(
        conn, anchor.character_id, source, [(measured_on, ANCHOR_VALUE, False)]
    )
    for entry in others:
        written += repository.insert_signals(
            conn, entry.character_id, source, [(measured_on, interest[entry.term], False)]
        )
    return written


def _event_windows(conn: Connection) -> list[tuple[str, str, date]]:
    """Distinct (franchise, event date) pairs whose pre-window has pageview data."""
    earliest = PAGEVIEW_EPOCH - timedelta(days=EVENT_WINDOWS["preStart"])
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT e."franchiseId" AS franchise_id,
                            f."canonicalName" AS franchise_name,
                            e."eventDate" AS event_date
            FROM "ExitEvent" e
            JOIN "Franchise" f ON f.id = e."franchiseId"
            JOIN "Character" c ON c.id = e."characterId"
            WHERE c."wikiTitle" IS NOT NULL AND e."eventDate" >= %s
            ORDER BY f."canonicalName", e."eventDate"
            """,
            (earliest,),
        )
        return [
            (str(row["franchise_id"]), str(row["franchise_name"]), row["event_date"])
            for row in cur.fetchall()
        ]


def _roster_rows(conn: Connection, franchise_id: str) -> list[dict]:
    """Wiki-titled characters, top-billed first. The first row is the anchor."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id AS character_id, c."wikiTitle" AS wiki_title
            FROM "Character" c
            LEFT JOIN "PersonLink" pl ON pl."characterId" = c.id
            WHERE c."franchiseId" = %s AND c."wikiTitle" IS NOT NULL
            GROUP BY c.id, c."wikiTitle", c."canonicalName"
            ORDER BY MIN(pl."billingOrder") NULLS LAST, c."canonicalName"
            """,
            (franchise_id,),
        )
        return list(cur.fetchall())
