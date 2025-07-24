from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from enum import Enum
from compression.base import BaseCompressor

class SequentialCompressor(BaseCompressor):
    """時序性場景的壓縮器"""
    def compress(self, chunks: List[Dict[str, Any]], seq_field: str = "chunk_seq", **kwargs) -> Dict[str, Any]:
        # 按時序聚合壓縮
        pass
