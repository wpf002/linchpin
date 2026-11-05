"""Compute carry scores and franchise fragility from stored raw signals.

Raw signals are read, never written. Everything here is derived and is replaced
wholesale on each run, keyed by MODEL_VERSION, so a weight change produces a new
row rather than editing an old one.

Phase 2 runs wiki-only: the weight vector is WIKI_ONLY_WEIGHTS until the other
three sources are ingested for every franchise. Blending in a source that exists
for two franchises out of forty would make their scores incomparable.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import uuid4

from psycopg import Connection
from psycopg.rows import dict_row

from db import connection
from metrics.constants import MODEL_VERSION, SIGNAL_SOURCE_BY_SHARE, WIKI_ONLY_WEIGHTS
from metrics.shares import (
    ZStats,
    carry_score,
    durability_ratio,
    hhi,
    to_shares,
    top_n_share,
    z_stats,
)

logger = logging.getLogger(__name__)

#: Trailing window the current scores describe.
SCORING_WINDOW_DAYS = 365

#: A character needs this many daily observations before it gets a score.
MIN_OBSERVATIONS = 30

#: Below this, the character's share is noise and the confidence flag says so.
LOW_OBSERVATION_FLOOR = 120


@dataclass(frozen=True, slots=True)
class ScoringResult:
    characters_scored: int
    franchises_scored: int
    window_start: date
    window_end: date


@dataclass(slots=True)
class _CharacterTotals:
    character_id: str
    name: str
    total: float = 0.0
    off_cycle_total: float = 0.0
    on_cycle_total: float = 0.0
    observations: int = 0


def run_scoring(*, window_days: int = SCORING_WINDOW_DAYS) -> ScoringResult:
    window_end = _latest_signal_day()
    if window_end is None:
        raise RuntimeError("no attention signals in the database; run ingest first")
    window_start = window_end - timedelta(days=window_days)

    with connection() as conn:
        totals = _load_totals(conn, window_start, window_end)
        per_franchise = _carry_scores(conn, totals, window_start, window_end)
        franchises = _fragility_scores(conn, per_franchise, window_end)

    return ScoringResult(
        characters_scored=sum(len(rows) for rows in per_franchise.values()),
        franchises_scored=franchises,
        window_start=window_start,
        window_end=window_end,
    )


def _latest_signal_day() -> date | None:
    with connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute('SELECT MAX("measuredOn") AS latest FROM "AttentionSignal"')
        row = cur.fetchone()
    if row is None or row["latest"] is None:
        return None
    return row["latest"]


def _load_totals(
    conn: Connection, window_start: date, window_end: date
) -> dict[str, list[_CharacterTotals]]:
    """Summed raw signal per character, split by cycle, grouped by franchise."""
    sql = """
        SELECT c."franchiseId" AS franchise_id,
               c.id            AS character_id,
               c."canonicalName" AS name,
               SUM(s."rawValue") AS total,
               SUM(s."rawValue") FILTER (WHERE s."isOffCycle") AS off_cycle_total,
               SUM(s."rawValue") FILTER (WHERE NOT s."isOffCycle") AS on_cycle_total,
               COUNT(*) AS observations
        FROM "Character" c
        JOIN "AttentionSignal" s ON s."characterId" = c.id
        WHERE s.source = %s AND s."measuredOn" BETWEEN %s AND %s
        GROUP BY c."franchiseId", c.id, c."canonicalName"
    """
    grouped: dict[str, list[_CharacterTotals]] = defaultdict(list)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, (SIGNAL_SOURCE_BY_SHARE["wikiShare"], window_start, window_end))
        for row in cur.fetchall():
            if int(row["observations"]) < MIN_OBSERVATIONS:
                continue
            grouped[str(row["franchise_id"])].append(
                _CharacterTotals(
                    character_id=str(row["character_id"]),
                    name=str(row["name"]),
                    total=float(row["total"] or 0.0),
                    off_cycle_total=float(row["off_cycle_total"] or 0.0),
                    on_cycle_total=float(row["on_cycle_total"] or 0.0),
                    observations=int(row["observations"]),
                )
            )
    return grouped


@dataclass(frozen=True, slots=True)
class _ScoredCharacter:
    character_id: str
    name: str
    carry: float
    wiki_share: float
    observations: int


def _carry_scores(
    conn: Connection,
    totals: dict[str, list[_CharacterTotals]],
    window_start: date,
    window_end: date,
) -> dict[str, list[_ScoredCharacter]]:
    scored: dict[str, list[_ScoredCharacter]] = {}
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "CarryScore" WHERE "modelVersion" = %s', (MODEL_VERSION,))

    for franchise_id, rows in totals.items():
        shares = to_shares([row.total for row in rows])
        off_shares = to_shares([row.off_cycle_total for row in rows])
        on_shares = to_shares([row.on_cycle_total for row in rows])

        payload = []
        franchise_scores: list[_ScoredCharacter] = []
        for index, row in enumerate(rows):
            wiki_share = shares[index]
            carry = carry_score({"wikiShare": wiki_share}, WIKI_ONLY_WEIGHTS)
            off_carry = carry_score({"wikiShare": off_shares[index]}, WIKI_ONLY_WEIGHTS)
            on_carry = carry_score({"wikiShare": on_shares[index]}, WIKI_ONLY_WEIGHTS)
            confidence = 1.0 if row.observations >= LOW_OBSERVATION_FLOOR else 0.5
            payload.append(
                (
                    str(uuid4()),
                    row.character_id,
                    window_start,
                    window_end,
                    MODEL_VERSION,
                    wiki_share,
                    carry,
                    off_carry,
                    durability_ratio(off_carry, on_carry),
                    confidence,
                    row.observations,
                )
            )
            franchise_scores.append(
                _ScoredCharacter(
                    character_id=row.character_id,
                    name=row.name,
                    carry=carry,
                    wiki_share=wiki_share,
                    observations=row.observations,
                )
            )

        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO "CarryScore" (
                    id, "characterId", "windowStart", "windowEnd", "modelVersion",
                    "wikiShare", "carryScore", "offCycleCarry", "durabilityRatio",
                    confidence, "observationCount"
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                payload,
            )
        scored[franchise_id] = franchise_scores
    return scored


def _fragility_scores(
    conn: Connection, per_franchise: dict[str, list[_ScoredCharacter]], scored_on: date
) -> int:
    """Fragility is a cross-sectional z-score, so every franchise is scored together."""
    measures = {
        franchise_id: (
            hhi([s.carry for s in rows]),
            top_n_share([s.carry for s in rows], 1),
            top_n_share([s.carry for s in rows], 3),
        )
        for franchise_id, rows in per_franchise.items()
        if rows
    }
    if not measures:
        return 0

    hhi_stats = z_stats([value[0] for value in measures.values()])
    top1_stats = z_stats([value[1] for value in measures.values()])
    # Substitutability needs absence windows, which wiki-only Phase 2 does not
    # produce. The fragility weights renormalise rather than treating it as zero.
    empty_stats = ZStats(0.0, 0.0)

    from metrics.shares import fragility as fragility_of

    roster_complete = _roster_completeness(conn)
    rows = []
    for franchise_id, (hhi_value, top1, top3) in measures.items():
        score = fragility_of(
            hhi_value=hhi_value,
            top1_share=top1,
            substitutability=None,
            hhi_stats=hhi_stats,
            top1_stats=top1_stats,
            substitutability_stats=empty_stats,
        )
        rows.append(
            (
                str(uuid4()),
                franchise_id,
                scored_on,
                MODEL_VERSION,
                hhi_value,
                top1,
                top3,
                score,
                roster_complete.get(franchise_id, 0.0),
            )
        )

    with conn.cursor() as cur:
        cur.execute('DELETE FROM "FragilityScore" WHERE "modelVersion" = %s', (MODEL_VERSION,))
        cur.executemany(
            """
            INSERT INTO "FragilityScore" (
                id, "franchiseId", "scoredOn", "modelVersion",
                hhi, "top1Share", "top3Share", fragility, "rosterComplete"
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )
    return len(rows)


def _roster_completeness(conn: Connection) -> dict[str, float]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute('SELECT id, "rosterComplete" FROM "Franchise"')
        return {str(row["id"]): float(row["rosterComplete"]) for row in cur.fetchall()}
