import hashlib
import ipaddress
import threading
import time
from collections import deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError

_limiters: list["RateLimiter"] = []

DEFAULT_MAX_KEYS = 10_000
MAX_KEY_LENGTH = 256
_OVERFLOW_KEY = "\x00overflow"
_PRUNE_INTERVAL_SECONDS = 1.0


class RateLimiter:
    """In-memory sliding window limiter. Suits a single API instance.

    The number of keys is capped at `max_keys` so that spoofed client IPs or emails cannot
    grow memory without bound. Once the cap is reached, expired keys are dropped; if the table
    is still full, a new key is counted in one shared overflow bucket. That bucket has the
    same limit, so past the cap requests are still limited and nothing new is stored.
    """

    def __init__(self, limit: int, window_seconds: int, max_keys: int = DEFAULT_MAX_KEYS) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}
        self._last_prune = 0.0
        self._lock = threading.Lock()
        _limiters.append(self)

    def check(self, key: str) -> None:
        if len(key) > MAX_KEY_LENGTH:
            key = hashlib.sha256(key.encode()).hexdigest()
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            if key not in self._hits and len(self._hits) >= self.max_keys:
                if now - self._last_prune >= _PRUNE_INTERVAL_SECONDS:
                    self._prune(cutoff)
                    self._last_prune = now
                if key not in self._hits and len(self._hits) >= self.max_keys:
                    key = _OVERFLOW_KEY
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                raise AppError(429, "rate_limited", "Too many requests, try again later")
            hits.append(now)

    def _prune(self, cutoff: float) -> None:
        for key in [k for k, h in self._hits.items() if not h or h[-1] <= cutoff]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._last_prune = 0.0


def reset_all_limiters() -> None:
    for limiter in _limiters:
        limiter.reset()


def client_ip(request: Request) -> str:
    """The limiter key for a request: the forwarded client IP when trusted, else the socket's.

    A forwarded entry counts only if it parses as an IP address, so arbitrary strings
    cannot be used as limiter keys.
    """
    if get_settings().TRUST_PROXY:
        first = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        try:
            return str(ipaddress.ip_address(first))
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"
