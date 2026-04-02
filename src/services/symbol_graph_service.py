"""Co-occurrence graph service for symbolic imagery.

Builds an in-memory NetworkX DiGraph on demand (API-triggered, not at ingestion).
Parallel to KGService but operates on ImageryEntity nodes rather than EntityNode.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import networkx as nx

logger = logging.getLogger(__name__)


@dataclass
class ImageryNode:
    term: str
    imagery_type: str
    frequency: int
    imagery_id: str


class SymbolGraphService:
    """On-demand co-occurrence graph for imagery entities.

    Graphs are keyed by book_id and cached in memory for the process lifetime.
    Call build_graph() explicitly to (re-)build a book's graph.
    """

    def __init__(self) -> None:
        self._graphs: dict[str, nx.DiGraph] = {}

    async def build_graph(self, book_id: str, symbol_service) -> nx.DiGraph:
        """Build (or rebuild) the co-occurrence graph for a book.

        Nodes are imagery terms; directed edges carry a weight equal to
        the number of paragraphs in which the two terms co-occur.

        Args:
            book_id: The book identifier.
            symbol_service: SymbolService instance for data access.

        Returns:
            The constructed DiGraph.
        """
        entities = await symbol_service.get_imagery_list(book_id)
        occurrences = await symbol_service.get_occurrences_by_book(book_id)

        g: nx.DiGraph = nx.DiGraph()

        # Add a node per imagery entity
        id_to_term: dict[str, str] = {}
        for entity in entities:
            node = ImageryNode(
                term=entity.term,
                imagery_type=entity.imagery_type.value,
                frequency=entity.frequency,
                imagery_id=entity.id,
            )
            g.add_node(entity.term, **node.__dict__)
            id_to_term[entity.id] = entity.term

        # Build paragraph-level co-occurrence map:  paragraph_id → list[term]
        para_terms: dict[str, list[str]] = {}
        for occ in occurrences:
            term = id_to_term.get(occ.imagery_id)
            if term is None:
                continue
            para_terms.setdefault(occ.paragraph_id, []).append(term)

        # Add edges for terms that appear in the same paragraph
        for terms in para_terms.values():
            unique_terms = list(dict.fromkeys(terms))  # preserve order, deduplicate
            for i, t1 in enumerate(unique_terms):
                for t2 in unique_terms[i + 1 :]:
                    if g.has_edge(t1, t2):
                        g[t1][t2]["weight"] += 1
                    else:
                        g.add_edge(t1, t2, weight=1)
                    # Symmetric: also add reverse edge with same weight
                    if g.has_edge(t2, t1):
                        g[t2][t1]["weight"] += 1
                    else:
                        g.add_edge(t2, t1, weight=1)

        self._graphs[book_id] = g
        logger.info(
            "SymbolGraphService: built graph book=%s nodes=%d edges=%d",
            book_id,
            g.number_of_nodes(),
            g.number_of_edges(),
        )
        return g

    async def get_co_occurrences(
        self,
        book_id: str,
        term: str,
        top_k: int = 10,
    ) -> list[tuple[str, int]]:
        """Return top-k co-occurring terms for a given imagery term.

        Args:
            book_id: The book identifier.
            term: Canonical imagery term (node label).
            top_k: Maximum number of results to return.

        Returns:
            List of (co_term, weight) tuples sorted by weight descending.

        Raises:
            KeyError: If the book graph has not been built yet.
            ValueError: If term is not in the graph.
        """
        if not self._ensure_graph(book_id):
            raise KeyError(f"Graph for book '{book_id}' has not been built. Call build_graph() first.")

        g = self._graphs[book_id]
        if term not in g:
            return []

        neighbors = [
            (neighbor, g[term][neighbor].get("weight", 0))
            for neighbor in g.successors(term)
        ]
        neighbors.sort(key=lambda x: x[1], reverse=True)
        return neighbors[:top_k]

    def _ensure_graph(self, book_id: str) -> bool:
        """Return True if the graph for this book has been built."""
        return book_id in self._graphs
