"""
壓縮評估器模組
目前只有確定compression_ratio的概念, 其他的評估指標尚在確認中
"""
from typing import Dict

class CompressionEvaluator:
    
    def _calculate_information_retention(
        self, 
        original: str, 
        compressed: str
    ) -> float:
        """計算信息保留率"""
        # 假設簡單的保留率計算方法
        original_words = set(original.split())
        compressed_words = set(compressed.split())
        retained_words = original_words.intersection(compressed_words)
        return len(retained_words) / len(original_words) if original_words else 0.0
    
    def _calculate_readability(self, text: str) -> float:
        """計算可讀性分數"""
        # 使用簡單的字數和句子數計算可讀性
        words = text.split()
        sentences = text.count('.') + text.count('!') + text.count('?')
        return len(words) / (sentences if sentences > 0 else 1)
    
    def evaluate_compression(
        self, 
        original: str, 
        compressed: str
    ) -> Dict[str, float]:
        """評估壓縮品質"""
        return {
            "compression_ratio": len(compressed) / len(original),
            "information_retention": self._calculate_information_retention(original, compressed),
            "readability_score": self._calculate_readability(compressed)
        }