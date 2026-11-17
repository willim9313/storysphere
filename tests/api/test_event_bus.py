from __future__ import annotations

import asyncio

from storysphere.api.events import BUFFER_SIZE, RESYNC, EventBus, book_stream, job_stream


def _types(events) -> list[str]:
    return [event.type for event in events]


class TestPublish:
    def test_job_and_book_streams_count_separately(self):
        bus = EventBus()
        assert bus.publish("a", {}, job_id="j1", book_id="b") == 1
        assert bus.publish("b", {}, job_id="j2", book_id="b") == 1
        assert bus.last_seq(book_stream("b")) == 2
        assert bus.last_seq(job_stream("j1")) == 1

    def test_job_stream_continues_from_the_stored_last_seq_after_a_restart(self):
        bus = EventBus()
        assert bus.publish("a", {}, job_id="j1", job_last_seq=7) == 8


class TestReplay:
    def _bus(self, count: int) -> EventBus:
        bus = EventBus()
        for i in range(count):
            bus.publish(f"e{i + 1}", {}, job_id="j")
        return bus

    def test_events_after_the_given_seq(self):
        assert _types(self._bus(3).replay(job_stream("j"), 1)) == ["e2", "e3"]

    def test_up_to_date_or_no_seq_gets_nothing(self):
        bus = self._bus(3)
        assert bus.replay(job_stream("j"), 3) == [] and bus.replay(job_stream("j"), None) == []

    def test_seq_dropped_from_the_buffer_gets_resync(self):
        bus = self._bus(BUFFER_SIZE + 5)
        assert _types(bus.replay(job_stream("j"), 2)) == [RESYNC]
        assert len(bus.replay(job_stream("j"), 5)) == BUFFER_SIZE  # 剛好還在緩衝裡

    def test_seq_from_before_a_restart_gets_resync(self):
        # 重啟後書的串流從 0 算起，前端拿著舊的 seq 50 回來
        assert _types(EventBus().replay(book_stream("b"), 50)) == [RESYNC]

    def test_finished_job_after_restart_needs_nothing_when_up_to_date(self):
        bus = EventBus()
        assert bus.replay(job_stream("j"), 7, start_seq=7) == []
        assert _types(bus.replay(job_stream("j"), 3, start_seq=7)) == [RESYNC]


class TestSubscribe:
    async def test_replay_then_live_in_order(self):
        bus = EventBus()
        bus.publish("old-1", {}, job_id="j")
        bus.publish("old-2", {}, job_id="j")
        events = bus.subscribe(job_stream("j"), 1)
        first = await anext(events)
        bus.publish("live", {}, job_id="j")
        second = await asyncio.wait_for(anext(events), 1)
        assert [(first.seq, first.type), (second.seq, second.type)] == [(2, "old-2"), (3, "live")]
        await events.aclose()

    async def test_replay_from_zero_then_live(self):
        bus = EventBus()
        bus.publish("old", {}, job_id="j")
        events = bus.subscribe(job_stream("j"), 0)
        first = await anext(events)
        bus.publish("new", {}, job_id="j")
        second = await asyncio.wait_for(anext(events), 1)
        assert [first.type, second.type] == ["old", "new"]
        await events.aclose()

    async def test_unsubscribes_on_close(self):
        bus = EventBus()
        events = bus.subscribe(job_stream("j"), None)
        waiting = asyncio.ensure_future(anext(events))
        await asyncio.sleep(0)
        bus.publish("x", {}, job_id="j")
        assert (await waiting).type == "x"
        await events.aclose()
        bus.publish("y", {}, job_id="j")  # 沒有訂閱者了，不會卡住
