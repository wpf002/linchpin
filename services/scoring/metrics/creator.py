"""Creator score: franchise persistence versus peers, across a person's completed projects.

This is the weakest component in the system. Small n per person, confounded by
budget, slot, IP strength and co-creators. Below KILL_CRITERIA["minCreatorProjects"]
completed projects no score is written at all, and every score that is written
carries the low confidence value.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Final
from uuid import uuid4

from psycopg import Connection

from metrics.constants import (
    KILL_CRITERIA,
    MODEL_VERSION,
    SCORED_WIKI_BASIS,
    SIGNAL_SOURCE_BY_SHARE,
)

#: A priori weights for how much of a franchise's persistence a role can claim.
#: Set before any creator score existed. Change them only with a MODEL_VERSION bump.
CREATOR_ROLE_WEIGHTS: Final[dict[str, float]] = {
    "SHOWRUNNER": 1.0,
    "CREATOR": 1.0,
    "WRITER": 0.6,
    "DIRECTOR": 0.6,
    "ARTIST": 0.6,
    "ACTOR": 0.5,
    "ATHLETE": 0.5,
}

#: Every creator score is low confidence. Same value the carry score uses for "low".
CREATOR_CONFIDENCE: Final = 0.5

#: A peer baseline is the median of other franchises in the medium. Fewer peers
#: than this and the baseline is one or two shows, not a baseline.
MIN_PEER_FRANCHISES: Final = 3

COMPLETED_FRANCHISE_STATUSES: Final = frozenset({"ENDED", "CANCELLED"})
COMPLETED_CHARACTER_STATUSES: Final = frozenset({"DEPARTED", "DECEASED", "RECAST"})


@dataclass(frozen=True, slots=True)
class Project:
    """One completed franchise credit for one person."""

    franchise_id: str
    role_type: str
    credit_share: float
    #: Log of mean daily franchise pageviews over the scoring window.
    persistence: float
    #: Median persistence of other franchises in the same medium.
    peer_baseline: float

    @property
    def weight(self) -> float:
        return CREATOR_ROLE_WEIGHTS[self.role_type] * self.credit_share


@dataclass(frozen=True, slots=True)
class CreatorResult:
    residual: float
    project_count: int
    confidence: float


def creator_residual(projects: Sequence[Project]) -> CreatorResult | None:
    """Weighted mean of persistence minus peer baseline. None means suppress."""
    if len(projects) < KILL_CRITERIA["minCreatorProjects"]:
        return None
    total_weight = sum(project.weight for project in projects)
    if total_weight <= 0:
        return None
    residual = (
        sum(project.weight * (project.persistence - project.peer_baseline) for project in projects)
        / total_weight
    )
    return CreatorResult(
        residual=residual, project_count=len(projects), confidence=CREATOR_CONFIDENCE
    )


def peer_baselines(persistence_by_medium: dict[str, dict[str, float]]) -> dict[str, float]:
    """Median persistence of the other franchises in each franchise's medium."""
    baselines: dict[str, float] = {}
    for franchises in persistence_by_medium.values():
        for franchise_id in franchises:
            peers = [value for other, value in franchises.items() if other != franchise_id]
            if len(peers) >= MIN_PEER_FRANCHISES:
                baselines[franchise_id] = statistics.median(peers)
    return baselines


def run_creator_scoring(conn: Connection, window_start: date, window_end: date) -> int:
    """Replace this model version's creator scores. Returns the number written."""
    persistence = _franchise_persistence(conn, window_start, window_end)
    flat = {fid: value for franchises in persistence.values() for fid, value in franchises.items()}
    baselines = peer_baselines(persistence)

    rows = []
    for person_id, projects in _load_projects(conn, flat, baselines).items():
        result = creator_residual(projects)
        if result is None:
            continue
        rows.append(
            (
                str(uuid4()),
                person_id,
                MODEL_VERSION,
                window_end,
                result.residual,
                result.project_count,
                result.confidence,
            )
        )

    with conn.cursor() as cur:
        cur.execute('DELETE FROM "CreatorScore" WHERE "modelVersion" = %s', (MODEL_VERSION,))
        if rows:
            cur.executemany(
                """
                INSERT INTO "CreatorScore" (
                    id, "personId", "modelVersion", "scoredOn", residual, "projectCount", confidence
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                rows,
            )
    return len(rows)


def _franchise_persistence(
    conn: Connection, window_start: date, window_end: date
) -> dict[str, dict[str, float]]:
    """medium -> franchise id -> log mean daily pageviews."""
    days = (window_end - window_start).days + 1
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id AS franchise_id, f.medium::text AS medium, SUM(s."rawValue") AS total
            FROM "AttentionSignal" s
            JOIN "Character" c ON c.id = s."characterId"
            JOIN "Franchise" f ON f.id = c."franchiseId"
            WHERE s.source = %s AND s."measuredOn" BETWEEN %s AND %s
              AND c."wikiBasis" = %s
            GROUP BY f.id, f.medium
            """,
            (SIGNAL_SOURCE_BY_SHARE["wikiShare"], window_start, window_end, SCORED_WIKI_BASIS),
        )
        rows = cur.fetchall()
    by_medium: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows:
        total = float(row["total"] or 0.0)
        if total > 0:
            by_medium[str(row["medium"])][str(row["franchise_id"])] = math.log(total / days)
    return by_medium


def _load_projects(
    conn: Connection, persistence: dict[str, float], baselines: dict[str, float]
) -> dict[str, list[Project]]:
    """Completed projects per person, one per franchise, keeping the heaviest credit."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pl."personId"        AS person_id,
                   pl."franchiseId"     AS franchise_id,
                   pl."roleType"::text  AS role_type,
                   COALESCE(pl."creditShare", cs."wikiShare") AS credit_share,
                   f.status::text       AS franchise_status,
                   c.status::text       AS character_status
            FROM "PersonLink" pl
            JOIN "Franchise" f ON f.id = pl."franchiseId"
            LEFT JOIN "Character" c ON c.id = pl."characterId"
            LEFT JOIN "CarryScore" cs
                   ON cs."characterId" = pl."characterId" AND cs."modelVersion" = %s
            """,
            (MODEL_VERSION,),
        )
        rows = cur.fetchall()

    heaviest: dict[tuple[str, str], Project] = {}
    for row in rows:
        franchise_id = str(row["franchise_id"])
        completed = (
            row["franchise_status"] in COMPLETED_FRANCHISE_STATUSES
            or row["character_status"] in COMPLETED_CHARACTER_STATUSES
        )
        # A credit with no share, or a franchise with no peers, cannot be weighted
        # or compared. It is left out of the count rather than given a default.
        if (
            not completed
            or row["credit_share"] is None
            or franchise_id not in persistence
            or franchise_id not in baselines
        ):
            continue
        project = Project(
            franchise_id=franchise_id,
            role_type=str(row["role_type"]),
            credit_share=float(row["credit_share"]),
            persistence=persistence[franchise_id],
            peer_baseline=baselines[franchise_id],
        )
        key = (str(row["person_id"]), franchise_id)
        if key not in heaviest or project.weight > heaviest[key].weight:
            heaviest[key] = project

    by_person: dict[str, list[Project]] = defaultdict(list)
    for (person_id, _), project in heaviest.items():
        by_person[person_id].append(project)
    return by_person
