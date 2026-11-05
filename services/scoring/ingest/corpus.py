"""Typed loader for the hand-maintained seed corpus.

The corpus is the only place where a human asserts facts. Everything else is
fetched. Validation happens here so a typo in the JSON fails at load instead of
halfway through a six-minute ingest.
"""

from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CORPUS_DIR = Path(__file__).resolve().parents[3] / "data" / "corpus"
FRANCHISES_FILE = CORPUS_DIR / "franchises.json"
EXIT_EVENTS_FILE = CORPUS_DIR / "exit_events.json"

Medium = Literal["TV", "FILM", "COMIC", "ANIMATION", "SPORTS"]
FranchiseStatus = Literal["ACTIVE", "ENDED", "CANCELLED", "HIATUS", "ANNOUNCED"]
ExitType = Literal[
    "CHARACTER_DEATH",
    "ACTOR_DEPARTURE",
    "RECAST",
    "SHOWRUNNER_EXIT",
    "CREATIVE_TEAM_CHANGE",
]


class RosterEntry(BaseModel):
    """A hand-listed character, used for media no free catalogue API covers."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    wiki_title: str = Field(alias="wikiTitle")
    creator: str | None = None
    billing_order: int = Field(alias="billingOrder")


class CorpusFranchise(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    canonical_name: str = Field(alias="canonicalName")
    search_name: str | None = Field(default=None, alias="searchName")
    medium: Medium
    primary_subs: list[str] = Field(default_factory=list, alias="primarySubs")
    genres: list[str] = Field(default_factory=list)
    first_release: date | None = Field(default=None, alias="firstRelease")
    status: FranchiseStatus | None = None
    roster: list[RosterEntry] = Field(default_factory=list)

    @property
    def query_name(self) -> str:
        return self.search_name or self.canonical_name

    @property
    def uses_catalogue(self) -> bool:
        """TV and animation rosters come from TVMaze; everything else is hand-listed."""
        return self.medium in ("TV", "ANIMATION") and not self.roster


class CorpusExitEvent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    franchise: str
    character: str
    aliases: list[str] = Field(default_factory=list)
    person: str
    exit_type: ExitType = Field(alias="exitType")
    event_date: date = Field(alias="eventDate")
    announced_date: date | None = Field(default=None, alias="announcedDate")
    source_url: str = Field(alias="sourceUrl")
    verified: bool = False
    notes: str | None = None

    @field_validator("source_url")
    @classmethod
    def _must_be_http(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError(f"source url must be https: {value!r}")
        return value

    @property
    def match_names(self) -> tuple[str, ...]:
        return (self.character, *self.aliases)


@lru_cache(maxsize=1)
def load_franchises() -> tuple[CorpusFranchise, ...]:
    payload = json.loads(FRANCHISES_FILE.read_text(encoding="utf-8"))
    franchises = tuple(CorpusFranchise.model_validate(row) for row in payload["franchises"])
    _reject_duplicates(f.canonical_name for f in franchises)
    return franchises


@lru_cache(maxsize=1)
def load_exit_events() -> tuple[CorpusExitEvent, ...]:
    payload = json.loads(EXIT_EVENTS_FILE.read_text(encoding="utf-8"))
    events = tuple(CorpusExitEvent.model_validate(row) for row in payload["events"])
    known = {f.canonical_name for f in load_franchises()}
    unknown = sorted({e.franchise for e in events} - known)
    if unknown:
        raise ValueError(f"exit events reference franchises not in the corpus: {unknown}")
    return events


def _reject_duplicates(names: object) -> None:
    seen: set[str] = set()
    for name in names:  # type: ignore[attr-defined]
        if name in seen:
            raise ValueError(f"duplicate franchise in corpus: {name!r}")
        seen.add(name)
