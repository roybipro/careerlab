import threading
import time
from collections import deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError

_limiters: list["RateLimiter"] = []


class RateLimiter:
    """In-memory sliding window limiter. Suits a single API instance."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        _limiters.append(self)

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                raise AppError(429, "rate_limited", "Too many requests, try again later")
            hits.append(now)
            if len(self._hits) > 10_000:
                self._prune(cutoff)

    def _prune(self, cutoff: float) -> None:
        for key in [k for k, h in self._hits.items() if not h or h[-1] <= cutoff]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def reset_all_limiters() -> None:
    for limiter in _limiters:
        limiter.reset()


def client_ip(request: Request) -> str:
    if get_settings().TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"
