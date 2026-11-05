"""Pick control franchises for an exit event.

Matching is on observable, pre-event traits only: medium, genre overlap, roster
size, and franchise age at the event date. A control must have no exit event of
its own inside the study window, otherwise its post-window carries another
shock and the difference-in-differences estimate absorbs it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from psycopg import Connection

from metrics.constants import EVENT_WINDOWS

#: Controls must be comparably sized. A 4-hander is not a control for an ensemble.
ROSTER_TOLERANCE = 0.5

#: Franchise age in years, at the event date.
AGE_TOLERANCE_YEARS = 8.0

MIN_CONTROLS = 2
MAX_CONTROLS = 8

_WINDOW_PAD = timedelta(days=abs(EVENT_WINDOWS["preStart"]) + EVENT_WINDOWS["postEnd"])


@dataclass(frozen=True, slots=True)
class FranchiseProfile:
    franchise_id: str
    canonical_name: str
    medium: str
    genres: frozenset[str]
    first_release: date | None
    roster_size: int


@dataclass(frozen=True, slots=True)
class ControlSet:
    franchise_ids: tuple[str, ...]
    matched_on: tuple[str, ...]
    reason: str | None = None


def load_profiles(conn: Connection) -> dict[str, FranchiseProfile]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id,
                   f."canonicalName",
                   f.medium::text AS medium,
                   f.genres,
                   f."firstRelease",
                   COUNT(c.id) AS roster_size
            FROM "Franchise" f
            LEFT JOIN "Character" c ON c."franchiseId" = f.id
            GROUP BY f.id, f."canonicalName", f.medium, f.genres, f."firstRelease"
            """
        )
        rows = cur.fetchall()
    return {
        str(row["id"]): FranchiseProfile(
            franchise_id=str(row["id"]),
            canonical_name=str(row["canonicalName"]),
            medium=str(row["medium"]),
            genres=frozenset(row["genres"] or ()),
            first_release=as_date(row["firstRelease"]),
            roster_size=int(row["roster_size"]),
        )
        for row in rows
    }


def load_shocked_franchises(conn: Connection) -> list[tuple[str, date]]:
    """(franchiseId, eventDate) for every exit event, used to disqualify controls."""
    with conn.cursor() as cur:
        cur.execute('SELECT "franchiseId", "eventDate" FROM "ExitEvent"')
        return [(str(row["franchiseId"]), row["eventDate"]) for row in cur.fetchall()]


def build_control_set(
    *,
    treated: FranchiseProfile,
    event_date: date,
    profiles: dict[str, FranchiseProfile],
    shocked: list[tuple[str, date]],
) -> ControlSet:
    matched_on = ("medium", "genreOverlap", "rosterSize", "franchiseAge")
    candidates: list[tuple[float, str]] = []

    for profile in profiles.values():
        if profile.franchise_id == treated.franchise_id:
            continue
        if profile.medium != treated.medium:
            continue
        if not _roster_comparable(profile.roster_size, treated.roster_size):
            continue
        if not _age_comparable(profile.first_release, treated.first_release, event_date):
            continue
        if _has_own_shock(profile.franchise_id, event_date, shocked):
            continue
        overlap = _genre_overlap(profile.genres, treated.genres)
        if overlap <= 0 and treated.genres:
            continue
        candidates.append((-overlap, profile.franchise_id))

    if len(candidates) < MIN_CONTROLS:
        return ControlSet((), matched_on, reason="fewer than two comparable controls")

    candidates.sort()
    chosen = tuple(franchise_id for _, franchise_id in candidates[:MAX_CONTROLS])
    return ControlSet(chosen, matched_on)


def as_date(value: date | datetime | None) -> date | None:
    """firstRelease is a timestamp column; date arithmetic against event dates needs a date."""
    if isinstance(value, datetime):
        return value.date()
    return value


def _roster_comparable(candidate: int, treated: int) -> bool:
    if treated == 0:
        return False
    ratio = candidate / treated
    return (1 - ROSTER_TOLERANCE) <= ratio <= (1 + ROSTER_TOLERANCE)


def _age_comparable(candidate: date | None, treated: date | None, event_date: date) -> bool:
    if candidate is None or treated is None:
        # Undated franchises are excluded rather than assumed comparable.
        return False
    candidate_age = (event_date - candidate).days / 365.25
    treated_age = (event_date - treated).days / 365.25
    if candidate_age < 0:
        return False
    return abs(candidate_age - treated_age) <= AGE_TOLERANCE_YEARS


def _genre_overlap(candidate: frozenset[str], treated: frozenset[str]) -> float:
    if not treated or not candidate:
        return 0.0
    return len(candidate & treated) / len(candidate | treated)


def _has_own_shock(franchise_id: str, event_date: date, shocked: list[tuple[str, date]]) -> bool:
    return any(
        other_id == franchise_id and abs(other_date - event_date) <= _WINDOW_PAD
        for other_id, other_date in shocked
    )
