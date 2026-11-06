"""Reddit mention counts per character, stored as REDDIT attention signals.

Mentions are counted, never scored for sentiment. A post counts once for a
character when its title or body contains the character's canonical name or a
stored alias as a whole word. Reddit's listing API returns only a subreddit's
newest posts, so one run covers a trailing span of days. Rows are inserted with
ON CONFLICT DO NOTHING, so repeated runs extend the series and never rewrite a
raw value.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Final

from psycopg import Connection
from psycopg.rows import dict_row

from db import connection
from ingest import repository
from ingest.corpus import CorpusFranchise, load_franchises
from ingest.reddit import (
    RedditFetchError,
    RedditNotConfigured,
    SubredditScan,
    fetch_subreddit_mentions,
    is_configured,
)
from metrics.constants import SIGNAL_SOURCE_BY_SHARE
from metrics.windows import is_off_cycle

logger = logging.getLogger(__name__)

SOURCE: Final = SIGNAL_SOURCE_BY_SHARE["discourseShare"]

#: Names shorter than this match too many unrelated words ("Al", "Bo").
MIN_NAME_LENGTH: Final = 3

#: Newest posts read per subreddit per run. Reddit's listing API stops at 1000.
DEFAULT_POST_LIMIT: Final = 1000


@dataclass(slots=True)
class DiscourseReport:
    franchises: int = 0
    characters: int = 0
    rows_written: int = 0
    skipped: list[str] = field(default_factory=list)
    stopped: str | None = None


def match_names(canonical_name: str, aliases: Sequence[str]) -> tuple[str, ...]:
    """Canonical name plus stored aliases, minus duplicates and names too short to mean anything."""
    kept: list[str] = []
    for name in (canonical_name, *aliases):
        cleaned = name.strip()
        if len(cleaned) < MIN_NAME_LENGTH:
            continue
        if cleaned.lower() in {existing.lower() for existing in kept}:
            continue
        kept.append(cleaned)
    return tuple(kept)


def covered_span(scans: Sequence[SubredditScan]) -> tuple[date, date] | None:
    """Days every scan covers in full.

    Each scan's oldest and newest post days are partial (the listing cut off
    inside one and the other is still running), so both are dropped. With
    several subreddits the span is the intersection, so a day's sum always
    covers every subreddit.
    """
    starts: list[date] = []
    ends: list[date] = []
    for scan in scans:
        if scan.oldest_post is None or scan.newest_post is None:
            return None
        starts.append(scan.oldest_post + timedelta(days=1))
        ends.append(scan.newest_post - timedelta(days=1))
    if not starts:
        return None
    start, end = max(starts), min(ends)
    if start > end:
        return None
    return start, end


def daily_points(
    scans: Sequence[SubredditScan],
    character_key: str,
    span: tuple[date, date],
    release_dates: Sequence[date],
) -> list[tuple[date, float, bool]]:
    """One row per day in the span, summed across subreddits. Days with no mention are zero."""
    start, end = span
    points: list[tuple[date, float, bool]] = []
    day = start
    while day <= end:
        mentions = sum(scan.counts.get(character_key, {}).get(day, 0) for scan in scans)
        points.append((day, float(mentions), is_off_cycle(day, release_dates)))
        day += timedelta(days=1)
    return points


def run_discourse_ingest(
    *, only: list[str] | None = None, limit: int = DEFAULT_POST_LIMIT
) -> DiscourseReport:
    report = DiscourseReport()
    if not is_configured():
        report.stopped = "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required"
        return report
    franchises = [
        franchise
        for franchise in load_franchises()
        if franchise.primary_subs and (only is None or franchise.canonical_name in only)
    ]
    with connection() as conn:
        for franchise in franchises:
            try:
                _ingest_franchise(conn, franchise, report, limit=limit)
            except RedditNotConfigured as error:
                report.stopped = str(error)
                return report
            except RedditFetchError as error:
                logger.warning("%s: %s", franchise.canonical_name, error)
                report.skipped.append(f"{franchise.canonical_name}: {error}")
                conn.rollback()
                continue
            conn.commit()
    return report


def _ingest_franchise(
    conn: Connection, franchise: CorpusFranchise, report: DiscourseReport, *, limit: int
) -> None:
    franchise_id = _franchise_id(conn, franchise)
    if franchise_id is None:
        report.skipped.append(f"{franchise.canonical_name}: not ingested")
        return
    names_by_character = _names_by_character(conn, franchise_id)
    if not names_by_character:
        report.skipped.append(f"{franchise.canonical_name}: no characters")
        return

    scans = [
        fetch_subreddit_mentions(subreddit, names_by_character, limit=limit)
        for subreddit in franchise.primary_subs
    ]
    span = covered_span(scans)
    if span is None:
        report.skipped.append(f"{franchise.canonical_name}: no fully covered day")
        return

    release_dates = _release_dates(conn, franchise_id)
    written = 0
    for character_id in names_by_character:
        points = daily_points(scans, character_id, span, release_dates)
        written += repository.insert_signals(conn, character_id, SOURCE, points)
    report.franchises += 1
    report.characters += len(names_by_character)
    report.rows_written += written
    logger.info(
        "%s: r/%s %s..%s, %d characters, %d new rows",
        franchise.canonical_name,
        "+".join(franchise.primary_subs),
        span[0],
        span[1],
        len(names_by_character),
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


def _names_by_character(conn: Connection, franchise_id: str) -> dict[str, Sequence[str]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT id, "canonicalName", aliases FROM "Character" WHERE "franchiseId" = %s',
            (franchise_id,),
        )
        rows = cur.fetchall()
    names = {
        str(row["id"]): match_names(str(row["canonicalName"]), list(row["aliases"] or []))
        for row in rows
    }
    return {character_id: found for character_id, found in names.items() if found}


def _release_dates(conn: Connection, franchise_id: str) -> list[date]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            'SELECT "releasedOn"::date AS day FROM "Release" WHERE "franchiseId" = %s ORDER BY 1',
            (franchise_id,),
        )
        return [row["day"] for row in cur.fetchall()]
