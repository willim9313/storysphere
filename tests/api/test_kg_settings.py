"""KG settings endpoint — the capability warning shown before a backend switch.

`/kg/status` reports what breaks under *each* selectable backend, not just the
one currently loaded. That asymmetry is the whole point: the settings page has
to warn someone on NetworkX about what Neo4j cannot do, and the live instance
can only answer for the mode it is already on.
"""

from __future__ import annotations

from storysphere.services.kg_service import KGService
from storysphere.services.kg_service_base import unsupported_features
from storysphere.services.kg_service_neo4j import Neo4jKGService


class TestUnsupportedFeatures:
    def test_networkx_reports_nothing(self):
        assert unsupported_features(KGService) == []

    def test_neo4j_reports_the_union_of_its_gaps(self):
        """``UNSUPPORTED`` is keyed by raising member; callers want the other
        axis. Two members both breaking the graph page must not surface it
        twice."""
        expected = sorted(
            {f for ids in Neo4jKGService.UNSUPPORTED.values() for f in ids}
        )
        assert unsupported_features(Neo4jKGService) == expected

    def test_result_is_deduplicated(self):
        """`graph` is named by both Neo4j gaps — proof the union collapses it,
        rather than the test passing because nothing overlaps."""
        overlapping = [
            f
            for f, count in (
                (feature, sum(feature in ids for ids in Neo4jKGService.UNSUPPORTED.values()))
                for feature in unsupported_features(Neo4jKGService)
            )
            if count > 1
        ]
        assert overlapping, (
            "no feature is named by more than one gap, so this test proves "
            "nothing about deduplication — pick a different guard"
        )
        result = unsupported_features(Neo4jKGService)
        assert len(result) == len(set(result))


class TestKgStatusCapabilityWarning:
    def test_reports_every_selectable_mode(self, client):
        """Including the mode with nothing to report: the page indexes by mode
        name, and a missing key is indistinguishable from "no gaps" only if
        every caller remembers to default it."""
        body = client.get("/api/v1/kg/status").json()

        assert set(body["unsupportedByMode"]) == {"networkx", "neo4j"}

    def test_warns_about_neo4j_while_running_networkx(self, client):
        """The reason this reads the backend classes rather than the live
        service. Warning after the switch is too late — by then the graph page
        is already 500ing."""
        body = client.get("/api/v1/kg/status").json()

        assert body["mode"] == "networkx"
        assert body["unsupportedByMode"]["networkx"] == []
        assert body["unsupportedByMode"]["neo4j"] == unsupported_features(
            Neo4jKGService
        )

    def test_neo4j_gaps_are_not_empty(self, client):
        """A derivation that silently returns [] would leave the page showing
        no warning at all, which looks exactly like a healthy backend."""
        body = client.get("/api/v1/kg/status").json()

        assert body["unsupportedByMode"]["neo4j"], (
            "Neo4j is known to have capability gaps; an empty list here means "
            "the derivation broke, not that the gaps were closed"
        )

    def test_field_is_camel_case(self, client):
        """`api/schemas/` serialises camelCase; a snake_case key here would
        reach the frontend as undefined and silently render no warning."""
        body = client.get("/api/v1/kg/status").json()

        assert "unsupportedByMode" in body
        assert "unsupported_by_mode" not in body
