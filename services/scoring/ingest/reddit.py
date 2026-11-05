"""Reddit mention counts. Counting only; no sentiment scoring, by design."""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime

from config import get_settings

logger = logging.getLogger("linchpin.reddit")


class RedditNotConfigured(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class MentionCount:
    measured_on: date
    mentions: int


def _alias_pattern(aliases: Sequence[str]) -> re.Pattern[str]:
    parts = sorted({alias.strip() for alias in aliases if alias.strip()}, key=len, reverse=True)
    if not parts:
        raise ValueError("at least one alias is required to count mentions")
    return re.compile(r"\b(" + "|".join(re.escape(part) for part in parts) + r")\b", re.IGNORECASE)


def count_mentions(texts: Sequence[str], aliases: Sequence[str]) -> int:
    """Count posts containing any alias. One hit per text, not per occurrence,
    so a single ranting comment cannot outweigh a hundred mentions."""
    pattern = _alias_pattern(aliases)
    return sum(1 for text in texts if pattern.search(text))


def fetch_subreddit_mentions(
    subreddit: str,
    aliases_by_character: dict[str, Sequence[str]],
    *,
    limit: int = 1000,
) -> dict[str, list[MentionCount]]:
    """Daily mention counts per character across a subreddit's recent posts."""
    settings = get_settings()
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        raise RedditNotConfigured("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required")

    import praw

    reddit = praw.Reddit(
        client_id=settings.reddit_client_id,
        client_secret=settings.reddit_client_secret,
        user_agent=settings.reddit_user_agent,
        check_for_async=False,
    )
    buckets: dict[str, dict[date, int]] = {name: {} for name in aliases_by_character}
    patterns = {
        name: _alias_pattern(aliases) for name, aliases in aliases_by_character.items() if aliases
    }

    for submission in reddit.subreddit(subreddit).new(limit=limit):
        created = datetime.fromtimestamp(submission.created_utc, tz=UTC).date()
        body = f"{submission.title}\n{getattr(submission, 'selftext', '')}"
        for name, pattern in patterns.items():
            if pattern.search(body):
                buckets[name][created] = buckets[name].get(created, 0) + 1

    return {
        name: [MentionCount(measured_on=day, mentions=count) for day, count in sorted(days.items())]
        for name, days in buckets.items()
    }
