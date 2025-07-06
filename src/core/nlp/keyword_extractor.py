# core/nlp/keyword_extractor.py
"""
提供關鍵字提取工具，目前使用 MultipartiteRank（支援英文）
"""
from pke.unsupervised import MultipartiteRank
from typing import Dict


class KpeTool:
    def __init__(self):
        self.model = MultipartiteRank()

    def extract_keywords(self, text: str, language: str = "en", n: int = 10) -> Dict[str, float]:
        self.model.load_document(input=text, language=language)
        self.model.candidate_selection()
        self.model.candidate_weighting()
        keywords = self.model.get_n_best(n=n)
        return dict(keywords)
