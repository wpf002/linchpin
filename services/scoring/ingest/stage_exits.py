"""Stage candidate exit events for human review.

A candidate names a character, an exit type and the episode it happens in.
Staging fills in what can be fetched: the air date from TVMaze and a source
page plus one sentence from it that states the exit. Candidates that fail any
check are rejected with a reason. Staged events are written with
verified=false; only a person who has read the source flips that flag.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field

from ingest.corpus import CORPUS_DIR, EXIT_EVENTS_FILE, ExitType, load_franchises
from ingest.http import ThrottledClient
from ingest.names import matches, normalise, tokens
from ingest.resolve import API_URL
from ingest.tvmaze import TvMazeEpisode, fetch_episodes, search_show
from ingest.tvmaze import open_client as tvmaze_client

logger = logging.getLogger("linchpin.stage")

CANDIDATES_FILE = CORPUS_DIR / "exit_candidates.json"
WIKI_ARTICLE_BASE = "https://en.wikipedia.org/wiki/"
WIKI_MIN_INTERVAL_SECONDS = 1.0

#: TVMaze titles like "Episode 6" carry no information to cross-check.
_GENERIC_TITLE = re.compile(r"^(episode|chapter|part)\s+\w+$", re.IGNORECASE)

#: Honorifics and ranks that appear in roster names but rarely in prose.
_NAME_NOISE = frozenset(
    {
        "queen",
        "king",
        "lord",
        "lady",
        "ser",
        "chief",
        "major",
        "nurse",
        "det",
        "lt",
        "off",
        "p",
        "comm",
        "dep",
        "councilman",
        "assistant",
        "state",
        "s",
        "attorney",
        "countess",
        "earl",
        "grantham",
        "princess",
        "prince",
        "duke",
        "edinburgh",
        "commodore",
    }
)
_MIN_NAME_TOKEN = 3

_EXIT_WORDS: dict[str, tuple[str, ...]] = {
    "CHARACTER_DEATH": (
        "death",
        "dies",
        "died",
        "die",
        "dying",
        "killed",
        "kills",
        "murder",
        "shot",
        "dead",
        "execut",
        "sacrific",
        "stabbed",
        "suicide",
        "slain",
        "strangl",
        "poison",
        "behead",
        "fatally",
    ),
    "ACTOR_DEPARTURE": (
        "depart",
        "leaves",
        "left the",
        "final appearance",
        "last appearance",
        "exit",
        "written out",
        "farewell",
        "final episode",
        "last episode",
    ),
    "RECAST": ("regenerat", "recast", "replac", "succeed", "takes over", "new doctor"),
    "SHOWRUNNER_EXIT": ("showrunner", "depart", "step down", "stepped down"),
    "CREATIVE_TEAM_CHANGE": ("writer", "artist", "creative team", "takes over"),
}

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_MAX_EVIDENCE_CHARS = 400


class ExitCandidate(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)

    franchise: str
    character: str
    person: str
    exit_type: ExitType = Field(alias="exitType")
    episode_title: str = Field(alias="episodeTitle")
    season: int | None = None
    episode: int | None = None
    notes: str | None = None


@dataclass(frozen=True, slots=True)
class Staged:
    candidate: ExitCandidate
    event_date: date
    source_url: str
    evidence: str


@dataclass(frozen=True, slots=True)
class Rejected:
    candidate: ExitCandidate
    reason: str


def find_episode(
    episodes: Sequence[TvMazeEpisode], candidate: ExitCandidate
) -> TvMazeEpisode | str:
    """The episode the candidate names, or the reason it can't be pinned down.

    Season and number pick the episode when given; the title must then agree
    unless TVMaze's title is generic. Without season and number the title has
    to match exactly one episode.
    """
    wanted = normalise(candidate.episode_title)
    if candidate.season is not None and candidate.episode is not None:
        hits = [
            e for e in episodes if e.season == candidate.season and e.number == candidate.episode
        ]
        if len(hits) != 1:
            return f"no S{candidate.season}E{candidate.episode} on TVMaze"
        hit = hits[0]
        if _GENERIC_TITLE.match(hit.title.strip()) or _titles_agree(hit.title, wanted):
            return hit
        return f"S{candidate.season}E{candidate.episode} is titled {hit.title!r} on TVMaze"
    hits = [e for e in episodes if _titles_agree(e.title, wanted)]
    if len(hits) != 1:
        return f"{len(hits)} TVMaze episodes titled {candidate.episode_title!r}"
    return hits[0]


def _titles_agree(tvmaze_title: str, wanted: str) -> bool:
    have = normalise(tvmaze_title)
    return bool(have) and (have == wanted or wanted in have or have in wanted)


def name_tokens(character: str) -> frozenset[str]:
    return frozenset(
        t for t in tokens(character) if t not in _NAME_NOISE and len(t) >= _MIN_NAME_TOKEN
    )


def find_evidence(text: str, character: str, exit_type: str) -> str | None:
    """The sentence where the character's name sits closest to an exit word.

    Exit words match as word prefixes ("die" matches "dies", not "audience").
    A sentence only counts when the two are at most MAX_NAME_DISTANCE tokens
    apart, which keeps a sentence about someone else's death from qualifying.
    """
    names = name_tokens(character)
    pattern = _exit_pattern(exit_type)
    best: tuple[int, str] | None = None
    for sentence in _sentences(text):
        words = normalise(sentence).split()
        name_at = [i for i, word in enumerate(words) if word in names]
        if not name_at:
            continue
        exit_at = [m.start() for m in pattern.finditer(" ".join(words))]
        if not exit_at:
            continue
        exit_indexes = [_token_index(" ".join(words), offset) for offset in exit_at]
        distance = min(abs(n - e) for n in name_at for e in exit_indexes)
        if distance <= MAX_NAME_DISTANCE and (best is None or distance < best[0]):
            best = (distance, sentence.strip()[:_MAX_EVIDENCE_CHARS])
    return best[1] if best else None


MAX_NAME_DISTANCE = 12


def _exit_pattern(exit_type: str) -> re.Pattern[str]:
    stems = "|".join(re.escape(normalise(word)) for word in _EXIT_WORDS[exit_type])
    return re.compile(rf"\b(?:{stems})")


def _token_index(joined: str, offset: int) -> int:
    return joined.count(" ", 0, offset)


def _sentences(text: str) -> list[str]:
    lines = [line for line in text.splitlines() if line.strip() and not line.startswith("=")]
    return [s for line in lines for s in _SENTENCE_SPLIT.split(line)]


def stage(
    candidates: Sequence[ExitCandidate],
    *,
    existing: list[tuple[str, str, date]],
) -> tuple[list[Staged], list[Rejected]]:
    franchises = {f.canonical_name: f for f in load_franchises()}
    staged: list[Staged] = []
    rejected: list[Rejected] = []
    episodes_by_show: dict[str, list[TvMazeEpisode]] = {}

    with tvmaze_client() as tv, _wiki_client() as wiki:
        for candidate in candidates:
            franchise = franchises.get(candidate.franchise)
            if franchise is None:
                rejected.append(Rejected(candidate, "franchise not in corpus"))
                continue
            if franchise.query_name not in episodes_by_show:
                show = search_show(franchise.query_name, client=tv)
                episodes_by_show[franchise.query_name] = (
                    fetch_episodes(show.tvmaze_id, include_specials=True, client=tv) if show else []
                )
            found = find_episode(episodes_by_show[franchise.query_name], candidate)
            if isinstance(found, str):
                rejected.append(Rejected(candidate, found))
                continue
            key = (candidate.franchise, candidate.character, found.airdate)
            if is_duplicate(key, existing):
                rejected.append(Rejected(candidate, "already in corpus"))
                continue
            sourced = _source(wiki, candidate, franchise.query_name)
            if isinstance(sourced, str):
                rejected.append(Rejected(candidate, sourced))
                continue
            title, sentence = sourced
            staged.append(
                Staged(
                    candidate,
                    found.airdate,
                    WIKI_ARTICLE_BASE + quote(title.replace(" ", "_")),
                    sentence,
                )
            )
            existing.append(key)
    return staged, rejected


def _source(wiki: ThrottledClient, candidate: ExitCandidate, show: str) -> tuple[str, str] | str:
    """A Wikipedia page and sentence stating the exit: the episode's article
    first, then the character's."""
    queries = (
        f'"{candidate.episode_title}" {show} episode',
        f"{candidate.character} {show} character",
    )
    for query in queries:
        title = _search(wiki, query)
        if title is None:
            continue
        text = _plaintext(wiki, title)
        if not text or normalise(show) not in normalise(text):
            continue
        sentence = find_evidence(text, candidate.character, candidate.exit_type)
        if sentence:
            return title, sentence
    return "no Wikipedia sentence states this exit"


def _search(wiki: ThrottledClient, query: str) -> str | None:
    payload = wiki.get_json(
        API_URL,
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "list": "search",
            "srsearch": query,
            "srlimit": "1",
        },
    )
    results = ((payload or {}).get("query") or {}).get("search") or []
    title = results[0].get("title") if results else None
    return title if isinstance(title, str) else None


def _plaintext(wiki: ThrottledClient, title: str) -> str:
    payload = wiki.get_json(
        API_URL,
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "extracts",
            "explaintext": "1",
            "redirects": "1",
            "titles": title,
        },
    )
    pages = ((payload or {}).get("query") or {}).get("pages") or []
    return str(pages[0].get("extract") or "") if pages else ""


def _wiki_client() -> ThrottledClient:
    from config import get_settings

    return ThrottledClient(
        namespace="wikipedia-stage",
        min_interval_seconds=WIKI_MIN_INTERVAL_SECONDS,
        headers={"User-Agent": get_settings().wikimedia_user_agent, "Accept": "application/json"},
    )


def load_candidates(source: Path = CANDIDATES_FILE) -> list[ExitCandidate]:
    payload = json.loads(source.read_text(encoding="utf-8"))
    return [ExitCandidate.model_validate(row) for row in payload["candidates"]]


def append_staged(staged: Sequence[Staged], target: Path = EXIT_EVENTS_FILE) -> int:
    payload = json.loads(target.read_text(encoding="utf-8"))
    for item in staged:
        row: dict[str, object] = {
            "franchise": item.candidate.franchise,
            "character": item.candidate.character,
            "person": item.candidate.person,
            "exitType": item.candidate.exit_type,
            "eventDate": item.event_date.isoformat(),
            "sourceUrl": item.source_url,
            "verified": False,
            "evidence": item.evidence,
        }
        if item.candidate.notes:
            row["notes"] = item.candidate.notes
        payload["events"].append(row)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(staged)


def existing_keys(target: Path = EXIT_EVENTS_FILE) -> list[tuple[str, str, date]]:
    payload = json.loads(target.read_text(encoding="utf-8"))
    return [
        (row["franchise"], row["character"], date.fromisoformat(row["eventDate"]))
        for row in payload["events"]
    ]


def is_duplicate(key: tuple[str, str, date], existing: Sequence[tuple[str, str, date]]) -> bool:
    franchise, character, day = key
    return any(
        franchise == other_franchise and day == other_day and matches(character, other_character)
        for other_franchise, other_character, other_day in existing
    )
