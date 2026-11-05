"""metrics/constants.py mirrors packages/shared/src/constants.ts by hand.

A silent drift between the two would mean the UI explains one model while the
service computes another, so the values are compared literally.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from metrics import constants

SHARED_CONSTANTS = (
    Path(__file__).resolve().parents[3] / "packages" / "shared" / "src" / "constants.ts"
)

_EXPORT = re.compile(
    r"export const (?P<name>\w+)[^=]*=\s*(?P<body>\{[^}]*\}|'[^']*'|\"[^\"]*\")", re.DOTALL
)


def _parse_typescript_constants() -> dict[str, object]:
    source = SHARED_CONSTANTS.read_text("utf-8")
    parsed: dict[str, object] = {}
    for match in _EXPORT.finditer(source):
        parsed[match.group("name")] = _to_python(match.group("body"))
    return parsed


def _to_python(body: str) -> object:
    if body.startswith(("'", '"')):
        return body.strip("'\"")
    without_comments = re.sub(r"//[^\n]*", "", body)
    quoted_keys = re.sub(r"(\w+)\s*:", r'"\1":', without_comments)
    no_trailing_comma = re.sub(r",(\s*})", r"\1", quoted_keys)
    return json.loads(no_trailing_comma)


@pytest.fixture(scope="module")
def typescript() -> dict[str, object]:
    return _parse_typescript_constants()


@pytest.mark.parametrize(
    ("ts_name", "py_value"),
    [
        ("MODEL_VERSION", constants.MODEL_VERSION),
        ("SIGNAL_WEIGHTS", constants.SIGNAL_WEIGHTS),
        ("WIKI_ONLY_WEIGHTS", constants.WIKI_ONLY_WEIGHTS),
        ("FRAGILITY_WEIGHTS", constants.FRAGILITY_WEIGHTS),
        ("KILL_CRITERIA", constants.KILL_CRITERIA),
        ("EVENT_WINDOWS", constants.EVENT_WINDOWS),
        ("SIGNAL_SOURCE_BY_SHARE", constants.SIGNAL_SOURCE_BY_SHARE),
    ],
)
def test_constant_matches_typescript(
    typescript: dict[str, object], ts_name: str, py_value: object
) -> None:
    assert ts_name in typescript, f"{ts_name} not found in constants.ts"
    assert typescript[ts_name] == py_value


def test_signal_weights_sum_to_one() -> None:
    assert sum(constants.SIGNAL_WEIGHTS.values()) == pytest.approx(1.0)
