"""LinkPredictionService — F-01 inferred relation discovery via Common Neighbors + Adamic-Adar.

NOTE (B-035): This implementation is NetworkX-only. A Neo4j-compatible path using
gds.alpha.linkprediction.adamicAdar() must be implemented separately when Neo4j
support is added. See docs/BACKLOG.md B-035.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import networkx as nx

from domain.inferred_relations import InferenceStatus, InferredRelation, InferredRelationType
from domain.relations import Relation, RelationType
from services.kg_service import KGService
from services.link_prediction_store import LinkPredictionStore

logger = logging.getLogger(__name__)

_EPSILON = 1e-9


class LinkPredictionService:
    def __init__(self, kg_service: KGService, store: LinkPredictionStore) -> None:
        self._kg = kg_service
        self._store = store

    # ── Public API ────────────────────────────────────────────────────────────

    async def run_inference(
        self,
        document_id: str,
        max_candidates: int = 20,
        min_common_neighbors: int = 1,
        force_refresh: bool = False,
    ) -> list[InferredRelation]:
        """Run CN + Adamic-Adar on the full book graph and persist results.

        Args:
            document_id: Book / document ID.
            max_candidates: Maximum number of candidates to persist.
            min_common_neighbors: Minimum common neighbors to include a pair.
            force_refresh: Re-compute even for pairs that already have a PENDING record.

        Returns:
            List of PENDING InferredRelation records after the run.
        """
        entities = await self._kg.list_entities(document_id=document_id)
        if len(entities) < 3:
            logger.info("LinkPrediction: fewer than 3 entities in %s, skipping.", document_id)
            return []

        entity_map = {e.id: e for e in entities}

        # Build undirected view for CN / AA computation
        g_directed: nx.MultiDiGraph = self._kg._graph
        g_undirected: nx.Graph = nx.Graph()
        for node in g_directed.nodes():
            if node in entity_map:
                g_undirected.add_node(node)
        for u, v, data in g_directed.edges(data=True):
            if u in entity_map and v in entity_map:
                g_undirected.add_edge(u, v)

        # Collect existing explicit edges (both directions) to skip
        existing_pairs: set[tuple[str, str]] = set()
        for u, v in g_undirected.edges():
            a, b = (u, v) if u <= v else (v, u)
            existing_pairs.add((a, b))

        # Collect already-processed pairs (unless force_refresh)
        skip_pairs: set[tuple[str, str]] = set()
        if not force_refresh:
            existing_records = await self._store.list_by_document(document_id)
            for ir in existing_records:
                if ir.status in (InferenceStatus.PENDING, InferenceStatus.CONFIRMED, InferenceStatus.REJECTED):
                    skip_pairs.add((ir.source_id, ir.target_id))

        # Generate candidate pairs (nodes with >= min_common_neighbors)
        nodes = list(g_undirected.nodes())
        candidates: list[tuple[str, str]] = []
        for i, u in enumerate(nodes):
            for v in nodes[i + 1:]:
                a, b = (u, v) if u <= v else (v, u)
                if (a, b) in existing_pairs or (a, b) in skip_pairs:
                    continue
                cn = len(list(nx.common_neighbors(g_undirected, u, v)))
                if cn >= min_common_neighbors:
                    candidates.append((a, b))

        if not candidates:
            logger.info("LinkPrediction: no new candidates for %s.", document_id)
            return await self._store.list_by_document(document_id, InferenceStatus.PENDING)

        # Compute Adamic-Adar scores
        aa_results: dict[tuple[str, str], tuple[int, float]] = {}
        for u, v, aa_score in nx.adamic_adar_index(g_undirected, candidates):
            a, b = (u, v) if u <= v else (v, u)
            cn_count = len(list(nx.common_neighbors(g_undirected, u, v)))
            aa_results[(a, b)] = (cn_count, aa_score)

        if not aa_results:
            return await self._store.list_by_document(document_id, InferenceStatus.PENDING)

        # Normalise to confidence [0, 1]
        scores = [s for _, s in aa_results.values()]
        min_s, max_s = min(scores), max(scores)
        score_range = max_s - min_s

        def _normalise(score: float) -> float:
            if score_range < _EPSILON:
                return 0.5
            return (score - min_s) / score_range

        # Sort descending by AA score, take top max_candidates
        sorted_pairs = sorted(aa_results.items(), key=lambda kv: kv[1][1], reverse=True)
        sorted_pairs = sorted_pairs[:max_candidates]

        now = time.time()
        relations = await self._kg.list_relations(document_id=document_id)
        relation_index: dict[tuple[str, str], list[RelationType]] = {}
        for rel in relations:
            a, b = (rel.source_id, rel.target_id) if rel.source_id <= rel.target_id else (rel.target_id, rel.source_id)
            relation_index.setdefault((a, b), []).append(rel.relation_type)

        for (a, b), (cn_count, aa_score) in sorted_pairs:
            confidence = _normalise(aa_score)
            common_nbrs = list(nx.common_neighbors(g_undirected, a, b))
            rel_type, reasoning = self._infer_type(a, b, common_nbrs, relation_index, entity_map)
            visible_from = self._visible_from_chapter(a, b, entity_map)

            ir = InferredRelation(
                document_id=document_id,
                source_id=a,
                target_id=b,
                common_neighbor_count=cn_count,
                adamic_adar_score=aa_score,
                confidence=confidence,
                suggested_relation_type=rel_type,
                reasoning=reasoning,
                visible_from_chapter=visible_from,
                created_at=now,
                updated_at=now,
            )
            await self._store.upsert(ir)

        logger.info(
            "LinkPrediction: %d candidates persisted for %s.",
            len(sorted_pairs),
            document_id,
        )
        return await self._store.list_by_document(document_id, InferenceStatus.PENDING)

    async def list_inferred(
        self,
        document_id: str,
        status: Optional[InferenceStatus] = None,
    ) -> list[InferredRelation]:
        return await self._store.list_by_document(document_id, status)

    async def get_inferred(self, ir_id: str) -> Optional[InferredRelation]:
        return await self._store.get(ir_id)

    async def confirm(
        self,
        ir_id: str,
        relation_type: RelationType,
    ) -> Optional[Relation]:
        """Confirm an inferred relation and write it as a real Relation to the KG."""
        ir = await self._store.get(ir_id)
        if ir is None:
            return None

        relation = Relation(
            document_id=ir.document_id,
            source_id=ir.source_id,
            target_id=ir.target_id,
            relation_type=relation_type,
            description=f"Inferred relation (confidence {ir.confidence:.2f}). {ir.reasoning}",
            weight=ir.confidence,
            is_bidirectional=False,
            valid_from_chapter=ir.visible_from_chapter,
        )
        await self._kg.add_relation(relation)
        await self._kg.save()
        await self._store.update_status(
            ir_id, InferenceStatus.CONFIRMED, confirmed_relation_id=relation.id
        )
        logger.info("Confirmed inferred relation %s → Relation %s", ir_id, relation.id)
        return relation

    async def reject(self, ir_id: str) -> None:
        await self._store.update_status(ir_id, InferenceStatus.REJECTED)

    async def delete_by_document(self, document_id: str) -> int:
        return await self._store.delete_by_document(document_id)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _infer_type(
        self,
        source_id: str,
        target_id: str,
        common_neighbors: list[str],
        relation_index: dict[tuple[str, str], list[RelationType]],
        entity_map: dict,
    ) -> tuple[InferredRelationType, str]:
        """Rule-based relation type inference from shared neighborhood."""
        nbr_names: list[str] = []
        has_enemy_with_source = False
        has_enemy_with_target = False
        has_friendly_with_source = False
        has_friendly_with_target = False
        _friendly = {RelationType.FAMILY, RelationType.FRIENDSHIP, RelationType.ALLY, RelationType.ROMANCE}

        for nbr in common_neighbors:
            entity = entity_map.get(nbr)
            if entity:
                nbr_names.append(entity.name)
            a, b = (source_id, nbr) if source_id <= nbr else (nbr, source_id)
            src_types = relation_index.get((a, b), [])
            a, b = (target_id, nbr) if target_id <= nbr else (nbr, target_id)
            tgt_types = relation_index.get((a, b), [])

            if RelationType.ENEMY in src_types:
                has_enemy_with_source = True
            if RelationType.ENEMY in tgt_types:
                has_enemy_with_target = True
            if any(t in _friendly for t in src_types):
                has_friendly_with_source = True
            if any(t in _friendly for t in tgt_types):
                has_friendly_with_target = True

        names_str = "、".join(nbr_names[:5]) if nbr_names else "（不明）"
        reasoning = f"共同鄰居：{names_str}"

        if has_enemy_with_source and has_enemy_with_target:
            return InferredRelationType.POTENTIAL_ALLY, reasoning + "（敵人的敵人）"
        if has_friendly_with_source and has_friendly_with_target:
            return InferredRelationType.POTENTIAL_FRIENDSHIP, reasoning
        if has_enemy_with_source or has_enemy_with_target:
            return InferredRelationType.POTENTIAL_ENEMY, reasoning
        if common_neighbors:
            return InferredRelationType.POTENTIAL_ASSOCIATE, reasoning
        return InferredRelationType.UNKNOWN, reasoning

    def _visible_from_chapter(
        self,
        source_id: str,
        target_id: str,
        entity_map: dict,
    ) -> Optional[int]:
        """Return the earliest chapter where both endpoints are present."""
        src = entity_map.get(source_id)
        tgt = entity_map.get(target_id)
        chapters = [
            e.first_appearance_chapter
            for e in (src, tgt)
            if e is not None and e.first_appearance_chapter is not None
        ]
        if len(chapters) < 2:
            return None
        return max(chapters)
