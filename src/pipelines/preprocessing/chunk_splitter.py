# pipeline/doc_preprocessing/chunk_splitter.py
"""
章節內容的 chunk 切分模組，使用 LlamaIndex 的 TokenTextSplitter。
"""
from llama_index.core.text_splitter import TokenTextSplitter
from typing import List


class ChunkSplitter:
    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 50):
        self.splitter = TokenTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    def split(self, text: str) -> List[str]:
        return self.splitter.split_text(text)
