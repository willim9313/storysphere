from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from storysphere.api.main import (
    CHECKPOINT_ENV,
    DB_ENV,
    UPLOAD_DIR_ENV,
    WATCH_INTERVAL_ENV,
    app,
)
from storysphere.llm.settings import DEFAULT_SETTINGS_PATH, SETTINGS_ENV


@pytest.fixture
def db_file(tmp_path: Path) -> Path:
    """這個測試的資料庫檔；`client` 啟動時會建表。要先塞資料的測試用 `tests/api/support.seed`。"""
    return tmp_path / "neo.db"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, db_file: Path) -> Iterator[TestClient]:
    # 固定讀 repo 的預設設定，測試不受本機 var/settings.yaml 影響。
    monkeypatch.setenv(SETTINGS_ENV, str(DEFAULT_SETTINGS_PATH))
    # 資料檔一律在 tmp_path，不碰 var/。
    monkeypatch.setenv(DB_ENV, str(db_file))
    monkeypatch.setenv(CHECKPOINT_ENV, str(db_file.parent / "ckpt.db"))
    monkeypatch.setenv(UPLOAD_DIR_ENV, str(db_file.parent / "uploads"))
    # 監看迴圈另外測（tests/api/test_watcher.py）；這裡關掉，免得它在背景改 progress／last_seq。
    monkeypatch.setenv(WATCH_INTERVAL_ENV, "0")
    with TestClient(app) as test_client:
        yield test_client
