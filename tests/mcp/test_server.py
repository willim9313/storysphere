"""`/mcp` 掛在 FastAPI 上的 HTTP 行為：Bearer token 驗證（04 §1）。"""

from __future__ import annotations

from storysphere.store.agent import create_session

from tests.api.support import add_book, seed
from tests.store.conftest import BOOK

INIT = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "0"},
    },
}
# MCP SDK 預設擋非本機 Host（DNS rebinding 防護）；TestClient 預設是 testserver。
ACCEPT = {"Accept": "application/json, text/event-stream", "Host": "127.0.0.1:8000"}


def _token(path) -> str:
    async def fill(store):
        await add_book(store.session)
        _row, token = await create_session(store.session, book_id=BOOK, backend="deepagents")
        return token

    return seed(path, fill)


class TestAuth:
    def test_missing_token_is_401(self, client):
        response = client.post("/mcp", json=INIT, headers=ACCEPT)
        assert response.status_code == 401
        assert response.json()["code"] == "unauthorized"

    def test_unknown_token_is_401(self, client):
        headers = {**ACCEPT, "Authorization": "Bearer nope"}
        assert client.post("/mcp", json=INIT, headers=headers).status_code == 401

    def test_session_token_reaches_the_server(self, db_file, client):
        headers = {**ACCEPT, "Authorization": f"Bearer {_token(db_file)}"}
        response = client.post("/mcp", json=INIT, headers=headers, follow_redirects=False)
        assert response.status_code == 200, response.text
        assert "storysphere" in response.text

    def test_foreign_host_is_refused(self, db_file, client):
        headers = {**ACCEPT, "Host": "evil.example", "Authorization": f"Bearer {_token(db_file)}"}
        assert client.post("/mcp", json=INIT, headers=headers).status_code == 421
