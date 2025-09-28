# core/nlp/keyword_extractor.py
"""
基底為pke套件的關鍵字提取工具
提供關鍵字提取工具，目前使用 MultipartiteRank（支援英文）
"""
from pke.unsupervised import MultipartiteRank
from typing import Dict


class KpeTool:
    def __init__(self):
        """ 
        初始化關鍵字提取工具
        後面要可以開放換其他工具，這邊先寫死
        """
        self.model = MultipartiteRank()

    def extract_keywords(
        self,
        text: str,
        language: str = "en",
        n: int = 10
    ) -> Dict[str, float]:
        """
        提取文本中的關鍵字
        :param text: 要處理的文本
        :param language: 語言，預設為英文
        :param n: 返回的關鍵字數量，預設為10
        :return: 提取的關鍵字字典，格式為 {keyword: score}
        """
        self.model.load_document(input=text, language=language)
        self.model.candidate_selection()
        self.model.candidate_weighting()
        keywords = self.model.get_n_best(n=n)
        return dict(keywords)
