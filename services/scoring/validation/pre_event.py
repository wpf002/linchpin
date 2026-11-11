"""Shares measured inside an event's own pre-window.

v0.1.0 read the pre-event carry score from the latest CarryScore row. That row
covers the trailing year, which postdates most exits, so the predictor included
data from after the event it was meant to predict. From v0.2.0 every share is
computed from t-90..t-1 only.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta

from psycopg import Connection

from metrics.constants import EVENT_WINDOWS, SCORED_WIKI_BASIS, SIGNAL_SOURCE_BY_SHARE
from validation.did import MIN_WINDOW_OBSERVATIONS

#: A share needs someone to be a share of. One measured character is always 1.0.
MIN_ROSTER_FOR_SHARE = 2


def pre_window(event_date: date) -> tuple[date, date]:
    return (
        event_date + timedelta(days=EVENT_WINDOWS["preStart"]),
        event_date + timedelta(days=EVENT_WINDOWS["preEnd"]),
    )


def window_shares(totals: Mapping[str, float]) -> dict[str, float]:
    """Each character's fraction of the roster total. Empty when no share is meaningful."""
    positive = {key: value for key, value in totals.items() if value > 0}
    total = sum(positive.values())
    if len(totals) < MIN_ROSTER_FOR_SHARE or total <= 0:
        return {}
    return {key: positive.get(key, 0.0) / total for key in totals}


def load_wiki_shares(conn: Connection, franchise_id: str, event_date: date) -> dict[str, float]:
    """Pageview share per character over the pre-window."""
    start, end = pre_window(event_date)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s."characterId" AS character_id, SUM(s."rawValue") AS total
            FROM "AttentionSignal" s
            JOIN "Character" c ON c.id = s."characterId"
            WHERE c."franchiseId" = %s
              AND s.source = %s
              AND c."wikiBasis" = %s
              AND s."measuredOn" BETWEEN %s AND %s
            GROUP BY s."characterId"
            HAVING COUNT(*) >= %s
            """,
            (
                franchise_id,
                SIGNAL_SOURCE_BY_SHARE["wikiShare"],
                SCORED_WIKI_BASIS,
                start,
                end,
                MIN_WINDOW_OBSERVATIONS,
            ),
        )
        rows = cur.fetchall()
    return window_shares({str(row["character_id"]): float(row["total"]) for row in rows})


def load_search_shares(conn: Connection, franchise_id: str, event_date: date) -> dict[str, float]:
    """Search-interest share per character over the pre-window.

    Trends rows are one window mean per character, in anchor units, dated at the
    window's last day. See ingest/search_signals.py.
    """
    _, end = pre_window(event_date)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s."characterId" AS character_id, s."rawValue" AS total
            FROM "AttentionSignal" s
            JOIN "Character" c ON c.id = s."characterId"
            WHERE c."franchiseId" = %s AND s.source = %s AND s."measuredOn" = %s
            """,
            (franchise_id, SIGNAL_SOURCE_BY_SHARE["searchShare"], end),
        )
        rows = cur.fetchall()
    return window_shares({str(row["character_id"]): float(row["total"]) for row in rows})
