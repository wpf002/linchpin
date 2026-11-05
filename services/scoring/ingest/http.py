"""Throttled, cached HTTP. Every source here is someone else's free service;
the throttle is the price of continued access."""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config import get_settings

logger = logging.getLogger("linchpin.http")

#: Upper bound on an honoured Retry-After, so a hostile header cannot stall a run.
MAX_RETRY_AFTER_SECONDS = 60.0

#: Status codes worth trying again. Everything else in 4xx is a permanent answer.
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class RetryableStatus(Exception):
    """A response the server asked us to try again later."""

    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"{status_code} from {url}")
        self.status_code = status_code


class RateLimiter:
    """Minimum interval between requests, per host key."""

    def __init__(self, min_interval_seconds: float) -> None:
        self._min_interval = min_interval_seconds
        self._last = 0.0
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            elapsed = time.monotonic() - self._last
            if elapsed < self._min_interval:
                time.sleep(self._min_interval - elapsed)
            self._last = time.monotonic()


class JsonCache:
    def __init__(self, namespace: str) -> None:
        self._dir = get_settings().cache_dir / namespace
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:40]
        return self._dir / f"{digest}.json"

    def get(self, key: str) -> Any | None:
        path = self._path(key)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("discarding unreadable cache entry %s", path)
            return None

    def set(self, key: str, value: Any) -> None:
        try:
            self._path(key).write_text(json.dumps(value), "utf-8")
        except OSError:
            logger.warning("could not write cache entry for %s", key)


class ThrottledClient:
    def __init__(
        self,
        *,
        namespace: str,
        min_interval_seconds: float,
        headers: dict[str, str] | None = None,
    ) -> None:
        settings = get_settings()
        self._limiter = RateLimiter(min_interval_seconds)
        self._cache = JsonCache(namespace)
        self._client = httpx.Client(
            timeout=settings.request_timeout_seconds,
            headers=headers or {},
            follow_redirects=True,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ThrottledClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    @retry(
        reraise=True,
        stop=stop_after_attempt(6),
        wait=wait_exponential(multiplier=2, min=4, max=120),
        retry=retry_if_exception_type((httpx.TransportError, RetryableStatus)),
    )
    def _request(self, url: str, params: dict[str, Any] | None) -> httpx.Response:
        self._limiter.wait()
        response = self._client.get(url, params=params)
        if response.status_code in RETRYABLE_STATUS:
            self._sleep_for_retry_after(response)
            raise RetryableStatus(response.status_code, url)
        return response

    @staticmethod
    def _sleep_for_retry_after(response: httpx.Response) -> None:
        raw = response.headers.get("retry-after")
        if raw is None:
            return
        try:
            seconds = float(raw)
        except ValueError:
            return
        logger.info("honouring Retry-After of %.0fs", seconds)
        time.sleep(min(max(seconds, 0.0), MAX_RETRY_AFTER_SECONDS))

    def get_json(
        self, url: str, params: dict[str, Any] | None = None, *, use_cache: bool = True
    ) -> Any | None:
        key = f"{url}?{json.dumps(params, sort_keys=True)}"
        if use_cache:
            cached = self._cache.get(key)
            if cached is not None:
                return cached
        response = self._request(url, params)
        if response.status_code >= 400:
            logger.info("%s -> %d, recording as missing", url, response.status_code)
            if use_cache:
                self._cache.set(key, {"__missing__": True})
            return None
        payload = response.json()
        if use_cache:
            self._cache.set(key, payload)
        return payload

    def get_text(self, url: str, params: dict[str, Any] | None = None) -> str | None:
        response = self._request(url, params)
        if response.status_code >= 400:
            logger.info("%s -> %d, recording as missing", url, response.status_code)
            return None
        return response.text
