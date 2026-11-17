"""In-memory SSE event buffer (docs/spec/04 §3.4, §3.5).

串流：每個 job 一條（`job:<id>`），每本書一條（`book:<id>`，該書所有 job 的事件），
每個 agent session 一條（`session:<id>`，MCP server 發的 AgentEvent，04 §5.1）。
每條串流各自有單調遞增的 seq，記憶體只留最近 ``BUFFER_SIZE`` 筆；要求的 seq 已被丟掉
（或伺服器重啟過）時送 `resync`，前端重新抓 REST 狀態。

事件由 `api/watcher.py` 比對資料庫產生後丟進來；這裡不知道事件從哪來。
"""

from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

BUFFER_SIZE = 1000
RESYNC = "resync"


@dataclass(frozen=True)
class Event:
    seq: int | None  # None＝不佔 seq 的訊框（resync）
    type: str
    data: dict[str, Any]


@dataclass
class _Stream:
    seq: int = 0
    buffer: deque[Event] = field(default_factory=lambda: deque(maxlen=BUFFER_SIZE))
    subscribers: set[asyncio.Queue[Event]] = field(default_factory=set)

    def append(self, event_type: str, data: dict[str, Any]) -> Event:
        self.seq += 1
        event = Event(self.seq, event_type, data)
        self.buffer.append(event)
        for queue in self.subscribers:
            queue.put_nowait(event)
        return event

    def replay(self, after: int | None) -> list[Event]:
        """Buffered events after ``after``; a single `resync` when that range is gone."""
        if after is None or after == self.seq:
            return []
        first = self.buffer[0].seq if self.buffer else self.seq + 1
        # after 比目前還大：伺服器重啟過，seq 從頭算了。after 比緩衝還舊：中間被丟掉了。
        if after > self.seq or after < first - 1:
            return [Event(None, RESYNC, {})]
        return [event for event in self.buffer if event.seq > after]


def job_stream(job_id: str) -> str:
    return f"job:{job_id}"


def book_stream(book_id: str) -> str:
    return f"book:{book_id}"


class EventBus:
    def __init__(self) -> None:
        self._streams: dict[str, _Stream] = {}

    def _stream(self, key: str, start_seq: int = 0) -> _Stream:
        stream = self._streams.get(key)
        if stream is None:
            stream = self._streams[key] = _Stream(seq=start_seq)
        return stream

    def last_seq(self, key: str) -> int:
        stream = self._streams.get(key)
        return stream.seq if stream else 0

    def publish(
        self,
        event_type: str,
        data: dict[str, Any],
        *,
        job_id: str | None = None,
        book_id: str | None = None,
        job_last_seq: int = 0,
    ) -> int | None:
        """Append to the job stream and the book stream; return the job stream's new seq.

        ``job_last_seq`` 是資料庫裡的 `jobs.last_seq`：重啟後第一次發這個 job 的事件時從它接著算，
        前端拿舊 seq 來補抓才不會被誤判成「未來的 seq」。
        """
        seq = None
        if job_id is not None:
            seq = self._stream(job_stream(job_id), job_last_seq).append(event_type, data).seq
        if book_id is not None:
            self._stream(book_stream(book_id)).append(event_type, data)
        return seq

    def append(self, key: str, event_type: str, data: dict[str, Any]) -> int:
        """Append to one arbitrary stream (e.g. an agent session's); return its seq."""
        seq = self._stream(key).append(event_type, data).seq
        assert seq is not None
        return seq

    def replay(self, key: str, after: int | None, *, start_seq: int = 0) -> list[Event]:
        """What a reconnecting client missed after ``after`` (or one `resync`)."""
        return self._stream(key, start_seq).replay(after)

    async def subscribe(
        self, key: str, after: int | None, *, start_seq: int = 0
    ) -> AsyncIterator[Event]:
        """Replay what was missed after ``after``, then follow live events (never ends by itself)."""
        stream = self._stream(key, start_seq)
        queue: asyncio.Queue[Event] = asyncio.Queue()
        # 先掛上再補抓：補抓與即時之間不會漏事件；重複的用 seq 擋掉。
        stream.subscribers.add(queue)
        try:
            sent = after or 0
            for event in stream.replay(after):
                if event.seq is not None:
                    sent = event.seq
                yield event
            while True:
                event = await queue.get()
                if event.seq is not None and event.seq <= sent:
                    continue
                sent = event.seq or sent
                yield event
        finally:
            stream.subscribers.discard(queue)
