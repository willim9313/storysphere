"""Shared pieces of the REST schemas (docs/spec/04 §1.1–§1.3)."""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

from storysphere.api.errors import validation_error

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class ApiModel(BaseModel):
    """Base of every REST model: camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


def _utc_z(value: datetime) -> str:
    # SQLite 讀回的時間不帶時區；存進去的都是 UTC（04 §1「時間」）。
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


# UTC ISO 8601，結尾 Z。
UtcDatetime = Annotated[datetime, PlainSerializer(_utc_z, return_type=str)]


def camelize(value: Any, raw_keys: frozenset[str] = frozenset()) -> Any:
    """Convert dict keys to camelCase, recursively (04 §1.1「證據內容欄位」).

    值不轉。``raw_keys`` 列出「以資料當 key」的欄位（snake_case 名），這些欄位底下整棵不轉。
    """
    if isinstance(value, dict):
        return {
            to_camel(key): (item if key in raw_keys else camelize(item, raw_keys))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [camelize(item, raw_keys) for item in value]
    return value


def encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(f"o:{offset}".encode()).decode()


def decode_cursor(cursor: str | None) -> int:
    """Offset behind an opaque cursor; a missing cursor is the first page."""
    if cursor is None:
        return 0
    try:
        kind, _, number = base64.urlsafe_b64decode(cursor.encode()).decode().partition(":")
        offset = int(number)
    except (ValueError, UnicodeDecodeError) as exc:
        raise validation_error("cursor: not a cursor issued by this API") from exc
    if kind != "o" or offset < 0:
        raise validation_error("cursor: not a cursor issued by this API")
    return offset


def next_cursor(offset: int, returned: int, total: int) -> str | None:
    end = offset + returned
    return encode_cursor(end) if returned and end < total else None
