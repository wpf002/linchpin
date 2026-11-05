"""Google Trends, comparative only.

Absolute Trends values are meaningless across queries. Every batch carries a
pinned anchor term, and results are rescaled against that anchor so batches can
be compared with each other.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence

logger = logging.getLogger("linchpin.trends")

MAX_TERMS_PER_QUERY = 5
BATCH_PAUSE_SECONDS = 8.0


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
    """Mean comparative interest per term, expressed in anchor units."""
    try:
        from pytrends.request import TrendReq
    except ImportError as error:  # pragma: no cover - dependency guard
        raise TrendsUnavailable("pytrends is not installed") from error

    pytrends = TrendReq(hl="en-US", tz=0)
    results: dict[str, float] = {}
    for batch in batch_terms(terms, anchor):
        try:
            pytrends.build_payload(batch, timeframe=timeframe, geo=geo)
            frame = pytrends.interest_over_time()
        except Exception as error:  # pytrends raises bare exceptions on 429
            raise TrendsUnavailable(f"Google Trends refused batch {batch}: {error}") from error
        if frame.empty:
            logger.info("empty Trends frame for batch %s", batch)
            continue
        means = {term: float(frame[term].mean()) for term in batch if term in frame}
        results.update(rescale_to_anchor(means, anchor))
        time.sleep(BATCH_PAUSE_SECONDS)
    return results
