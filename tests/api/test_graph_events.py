"""Tests for event nodes in graph endpoint + event detail endpoint."""

from __future__ import annotations

import networkx as nx

from domain.entities import Entity, EntityType
from domain.events import Event, EventType
from tests.api.conftest import ALICE, BOB


def _evt(**overrides) -> Event:
    """Create a test event with sensible defaults."""
    defaults = dict(
        id="evt-1",
        title="The Meeting",
        event_type=EventType.MEETING,
        description="Alice met Bob.",
        chapter=1,
        participants=["ent-alice"],
        document_id="doc-1",
    )
    defaults.update(overrides)
    return Event(**defaults)


# ── Graph endpoint includes event nodes + edges ──────────────────────────────


def test_graph_includes_event_nodes(client, mock_kg):
    """Event nodes appear in graph response."""
    evt = _evt(id="evt-1", title="The Battle", participants=["ent-alice", "ent-bob"])
    mock_kg.get_events = _async_return([evt])
    mock_kg._graph = nx.MultiDiGraph()

    resp = client.get("/api/v1/books/doc-1/graph")
    assert resp.status_code == 200
    data = resp.json()

    event_nodes = [n for n in data["nodes"] if n["type"] == "event"]
    assert len(event_nodes) == 1
    assert event_nodes[0]["name"] == "The Battle"
    assert event_nodes[0]["eventType"] == "meeting"
    assert event_nodes[0]["chapter"] == 1
    assert event_nodes[0]["chunkCount"] == 2  # len(participants)


def test_graph_event_edges_participates_in(client, mock_kg):
    """Edges from event to participants are created."""
    evt = _evt(participants=["ent-alice", "ent-bob"])
    mock_kg.get_events = _async_return([evt])
    mock_kg._graph = nx.MultiDiGraph()

    resp = client.get("/api/v1/books/doc-1/graph")
    data = resp.json()

    evt_edges = [e for e in data["edges"] if e["label"] == "participates_in"]
    assert len(evt_edges) == 2
    sources = {e["source"] for e in evt_edges}
    targets = {e["target"] for e in evt_edges}
    assert sources == {"evt-1"}
    assert targets == {"ent-alice", "ent-bob"}


def test_graph_event_edge_occurs_at(client, mock_kg):
    """Location edge is created when location_id is in entity_ids."""
    loc = Entity(id="ent-loc", name="Forest", entity_type=EntityType.LOCATION)
    mock_kg.list_entities = _async_return([ALICE, BOB, loc])

    evt = _evt(participants=["ent-alice"], location_id="ent-loc")
    mock_kg.get_events = _async_return([evt])
    mock_kg._graph = nx.MultiDiGraph()

    resp = client.get("/api/v1/books/doc-1/graph")
    data = resp.json()

    loc_edges = [e for e in data["edges"] if e["label"] == "occurs_at"]
    assert len(loc_edges) == 1
    assert loc_edges[0]["source"] == "evt-1"
    assert loc_edges[0]["target"] == "ent-loc"


def test_graph_event_skips_unknown_participant(client, mock_kg):
    """Participant IDs not in entity_ids don't get edges."""
    evt = _evt(participants=["ent-alice", "ent-unknown"])
    mock_kg.get_events = _async_return([evt])
    mock_kg._graph = nx.MultiDiGraph()

    resp = client.get("/api/v1/books/doc-1/graph")
    data = resp.json()

    evt_edges = [e for e in data["edges"] if e["label"] == "participates_in"]
    assert len(evt_edges) == 1
    assert evt_edges[0]["target"] == "ent-alice"


def test_graph_no_events(client, mock_kg):
    """Books with no events don't break."""
    mock_kg.get_events = _async_return([])
    mock_kg._graph = nx.MultiDiGraph()

    resp = client.get("/api/v1/books/doc-1/graph")
    assert resp.status_code == 200
    data = resp.json()
    event_nodes = [n for n in data["nodes"] if n["type"] == "event"]
    assert event_nodes == []


# ── Event detail endpoint ────────────────────────────────────────────────────


def test_event_detail_success(client, mock_kg):
    """GET /books/:bookId/events/:eventId returns full event detail."""
    evt = _evt(
        title="The Battle",
        participants=["ent-alice", "ent-bob"],
        location_id="ent-loc",
        significance="A turning point.",
        consequences=["Alliance formed"],
    )
    mock_kg.get_event = _async_return_fn({"evt-1": evt})

    loc = Entity(id="ent-loc", name="Forest", entity_type=EntityType.LOCATION)

    async def _get_entity(eid):
        return {"ent-alice": ALICE, "ent-bob": BOB, "ent-loc": loc}.get(eid)

    mock_kg.get_entity = _get_entity

    resp = client.get("/api/v1/books/doc-1/events/evt-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "The Battle"
    assert data["eventType"] == "meeting"
    assert data["chapter"] == 1
    assert data["significance"] == "A turning point."
    assert data["consequences"] == ["Alliance formed"]
    assert len(data["participants"]) == 2
    assert data["location"]["name"] == "Forest"


def test_event_detail_not_found(client, mock_kg):
    """404 when event doesn't exist."""
    mock_kg.get_event = _async_return_fn({})

    resp = client.get("/api/v1/books/doc-1/events/evt-nonexistent")
    assert resp.status_code == 404


def test_event_detail_wrong_book(client, mock_kg):
    """404 when event exists but belongs to a different book."""
    evt = _evt(document_id="doc-other")
    mock_kg.get_event = _async_return_fn({"evt-1": evt})

    resp = client.get("/api/v1/books/doc-1/events/evt-1")
    assert resp.status_code == 404


# ── Helpers ───────────────────────────────────────────────────────────────────


def _async_return(value):
    """Create an async function that returns a fixed value."""
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _async_return_fn(mapping: dict):
    """Create an async function that looks up the first positional arg in mapping."""
    async def _fn(key, *args, **kwargs):
        return mapping.get(key)
    return _fn
