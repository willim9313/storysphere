from dataclasses import dataclass
from typing import Dict, Any, Optional

@dataclass
class CompressionConfig:
    max_tokens: int = 4000
    compression_ratio: float = 0.3  # 壓縮到原文的30%
    preserve_structure: bool = True
    extract_key_entities: bool = True
    maintain_chronology: bool = False  # 僅對sequential有效

@dataclass
class ScenarioConfig:
    general: CompressionConfig = CompressionConfig()
    topic: CompressionConfig = CompressionConfig(maintain_chronology=False)
    sequential: CompressionConfig = CompressionConfig(maintain_chronology=True)
    
    def get_config(self, scenario: str) -> CompressionConfig:
        return getattr(self, scenario, self.general)