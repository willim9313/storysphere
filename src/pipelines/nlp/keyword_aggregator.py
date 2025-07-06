
from typing import List, Dict, Tuple, Literal
from collections import defaultdict
import math
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering
import numpy as np

class KeywordAggregator:
    def __init__(
        self,
        top_n: int = 10,
        score_strategy: Literal["sum", "avg", "max"] = "sum",
        weight_by_count: bool = True,
        semantic_merge: bool = False,
        semantic_model: str = "paraphrase-MiniLM-L6-v2",
        similarity_threshold: float = 0.8
    ):
        """
        Initialize the aggregator.

        Args:
            top_n (int): Number of top keywords to return.
            score_strategy (str): Strategy to aggregate scores. Options: "sum", "avg", "max".
            weight_by_count (bool): Whether to apply frequency-based weighting.
            semantic_merge (bool): Whether to enable semantic merging of similar keywords.
            semantic_model (str): SentenceTransformer model for embedding.
            similarity_threshold (float): Cosine similarity threshold for merging.
        """
        self.top_n = top_n
        self.score_strategy = score_strategy
        self.weight_by_count = weight_by_count
        self.semantic_merge = semantic_merge
        self.similarity_threshold = similarity_threshold
        self.model = SentenceTransformer(semantic_model) if semantic_merge else None


    def aggregate(self, keyword_scores_list: List[Dict[str, float]]) -> Tuple[List[str], Dict[str, float]]:
        """
        Aggregate a list of keyword_scores dictionaries into top keywords and their scores.

        Args:
            keyword_scores_list (List[Dict[str, float]]): List of keyword-score dicts from chunks or chapters.

        Returns:
            Tuple[List[str], Dict[str, float]]: A list of top keywords and their corresponding score dict.
        """
        counter = defaultdict(list)

        # Collect all scores for each keyword
        for kw_scores in keyword_scores_list:
            for kw, score in kw_scores.items():
                counter[kw].append(score)

        # Aggregate scores
        aggregated_scores = {}
        for kw, scores in counter.items():
            if self.score_strategy == "avg":
                score = sum(scores) / len(scores)
            elif self.score_strategy == "max":
                score = max(scores)
            else:  # default: sum
                score = sum(scores)

            if self.weight_by_count:
                score *= math.log(len(scores) + 1)

            aggregated_scores[kw] = round(score, 2)
        
        # If semantic merging is enabled, apply it
        if self.semantic_merge:
            return self._semantic_merge(aggregated_scores)
        else:
            return self._finalize(aggregated_scores)

    def _semantic_merge(self, aggregated_scores: Dict[str, float]) -> Tuple[List[str], Dict[str, float]]:
        keywords = list(aggregated_scores.keys())
        embeddings = self.model.encode(keywords, convert_to_numpy=True)
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=1 - self.similarity_threshold,
            metric='cosine',
            linkage='average'
        ).fit(embeddings)

        cluster_map = defaultdict(list)
        for idx, label in enumerate(clustering.labels_):
            cluster_map[label].append(keywords[idx])

        merged_scores = {}
        for cluster_keywords in cluster_map.values():
            # Combine scores within a cluster
            cluster_total = sum(aggregated_scores[kw] for kw in cluster_keywords)
            # Choose representative: highest score or shortest name
            rep = max(cluster_keywords, key=lambda k: (aggregated_scores[k], -len(k)))
            merged_scores[rep] = cluster_total

        return self._finalize(merged_scores)

    def _finalize(self, score_dict: Dict[str, float]) -> Tuple[List[str], Dict[str, float]]:
        sorted_keywords = sorted(score_dict.items(), key=lambda x: x[1], reverse=True)
        top_keywords = sorted_keywords[:self.top_n]
        # keywords = [kw for kw, _ in top_keywords]
        keyword_scores = {kw: score for kw, score in top_keywords}
        return keyword_scores

if __name__ == "__main__":

    chunks_keyword_scores = [
        {"AI": 0.9, "artificial intelligence": 0.85},
        {"deep learning": 0.6, "neural networks": 0.55},
        {"machine learning": 0.8, "ML": 0.75},
        {"AI": 0.7, "robotics": 0.5},
        {"deep learning": 0.65, "artificial intelligence": 0.8},
        {"machine learning": 0.9, "deep neural nets": 0.45},
        {"robotics": 0.6, "AI": 0.65},
        {"ML": 0.7, "machine perception": 0.5}
    ]


    aggregator = KeywordAggregator(top_n=10)
    keywords, keyword_scores = aggregator.aggregate(chunks_keyword_scores)

    print("Top Keywords:\n", keywords)  # Expected: ['AI', 'Turing', 'machine learning', 'deep learning']
    print("Keyword Scores:\n", keyword_scores)  # Expected: {'AI': 2.45, 'Turing': 0.7, 'machine learning': 0.6, 'deep learning': 0.65}

    # 目前語意合併測試上不佳，可能與選用模型有關，做不到ML跟machine learning的合併
    aggregator = KeywordAggregator(top_n=10, semantic_merge=True, similarity_threshold=0.7)
    keywords, keyword_scores = aggregator.aggregate(chunks_keyword_scores)
    print("Top Keywords with Semantic Merge:\n", keywords)  
    print("Keyword Scores with Semantic Merge:\n", keyword_scores)