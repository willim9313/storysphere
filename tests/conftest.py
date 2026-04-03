"""Shared pytest configuration for StorySphere tests."""

from __future__ import annotations

import pytest


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
