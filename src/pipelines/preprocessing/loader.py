# pipeline/doc_preprocessing/loader.py
"""
文件載入與合併模組，支援 PDF / DOCX 格式。
"""
from llama_index.core import Document
from llama_index.core import SimpleDirectoryReader
from typing import List, Optional


def load_documents(input_dir: str, limit_pages: Optional[int] = None) -> List[Document]:
    reader = SimpleDirectoryReader(input_dir=input_dir, required_exts=[".pdf", ".docx"])
    docs = reader.load_data()
    docs = [doc for doc in docs if len(doc.text.strip()) > 0]
    return docs[:limit_pages] if limit_pages else docs


def merge_documents(docs: List[Document]) -> Document:
    """
    將多個 Document 物件合併為單一文件。
    合併文本，保留第一頁的 metadata。
    """
    combined_text = "\n\n".join(doc.text for doc in docs)
    metadata = docs[0].metadata if docs else {}
    return Document(text=combined_text, metadata=metadata)
