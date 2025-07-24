from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from enum import Enum

class CompressionScenario(Enum):
    GENERAL = "general"
    TOPIC = "topic"
    SEQUENTIAL = "sequential"

class BaseCompressor(ABC):
    def __init__(self, llm_operator, config: Optional[Dict[str, Any]] = None):
        self.llm_operator = llm_operator
        self.config = config or {}
    
    @abstractmethod
    def compress(self, chunks: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """壓縮邏輯的抽象方法"""
        pass
    
    @abstractmethod
    def get_instruction_template(self) -> str:
        """獲取指令模板的抽象方法"""
        pass
    
    def _estimate_tokens(self, text: str) -> int:
        """估算token數量"""
        return len(text.split()) * 1.3  # 粗略估算