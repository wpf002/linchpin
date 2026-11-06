"""Roster cap.

Shares are fractions of a roster total, so roster size sets every share. A comics
publisher lists thousands of characters; scoring all of them would push every
share toward zero and make HHI incomparable with a twenty-person TV cast. Every
medium is capped, and the cap ranks by appearance count where the corpus records
one.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Final, TypeVar

from ingest.tvmaze import MAIN_CAST_CAP

#: Largest roster scored per franchise, by medium. Comics get a slightly larger
#: cap because a publisher's line is wider than one show's cast.
ROSTER_CAP_BY_MEDIUM: Final[dict[str, int]] = {
    "TV": MAIN_CAST_CAP,
    "ANIMATION": MAIN_CAST_CAP,
    "FILM": MAIN_CAST_CAP,
    "SPORTS": MAIN_CAST_CAP,
    "COMIC": 25,
}

Entry = TypeVar("Entry")


def _no_appearances(_: object) -> int | None:
    return None


def cap_roster(
    entries: Sequence[Entry],
    medium: str,
    *,
    billing_order: Callable[[Entry], int],
    appearances: Callable[[Entry], int | None] = _no_appearances,
) -> list[Entry]:
    """Keep the top of the roster, ranked by appearances and then billing order.

    Entries with an appearance count rank above entries without one. Catalogue
    casts carry no counts, so they keep catalogue billing order.
    """
    cap = ROSTER_CAP_BY_MEDIUM[medium]

    def rank(entry: Entry) -> tuple[int, int, int]:
        count = appearances(entry)
        if count is None:
            return (1, 0, billing_order(entry))
        return (0, -count, billing_order(entry))

    return sorted(entries, key=rank)[:cap]
