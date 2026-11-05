"""Name matching between corpus rows and catalogue data.

Catalogues spell character names their own way: "Eddard 'Ned' Stark" in one
place, "Ned Stark" in another. Matching is normalised and, failing that,
token-subset based. It never falls back to fuzzy scoring, because a near miss
attaches an exit event to the wrong character and silently corrupts the study.
"""

from __future__ import annotations

import re
import unicodedata

_PUNCTUATION = re.compile(r"[^a-z0-9]+")
_STOPWORDS = frozenset({"the", "of", "a", "an", "dr", "mr", "mrs", "ms", "prof", "sir"})


def normalise(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return _PUNCTUATION.sub(" ", folded.lower()).strip()


def tokens(value: str) -> frozenset[str]:
    return frozenset(t for t in normalise(value).split() if t and t not in _STOPWORDS)


def matches(candidate: str, target: str) -> bool:
    """True when the two names refer to the same character.

    Exact after normalisation, or one token set contained in the other. Single
    token names must match exactly, since "Angel" and "Angel Batista" are not
    the same character.
    """
    left, right = normalise(candidate), normalise(target)
    if left == right:
        return True
    left_tokens, right_tokens = tokens(candidate), tokens(target)
    if not left_tokens or not right_tokens:
        return False
    if len(left_tokens) == 1 or len(right_tokens) == 1:
        return False
    return left_tokens <= right_tokens or right_tokens <= left_tokens


def find(names: object, pool: object) -> str | None:
    """First pool entry matching any of the given names, else None."""
    for name in names:  # type: ignore[attr-defined]
        for candidate in pool:  # type: ignore[attr-defined]
            if matches(name, candidate):
                return str(candidate)
    return None
