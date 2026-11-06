"""Mirror of packages/shared/src/constants.ts. Kept in step by tests/test_constants_parity.py."""

from __future__ import annotations

from typing import Final

MODEL_VERSION: Final = "v0.2.0"

SIGNAL_WEIGHTS: Final[dict[str, float]] = {
    "wikiShare": 0.35,
    "fanworkShare": 0.25,
    "searchShare": 0.20,
    "discourseShare": 0.20,
}

WIKI_ONLY_WEIGHTS: Final[dict[str, float]] = {
    "wikiShare": 1.0,
    "fanworkShare": 0.0,
    "searchShare": 0.0,
    "discourseShare": 0.0,
}

FRAGILITY_WEIGHTS: Final[dict[str, float]] = {
    "hhi": 0.60,
    "top1Share": 0.25,
    "substitutability": -0.15,
}

# Written before the test is run. Do not adjust after seeing results.
KILL_CRITERIA: Final[dict[str, float]] = {
    "minRankIC": 0.15,
    "minRosterCompleteness": 0.70,
    "minCreatorProjects": 3,
    "minExitEvents": 200,
}

EVENT_WINDOWS: Final[dict[str, int]] = {
    "preStart": -90,
    "preEnd": -1,
    "postStart": 30,
    "postEnd": 210,
    "offCycleGapDays": 90,
}

SIGNAL_SOURCE_BY_SHARE: Final[dict[str, str]] = {
    "wikiShare": "WIKI",
    "fanworkShare": "AO3",
    "searchShare": "TRENDS",
    "discourseShare": "REDDIT",
}
