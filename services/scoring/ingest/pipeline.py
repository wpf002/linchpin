"""Ingest orchestrator: corpus -> catalogue -> Wikipedia -> database.

Order matters. Rosters and release calendars are established first, because
off-cycle classification of every pageview depends on the release calendar, and
a character we cannot resolve to an article must still count against the
franchise's rosterComplete rather than quietly disappearing.

Pageviews are only fetched for date ranges the model actually uses: the current
scoring window, plus an event window around each exit event. Wikimedia's daily
pageview API has no data before 2015-07-01, so earlier events are recorded but
carry no signal.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta

from psycopg import Connection

from config import get_settings
from db import connection
from ingest import repository
from ingest.corpus import CorpusExitEvent, CorpusFranchise, load_exit_events, load_franchises
from ingest.http import ThrottledClient
from ingest.names import find, matches
from ingest.repository import ReleaseRow
from ingest.resolve import MIN_INTERVAL_SECONDS as RESOLVE_MIN_INTERVAL
from ingest.resolve import resolve_roster
from ingest.roster import cap_roster
from ingest.tmdb import CastMember, ReleaseRecord, fetch_tv_cast, fetch_tv_releases, search_tv
from ingest.tvmaze import (
    TvMazeCastEntry,
    fetch_cast,
    fetch_episode_dates,
    search_show,
)
from ingest.wikimedia import fetch_pageviews
from metrics.constants import EVENT_WINDOWS
from metrics.windows import is_off_cycle

logger = logging.getLogger(__name__)

#: Wikimedia's pageview API has no daily data before this date.
PAGEVIEW_EPOCH = date(2015, 7, 1)

#: Length of the trailing window used for current carry scores and fragility.
SCORING_WINDOW_DAYS = 365

#: Pageviews lag by a day or two; ask for data up to here, not up to today.
PAGEVIEW_LAG_DAYS = 2

TV_MEDIA = frozenset({"TV", "ANIMATION"})

#: Billing order given to a TMDB credit that has none, so it sorts after billed ones.
_UNBILLED_ORDER = 10_000
_STATUS_BY_TVMAZE = {
    "Running": "ACTIVE",
    "To Be Determined": "HIATUS",
    "In Development": "ANNOUNCED",
    "Ended": "ENDED",
}


@dataclass(slots=True)
class FranchiseOutcome:
    canonical_name: str
    franchise_id: str | None = None
    roster_size: int = 0
    resolved: int = 0
    signal_rows: int = 0
    releases: int = 0
    skipped_reason: str | None = None

    @property
    def roster_complete(self) -> float:
        return self.resolved / self.roster_size if self.roster_size else 0.0


@dataclass(slots=True)
class IngestReport:
    franchises: list[FranchiseOutcome] = field(default_factory=list)
    exit_events_written: int = 0
    exit_events_unmatched: list[str] = field(default_factory=list)

    @property
    def signal_rows(self) -> int:
        return sum(f.signal_rows for f in self.franchises)


def run_ingest(*, only: list[str] | None = None, skip_signals: bool = False) -> IngestReport:
    settings = get_settings()
    report = IngestReport()
    franchises = [f for f in load_franchises() if only is None or f.canonical_name in only]
    events = load_exit_events()
    # Every franchise needs every event window: a franchise serves as a control
    # for other franchises' exits, and a control without pageviews in the
    # treated window cannot produce a difference-in-differences estimate.
    signal_ranges = _signal_ranges(list(events))

    wiki_client = ThrottledClient(
        namespace="wikipedia-summary",
        min_interval_seconds=RESOLVE_MIN_INTERVAL,
        headers={"User-Agent": settings.wikimedia_user_agent, "Accept": "application/json"},
    )
    character_ids: dict[tuple[str, str], str] = {}

    try:
        with connection() as conn:
            for corpus_franchise in franchises:
                outcome = _ingest_franchise(
                    conn,
                    corpus_franchise,
                    signal_ranges=signal_ranges,
                    wiki_client=wiki_client,
                    skip_signals=skip_signals,
                    character_ids=character_ids,
                )
                # Commit per franchise: a failure on franchise 39 must not discard
                # the 38 already written.
                conn.commit()
                report.franchises.append(outcome)
                logger.info(
                    "%s: %d/%d resolved, %d signal rows",
                    outcome.canonical_name,
                    outcome.resolved,
                    outcome.roster_size,
                    outcome.signal_rows,
                )
            ingested = {f.canonical_name for f in franchises}
            scoped = tuple(e for e in events if e.franchise in ingested)
            _write_exit_events(conn, scoped, character_ids, report)
    finally:
        wiki_client.close()

    return report


def _ingest_franchise(
    conn: Connection,
    corpus_franchise: CorpusFranchise,
    *,
    signal_ranges: list[tuple[date, date]],
    wiki_client: ThrottledClient,
    skip_signals: bool,
    character_ids: dict[tuple[str, str], str],
) -> FranchiseOutcome:
    outcome = FranchiseOutcome(canonical_name=corpus_franchise.canonical_name)

    described = _describe(corpus_franchise)
    if described.roster is None:
        outcome.skipped_reason = "no catalogue match"
        return outcome
    roster = described.roster

    franchise_id = repository.upsert_franchise(
        conn,
        canonical_name=corpus_franchise.canonical_name,
        medium=corpus_franchise.medium,
        status=described.status,
        genres=described.genres,
        primary_subs=corpus_franchise.primary_subs,
        first_release=described.first_release,
        wiki_title=None,
        tmdb_id=described.tmdb_id,
    )
    outcome.franchise_id = franchise_id
    outcome.releases = repository.replace_releases(conn, franchise_id, described.releases)
    outcome.roster_size = len(roster)

    release_dates = sorted(row.released_on for row in described.releases)

    # One batched Action API query for the whole roster: ~2 requests instead of
    # one per candidate title.
    pending = [(e.character_name, e.person_name) for e in roster if e.wiki_title is None]
    resolutions = (
        resolve_roster(
            characters=pending,
            franchise_name=corpus_franchise.canonical_name,
            client=wiki_client,
        )
        if pending
        else {}
    )

    for entry in roster:
        character_id = repository.upsert_character(
            conn,
            franchise_id=franchise_id,
            canonical_name=entry.character_name,
            aliases=[],
            wiki_title=entry.wiki_title,
        )
        character_ids[(corpus_franchise.canonical_name, entry.character_name)] = character_id

        if entry.person_name:
            person_id = repository.upsert_person(
                conn, canonical_name=entry.person_name, role_type=entry.role_type
            )
            repository.upsert_person_link(
                conn,
                person_id=person_id,
                character_id=character_id,
                franchise_id=franchise_id,
                role_type=entry.role_type,
                billing_order=entry.billing_order,
            )

        wiki_title = entry.wiki_title
        if wiki_title is None:
            resolution = resolutions.get(entry.character_name)
            wiki_title = resolution.title if resolution else None
            if wiki_title is None:
                logger.info(
                    "unresolved: %s / %s (%s)",
                    corpus_franchise.canonical_name,
                    entry.character_name,
                    resolution.reason if resolution else "not resolved",
                )
                continue
            repository.upsert_character(
                conn,
                franchise_id=franchise_id,
                canonical_name=entry.character_name,
                aliases=[],
                wiki_title=wiki_title,
            )

        outcome.resolved += 1
        if not skip_signals:
            outcome.signal_rows += _ingest_pageviews(
                conn, character_id, wiki_title, signal_ranges, release_dates
            )

    repository.set_roster_complete(conn, franchise_id, outcome.roster_complete)
    return outcome


@dataclass(frozen=True, slots=True)
class _RosterEntry:
    character_name: str
    person_name: str | None
    billing_order: int
    role_type: str
    wiki_title: str | None


@dataclass(frozen=True, slots=True)
class _Description:
    """What the catalogues say about one franchise. roster is None when nothing matched."""

    roster: list[_RosterEntry] | None
    releases: list[ReleaseRow]
    genres: list[str]
    first_release: date | None
    status: str
    tmdb_id: int | None = None


def _describe(corpus_franchise: CorpusFranchise) -> _Description:
    """Roster, releases, genres, first release and status for one franchise."""
    if not corpus_franchise.uses_catalogue:
        roster = [
            _RosterEntry(
                character_name=row.name,
                person_name=row.creator,
                billing_order=row.billing_order,
                role_type="CREATOR",
                wiki_title=row.wiki_title,
            )
            for row in cap_roster(
                corpus_franchise.roster,
                corpus_franchise.medium,
                billing_order=lambda row: row.billing_order,
                appearances=lambda row: row.appearances,
            )
        ]
        return _Description(
            roster=roster,
            releases=[],
            genres=corpus_franchise.genres,
            first_release=corpus_franchise.first_release,
            status=corpus_franchise.status or "ACTIVE",
        )

    show = search_show(corpus_franchise.query_name)
    tmdb_id = _tmdb_id_for(corpus_franchise.query_name)

    roster = []
    releases: list[ReleaseRow] = []
    if show is not None:
        cast = cap_roster(
            fetch_cast(show.tvmaze_id),
            corpus_franchise.medium,
            billing_order=lambda member: member.billing_order,
        )
        roster = [
            _RosterEntry(
                character_name=member.character_name,
                person_name=member.person_name,
                billing_order=member.billing_order,
                role_type="ACTOR",
                wiki_title=None,
            )
            for member in _dedupe_cast(cast)
        ]
        releases = [
            ReleaseRow(title=f"{corpus_franchise.canonical_name} episode", released_on=day)
            for day in fetch_episode_dates(show.tvmaze_id)
        ]

    # TMDB fills only what TVmaze left empty, so existing rosters do not move.
    if not roster and tmdb_id is not None:
        roster = tmdb_roster(fetch_tv_cast(tmdb_id), corpus_franchise.medium)
        if roster:
            logger.info("%s: roster from TMDB %d", corpus_franchise.canonical_name, tmdb_id)
    if not releases and tmdb_id is not None:
        releases = tmdb_release_rows(fetch_tv_releases(tmdb_id))

    if not roster:
        return _Description(None, [], [], None, "ACTIVE", tmdb_id)
    if show is not None:
        status = _STATUS_BY_TVMAZE.get(show.status, "ACTIVE")
        return _Description(roster, releases, show.genres, show.premiered, status, tmdb_id)
    first_release = min((row.released_on for row in releases), default=None)
    return _Description(roster, releases, [], first_release, "ACTIVE", tmdb_id)


def _tmdb_id_for(name: str) -> int | None:
    if not get_settings().tmdb_api_key:
        return None
    return search_tv(name)


def tmdb_roster(cast: list[CastMember], medium: str) -> list[_RosterEntry]:
    """TMDB aggregate credits as roster entries, capped like a TVmaze cast.

    Credits without a billing order sort last. One row per character name; a
    recast character keeps its first credit.
    """
    capped = cap_roster(
        cast,
        medium,
        billing_order=lambda member: (
            member.billing_order if member.billing_order is not None else _UNBILLED_ORDER
        ),
        appearances=lambda member: member.episode_count,
    )
    seen: list[str] = []
    roster: list[_RosterEntry] = []
    for index, member in enumerate(capped):
        if any(matches(member.character_name, name) for name in seen):
            continue
        seen.append(member.character_name)
        roster.append(
            _RosterEntry(
                character_name=member.character_name,
                person_name=member.person_name or None,
                billing_order=member.billing_order if member.billing_order is not None else index,
                role_type="ACTOR",
                wiki_title=None,
            )
        )
    return roster


def tmdb_release_rows(records: list[ReleaseRecord]) -> list[ReleaseRow]:
    return [
        ReleaseRow(
            title=record.title,
            released_on=record.released_on,
            season_no=record.season_no,
            episode_no=record.episode_no,
        )
        for record in records
    ]


def _dedupe_cast(cast: list[TvMazeCastEntry]) -> list[TvMazeCastEntry]:
    """One row per character. A recast character appears twice in TVMaze; keep the first."""
    seen: list[str] = []
    kept: list[TvMazeCastEntry] = []
    for member in cast:
        if any(matches(member.character_name, name) for name in seen):
            continue
        seen.append(member.character_name)
        kept.append(member)
    return kept


def _signal_ranges(events: list[CorpusExitEvent]) -> list[tuple[date, date]]:
    """Merged date ranges worth fetching: the scoring window plus each event window."""
    today = date.today() - timedelta(days=PAGEVIEW_LAG_DAYS)
    ranges = [(today - timedelta(days=SCORING_WINDOW_DAYS), today)]
    for event in events:
        start = event.event_date + timedelta(days=EVENT_WINDOWS["preStart"])
        end = event.event_date + timedelta(days=EVENT_WINDOWS["postEnd"])
        ranges.append((max(start, PAGEVIEW_EPOCH), min(end, today)))
    return _merge(sorted(r for r in ranges if r[0] <= r[1] and r[1] >= PAGEVIEW_EPOCH))


def _merge(ranges: list[tuple[date, date]]) -> list[tuple[date, date]]:
    merged: list[tuple[date, date]] = []
    for start, end in ranges:
        if merged and start <= merged[-1][1] + timedelta(days=1):
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def _ingest_pageviews(
    conn: Connection,
    character_id: str,
    wiki_title: str,
    ranges: list[tuple[date, date]],
    release_dates: list[date],
) -> int:
    written = 0
    for start, end in ranges:
        points = fetch_pageviews(wiki_title, max(start, PAGEVIEW_EPOCH), end)
        rows = [
            (point.measured_on, float(point.views), is_off_cycle(point.measured_on, release_dates))
            for point in points
        ]
        written += repository.insert_signals(conn, character_id, "WIKI", rows)
    return written


def _write_exit_events(
    conn: Connection,
    events: tuple[CorpusExitEvent, ...],
    character_ids: dict[tuple[str, str], str],
    report: IngestReport,
) -> None:
    by_franchise: dict[str, list[str]] = {}
    for franchise_name, character_name in character_ids:
        by_franchise.setdefault(franchise_name, []).append(character_name)

    for event in events:
        pool = by_franchise.get(event.franchise)
        if pool is None:
            report.exit_events_unmatched.append(
                f"{event.franchise} / {event.character} (no roster)"
            )
            continue
        matched = find(event.match_names, pool)
        if matched is None:
            report.exit_events_unmatched.append(f"{event.franchise} / {event.character}")
            continue
        character_id = character_ids[(event.franchise, matched)]
        franchise_id = _franchise_id_of(conn, character_id)
        person_id = repository.upsert_person(
            conn, canonical_name=event.person, role_type=_role_for(event.exit_type)
        )
        repository.upsert_exit_event(
            conn,
            franchise_id=franchise_id,
            character_id=character_id,
            person_id=person_id,
            exit_type=event.exit_type,
            event_date=event.event_date,
            announced_date=event.announced_date,
            source_url=event.source_url,
            verified=event.verified,
            notes=event.notes,
        )
        repository.set_character_status(conn, character_id, _status_for(event.exit_type))
        report.exit_events_written += 1


def _franchise_id_of(conn: Connection, character_id: str) -> str:
    with conn.cursor() as cur:
        cur.execute('SELECT "franchiseId" FROM "Character" WHERE id = %s', (character_id,))
        row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"character {character_id} vanished mid-ingest")
    return str(row["franchiseId"])


def _role_for(exit_type: str) -> str:
    return "CREATOR" if exit_type in {"SHOWRUNNER_EXIT", "CREATIVE_TEAM_CHANGE"} else "ACTOR"


def _status_for(exit_type: str) -> str:
    if exit_type == "CHARACTER_DEATH":
        return "DECEASED"
    if exit_type == "RECAST":
        return "RECAST"
    return "DEPARTED"
