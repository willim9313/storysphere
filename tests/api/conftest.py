from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from storysphere.api.main import app
from storysphere.llm.settings import DEFAULT_SETTINGS_PATH, SETTINGS_ENV


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # 固定讀 repo 的預設設定，測試不受本機 var/settings.yaml 影響。
    monkeypatch.setenv(SETTINGS_ENV, str(DEFAULT_SETTINGS_PATH))
    with TestClient(app) as test_client:
        yield test_client
