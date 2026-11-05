"""Thin psycopg helpers. Prisma owns the schema; this module only reads and writes rows."""

from __future__ import annotations

import logging
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from config import get_settings

logger = logging.getLogger("linchpin.db")


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    settings = get_settings()
    conn = psycopg.connect(settings.psycopg_url, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_all(sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> list[dict]:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)  # type: ignore[arg-type]
        return list(cur.fetchall())


def fetch_one(sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> dict | None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)  # type: ignore[arg-type]
        return cur.fetchone()


def execute(sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)  # type: ignore[arg-type]
        return cur.rowcount


def execute_many(sql: str, rows: Sequence[Sequence[Any]]) -> int:
    if not rows:
        return 0
    with connection() as conn, conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


def health() -> bool:
    try:
        return fetch_one("SELECT 1 AS ok") is not None
    except psycopg.Error:
        logger.exception("database health check failed")
        return False
