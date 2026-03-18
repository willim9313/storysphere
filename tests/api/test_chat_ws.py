"""Tests for WS /ws/chat endpoint."""

from __future__ import annotations


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
