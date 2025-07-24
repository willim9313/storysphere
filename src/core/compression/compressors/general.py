from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from enum import Enum
from compression.base import BaseCompressor

class GeneralCompressor(BaseCompressor):
    """一般對話場景的壓縮器"""
    def compress(self, chunks: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        # 實現一般壓縮邏輯
        pass
    
    def get_instruction_template(self) -> str:
        return """
        Please compress the following information while preserving key details:
        {content}
        
        Output format:
        {
            "compressed_content": "...",
            "key_points": [...],
            "confidence": 0.8
        }
        """