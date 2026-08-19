"""Shared pytest configuration for StorySphere tests."""

from __future__ import annotations

import sys
from unittest.mock import AsyncMock

import pytest
from pydantic import TypeAdapter, ValidationError


@pytest.fixture(autouse=True)
def isolated_task_store(monkeypatch):
    """Give every test its own empty task store.

    ``task_store`` is a process-level singleton whose backend comes from
    ``Settings.task_store_backend`` — and that setting **defaults to
    ``"sqlite"``**, with only a local ``.env`` overriding it to ``"memory"``.
    So on any machine without a ``.env`` (fresh clone, container, CI, a git
    worktree) a plain ``pytest`` run used to:

    * write into the **real** ``./var/tasks.db`` — a persistent file that is
      also the running app's task history, and
    * let every test see rows left by every earlier test *and every earlier
      run*, because nothing ever cleared it.

    That is not hypothetical: the file had accumulated 647 rows, among them 35
    ``awaiting_review`` tasks for ``doc-1`` plus one stale ``error`` task for
    the same book.  ``get_task_id_by_book_id`` is ``LIMIT 1`` with no
    ``ORDER BY``, so whichever row SQLite reached first decided the result and
    three chapter-review tests failed depending on that.

    Patching one module attribute is not enough: routers bind the singleton at
    import time (``from storysphere.api.store import task_store``), so each
    holder needs replacing.  The sweep matches **by identity** rather than by
    module name, which is what makes it self-maintaining — a new holder is
    caught automatically, and test modules that bind the singleton at import
    time (``test_ingestion_murmur_seam.py`` does) are covered by the same rule
    instead of needing a special case.

    Modules that import later read the patched module attribute and get the
    same instance.  Tests that want a specific backend build their own store
    directly (see ``test_sqlite_task_store.py``) and are unaffected.
    """
    import storysphere.api.store as store_module

    stores = (store_module.MemoryTaskStore, store_module.SQLiteTaskStore)
    fresh = store_module.MemoryTaskStore()
    monkeypatch.setattr(store_module, "task_store", fresh)

    for module in list(sys.modules.values()):
        if module is None or module is store_module:
            continue
        # ``vars()`` rather than ``getattr()`` on purpose: lazy module proxies
        # (torch, transformers) implement ``__getattr__`` to import submodules
        # on demand, so probing them by attribute drags in optional deps that
        # are not installed and turns the whole suite into import errors.
        # A module-level ``from ... import task_store`` binding is in
        # ``__dict__``, which is all this needs to see.
        #
        # Matching on **type** rather than on "is the original singleton" is
        # what makes this self-healing.  A router module first imported *during*
        # a test — any test whose fixture calls ``create_app()`` — binds that
        # test's store, and monkeypatch never learnt about it, so it keeps a
        # dead store once the test ends.  An identity check would then skip it
        # forever: the router would write to the stale store while ``get_task``
        # read the current one, and the endpoint would answer 404 for a task it
        # had just created.
        if isinstance(vars(module).get("task_store"), stores):
            monkeypatch.setattr(module, "task_store", fresh)

    return fresh


def attach_get_as(cache):
    """Give an AsyncMock cache a ``get_as`` that reads through its ``get``.

    Mirrors the real AnalysisCache, so a test can keep stubbing ``get`` with
    raw dicts and still exercise call sites that read via ``get_as``.
    Returns the same mock, for use inline where the mock is built.

    The mismatch case must degrade to None exactly as the real helper does —
    a double that raises instead turns a tolerated stale entry into a 500 and
    hides the behaviour under test.
    """

    async def _get_as(key, model):
        raw = await cache.get(key)
        if raw is None:
            return None
        try:
            return TypeAdapter(model).validate_python(raw)
        except ValidationError:
            return None

    cache.get_as = AsyncMock(side_effect=_get_as)
    return cache


def pytest_addoption(parser):
    parser.addoption(
        "--neo4j",
        action="store_true",
        default=False,
        help="Run Neo4j integration tests (requires a running Neo4j instance)",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "neo4j: mark test as requiring a live Neo4j instance"
    )


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--neo4j"):
        skip = pytest.mark.skip(reason="Pass --neo4j to run Neo4j integration tests")
        for item in items:
            if "neo4j" in item.keywords:
                item.add_marker(skip)
