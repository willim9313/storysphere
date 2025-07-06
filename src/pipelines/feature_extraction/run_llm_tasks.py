# pipeline/feature_extraction/run_llm_tasks.py
"""
負責對單一 chunk 執行所有 LLM 任務：摘要、關鍵字、KG 擷取、角色偵測。
"""
from typing import Dict, Any
from core.utils.id_generator import generate_uuid_id


def process_chunk_with_llm(
    chunk: str, 
    llm_operator, 
    kpe_tool
) -> Dict[str, Any]:
    """
    對單一 chunk 執行 NLP 任務。
    回傳 dict，包含 chunk_id、keywords、summary、roles、KG 結果等。
    """
    chunk_id = generate_uuid_id()

    # 關鍵字
    keyword_scores = kpe_tool.extract_keywords(chunk)
    keywords = list(keyword_scores.keys())

    # 摘要
    summary = llm_operator.summarize(chunk)

    # 知識圖譜抽取
    kg_result = llm_operator.extract_kg_elements(chunk)
    if kg_result:
        roles = [ent.name for ent in kg_result.entities if ent.type == "Person"]
    else:
        roles = []

    return {
        "chunk_id": chunk_id,
        "chunk": chunk,
        "keywords": keywords,
        "keyword_scores": keyword_scores,
        "summary": summary,
        "roles": roles,
        "kg_entities": kg_result.entities if kg_result else None,
        "kg_relations": kg_result.relations if kg_result else None,
        "kg_raw": kg_result.model_dump() if kg_result else None,
    }
