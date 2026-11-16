from __future__ import annotations

from tests.api.support import P


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
