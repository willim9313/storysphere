# pipeline/doc_preprocessing/loader.py
"""
文件載入與合併模組，支援 PDF / DOCX 格式。
"""
from llama_index.core import Document
from llama_index.core import SimpleDirectoryReader
from typing import List, Optional


def load_documents(
    input_dir: str, 
    limit_pages: Optional[int] = None
) -> List[Document]:
    """
    從指定目錄載入文件，支援 PDF 和 DOCX 格式。
    可選擇限制載入的頁數。
    Args:
        input_dir: 文件所在目錄
        limit_pages: 限制載入的頁數，若為 None 則載入全部
    Returns:
        List[Document]: 載入的 Document 物件列表
    """
    reader = SimpleDirectoryReader(input_dir=input_dir, required_exts=[".pdf", ".docx"])
    docs = reader.load_data()
    docs = [doc for doc in docs if len(doc.text.strip()) > 0]
    return docs[:limit_pages] if limit_pages else docs


def merge_documents(docs: List[Document]) -> Document:
    """
    將多個 Document 物件合併為單一文件。
    合併文本，保留第一頁的 metadata。
    因為新版本的llama_index把文件拆成多頁了，要自己手動合併
    Args:
        docs: Document 物件列表
    Returns:
        Document: 合併後的 Document 物件
    """
    combined_text = "\n\n".join(doc.text for doc in docs)
    metadata = docs[0].metadata if docs else {}
    return Document(text=combined_text, metadata=metadata)
