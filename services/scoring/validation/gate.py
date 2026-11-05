"""The Phase 2 validation gate.

Runs the event study over every exit event, compares carry-score ranking against
the billing-order baseline, then evaluates the kill criteria written before any
result was seen. A FAIL is a deliverable: it is recorded with its failures and
reported, not retried with different weights.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from uuid import uuid4

from psycopg import Connection

from db import connection
from ingest.repository import now_utc
from metrics.constants import EVENT_WINDOWS, KILL_CRITERIA, MODEL_VERSION
from validation import controls as control_matching
from validation import did
from validation.rank_ic import RankIC, rank_ic

logger = logging.getLogger(__name__)

PRE_WINDOW_DAYS = abs(EVENT_WINDOWS["preStart"])
POST_WINDOW_DAYS = EVENT_WINDOWS["postEnd"]

#: Events announced ahead of the exit leak into the pre-window. They are analysed
#: as their own stratum rather than mixed into the headline estimate.
ANNOUNCEMENT_LEAK_DAYS = 14


@dataclass(frozen=True, slots=True)
class Failure:
    """One unmet kill criterion. criterion names the KILL_CRITERIA key it breaks."""

    criterion: str
    detail: str


@dataclass(frozen=True, slots=True)
class EventRow:
    exit_event_id: str
    franchise_id: str
    character_id: str | None
    event_date: date
    verified: bool
    announced: bool
    pre_carry: float | None
    billing_order: int | None


@dataclass(slots=True)
class ValidationResult:
    gate: str
    event_count: int
    verified_event_count: int
    studied_event_count: int
    rank_ic: RankIC
    baseline_rank_ic: RankIC
    median_roster_complete: float | None
    failures: list[Failure] = field(default_factory=list)
    notes: str | None = None


def run_validation() -> ValidationResult:
    with connection() as conn:
        events = _load_events(conn)
        profiles = control_matching.load_profiles(conn)
        shocked = control_matching.load_shocked_franchises(conn)
        studies = _run_event_studies(conn, events, profiles, shocked)
        median_roster = _median_roster_complete(conn)
        result = _evaluate(events, studies, median_roster)
        _record(conn, result)
    return result


@dataclass(frozen=True, slots=True)
class _Study:
    event: EventRow
    estimate: did.DidEstimate
    control_set_id: str


def _load_events(conn: Connection) -> list[EventRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id,
                   e."franchiseId",
                   e."characterId",
                   e."eventDate",
                   e."announcedDate",
                   e.verified,
                   cs."carryScore"    AS pre_carry,
                   pl."billingOrder"  AS billing_order
            FROM "ExitEvent" e
            LEFT JOIN LATERAL (
                SELECT c."carryScore"
                FROM "CarryScore" c
                WHERE c."characterId" = e."characterId"
                  AND c."modelVersion" = %s
                ORDER BY c."windowEnd" DESC
                LIMIT 1
            ) cs ON TRUE
            LEFT JOIN LATERAL (
                SELECT l."billingOrder"
                FROM "PersonLink" l
                WHERE l."characterId" = e."characterId"
                ORDER BY l."billingOrder" ASC
                LIMIT 1
            ) pl ON TRUE
            ORDER BY e."eventDate"
            """,
            (MODEL_VERSION,),
        )
        rows = cur.fetchall()

    return [
        EventRow(
            exit_event_id=str(row["id"]),
            franchise_id=str(row["franchiseId"]),
            character_id=str(row["characterId"]) if row["characterId"] else None,
            event_date=row["eventDate"],
            verified=bool(row["verified"]),
            announced=_is_announced(row["announcedDate"], row["eventDate"]),
            pre_carry=float(row["pre_carry"]) if row["pre_carry"] is not None else None,
            billing_order=int(row["billing_order"]) if row["billing_order"] is not None else None,
        )
        for row in rows
    ]


def _is_announced(announced_date: date | None, event_date: date) -> bool:
    if announced_date is None:
        return False
    return (event_date - announced_date).days >= ANNOUNCEMENT_LEAK_DAYS


def _run_event_studies(
    conn: Connection,
    events: list[EventRow],
    profiles: dict[str, control_matching.FranchiseProfile],
    shocked: list[tuple[str, date]],
) -> list[_Study]:
    studies: list[_Study] = []
    for event in events:
        treated_profile = profiles.get(event.franchise_id)
        if treated_profile is None:
            continue
        control_set = control_matching.build_control_set(
            treated=treated_profile,
            event_date=event.event_date,
            profiles=profiles,
            shocked=shocked,
        )
        if not control_set.franchise_ids:
            logger.info(
                "no control set for %s on %s (%s)",
                treated_profile.canonical_name,
                event.event_date,
                control_set.reason,
            )
            continue

        start = event.event_date - timedelta(days=PRE_WINDOW_DAYS)
        end = event.event_date + timedelta(days=POST_WINDOW_DAYS)
        series = did.franchise_daily_totals(
            conn, [event.franchise_id, *control_set.franchise_ids], start, end
        )
        treated_series = series.get(event.franchise_id, {})
        control_series = [
            series[franchise_id]
            for franchise_id in control_set.franchise_ids
            if franchise_id in series
        ]
        estimate = did.estimate(
            event_date=event.event_date,
            treated=treated_series,
            controls=control_series,
        )
        control_set_id = _write_control_set(conn, event.exit_event_id, control_set)
        if not estimate.usable:
            logger.info(
                "no usable estimate for %s on %s (%s)",
                treated_profile.canonical_name,
                event.event_date,
                estimate.reason,
            )
            continue
        _write_event_study(conn, event, estimate, control_set_id)
        studies.append(_Study(event=event, estimate=estimate, control_set_id=control_set_id))
    return studies


def _write_control_set(
    conn: Connection, exit_event_id: str, control_set: control_matching.ControlSet
) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "ControlSet" (id, "exitEventId", "franchiseIds", "matchedOn", "createdAt")
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                str(uuid4()),
                exit_event_id,
                list(control_set.franchise_ids),
                list(control_set.matched_on),
                now_utc(),
            ),
        )
        row = cur.fetchone()
    assert row is not None
    return str(row["id"])


def _write_event_study(
    conn: Connection, event: EventRow, estimate: did.DidEstimate, control_set_id: str
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "EventStudy" (
                id, "exitEventId", "controlSetId", "preMean", "postMean",
                "controlPre", "controlPost", "didEstimate", "stdError",
                "preCarryScore", "baselineRank", announced, split, "modelVersion", "runAt"
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("exitEventId", "modelVersion") DO UPDATE SET
                "controlSetId" = EXCLUDED."controlSetId",
                "preMean" = EXCLUDED."preMean",
                "postMean" = EXCLUDED."postMean",
                "controlPre" = EXCLUDED."controlPre",
                "controlPost" = EXCLUDED."controlPost",
                "didEstimate" = EXCLUDED."didEstimate",
                "stdError" = EXCLUDED."stdError",
                "preCarryScore" = EXCLUDED."preCarryScore",
                "baselineRank" = EXCLUDED."baselineRank",
                announced = EXCLUDED.announced,
                "runAt" = EXCLUDED."runAt"
            """,
            (
                str(uuid4()),
                event.exit_event_id,
                control_set_id,
                estimate.pre_mean,
                estimate.post_mean,
                estimate.control_pre,
                estimate.control_post,
                estimate.estimate,
                estimate.std_error,
                event.pre_carry or 0.0,
                event.billing_order,
                event.announced,
                "test",
                MODEL_VERSION,
                now_utc(),
            ),
        )


def _median_roster_complete(conn: Connection) -> float | None:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "rosterComplete") AS median'
            ' FROM "Franchise" WHERE "rosterComplete" IS NOT NULL'
        )
        row = cur.fetchone()
    if row is None or row["median"] is None:
        return None
    return float(row["median"])


def _evaluate(
    events: list[EventRow], studies: list[_Study], median_roster: float | None
) -> ValidationResult:
    # A fall in attention is a negative DiD estimate, so the predicted direction
    # is "higher carry score -> more negative estimate". Sign-flip the outcome so
    # a positive rank IC means the model ranked correctly.
    scored = [
        study
        for study in studies
        if study.event.pre_carry is not None and not study.event.announced
    ]
    carry_ic = rank_ic(
        [study.event.pre_carry or 0.0 for study in scored],
        [-study.estimate.estimate for study in scored],
    )
    with_billing = [study for study in scored if study.event.billing_order is not None]
    baseline_ic = rank_ic(
        # Billing order 1 is the lead, so invert it into a "bigger means more
        # important" predictor before correlating.
        [-(study.event.billing_order or 0) for study in with_billing],
        [-study.estimate.estimate for study in with_billing],
    )

    verified = [event for event in events if event.verified]
    failures: list[Failure] = []

    if len(verified) < KILL_CRITERIA["minExitEvents"]:
        failures.append(
            Failure(
                "minExitEvents",
                f"verified exit events {len(verified)} < {int(KILL_CRITERIA['minExitEvents'])}",
            )
        )
    if median_roster is None:
        failures.append(
            Failure("minRosterCompleteness", "no franchise has a roster completeness figure")
        )
    elif median_roster < KILL_CRITERIA["minRosterCompleteness"]:
        failures.append(
            Failure(
                "minRosterCompleteness",
                f"median roster completeness {median_roster:.2f}"
                f" < {KILL_CRITERIA['minRosterCompleteness']}",
            )
        )
    if carry_ic.coefficient is None:
        failures.append(Failure("minRankIC", f"rank IC not computable: {carry_ic.reason}"))
    else:
        if carry_ic.coefficient < KILL_CRITERIA["minRankIC"]:
            failures.append(
                Failure(
                    "minRankIC",
                    f"rank IC {carry_ic.coefficient:.3f} < {KILL_CRITERIA['minRankIC']}",
                )
            )
        if carry_ic.lower is not None and carry_ic.lower <= 0:
            failures.append(
                Failure(
                    "rankICInterval",
                    f"rank IC lower bound {carry_ic.lower:.3f} does not exclude zero",
                )
            )
        if baseline_ic.coefficient is not None and carry_ic.coefficient <= baseline_ic.coefficient:
            failures.append(
                Failure(
                    "beatsBaseline",
                    f"rank IC {carry_ic.coefficient:.3f} does not beat the billing-order"
                    f" baseline {baseline_ic.coefficient:.3f}",
                )
            )

    gate = "BLOCKED" if _is_blocked(events, studies) else ("FAIL" if failures else "PASS")
    return ValidationResult(
        gate=gate,
        event_count=len(events),
        verified_event_count=len(verified),
        studied_event_count=len(studies),
        rank_ic=carry_ic,
        baseline_rank_ic=baseline_ic,
        median_roster_complete=median_roster,
        failures=failures,
        notes=_notes(events, studies),
    )


def _is_blocked(events: list[EventRow], studies: list[_Study]) -> bool:
    """BLOCKED means the test could not be run, which is different from failing it."""
    return not events or not studies


def _notes(events: list[EventRow], studies: list[_Study]) -> str:
    return (
        f"{len(studies)} of {len(events)} exit events produced a usable"
        " difference-in-differences estimate; the rest lacked pageview coverage"
        " or a comparable control set."
    )


def _record(conn: Connection, result: ValidationResult) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "ValidationRun" (
                id, "modelVersion", "runAt", "eventCount", "verifiedEventCount",
                "rankIC", "rankICLower", "rankICUpper",
                "baselineRankIC", "baselineLower", "baselineUpper",
                "medianRosterComplete", gate, failures, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid4()),
                MODEL_VERSION,
                now_utc(),
                result.event_count,
                result.verified_event_count,
                result.rank_ic.coefficient,
                result.rank_ic.lower,
                result.rank_ic.upper,
                result.baseline_rank_ic.coefficient,
                result.baseline_rank_ic.lower,
                result.baseline_rank_ic.upper,
                result.median_roster_complete,
                result.gate,
                json.dumps([asdict(failure) for failure in result.failures]),
                result.notes,
            ),
        )
