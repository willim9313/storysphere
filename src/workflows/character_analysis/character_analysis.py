"""
角色分析功能完整實現
在指定角色下，完成所有相關的分析功能
"""
from src.pipelines.kg.entity_attribute_extraction_pipeline import (
    create_entity_attribute_pipeline
)
from typing import Dict, List, Any, Optional, Union
from src.core.indexing.vector_store import VectorStore
from src.core.nlp.llm_operator import LlmOperator
from src.core.llm.gemini_client import GeminiClient
from src.core.utils.data_sanitizer import DataSanitizer
import json
import os
from pathlib import Path

def load_archetype_config(
    archetype_type: str = "jung", 
    language: str = "en"
) -> List[Dict]:
    """
    載入角色原型設定檔
    
    Args:
        archetype_type: 原型類型 ("jung" 或 "schmidt")
        language: 語言 ("en" 或 "zh")
    
    Returns:
        List[Dict]: 原型設定列表
    """
    config_dir = Path(__file__).parent.parent.parent.parent / "config" / "character_analysis"
    
    if archetype_type == "jung":
        filename = f"jung_archetypes_{language}.json"
    elif archetype_type == "schmidt":
        filename = f"schmidt_archetypes_{language}.json"
    else:
        raise ValueError(f"不支援的原型類型: {archetype_type}")
    
    config_path = config_dir / filename
    
    if not config_path.exists():
        raise FileNotFoundError(f"設定檔不存在: {config_path}")
    
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_archetype_names(archetypes: List[Dict]) -> List[str]:
    """
    提取原型名稱列表
    """
    return [arch.get('name', arch.get('id', '')) for arch in archetypes]

def run_character_analysis_workflow(
    target_role: List,
    api_key: str,
    model_name: str,
    kg_entity_path: str="/Users/williamhuang/projects/storysphere/data/kg_storage/kg_entity_set.json",
    archetype_type: str = "jung",
    language: str = "zh"
):  
    # 載入原型設定
    try:
        archetypes = load_archetype_config(archetype_type, language)
        archetype_names = get_archetype_names(archetypes)
        print(f"載入了 {len(archetypes)} 個 {archetype_type} 原型 ({language})")
    except Exception as e:
        print(f"載入原型設定失敗: {e}")
        return
    
    for role in target_role:
        print(f"正在處理角色: {role}")

        # character basic info
        pipeline = create_entity_attribute_pipeline(kg_entity_path)
        entity_type = "Person"  # 假設角色都是 Person 類型

        # 獲取實體類型摘要, 後面可以關閉, 因為抓取的會是整個檔案
        print("實體類型摘要:", pipeline.get_entity_summary_by_type(), '\n')

        # 提取特定角色的屬性
        character_attrs = pipeline.extract_entity_attributes(
            target_entities=role,
            entity_type=entity_type
        )
        print("角色屬性:", character_attrs, '\n')

        # archetype analysis
        vs = VectorStore(
            collection_name='Test_10p_AnimalFarm',
            encode_model='all-MiniLM-L6-v2',
            # data=None
        )

        results = vs.scroll(
            filter={
                "roles": role,
            },
            list_fields={"roles": "any"},  # roles 欄位使用 any 匹配
            with_payload=['chunk_id', 'chunk', 'kg_relations'],
            limit=100
        )
        # print(f"角色 {role} 的DB篩選結果:", results, '\n')
        # print(f'[INFO] 角色 {role} 的DB篩選結果數量: {len(results)}', '\n')

        # 這邊未來要加上，如果資料量太大，需要做過一次compression
        # 但這邊這樣的寫法沒有辦法正確的將chunk id 拿出來
        n_info = DataSanitizer.format_vector_store_results(results)


        print(f'[INFO] 角色 {role} 的DB篩選結果摘要: {n_info}', '\n')

        client = LlmOperator(GeminiClient(
            api_key=api_key,
            model=model_name
        ))

        resp = client.extract_character_evidence_pack(
            content="\n".join(n_info),
            character_name=role,
        )

        

        print(f"角色 {role} 的原型分析結果:", resp)

        # resp = client.client_suggest_archetype(
        # psychological analysis

        # behavioral trace analysis

        # role relationships analysis

        # 出場統計

        # words of role omnibuses
