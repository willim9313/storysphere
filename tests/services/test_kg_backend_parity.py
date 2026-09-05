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

import ast
import inspect
import textwrap

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


# ── Members that exist but raise ─────────────────────────────────────────────
#
# The tests above prove both backends *have* every abstract member. They say
# nothing about whether calling one works. Two Neo4j members raise
# NotImplementedError, and because the signature is right they sail through
# every check above — a green parity suite next to a backend that cannot serve
# the graph page.


# Members that raise by design, with a working alternative. Not capability
# gaps: the base declares these as properties (cheap on an in-memory graph),
# and over the wire they need a round trip, so Neo4j points callers at the
# awaitable variants instead of doing blocking I/O in a property.
RAISING_BY_DESIGN: dict[str, str] = {
    "entity_count": "await async_entity_count()",
    "relation_count": "await async_relation_count()",
    "event_count": "await async_event_count()",
}


def _members_that_only_raise(cls) -> set[str]:
    """Public members whose whole body is ``raise NotImplementedError``."""
    tree = ast.parse(textwrap.dedent(inspect.getsource(cls)))
    class_def = tree.body[0]
    assert isinstance(class_def, ast.ClassDef)

    found: set[str] = set()
    for node in class_def.body:
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        if node.name.startswith("_"):
            continue
        body = [n for n in node.body if not _is_docstring(n)]
        if len(body) != 1 or not isinstance(body[0], ast.Raise):
            continue
        exc = body[0].exc
        name = exc.func if isinstance(exc, ast.Call) else exc
        if isinstance(name, ast.Name) and name.id == "NotImplementedError":
            found.add(node.name)
    return found


def _is_docstring(node: ast.stmt) -> bool:
    return isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)


class TestUnsupportedMembers:
    def test_parser_finds_something(self):
        """The failure mode of a source-scanning test is matching nothing and
        passing on an empty set — which is exactly the silence it exists to
        break. Neo4j is known to have raising members; if this comes back
        empty the parser broke, not the backend."""
        assert _members_that_only_raise(Neo4jKGService), (
            "the NotImplementedError scan found no members at all — "
            "_members_that_only_raise() needs updating, not the backend"
        )

    @pytest.mark.parametrize("backend", BACKENDS, ids=lambda c: c.__name__)
    def test_gaps_match_the_declaration(self, backend):
        """``UNSUPPORTED`` is what ``/kg/switch`` warns from, so it has to stay
        equal to reality in both directions: a new gap that nobody declared,
        and a declaration left behind after the gap closed, are both wrong.

        Parametrised rather than written against Neo4j, because NetworkX
        having no gaps today is a fact about today, not a property of the
        backend.
        """
        actual = _members_that_only_raise(backend) - set(RAISING_BY_DESIGN)
        declared = set(backend.UNSUPPORTED)

        undeclared = sorted(actual - declared)
        stale = sorted(declared - actual)

        assert undeclared == [], (
            f"{backend.__name__} members raise NotImplementedError but are "
            f"not in UNSUPPORTED: {undeclared}. Callers cannot be warned about a gap "
            f"nobody wrote down — add it with the features it breaks, or "
            f"implement it (see B-048)"
        )
        assert stale == [], (
            f"UNSUPPORTED still lists {stale}, which no longer raise. A stale "
            f"entry makes /kg/switch warn about a feature that now works"
        )

    @pytest.mark.parametrize("backend", BACKENDS, ids=lambda c: c.__name__)
    def test_every_gap_names_what_it_breaks(self, backend):
        """A gap recorded without its blast radius is a name, not a warning —
        the switch endpoint shows these strings to the person deciding."""
        for member, reason in backend.UNSUPPORTED.items():
            assert reason.strip(), f"{backend.__name__}.{member} has no reason recorded"

    @pytest.mark.parametrize("backend", BACKENDS, ids=lambda c: c.__name__)
    def test_gaps_are_declared_abstract_members(self, backend):
        """A gap on something the base never promised is a different problem;
        this test is about the interface lying, so keep it to that."""
        assert set(backend.UNSUPPORTED) <= KGServiceBase.__abstractmethods__
