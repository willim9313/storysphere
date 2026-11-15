"""Content tables `ev_<claim_type>`, generated from the Pydantic content models.

docs/spec/01 §2、§7：Pydantic model 為準，內容表由它產生，所以兩者不會各改各的。
匯入這個模組就會把 33 張表註冊到 `Base.metadata`（`db.init_db` 會匯入）。
"""

from __future__ import annotations

import types
from typing import Any, Literal, Union, get_args, get_origin

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    insert,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import TypeEngine

from storysphere.domain.evidence import CONTENT_MODELS, EvidenceContent
from storysphere.store.tables import Base

_SCALARS: dict[type, type[TypeEngine]] = {
    str: Text,
    bool: Boolean,
    int: Integer,
    float: Float,
}


def _unwrap_optional(annotation: Any) -> tuple[Any, bool]:
    """`X | None` → (X, True)；其他 → (annotation, False)。"""
    if get_origin(annotation) in (Union, types.UnionType):
        args = [arg for arg in get_args(annotation) if arg is not type(None)]
        if len(args) == 1 and len(args) != len(get_args(annotation)):
            return args[0], True
    return annotation, False


def column_type(annotation: Any) -> TypeEngine:
    """Map a content field annotation to a column type.

    純量各自一種型別，枚舉（Literal）存字串，其餘（list、dict、巢狀物件）一律 JSON。
    """
    inner, _ = _unwrap_optional(annotation)
    if get_origin(inner) is Literal:
        return String()
    if inner in _SCALARS:
        return _SCALARS[inner]()
    return JSON()


def table_name(claim_type: str) -> str:
    return f"ev_{claim_type}"


def _build_table(model: type[EvidenceContent]) -> Table:
    columns = [
        Column(
            "evidence_id",
            String,
            ForeignKey("evidence.id", ondelete="CASCADE"),
            primary_key=True,
        )
    ]
    for name, field in model.model_fields.items():
        _, optional = _unwrap_optional(field.annotation)
        columns.append(Column(name, column_type(field.annotation), nullable=optional))
    return Table(table_name(model.claim_type), Base.metadata, *columns)


CONTENT_TABLES: dict[str, Table] = {
    claim_type: _build_table(model) for claim_type, model in CONTENT_MODELS.items()
}


async def insert_content(
    session: AsyncSession, evidence_id: str, content: EvidenceContent
) -> None:
    table = CONTENT_TABLES[content.claim_type]
    await session.execute(
        insert(table).values(evidence_id=evidence_id, **content.model_dump(mode="json"))
    )


async def get_content(
    session: AsyncSession, claim_type: str, evidence_id: str
) -> dict[str, Any] | None:
    """Return the content row as a plain dict (without `evidence_id`), or None."""
    table = CONTENT_TABLES[claim_type]
    row = (
        await session.execute(select(table).where(table.c.evidence_id == evidence_id))
    ).mappings().one_or_none()
    if row is None:
        return None
    return {key: value for key, value in row.items() if key != "evidence_id"}
