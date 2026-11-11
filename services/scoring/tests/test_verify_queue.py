"""The verification queue holds only exits the gate could test."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from ingest.corpus import CorpusExitEvent
from validation.verify_queue import QueueItem, build_queue, coverable_event_dates, mark_verified


def _event(character: str, exit_type: str, *, verified: bool = False) -> CorpusExitEvent:
    return CorpusExitEvent.model_validate(
        {
            "franchise": "Game of Thrones",
            "character": character,
            "person": "Someone",
            "exitType": exit_type,
            "eventDate": "2019-05-12",
            "sourceUrl": "https://en.wikipedia.org/wiki/The_Bells_(Game_of_Thrones)",
            "verified": verified,
        }
    )


def test_window_must_sit_inside_pageview_coverage() -> None:
    earliest, latest = coverable_event_dates(date(2026, 11, 9))
    assert earliest == date(2015, 9, 29)
    assert latest == date(2026, 4, 13)


def test_queue_skips_verified_recast_and_untestable_events() -> None:
    day = date(2019, 5, 12)
    corpus = (
        _event("Lord Varys", "CHARACTER_DEATH"),
        _event("Sandor Clegane", "CHARACTER_DEATH", verified=True),
        _event("Bran Stark", "RECAST"),
        _event("Hot Pie", "ACTOR_DEPARTURE"),
    )
    testable = {
        ("Game of Thrones", name, day) for name in ("Lord Varys", "Sandor Clegane", "Bran Stark")
    }
    assert [item.character for item in build_queue(corpus, testable)] == ["Lord Varys"]


def test_mark_verified_flips_only_the_matching_event(tmp_path: Path) -> None:
    corpus = tmp_path / "exit_events.json"
    rows = [
        {
            "franchise": "Game of Thrones",
            "character": name,
            "eventDate": "2019-05-12",
            "verified": False,
        }
        for name in ("Lord Varys", "Sandor Clegane")
    ]
    corpus.write_text(json.dumps({"events": rows}), encoding="utf-8")
    item = QueueItem(
        "Game of Thrones", "Lord Varys", date(2019, 5, 12), "CHARACTER_DEATH", "", None
    )
    mark_verified(item, corpus)
    saved = json.loads(corpus.read_text(encoding="utf-8"))["events"]
    assert [row["verified"] for row in saved] == [True, False]
