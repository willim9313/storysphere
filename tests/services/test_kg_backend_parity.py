"""The two KG backends must stay interchangeable.

``KGServiceBase`` is an ABC, so Python already refuses to instantiate a backend
that skips an abstract method. What it does **not** catch is drift: a method
gaining a parameter on one side only, or a capability landing on NetworkX and
never reaching Neo4j.

That has happened. B-048 records Link Prediction calling
``nx.adamic_adar_index()`` directly, leaving Neo4j users without the feature —
and it sat in the backlog for months because nothing failed. This file is the
cheap part of the fix: it will not implement anything for Neo4j, but it makes
the next divergence fail here instead of surfacing as a user report.
"""

from __future__ import annotations

import inspect

import pytest
from storysphere.services.kg_service import KGService
from storysphere.services.kg_service_base import KGServiceBase
from storysphere.services.kg_service_neo4j import Neo4jKGService

BACKENDS = [KGService, Neo4jKGService]

# Public members that legitimately exist on one backend only, with the reason.
# Anything not listed here is drift until someone decides otherwise.
BACKEND_ONLY: dict[str, str] = {
    # Neo4j holds a driver; NetworkX holds a dict.
    "close": "Neo4j driver lifecycle",
    "verify_connectivity": "Neo4j driver lifecycle",
    # The counts are properties on the base (cheap for an in-memory graph);
    # over the wire they need a round trip, so Neo4j offers awaitable variants.
    "async_entity_count": "Neo4j round-trip variant of a base property",
    "async_relation_count": "Neo4j round-trip variant of a base property",
    "async_event_count": "Neo4j round-trip variant of a base property",
}


def _public_members(cls) -> set[str]:
    return {
        name
        for name, _ in inspect.getmembers(cls)
        if not name.startswith("_")
    }


def _parameters(cls, name: str) -> list[str] | None:
    member = getattr(cls, name, None)
    if member is None:
        return None
    if isinstance(member, property):
        member = member.fget
    return list(inspect.signature(member).parameters)


# ── Every abstract member is implemented ─────────────────────────────────────


class TestAbstractCoverage:
    @pytest.mark.parametrize("backend", BACKENDS, ids=lambda c: c.__name__)
    def test_implements_every_abstract_member(self, backend):
        missing = sorted(
            name for name in KGServiceBase.__abstractmethods__
            if getattr(backend, name, None) is None
        )

        assert missing == []

    @pytest.mark.parametrize("backend", BACKENDS, ids=lambda c: c.__name__)
    def test_is_a_registered_subclass(self, backend):
        assert issubclass(backend, KGServiceBase)


# ── Signatures do not drift ──────────────────────────────────────────────────


class TestSignatureParity:
    """Parameters only — return annotations differ harmlessly today
    (``Neo4jKGService.get_snapshot`` says ``tuple`` where the base spells the
    generic out), and pinning them would fail on formatting rather than on
    anything a caller can observe.
    """

    @pytest.mark.parametrize("name", sorted(KGServiceBase.__abstractmethods__))
    def test_both_backends_take_the_base_parameters(self, name):
        expected = _parameters(KGServiceBase, name)

        actual = {b.__name__: _parameters(b, name) for b in BACKENDS}

        assert actual == {b.__name__: expected for b in BACKENDS}


# ── No unannounced backend-only capability ───────────────────────────────────


class TestNoUndeclaredDivergence:
    def test_backend_only_members_are_all_declared(self):
        """A capability on one backend and not the other is a decision.

        Adding one is fine — record it in ``BACKEND_ONLY`` with why, so the
        next person reading this knows it was chosen rather than forgotten.
        """
        nx_only = _public_members(KGService) - _public_members(Neo4jKGService)
        neo_only = _public_members(Neo4jKGService) - _public_members(KGService)

        undeclared = sorted((nx_only | neo_only) - set(BACKEND_ONLY))

        assert undeclared == [], (
            "public members exist on one KG backend only and are not listed in "
            "BACKEND_ONLY — implement them on both, or declare the split "
            "deliberately (see B-048)"
        )

    def test_declared_exceptions_still_exist(self):
        """A stale allowlist hides the next real divergence behind a name that
        no longer means anything."""
        everything = _public_members(KGService) | _public_members(Neo4jKGService)

        stale = sorted(set(BACKEND_ONLY) - everything)

        assert stale == []
