"""Resolve a character name to an English Wikipedia article, or refuse.

A wrong link is worse than a missing one: it injects another franchise's
attention into this franchise's shares. Every candidate must pass explicit
acceptance checks, and a character that passes none is recorded as unresolved
and counts against the franchise's rosterComplete.

Lookups go through the MediaWiki Action API rather than the REST summary
endpoint. The Action API accepts up to 50 titles per request and tolerates a
steady client, which turns ~80 requests per franchise into two.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from ingest.http import ThrottledClient
from ingest.names import normalise, tokens

logger = logging.getLogger(__name__)

API_URL = "https://en.wikipedia.org/w/api.php"

#: The Action API returns intro extracts for at most 20 pages per query.
MAX_TITLES_PER_QUERY = 20

#: One query covers a whole franchise, so a slow, polite interval costs little.
MIN_INTERVAL_SECONDS = 1.0

#: Extract prefix length that is enough to classify an article.
EXTRACT_CHARS = 600

#: Whole words only. A substring test accepted a musician's biography because
#: his music is "characterized" by something.
_FICTION_PATTERN = re.compile(
    r"\b(fictional|characters?|protagonists?|antagonists?|superhero(es|ines?)?|supervillains?"
    r"|comic book)\b"
)

_REJECT_TITLE_PATTERNS = (
    re.compile(r"^List of ", re.IGNORECASE),
    re.compile(r"\(disambiguation\)$", re.IGNORECASE),
    re.compile(r"^(Season|Series) \d", re.IGNORECASE),
    re.compile(r"^Characters (of|in) ", re.IGNORECASE),
    # An article about the work itself is never an article about one character.
    re.compile(r"\([^)]*\b(TV|television|web|film|anime) series\)$", re.IGNORECASE),
    re.compile(r"\((franchise|miniseries|film|season \d+)\)$", re.IGNORECASE),
)

_QUALIFIER = re.compile(r"\s*\(([^)]*)\)\s*$")

#: TVMaze writes a character with two identities as "Henry Creel / Vecna".
_ALIAS_SEPARATOR = re.compile(r"\s+/\s+")

_LEADING_ARTICLES = frozenset({"the", "a", "an"})

#: Credits use the short form ("Jimmy McGill"); article leads use the given name
#: ("James Morgan McGill"). Only the forms the corpus has needed are listed.
_SHORT_FORMS: dict[str, frozenset[str]] = {
    "james": frozenset({"jim", "jimmy"}),
    "anthony": frozenset({"tony"}),
    "michael": frozenset({"mike"}),
    "william": frozenset({"will", "bill", "billy"}),
    "robert": frozenset({"bob", "bobby", "rob"}),
    "richard": frozenset({"rick", "dick"}),
    "thomas": frozenset({"tom", "tommy"}),
    "joseph": frozenset({"joe"}),
    "edward": frozenset({"ed", "eddie"}),
    "daniel": frozenset({"dan", "danny"}),
    "samuel": frozenset({"sam"}),
    "katherine": frozenset({"kate", "katie"}),
    "elizabeth": frozenset({"liz", "beth"}),
}

#: The subject of an article's opening sentence: everything before "is a ...".
_LEAD_SUBJECT = re.compile(r"^(.{1,200}?)\b(?:is|was|are)\s+(?:a|an|the|one)\b", re.DOTALL)


@dataclass(frozen=True, slots=True)
class Resolution:
    title: str | None
    confidence: float
    reason: str


@dataclass(frozen=True, slots=True)
class _Candidate:
    character_name: str
    actor_name: str | None
    title: str
    confidence: float


@dataclass(frozen=True, slots=True)
class _Page:
    title: str
    description: str
    extract: str
    missing: bool


def resolve_roster(
    *,
    characters: Sequence[tuple[str, str | None]],
    franchise_name: str,
    client: ThrottledClient,
) -> dict[str, Resolution]:
    """Resolve a whole roster at once. Keys are the character names given."""
    candidates = [
        _Candidate(name, actor, title, confidence)
        for name, actor in characters
        for title, confidence in _candidate_titles(name, franchise_name)
    ]
    pages = _fetch_pages([c.title for c in candidates], client)
    resolved: dict[str, Resolution] = {}
    reasons: dict[str, str] = {}

    for candidate in candidates:
        if candidate.character_name in resolved:
            continue
        page = pages.get(normalise(candidate.title))
        if page is None or page.missing:
            reasons.setdefault(candidate.character_name, "no article at any candidate title")
            continue
        verdict = _accept(page, candidate.character_name, franchise_name, candidate.actor_name)
        if verdict.title is None:
            reasons[candidate.character_name] = verdict.reason
            continue
        resolved[candidate.character_name] = Resolution(
            verdict.title,
            min(1.0, candidate.confidence * verdict.confidence),
            verdict.reason,
        )

    unresolved = [(name, actor) for name, actor in characters if name not in resolved]
    if unresolved:
        resolved.update(_resolve_by_search(unresolved, franchise_name, client, reasons))
    return resolved


@dataclass(frozen=True, slots=True)
class TitleClaim:
    """A character-to-article link already stored, to be checked again."""

    character_name: str
    franchise_name: str
    actor_name: str | None
    title: str


@dataclass(frozen=True, slots=True)
class TitleVerdict:
    #: "unchecked" means the lookup failed. It is never grounds to drop a link.
    status: Literal["accepted", "rejected", "unchecked"]
    reason: str


def verify_titles(claims: Sequence[TitleClaim], client: ThrottledClient) -> list[TitleVerdict]:
    """Re-run the acceptance checks on stored links. One verdict per claim, in order."""
    pages = _fetch_pages([claim.title for claim in claims], client)
    verdicts: list[TitleVerdict] = []
    for claim in claims:
        page = pages.get(normalise(claim.title))
        if page is None:
            verdicts.append(TitleVerdict("unchecked", "lookup returned nothing for this title"))
            continue
        if page.missing:
            verdicts.append(TitleVerdict("rejected", "stored title has no article"))
            continue
        resolution = _accept(page, claim.character_name, claim.franchise_name, claim.actor_name)
        status = "rejected" if resolution.title is None else "accepted"
        verdicts.append(TitleVerdict(status, resolution.reason))
    return verdicts


def resolve_character_article(
    *,
    character_name: str,
    franchise_name: str,
    actor_name: str | None,
    client: ThrottledClient,
) -> Resolution:
    """Single-character convenience wrapper over resolve_roster."""
    results = resolve_roster(
        characters=[(character_name, actor_name)],
        franchise_name=franchise_name,
        client=client,
    )
    return results.get(character_name, Resolution(None, 0.0, "no candidate article found"))


def _candidate_titles(character_name: str, franchise_name: str) -> list[tuple[str, float]]:
    short = franchise_name.split(":")[0].strip()
    titles = [
        (f"{character_name} ({franchise_name})", 1.0),
        (f"{character_name} ({short})", 1.0),
        (f"{character_name} ({franchise_name} character)", 1.0),
        (f"{character_name} (character)", 0.95),
        (character_name, 0.95),
    ]
    seen: set[str] = set()
    unique: list[tuple[str, float]] = []
    for title, confidence in titles:
        key = normalise(title)
        if key in seen:
            continue
        seen.add(key)
        unique.append((title, confidence))
    return unique


def _fetch_pages(titles: Sequence[str], client: ThrottledClient) -> dict[str, _Page]:
    pages: dict[str, _Page] = {}
    for chunk in _chunks(list(dict.fromkeys(titles)), MAX_TITLES_PER_QUERY):
        payload = client.get_json(
            API_URL,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "extracts|pageprops|description",
                "exintro": "1",
                "explaintext": "1",
                "exchars": str(EXTRACT_CHARS),
                "exlimit": "max",
                "redirects": "1",
                "titles": "|".join(chunk),
            },
        )
        if not payload or payload.get("__missing__"):
            continue
        pages.update(_parse_query(payload, chunk))
    return pages


def _parse_query(payload: dict, requested: Sequence[str]) -> dict[str, _Page]:
    query = payload.get("query") or {}
    #: The API rewrites titles twice: normalisation, then redirect resolution.
    alias_of: dict[str, str] = {}
    for mapping in (*query.get("normalized", []), *query.get("redirects", [])):
        source, target = mapping.get("from"), mapping.get("to")
        if isinstance(source, str) and isinstance(target, str):
            alias_of[normalise(source)] = normalise(target)

    by_title: dict[str, _Page] = {}
    for page in query.get("pages", []):
        title = str(page.get("title") or "")
        if not title:
            continue
        props = page.get("pageprops") or {}
        by_title[normalise(title)] = _Page(
            title=title,
            description=str(page.get("description") or ""),
            extract=str(page.get("extract") or ""),
            missing=bool(page.get("missing")) or "disambiguation" in props,
        )

    resolved: dict[str, _Page] = dict(by_title)
    for asked in requested:
        key = normalise(asked)
        target = key
        for _ in range(3):  # normalisation then redirect; three hops is slack.
            target = alias_of.get(target, target)
        page = by_title.get(target)
        if page is not None:
            resolved[key] = page
    return resolved


def _accept(
    page: _Page, character_name: str, franchise_name: str, actor_name: str | None
) -> Resolution:
    title = page.title
    for pattern in _REJECT_TITLE_PATTERNS:
        if pattern.search(title):
            return Resolution(None, 0.0, f"rejected title shape: {title}")

    if actor_name and normalise(title) == normalise(actor_name):
        # The lookup landed on the performer's biography.
        return Resolution(None, 0.0, "resolved to the performer's page, not the character's")

    haystack = normalise(f"{page.description} {page.extract}")
    if not haystack:
        return Resolution(None, 0.0, "article has no summary text")
    if not _FICTION_PATTERN.search(haystack):
        return Resolution(None, 0.0, "article is not about a fictional character")

    named = title_names_character(
        title, character_name, franchise_name, context=haystack
    ) or lead_names_character(page.extract, character_name)
    if not named:
        return Resolution(None, 0.0, f"article title does not name the character: {title}")

    if _mentions_franchise(f"{normalise(title)} {haystack}", franchise_name):
        return Resolution(title, 1.0, "accepted")
    return Resolution(title, 0.75, "accepted without a franchise mention")


def title_names_character(
    title: str, character_name: str, franchise_name: str, *, context: str = ""
) -> bool:
    """True when the article title is this character's name.

    The search fallback returns the best article for "<character> <franchise>",
    which for a minor character is the series article or a stranger who shares a
    first name. Matching the title to the name, token for token, refuses both.
    """
    qualifier_match = _QUALIFIER.search(title)
    qualifier = normalise(qualifier_match.group(1)) if qualifier_match else ""
    base = _QUALIFIER.sub("", title)
    evidence = f"{qualifier} {context}"
    names = [character_name, *_ALIAS_SEPARATOR.split(character_name)]
    return any(_base_names(base, name, qualifier, evidence, franchise_name) for name in names)


def lead_names_character(extract: str, character_name: str) -> bool:
    """True when the opening sentence's subject is this character under another name.

    "James Morgan 'Jimmy' McGill, better known as Saul Goodman, is a fictional
    character" names Jimmy McGill. "David Palmer is a fictional character" does
    not name Sherry Palmer, however often the body mentions her.
    """
    lead = _LEAD_SUBJECT.match(extract.strip())
    if lead is None:
        return False
    subject_tokens = set(tokens(lead.group(1)))
    for given_name in tuple(subject_tokens):
        subject_tokens |= _SHORT_FORMS.get(given_name, frozenset())
    for name in (character_name, *_ALIAS_SEPARATOR.split(character_name)):
        name_tokens = tokens(name)
        if len(name_tokens) > 1 and name_tokens <= subject_tokens:
            return True
    return False


def _base_names(base: str, name: str, qualifier: str, evidence: str, franchise_name: str) -> bool:
    title_tokens, name_tokens = tokens(base), tokens(name)
    if not title_tokens or not name_tokens:
        return False
    if title_tokens == name_tokens:
        return True
    if not (title_tokens <= name_tokens or name_tokens <= title_tokens):
        return False
    if len(title_tokens) > 1 and len(name_tokens) > 1:
        return True
    # One side is a single name ("Vecna" for "Henry Creel / Vecna"). A lone
    # shared name is not enough, so the article must also be tied to this work.
    return "character" in qualifier.split() or _mentions_franchise(evidence, franchise_name)


def _mentions_franchise(normalised_text: str, franchise_name: str) -> bool:
    padded = f" {normalised_text} "
    return any(f" {phrase} " in padded for phrase in _franchise_phrases(franchise_name))


def _franchise_phrases(franchise_name: str) -> list[str]:
    """The franchise name and its pre-colon short form, without a leading article."""
    phrases: list[str] = []
    for form in (franchise_name, franchise_name.split(":")[0]):
        words = normalise(form).split()
        while words and words[0] in _LEADING_ARTICLES:
            words = words[1:]
        phrase = " ".join(words)
        if phrase and phrase not in phrases:
            phrases.append(phrase)
    return phrases


def _resolve_by_search(
    characters: Sequence[tuple[str, str | None]],
    franchise_name: str,
    client: ThrottledClient,
    reasons: dict[str, str],
) -> dict[str, Resolution]:
    found: dict[str, Resolution] = {}
    searched: dict[str, str] = {}
    for name, _actor in characters:
        title = _search_title(f"{name} {franchise_name}", client)
        if title is not None:
            searched[name] = title

    pages = _fetch_pages(list(searched.values()), client)
    for name, actor in characters:
        title = searched.get(name)
        if title is None:
            found[name] = Resolution(None, 0.0, reasons.get(name, "no candidate article found"))
            continue
        page = pages.get(normalise(title))
        if page is None or page.missing:
            found[name] = Resolution(None, 0.0, "search result had no article")
            continue
        verdict = _accept(page, name, franchise_name, actor)
        if verdict.title is None:
            found[name] = verdict
            continue
        found[name] = Resolution(
            verdict.title, min(0.85, verdict.confidence), f"via search: {verdict.reason}"
        )
    return found


def _search_title(query: str, client: ThrottledClient) -> str | None:
    payload = client.get_json(
        API_URL,
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "list": "search",
            "srsearch": query,
            "srlimit": "3",
        },
    )
    if not payload or payload.get("__missing__"):
        return None
    for result in (payload.get("query") or {}).get("search", []):
        title = result.get("title")
        if not isinstance(title, str):
            continue
        if any(pattern.search(title) for pattern in _REJECT_TITLE_PATTERNS):
            continue
        return title
    return None


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]
