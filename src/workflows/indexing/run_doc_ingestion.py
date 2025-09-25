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
from core.kg.kg_writer import append_to_json
from core.utils.id_generator import generate_uuid_id

from src.pipelines.preprocessing.loader import load_documents, merge_documents
from src.pipelines.preprocessing.chapter_splitter import ChapterExtractor
from src.pipelines.preprocessing.chunk_splitter import ChunkSplitter
from src.pipelines.feature_extraction.run_llm_tasks import process_chunk_with_llm
from src.pipelines.vector_indexing.embed_and_store import embed_and_store_chunk


def run_ingestion_pipeline(
    input_dir: str, 
    collection_name: str,
    api_key: str, 
    model_name: str,
    limit_pages: int = 0
) -> None:
    """
    主流程：讀取文件 → 分章節 → 分 chunk → 呼叫 NLP → 儲存至向量庫
    Args:
        input_dir: 文件所在目錄
        collection_name: 儲存向量的 Qdrant collection 名稱
        api_key: LLM API 金鑰
        model_name: LLM 模型名稱
        limit_pages: 限制處理的頁數，None 表示不限制
    """
    # 載入與合併文件
    docs = load_documents(input_dir, limit_pages)
    doc = merge_documents(docs)

    # 初始化工具
    chapter_extractor = ChapterExtractor()
    chunk_splitter = ChunkSplitter()
    kpe_tool = KpeTool()
    llm = LlmOperator(GeminiClient(api_key, model_name))

    # for meta data
    doc_id = generate_uuid_id()
    doc_seq = 0

    # 擷取章節
    chapter_infos = chapter_extractor.extract(doc.text)
    lines = doc.text.splitlines()
    chapter_bounds = [c["index"] for c in chapter_infos] + [len(lines)]

    # 處理每一章節
    for chapter_seq in range(len(chapter_infos)):
        chapter_lines = lines[chapter_bounds[chapter_seq]:chapter_bounds[chapter_seq+1]]
        chapter_text = "\n".join(chapter_lines).strip()
        chunks = chunk_splitter.split(chapter_text)

        chapter_info = chapter_infos[chapter_seq].get("info", {})
        chapter_match_type = chapter_info.get("match_type")
        chapter_number = chapter_info.get("chapter_number")
        chapter_title = chapter_info.get("chapter_title")

        # 處理每個 chunk
        for chunk_seq, chunk in enumerate(chunks):
            chunk_data = process_chunk_with_llm(
                chunk, 
                llm_operator=llm, 
                kpe_tool=kpe_tool
            )
            # 補 metadata
            chunk_data.update({
                "doc_id": doc_id,
                "doc_seq": doc_seq,
                "chapter_seq": chapter_seq,
                "chunk_seq": chunk_seq,
                "chapter_match_type": chapter_match_type,
                "chapter_number": chapter_number,
                "chapter_title": chapter_title,
            })

            embed_and_store_chunk(
                chunk_data=chunk_data, 
                embed_col_name="summary", 
                collection_name=collection_name
            )

            # 若有 KG 結果則寫入 JSON 檔案
            # 這邊目前寫的不太好，後續再拆做分拆跟美化
            if chunk_data.get("kg_entities"):
                append_to_json({
                    "chunk_id": chunk_data["chunk_id"],
                    "entities": [
                        {
                            "type": ent.type,
                            "name": ent.name,
                            "attributes": ent.attributes.model_dump() if ent.attributes else {}
                        } for ent in chunk_data["kg_entities"]
                    ]
                }, "./data/kg_storage/kg_entity_set.json")

            if chunk_data.get("kg_relations"):
                append_to_json({
                    "chunk_id": chunk_data["chunk_id"],
                    "relation_set": [
                        {
                            "head": rel.head,
                            "relation": rel.relation,
                            "tail": rel.tail
                        } for rel in chunk_data["kg_relations"]
                    ]
                }, "./data/kg_storage/kg_relation_set.json")

            if chunk_data.get("kg_raw"):
                raw_with_id = dict(chunk_data["kg_raw"])
                raw_with_id["chunk_id"] = chunk_data["chunk_id"]
                append_to_json(raw_with_id, "./data/kg_storage/kg_elements.json")

    llm.close()
    print("[✓] 文件處理與向量儲存完成")
