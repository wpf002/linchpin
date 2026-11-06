"""Google Trends, comparative only.

Absolute Trends values are meaningless across queries. Every batch carries a
pinned anchor term, and results are rescaled against that anchor so batches can
be compared with each other.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Sequence

from ingest.http import JsonCache

logger = logging.getLogger("linchpin.trends")

MAX_TERMS_PER_QUERY = 5
BATCH_PAUSE_SECONDS = 8.0
CACHE_NAMESPACE = "trends"
#: (connect, read) seconds. pytrends defaults to a 5 second read, which a
#: five-term historical query regularly exceeds.
REQUEST_TIMEOUT_SECONDS = (10, 30)


class TrendsUnavailable(RuntimeError):
    """pytrends is rate-limited often enough that callers must handle it."""


def batch_terms(terms: Sequence[str], anchor: str) -> list[list[str]]:
    """Split into queries of at most five terms, every batch containing the anchor."""
    others = [term for term in terms if term != anchor]
    if not others:
        return [[anchor]] if anchor else []
    size = MAX_TERMS_PER_QUERY - 1
    return [[anchor, *others[i : i + size]] for i in range(0, len(others), size)]


def rescale_to_anchor(batch_means: dict[str, float], anchor: str) -> dict[str, float]:
    """Express every term as a multiple of the anchor's interest in the same batch."""
    anchor_value = batch_means.get(anchor, 0.0)
    if anchor_value <= 0:
        # The anchor scored zero in this batch, so nothing in it is comparable to
        # any other batch. Drop it rather than emit numbers that look comparable.
        return {}
    return {term: value / anchor_value for term, value in batch_means.items() if term != anchor}


def fetch_comparative_interest(
    terms: Sequence[str],
    anchor: str,
    *,
    timeframe: str = "today 5-y",
    geo: str = "",
) -> dict[str, float]:
    """Mean comparative interest per term, expressed in anchor units.

    A term is missing from the result when its batch came back empty or the
    anchor scored zero in it. Callers that need the whole roster must check.
    """
    cache = JsonCache(CACHE_NAMESPACE)
    session = _Session()
    results: dict[str, float] = {}
    for batch in batch_terms(terms, anchor):
        key = json.dumps({"batch": batch, "timeframe": timeframe, "geo": geo})
        means = cache.get(key)
        if means is None:
            means = session.batch_means(batch, timeframe, geo)
            if means:
                # Only a relative timeframe ("today 5-y") changes from day to day,
                # and the ingest never uses one. Fixed windows are safe to keep.
                cache.set(key, means)
        if not means:
            logger.info("empty Trends frame for batch %s", batch)
            continue
        results.update(rescale_to_anchor(means, anchor))
    return results


class _Session:
    """One pytrends session, opened on the first request that misses the cache."""

    def __init__(self) -> None:
        self._client: object | None = None

    def batch_means(self, batch: list[str], timeframe: str, geo: str) -> dict[str, float]:
        try:
            from pytrends.request import TrendReq
        except ImportError as error:  # pragma: no cover - dependency guard
            raise TrendsUnavailable("pytrends is not installed") from error
        try:
            if self._client is None:
                self._client = TrendReq(hl="en-US", tz=0, timeout=REQUEST_TIMEOUT_SECONDS)
            self._client.build_payload(batch, timeframe=timeframe, geo=geo)  # type: ignore[attr-defined]
            frame = self._client.interest_over_time()  # type: ignore[attr-defined]
        except Exception as error:  # pytrends raises bare exceptions on 429
            raise TrendsUnavailable(f"Google Trends refused batch {batch}: {error}") from error
        finally:
            time.sleep(BATCH_PAUSE_SECONDS)
        if frame.empty:
            return {}
        return {term: float(frame[term].mean()) for term in batch if term in frame}
