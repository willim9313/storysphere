from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta, timezone

import pytest
from storysphere.api.errors import ApiError
from storysphere.api.schemas.common import (
    ApiModel,
    UtcDatetime,
    camelize,
    decode_cursor,
    encode_cursor,
    next_cursor,
)

from tests.api.support import P


class TestCamelize:
    def test_nested_keys_are_converted_and_values_are_not(self):
        assert camelize({"pole_a": {"carrier_ids": ["a_b"]}, "items": [{"is_misdirection": True}]}) == {
            "poleA": {"carrierIds": ["a_b"]},
            "items": [{"isMisdirection": True}],
        }

    def test_data_keyed_fields_keep_their_inner_keys(self):
        out = camelize({"mechanism_density": {"info_control": 1.0}}, frozenset({"mechanism_density"}))
        assert out == {"mechanismDensity": {"info_control": 1.0}}


class TestCursor:
    def test_round_trip(self):
        assert decode_cursor(encode_cursor(150)) == 150

    def test_missing_cursor_is_the_first_page(self):
        assert decode_cursor(None) == 0

    @pytest.mark.parametrize(
        "bad",
        [
            "abc",
            base64.urlsafe_b64encode(b"x:5").decode(),  # 不是 offset cursor
            base64.urlsafe_b64encode(b"o:-1").decode(),  # 負的
            encode_cursor(3)[:-2] + "!!",
        ],
    )
    def test_garbage_is_a_validation_error(self, bad):
        with pytest.raises(ApiError) as caught:
            decode_cursor(bad)
        assert (caught.value.status, caught.value.code) == (422, "validation_error")

    def test_next_cursor_is_null_on_the_last_page(self):
        assert next_cursor(0, 50, 50) is None
        assert decode_cursor(next_cursor(0, 50, 51)) == 50


class TestTime:
    class Stamp(ApiModel):
        made_at: UtcDatetime

    @pytest.mark.parametrize(
        "value",
        [
            datetime(2026, 11, 16, 6, 0, 1),  # SQLite 讀回來的：沒有時區
            datetime(2026, 11, 16, 6, 0, 1, tzinfo=UTC),
            datetime(2026, 11, 16, 14, 0, 1, tzinfo=timezone(timedelta(hours=8))),
        ],
    )
    def test_times_go_out_as_utc_z_under_a_camel_case_key(self, value):
        assert self.Stamp(made_at=value).model_dump(mode="json", by_alias=True) == {
            "madeAt": "2026-11-16T06:00:01Z"
        }


class TestErrorShape:
    def test_unknown_route(self, client):
        response = client.get(f"{P}/nope")
        assert response.status_code == 404
        assert response.json() == {"detail": "Not Found", "code": "not_found"}

    def test_fastapi_validation_errors_use_the_same_shape(self, client):
        response = client.get(f"{P}/jobs?recentLimit=-1")
        assert response.status_code == 422
        body = response.json()
        assert body["code"] == "validation_error" and body["detail"].startswith("query.recentLimit")
