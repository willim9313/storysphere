from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from storysphere.api.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
