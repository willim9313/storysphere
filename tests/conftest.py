"""Shared pytest configuration for StorySphere tests."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from pydantic import TypeAdapter, ValidationError


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
