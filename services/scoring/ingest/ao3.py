"""AO3 tagged work counts. The strongest durable-fandom signal available publicly,
and the easiest to lose: single-digit requests per minute, cache everything."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote

from bs4 import BeautifulSoup

from ingest.http import ThrottledClient

logger = logging.getLogger("linchpin.ao3")

# Six requests per minute. AO3 blocks aggressive clients and the signal is not
# worth losing over a faster backfill.
MIN_INTERVAL_SECONDS = 10.0
WORKS_URL = "https://archiveofourown.org/tags/{tag}/works"
_COUNT_PATTERN = re.compile(r"of\s+([\d,]+)\s+Works|([\d,]+)\s+Works\s+found", re.IGNORECASE)


def _client() -> ThrottledClient:
    return ThrottledClient(
        namespace="ao3",
        min_interval_seconds=MIN_INTERVAL_SECONDS,
        headers={
            "User-Agent": "linchpin/0.1 (research; https://github.com/wpf002/linchpin)",
            "Accept": "text/html",
        },
    )


def fetch_work_count(tag: str, *, client: ThrottledClient | None = None) -> int | None:
    """Total works tagged with `tag`, or None when the tag page is absent."""
    owned = client is None
    active = client or _client()
    try:
        html = active.get_text(WORKS_URL.format(tag=quote(tag, safe="")))
        if html is None:
            return None
        return parse_work_count(html)
    finally:
        if owned:
            active.close()


def parse_work_count(html: str) -> int | None:
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find("h2", class_="heading")
    text = heading.get_text(" ", strip=True) if heading else ""
    match = _COUNT_PATTERN.search(text)
    if not match:
        logger.info("could not parse AO3 work count from heading %r", text)
        return None
    raw = match.group(1) or match.group(2)
    return int(raw.replace(",", ""))
