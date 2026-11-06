"""Reddit mention counts. Counting only; no sentiment scoring, by design."""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from config import get_settings

logger = logging.getLogger("linchpin.reddit")


class RedditNotConfigured(RuntimeError):
    pass


class RedditFetchError(RuntimeError):
    """Reddit refused or failed a listing request. The subreddit is named in the message."""


@dataclass(frozen=True, slots=True)
class SubredditScan:
    """Daily mention counts per character key over one subreddit's newest posts.

    oldest_post and newest_post bound the posts that were read. Days outside
    them were not scanned; the two edge days were only partly scanned.
    """

    subreddit: str
    oldest_post: date | None
    newest_post: date | None
    counts: dict[str, dict[date, int]] = field(default_factory=dict)


def is_configured() -> bool:
    settings = get_settings()
    return bool(settings.reddit_client_id and settings.reddit_client_secret)


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
) -> SubredditScan:
    """Daily mention counts per character across a subreddit's newest posts."""
    if not is_configured():
        raise RedditNotConfigured("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required")

    import praw
    import prawcore

    settings = get_settings()
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
    oldest: date | None = None
    newest: date | None = None

    try:
        for submission in reddit.subreddit(subreddit).new(limit=limit):
            created = datetime.fromtimestamp(submission.created_utc, tz=UTC).date()
            oldest = created if oldest is None or created < oldest else oldest
            newest = created if newest is None or created > newest else newest
            body = f"{submission.title}\n{getattr(submission, 'selftext', '')}"
            for name, pattern in patterns.items():
                if pattern.search(body):
                    buckets[name][created] = buckets[name].get(created, 0) + 1
    except (prawcore.PrawcoreException, praw.exceptions.PRAWException) as error:
        raise RedditFetchError(f"r/{subreddit}: {error}") from error

    return SubredditScan(
        subreddit=subreddit, oldest_post=oldest, newest_post=newest, counts=buckets
    )
