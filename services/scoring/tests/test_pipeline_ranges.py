"""Regression: every franchise must fetch pageviews for every franchise's event
windows. Fetching only a franchise's own windows left control franchises with no
data in the treated window, so most event studies had no usable estimate."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, timedelta
from typing import Any

import pytest

from ingest import pipeline
from ingest.corpus import CorpusExitEvent, CorpusFranchise


def _franchise(name: str) -> CorpusFranchise:
    return CorpusFranchise.model_validate({"canonicalName": name, "medium": "TV"})


def _event(franchise: str, day: date) -> CorpusExitEvent:
    return CorpusExitEvent.model_validate(
        {
            "franchise": franchise,
            "character": "Someone",
            "person": "Someone Else",
            "exitType": "CHARACTER_DEATH",
            "eventDate": day.isoformat(),
            "sourceUrl": "https://en.wikipedia.org/wiki/Example",
        }
    )


class _NullClient:
    def __init__(self, **_: Any) -> None: ...

    def close(self) -> None: ...


class _NullConnection:
    def commit(self) -> None: ...


def _covers(ranges: list[tuple[date, date]], day: date) -> bool:
    return any(start <= day <= end for start, end in ranges)


def test_control_franchise_gets_other_franchises_event_windows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    treated_exit = date(2018, 6, 1)
    seen: dict[str, list[tuple[date, date]]] = {}

    def fake_ingest(_conn: object, franchise: CorpusFranchise, **kwargs: Any) -> Any:
        seen[franchise.canonical_name] = kwargs["signal_ranges"]
        return pipeline.FranchiseOutcome(canonical_name=franchise.canonical_name)

    @contextmanager
    def fake_connection() -> Any:
        yield _NullConnection()

    monkeypatch.setattr(pipeline, "load_franchises", lambda: (_franchise("A"), _franchise("B")))
    monkeypatch.setattr(pipeline, "load_exit_events", lambda: (_event("A", treated_exit),))
    monkeypatch.setattr(pipeline, "ThrottledClient", _NullClient)
    monkeypatch.setattr(pipeline, "connection", fake_connection)
    monkeypatch.setattr(pipeline, "_ingest_franchise", fake_ingest)
    monkeypatch.setattr(pipeline, "_write_exit_events", lambda *_args: None)

    pipeline.run_ingest()

    pre_window_day = treated_exit + timedelta(days=pipeline.EVENT_WINDOWS["preStart"])
    post_window_day = treated_exit + timedelta(days=pipeline.EVENT_WINDOWS["postEnd"])
    for day in (pre_window_day, post_window_day):
        assert _covers(seen["B"], day), "control franchise B is missing A's event window"
