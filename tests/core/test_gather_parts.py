import asyncio
import sys

sys.path.insert(0, "src")
from storysphere.core.gather_parts import gather_parts  # noqa: E402


async def _ok(v):
    return v


async def _boom():
    raise RuntimeError("fail")


class TestGatherParts:
    def test_all_succeed_returns_no_failures(self):
        async def run():
            return await gather_parts({"a": _ok(1), "b": _ok(2)})
        results, failed = asyncio.run(run())
        assert results == {"a": 1, "b": 2}
        assert failed == []

    def test_collects_failed_names_keeps_succeeded(self):
        async def run():
            return await gather_parts({"a": _ok(1), "b": _boom(), "c": _ok(3)})
        results, failed = asyncio.run(run())
        assert results == {"a": 1, "c": 3}
        assert failed == ["b"]

    def test_all_fail(self):
        async def run():
            return await gather_parts({"x": _boom(), "y": _boom()})
        results, failed = asyncio.run(run())
        assert results == {}
        assert failed == ["x", "y"]

    def test_empty(self):
        async def run():
            return await gather_parts({})
        results, failed = asyncio.run(run())
        assert results == {} and failed == []
