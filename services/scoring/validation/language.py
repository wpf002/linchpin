"""Does adding other Wikipedia language editions change who carries a franchise?

Two share definitions are compared inside each franchise over the scoring window:
English pageviews alone, and English plus a pinned set of other editions. The
decision rule below was written before the test was run.

Weighting editions by region was not tested. It needs a per-franchise audience
split by region, and no free source in docs/SOURCES.md provides one.
"""

from __future__ import annotations

import logging
import statistics
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Final, Literal

from psycopg import Connection
from scipy import stats

from config import get_settings
from db import connection
from ingest.http import ThrottledClient
from ingest.resolve import API_URL, MAX_TITLES_PER_QUERY
from ingest.resolve import MIN_INTERVAL_SECONDS as ACTION_API_MIN_INTERVAL
from ingest.wikimedia import fetch_pageviews, open_client
from metrics.constants import SIGNAL_SOURCE_BY_SHARE
from metrics.scoring import SCORING_WINDOW_DAYS
from metrics.shares import to_shares

logger = logging.getLogger(__name__)

#: Editions added to English in the summed definition. Pinned: the largest
#: non-English editions by pageviews.
LANGUAGE_EDITIONS: Final = ("es", "fr", "de", "ja", "pt", "ru", "it")

#: Median within-franchise rank agreement at or above this keeps English-only.
#: Written before the test was run. Do not adjust after seeing results.
LANGUAGE_AGREEMENT_FLOOR: Final = 0.90

#: Rank agreement over fewer characters than this is mostly ties and noise.
MIN_ROSTER_FOR_AGREEMENT: Final = 4

LANGLINKS_LIMIT: Final = "max"

Decision = Literal["ENGLISH_ONLY", "SUM_ALL", "INCONCLUSIVE"]


@dataclass(frozen=True, slots=True)
class FranchiseAgreement:
    franchise: str
    characters: int
    #: Spearman correlation between English-only shares and summed shares.
    rank_agreement: float
    top_character_changes: bool
    #: Fraction of summed pageviews that came from the other editions.
    other_language_fraction: float


@dataclass(frozen=True, slots=True)
class LanguageTest:
    window_start: date
    window_end: date
    editions: tuple[str, ...]
    floor: float
    franchises: list[FranchiseAgreement]
    median_rank_agreement: float | None
    top_character_changes: int
    decision: Decision


def agreement(
    franchise: str, english: Mapping[str, float], other: Mapping[str, float]
) -> FranchiseAgreement | None:
    """Compare the two share definitions for one franchise. None when not comparable."""
    characters = [key for key, value in english.items() if value > 0]
    if len(characters) < MIN_ROSTER_FOR_AGREEMENT:
        return None
    english_totals = [english[key] for key in characters]
    summed_totals = [english[key] + other.get(key, 0.0) for key in characters]
    english_shares = to_shares(english_totals)
    summed_shares = to_shares(summed_totals)
    coefficient = float(stats.spearmanr(english_shares, summed_shares).statistic)
    if coefficient != coefficient:  # NaN: every character has the same share.
        return None
    other_total = sum(summed_totals) - sum(english_totals)
    return FranchiseAgreement(
        franchise=franchise,
        characters=len(characters),
        rank_agreement=coefficient,
        top_character_changes=_argmax(english_shares) != _argmax(summed_shares),
        other_language_fraction=other_total / sum(summed_totals),
    )


def decide(rank_agreements: Sequence[float]) -> tuple[float | None, Decision]:
    if not rank_agreements:
        return None, "INCONCLUSIVE"
    median = statistics.median(rank_agreements)
    return median, "ENGLISH_ONLY" if median >= LANGUAGE_AGREEMENT_FLOOR else "SUM_ALL"


def _argmax(values: Sequence[float]) -> int:
    return max(range(len(values)), key=values.__getitem__)


def run_language_test() -> LanguageTest:
    with connection() as conn:
        window_end = _latest_wiki_day(conn)
        window_start = window_end - timedelta(days=SCORING_WINDOW_DAYS)
        rows = _english_totals(conn, window_start, window_end)

    titles = sorted({str(row["wiki_title"]) for row in rows})
    links_client = ThrottledClient(
        namespace="wikipedia-langlinks",
        min_interval_seconds=ACTION_API_MIN_INTERVAL,
        headers={"User-Agent": get_settings().wikimedia_user_agent, "Accept": "application/json"},
    )
    views_client = open_client()
    try:
        links = fetch_langlinks(titles, links_client)
        other_by_title = {
            title: _other_language_views(
                links.get(title, {}), window_start, window_end, views_client
            )
            for title in titles
        }
    finally:
        links_client.close()
        views_client.close()

    english: dict[str, dict[str, float]] = defaultdict(dict)
    other: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows:
        franchise = str(row["franchise"])
        character_id = str(row["character_id"])
        english[franchise][character_id] = float(row["total"])
        other[franchise][character_id] = other_by_title[str(row["wiki_title"])]

    compared = [
        result
        for franchise in sorted(english)
        if (result := agreement(franchise, english[franchise], other[franchise])) is not None
    ]
    median, decision = decide([result.rank_agreement for result in compared])
    return LanguageTest(
        window_start=window_start,
        window_end=window_end,
        editions=LANGUAGE_EDITIONS,
        floor=LANGUAGE_AGREEMENT_FLOOR,
        franchises=compared,
        median_rank_agreement=median,
        top_character_changes=sum(result.top_character_changes for result in compared),
        decision=decision,
    )


def fetch_langlinks(titles: Sequence[str], client: ThrottledClient) -> dict[str, dict[str, str]]:
    """English title -> {edition: title in that edition}, for the pinned editions only."""
    links: dict[str, dict[str, str]] = {title: {} for title in titles}
    by_spaced = {title.replace("_", " "): title for title in titles}
    for start in range(0, len(titles), MAX_TITLES_PER_QUERY):
        batch = titles[start : start + MAX_TITLES_PER_QUERY]
        params: dict[str, str] = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "langlinks",
            "lllimit": LANGLINKS_LIMIT,
            "titles": "|".join(batch),
        }
        while True:
            payload = client.get_json(API_URL, params)
            if not payload or payload.get("__missing__"):
                raise RuntimeError("langlinks query failed; the language test cannot run")
            query = payload.get("query", {})
            renamed = {
                str(entry["to"]): str(entry["from"]) for entry in query.get("normalized", [])
            }
            for page in query.get("pages", []):
                returned = str(page.get("title", ""))
                title = by_spaced.get(renamed.get(returned, returned).replace("_", " "))
                if title is None:
                    continue
                for link in page.get("langlinks", []):
                    if link.get("lang") in LANGUAGE_EDITIONS:
                        links[title][str(link["lang"])] = str(link["title"])
            continuation = payload.get("continue")
            if not continuation:
                break
            params = {**params, **{key: str(value) for key, value in continuation.items()}}
    return links


def _other_language_views(
    editions: Mapping[str, str], start: date, end: date, client: ThrottledClient
) -> float:
    total = 0.0
    for edition, title in editions.items():
        points = fetch_pageviews(
            title, start, end, project=f"{edition}.wikipedia.org", client=client
        )
        total += sum(point.views for point in points)
    return total


def _latest_wiki_day(conn: Connection) -> date:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT MAX("measuredOn") AS latest FROM "AttentionSignal" WHERE source = %s',
            (SIGNAL_SOURCE_BY_SHARE["wikiShare"],),
        )
        row = cur.fetchone()
    if row is None or row["latest"] is None:
        raise RuntimeError("no pageview signals in the database; run ingest first")
    return row["latest"]


def _english_totals(conn: Connection, start: date, end: date) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f."canonicalName" AS franchise,
                   c.id              AS character_id,
                   c."wikiTitle"     AS wiki_title,
                   SUM(s."rawValue") AS total
            FROM "Character" c
            JOIN "Franchise" f ON f.id = c."franchiseId"
            JOIN "AttentionSignal" s ON s."characterId" = c.id
            WHERE c."wikiTitle" IS NOT NULL
              AND s.source = %s
              AND s."measuredOn" BETWEEN %s AND %s
            GROUP BY f."canonicalName", c.id, c."wikiTitle"
            """,
            (SIGNAL_SOURCE_BY_SHARE["wikiShare"], start, end),
        )
        return list(cur.fetchall())
