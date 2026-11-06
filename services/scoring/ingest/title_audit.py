"""Re-check every stored character-to-article link against the current rules.

The resolver's acceptance rules have been tightened since some links were
written. A link that no longer passes is carrying another subject's pageviews,
so the audit can clear it together with the signals read through it. Hand-listed
rosters are skipped: a person chose those titles.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from psycopg import Connection
from psycopg.rows import dict_row

from config import get_settings
from db import connection
from ingest import repository
from ingest.corpus import load_franchises
from ingest.http import ThrottledClient
from ingest.resolve import MIN_INTERVAL_SECONDS, TitleClaim, verify_titles

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class StoredLink:
    character_id: str
    claim: TitleClaim


@dataclass(frozen=True, slots=True)
class RejectedLink:
    link: StoredLink
    reason: str


@dataclass(slots=True)
class TitleAuditReport:
    checked: int = 0
    unchecked: int = 0
    rejected: list[RejectedLink] = field(default_factory=list)
    signal_rows_removed: int = 0

    @property
    def franchises(self) -> list[str]:
        return sorted({item.link.claim.franchise_name for item in self.rejected})


def run_title_audit(*, write: bool) -> TitleAuditReport:
    settings = get_settings()
    catalogue_franchises = [f.canonical_name for f in load_franchises() if f.uses_catalogue]
    client = ThrottledClient(
        namespace="wikipedia-summary",
        min_interval_seconds=MIN_INTERVAL_SECONDS,
        headers={"User-Agent": settings.wikimedia_user_agent, "Accept": "application/json"},
    )
    report = TitleAuditReport()
    try:
        with connection() as conn:
            links = _stored_links(conn, catalogue_franchises)
            verdicts = verify_titles([link.claim for link in links], client)
            for link, verdict in zip(links, verdicts, strict=True):
                if verdict.status == "unchecked":
                    report.unchecked += 1
                    continue
                report.checked += 1
                if verdict.status == "rejected":
                    report.rejected.append(RejectedLink(link, verdict.reason))
            if write:
                for item in report.rejected:
                    report.signal_rows_removed += repository.clear_wiki_link(
                        conn, item.link.character_id
                    )
                conn.commit()
    finally:
        client.close()
    return report


def _stored_links(conn: Connection, franchise_names: list[str]) -> list[StoredLink]:
    sql = """
        SELECT c.id, c."canonicalName" AS character_name, c."wikiTitle" AS title,
               f."canonicalName" AS franchise_name,
               (
                   SELECT p."canonicalName"
                   FROM "PersonLink" l
                   JOIN "Person" p ON p.id = l."personId"
                   WHERE l."characterId" = c.id
                   ORDER BY l."billingOrder" NULLS LAST
                   LIMIT 1
               ) AS actor_name
        FROM "Character" c
        JOIN "Franchise" f ON f.id = c."franchiseId"
        WHERE c."wikiTitle" IS NOT NULL AND f."canonicalName" = ANY(%s)
        ORDER BY f."canonicalName", c."canonicalName"
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, (franchise_names,))
        rows = cur.fetchall()
    return [
        StoredLink(
            character_id=str(row["id"]),
            claim=TitleClaim(
                character_name=str(row["character_name"]),
                franchise_name=str(row["franchise_name"]),
                actor_name=row["actor_name"],
                title=str(row["title"]),
            ),
        )
        for row in rows
    ]
