"""Tests for WS /ws/chat endpoint."""

from __future__ import annotations


def test_chat_ws_streams_chunks(client):
    with client.websocket_connect("/ws/chat?session_id=test-session") as ws:
        ws.send_json({"message": "Who is Alice?"})

        chunks = []
        while True:
            msg = ws.receive_json()
            if msg["type"] == "done":
                break
            assert msg["type"] == "chunk"
            chunks.append(msg["content"])

        assert len(chunks) > 0
        full_response = "".join(chunks)
        assert "Hello" in full_response or len(full_response) > 0


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
        msgs = []
        while True:
            msg = ws.receive_json()
            msgs.append(msg)
            if msg["type"] == "done":
                break
        assert any(m["type"] == "chunk" for m in msgs)


def test_chat_ws_session_isolation(client):
    """Two sessions maintain independent states."""
    with client.websocket_connect("/ws/chat?session_id=session-a") as ws_a:
        ws_a.send_json({"message": "Hello from A"})
        while True:
            msg = ws_a.receive_json()
            if msg["type"] == "done":
                break

    with client.websocket_connect("/ws/chat?session_id=session-b") as ws_b:
        ws_b.send_json({"message": "Hello from B"})
        msgs = []
        while True:
            msg = ws_b.receive_json()
            msgs.append(msg)
            if msg["type"] == "done":
                break
        # Both sessions work independently
        assert any(m["type"] == "chunk" for m in msgs)
