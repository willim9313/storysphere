"""內容表與 Pydantic model 的漂移檢查（docs/spec/01 §7）：兩邊欄位不一致就失敗。"""

from __future__ import annotations

import pytest
from sqlalchemy import JSON, Boolean, Float, Integer, String, Text, inspect
from storysphere.domain.evidence import CONTENT_MODELS
from storysphere.store.content_tables import CONTENT_TABLES, column_type, table_name


class TestContentTablesMatchModels:
    def test_one_table_per_claim_type(self):
        assert set(CONTENT_TABLES) == set(CONTENT_MODELS)
        assert len(CONTENT_TABLES) == 33

    @pytest.mark.parametrize("claim_type", sorted(CONTENT_MODELS))
    def test_columns_equal_model_fields(self, claim_type):
        table = CONTENT_TABLES[claim_type]
        model = CONTENT_MODELS[claim_type]

        assert table.name == f"ev_{claim_type}"
        assert set(table.c.keys()) == {"evidence_id", *model.model_fields}
        assert [c.name for c in table.primary_key] == ["evidence_id"]

    @pytest.mark.parametrize("claim_type", sorted(CONTENT_MODELS))
    def test_required_fields_are_not_nullable(self, claim_type):
        table = CONTENT_TABLES[claim_type]
        for name, field in CONTENT_MODELS[claim_type].model_fields.items():
            accepts_none = type(None) in getattr(field.annotation, "__args__", ())
            assert table.c[name].nullable is accepts_none, name

    async def test_database_has_the_same_columns(self, session):
        """實際建出來的資料庫（不只是 metadata）也要一致。"""

        def read_columns(sync_conn):
            inspector = inspect(sync_conn)
            return {
                claim_type: {col["name"] for col in inspector.get_columns(table_name(claim_type))}
                for claim_type in CONTENT_MODELS
            }

        connection = await session.connection()
        actual = await connection.run_sync(read_columns)

        for claim_type, model in CONTENT_MODELS.items():
            assert actual[claim_type] == {"evidence_id", *model.model_fields}, claim_type


class TestColumnType:
    @pytest.mark.parametrize(
        ("annotation", "expected"),
        [
            (str, Text),
            (str | None, Text),
            (int, Integer),
            (float | None, Float),
            (bool, Boolean),
            (list[str], JSON),
            (dict[str, float], JSON),
        ],
    )
    def test_annotation_maps_to_column_type(self, annotation, expected):
        assert isinstance(column_type(annotation), expected)

    def test_enum_stored_as_string(self):
        annotation = CONTENT_MODELS["event"].model_fields["event_type"].annotation
        assert isinstance(column_type(annotation), String)
