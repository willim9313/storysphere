# workflow/run_doc_ingestion.py
"""
主流程：讀取文件 → 分章節 → 分 chunk → 呼叫 NLP → 儲存至向量庫
"""
import sys
sys.path.append("src")
sys.path.append("src/pipelines")  # Add this line to ensure 'pipelines' is in the path

from pathlib import Path
from core.nlp.llm_operator import LlmOperator
from core.nlp.keyword_extractor import KpeTool
from core.llm.gemini_client import GeminiClient

from src.pipelines.preprocessing.loader import load_documents, merge_documents
from src.pipelines.preprocessing.chapter_splitter import ChapterExtractor
from src.pipelines.preprocessing.chunk_splitter import ChunkSplitter
from src.pipelines.feature_extraction.run_llm_tasks import process_chunk_with_llm
from src.pipelines.vector_indexing.embed_and_store import embed_and_store_chunk


def run_ingestion_pipeline(input_dir: str, collection_name: str,
                            api_key: str, model_name: str,
                            limit_pages: int = None):
    # 載入與合併文件
    docs = load_documents(input_dir, limit_pages)
    doc = merge_documents(docs)

    # 初始化工具
    chapter_extractor = ChapterExtractor()
    chunk_splitter = ChunkSplitter()
    kpe_tool = KpeTool()
    llm = LlmOperator(GeminiClient(api_key, model_name))

    # 擷取章節
    chapter_infos = chapter_extractor.extract(doc.text)
    lines = doc.text.splitlines()
    chapter_bounds = [c["index"] for c in chapter_infos] + [len(lines)]

    # 處理每一章節
    for i in range(len(chapter_infos)):
        chapter_lines = lines[chapter_bounds[i]:chapter_bounds[i+1]]
        chapter_text = "\n".join(chapter_lines).strip()
        chunks = chunk_splitter.split(chapter_text)

        for chunk in chunks:
            chunk_data = process_chunk_with_llm(chunk, llm_operator=llm, kpe_tool=kpe_tool)
            embed_and_store_chunk(chunk_data, collection_name)

    llm.close()
    print("[✓] 文件處理與向量儲存完成")


if __name__ == "__main__":
    from dotenv import load_dotenv
    import os
    load_dotenv()
    
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL")

    run_ingestion_pipeline(
        input_dir="./data/novella",
        collection_name="AnimalFarm",
        api_key=api_key,
        model_name=model,
        limit_pages=10
    )
