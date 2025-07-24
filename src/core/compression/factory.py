from typing import Dict, Type
from .base import BaseCompressor, CompressionScenario
from .compressors.general import GeneralCompressor
from .compressors.topic import TopicCompressor
from .compressors.sequential import SequentialCompressor

class CompressorFactory:
    _compressors: Dict[CompressionScenario, Type[BaseCompressor]] = {
        CompressionScenario.GENERAL: GeneralCompressor,
        CompressionScenario.TOPIC: TopicCompressor,
        CompressionScenario.SEQUENTIAL: SequentialCompressor,
    }
    
    @classmethod
    def create_compressor(cls, scenario: CompressionScenario, llm_operator, config=None) -> BaseCompressor:
        compressor_class = cls._compressors.get(scenario)
        if not compressor_class:
            raise ValueError(f"Unsupported compression scenario: {scenario}")
        return compressor_class(llm_operator, config)
    
    @classmethod
    def register_compressor(cls, scenario: CompressionScenario, compressor_class: Type[BaseCompressor]):
        """允許註冊自定義壓縮器"""
        cls._compressors[scenario] = compressor_class

# 以下不確定該怎麼樣整合在此模組下
class PromptCompressor:
    def __init__(self, llm_operator):
        self.compressors = {
            CompressionScenario.GENERAL: GeneralCompressor(llm_operator),
            CompressionScenario.TOPIC: TopicCompressor(llm_operator),
            CompressionScenario.SEQUENTIAL: SequentialCompressor(llm_operator)
        }
    
    def compress(self, chunks: List[Dict[str, Any]], scenario: CompressionScenario, **kwargs) -> Dict[str, Any]:
        compressor = self.compressors[scenario]
        return compressor.compress(chunks, **kwargs)