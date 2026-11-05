"""Shared fixtures. The golden file is the contract between the TS and Python
metric implementations; both suites read the same numbers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

GOLDEN_FILE = Path(__file__).resolve().parents[3] / "data" / "fixtures" / "metrics_golden.json"


@pytest.fixture(scope="session")
def golden() -> dict[str, Any]:
    return json.loads(GOLDEN_FILE.read_text("utf-8"))
