from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from storysphere.store.db import create_engine, init_db, make_session_factory


@pytest.fixture
async def sf(tmp_path) -> AsyncIterator:
    """真實 SQLite（tmp_path）的 session factory。"""
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    yield make_session_factory(engine)
    await engine.dispose()
