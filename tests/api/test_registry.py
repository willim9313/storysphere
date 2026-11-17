from __future__ import annotations

from storysphere.store.agent import TraceCallRow, create_session

from tests.api.support import P, add_book, seed
from tests.store.conftest import BOOK


class TestMethods:
    def test_all_methods_with_implemented_flag(self, client):
        methods = {m["code"]: m for m in client.get(f"{P}/registry/methods").json()}
        assert len(methods) == 18
        assert {code for code, m in methods.items() if m["implemented"]} == {
            "EV1", "EV2", "CH2", "CH4", "CH5",
        }  # fmt: skip
        ev1 = methods["EV1"]
        assert ev1["id"] == "event.kernel_satellite" and ev1["implKind"] == "hybrid"
        assert ev1["llmTask"] == "method_light" and ev1["scopeSelector"] is None
        assert {"claimType": "causal_link", "genreExt": None, "optional": False, "source": None} in ev1["requires"]

    def test_filter_by_layer(self, client):
        layers = {m["layer"] for m in client.get(f"{P}/registry/methods?layer=genre").json()}
        assert layers == {"genre"}


class TestMethodDetail:
    def test_declaration_with_dag_neighbours(self, client):
        method = client.get(f"{P}/registry/methods/event.causal_network").json()
        assert method["impl"]["module"] and method["impl"]["prompt"]
        assert "event.kernel_satellite" in method["downstreamMethods"]
        assert method["usedByMethodologies"] == []

    def test_unknown_method_is_404(self, client):
        assert client.get(f"{P}/registry/methods/nope").json()["code"] == "not_found"


class TestDag:
    def test_nodes_and_edges(self, client):
        dag = client.get(f"{P}/registry/dag").json()
        nodes = {node["id"]: node for node in dag["nodes"]}
        assert nodes["event"]["kind"] == "claim_type" and nodes["event"]["level"] == 1
        assert nodes["event.kernel_satellite"]["kind"] == "method"
        assert {"from": "event.kernel_satellite", "to": "event_role", "kind": "produces"} in dag["edges"]


class TestViews:
    def test_view_catalog_and_default_cards(self, client):
        catalog = client.get(f"{P}/registry/views").json()
        views = {view["viewType"]: view for view in catalog["viewTypes"]}
        assert len(views) == 13 and views["network"]["usedBy"] == ["character.network"]
        cards = {p["genre"]: [card["refId"] for card in p["cards"]] for p in catalog["perspectives"]}
        assert cards["mystery"] == ["info.fair_play_audit", "character.belief"]
        assert len(cards["universal"]) == 3


class TestMethodologies:
    def test_builtin_methodologies_are_listed_as_not_implemented(self, client):
        items = {m["code"]: m for m in client.get(f"{P}/registry/methodologies").json()}
        assert set(items) == {"MY2", "TM3"}
        my2 = items["MY2"]
        assert my2["id"] == "builtin.puzzle_type" and my2["owner"] == "contract"
        assert my2["implemented"] is False
        assert [s["method"] for s in my2["steps"][:3]] == [
            "info.two_story", "info.trick_class", "info.fair_play_audit",
        ]  # fmt: skip
        assert my2["steps"][-1]["synthesis"]["produces"] == "puzzle_type"

    def test_single_methodology(self, client):
        body = client.get(f"{P}/registry/methodologies/builtin.theme_synthesis").json()
        assert body["code"] == "TM3" and body["view"] == "theme_card"

    def test_unknown_methodology_is_404(self, client):
        assert client.get(f"{P}/registry/methodologies/nope").status_code == 404


async def _session_with_turn(store) -> str:
    """t1：CH4 跑兩次（第二次同參數，去重）、一次 dry_run、一次失敗、讀取；t2：只有讀取。"""
    await add_book(store.session)
    row, _ = await create_session(store.session, book_id=BOOK, backend="deepagents")
    calls = [
        ("t1", "get_run", {"method_id": "character.arc"}, "ok"),
        ("t1", "run_method", {"method_id": "character.network"}, "ok"),
        ("t1", "run_method", {"method_id": "info.knowledge_state", "dry_run": True}, "ok"),
        ("t1", "run_method", {"method_id": "event.kernel_satellite"}, "error"),
        ("t1", "run_method", {"method_id": "character.arc",
                              "inputs": {"subject_ids": ["c1"]}}, "ok"),  # fmt: skip
        ("t1", "run_method", {"method_id": "character.network"}, "ok"),
        ("t2", "search_evidence", {"query": "x"}, "ok"),
    ]
    for seq, (turn, tool, args, status) in enumerate(calls, start=1):
        store.session.add(TraceCallRow(session_id=row.id, seq=seq, turn_id=turn, tool=tool,
                                       args_json=args, status=status))  # fmt: skip
    return row.id


class TestSaveMethodology:
    def save(self, client, sid: str, turn: str = "t1", **extra):
        body = {"question": "誰和誰一夥？", "fromSession": {"sessionId": sid, "turnId": turn}}
        return client.post(f"{P}/registry/methodologies", json=body | extra)

    def test_steps_are_the_turns_run_method_calls(self, client, db_file):
        sid = seed(db_file, _session_with_turn)
        response = self.save(client, sid)
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["id"].startswith("user.")
        assert (body["owner"], body["grade"], body["version"]) == ("user", "使用者自建", 1)
        assert body["implemented"] is False
        assert [(s["method"], s["input"]) for s in body["steps"]] == [
            ("character.network", None), ("character.arc", {"subject_ids": ["c1"]}),
        ]  # fmt: skip

        listed = client.get(f"{P}/registry/methodologies").json()
        assert listed[-1]["id"] == body["id"] and listed[0]["owner"] == "contract"
        detail = client.get(f"{P}/registry/methodologies/{body['id']}").json()
        assert detail["question"] == "誰和誰一夥？"

    def test_turn_without_run_method_is_no_steps(self, client, db_file):
        sid = seed(db_file, _session_with_turn)
        response = self.save(client, sid, turn="t2")
        assert response.status_code == 422 and response.json()["code"] == "no_steps"

    def test_unknown_session_is_404(self, client):
        assert self.save(client, "nope").status_code == 404

    def test_other_request_forms_are_not_supported(self, client):
        response = client.post(f"{P}/registry/methodologies",
                               json={"question": "q", "steps": [{"method": "character.arc"}]})  # fmt: skip
        assert response.status_code == 422 and response.json()["code"] == "validation_error"

    def test_system_field_is_refused(self, client, db_file):
        sid = seed(db_file, _session_with_turn)
        response = self.save(client, sid, level=1)
        assert response.status_code == 422 and response.json()["code"] == "system_field_forbidden"
