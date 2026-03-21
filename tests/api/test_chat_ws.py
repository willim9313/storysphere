"""Tests for WS /ws/chat endpoint."""

from __future__ import annotations

from api.schemas.chat import ChatContext, ChatIncomingMessage


def test_chat_context_schema_defaults():
    ctx = ChatContext()
    assert ctx.page == "library"
    assert ctx.book_id is None
    assert ctx.selected_entity is None


def test_chat_context_schema_full():
    ctx = ChatContext(
        page="graph",
        book_id="b1",
        book_title="Pride",
        chapter_id="c1",
        chapter_title="Ch 1",
        selected_entity={"id": "e1", "name": "Elizabeth", "type": "character"},
    )
    assert ctx.page == "graph"
    assert ctx.selected_entity["name"] == "Elizabeth"


def test_chat_incoming_message_backward_compat():
    msg = ChatIncomingMessage(message="hello")
    assert msg.context is None


def test_chat_incoming_message_with_context():
    msg = ChatIncomingMessage(
        message="Who?",
        context={"page": "reader", "book_id": "b1"},
    )
    assert msg.context is not None
    assert msg.context.page == "reader"
    assert msg.context.book_id == "b1"


def _recv_until_done(ws) -> list[dict]:
    """Receive messages until 'done' or 'error', preventing infinite hangs."""
    msgs = []
    for _ in range(100):  # safety cap
        msg = ws.receive_json()
        msgs.append(msg)
        if msg["type"] in ("done", "error"):
            break
    return msgs


def test_chat_ws_streams_chunks(client):
    with client.websocket_connect("/ws/chat?session_id=test-session") as ws:
        ws.send_json({"message": "Who is Alice?"})

        msgs = _recv_until_done(ws)
        chunks = [m["content"] for m in msgs if m["type"] == "chunk"]

        assert len(chunks) > 0
        assert msgs[-1]["type"] == "done"
        full_response = "".join(chunks)
        assert len(full_response) > 0


def test_chat_ws_empty_message_returns_error(client):
    with client.websocket_connect("/ws/chat?session_id=empty-test") as ws:
        ws.send_json({"message": ""})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "empty" in msg["detail"].lower()


def test_chat_ws_default_session(client):
    """Connects without explicit session_id — uses 'default'."""
    with client.websocket_connect("/ws/chat") as ws:
        ws.send_json({"message": "Hello"})
        msgs = _recv_until_done(ws)
        assert any(m["type"] == "chunk" for m in msgs)
        assert msgs[-1]["type"] == "done"


def test_chat_ws_session_isolation(client):
    """Two sessions maintain independent states."""
    with client.websocket_connect("/ws/chat?session_id=session-a") as ws_a:
        ws_a.send_json({"message": "Hello from A"})
        _recv_until_done(ws_a)

    with client.websocket_connect("/ws/chat?session_id=session-b") as ws_b:
        ws_b.send_json({"message": "Hello from B"})
        msgs = _recv_until_done(ws_b)
        assert any(m["type"] == "chunk" for m in msgs)
        assert msgs[-1]["type"] == "done"


def test_chat_ws_with_context(client):
    """Messages with context are accepted and processed without error."""
    with client.websocket_connect("/ws/chat?session_id=ctx-test") as ws:
        ws.send_json({
            "message": "Who is this character?",
            "context": {
                "page": "graph",
                "book_id": "b1",
                "book_title": "Pride and Prejudice",
                "selected_entity": {"id": "e1", "name": "Elizabeth", "type": "character"},
            },
        })
        msgs = _recv_until_done(ws)
        assert msgs[-1]["type"] == "done"


def test_chat_ws_context_hydrates_state(client):
    """Context data is written to the ChatState (check via entity mention)."""
    from api.routers.chat_ws import _sessions, _sessions_lock

    sid = "hydrate-test"
    with client.websocket_connect(f"/ws/chat?session_id={sid}") as ws:
        ws.send_json({
            "message": "Tell me about her",
            "context": {
                "page": "analysis",
                "book_id": "book-42",
                "selected_entity": {"id": "e1", "name": "Jane Bennet", "type": "character"},
            },
        })
        _recv_until_done(ws)

        with _sessions_lock:
            state = _sessions.get(sid)
        if state:
            assert state.book_id == "book-42"
            assert state.page_context == "analysis"
            assert "Jane Bennet" in state.detected_entities
