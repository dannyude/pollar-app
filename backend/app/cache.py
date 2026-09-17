"""A small in-memory cache with expiring entries. One of the few stateful objects
left in the backend: keeping state is its whole job."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Cached[V]:
    value: V


class TtlCache[K, V]:
    def __init__(self, max_entries: int = 5_000) -> None:
        self._entries: dict[K, tuple[V, float]] = {}
        self._max_entries = max_entries

    def get(self, key: K, now: float) -> Cached[V] | None:
        entry = self._entries.get(key)
        if entry is None or entry[1] <= now:
            return None
        return Cached(entry[0])

    def put(self, key: K, value: V, until: float) -> None:
        if len(self._entries) >= self._max_entries:
            self._entries.clear()
        self._entries[key] = (value, until)
