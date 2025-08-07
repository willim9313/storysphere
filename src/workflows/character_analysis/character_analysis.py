"""
角色分析功能完整實現
在指定角色下，完成所有相關的分析功能
"""
from src.pipelines.kg.entity_attribute_extraction_pipeline import (
    create_entity_attribute_pipeline
)
from typing import Dict, List, Any, Optional, Union
from src.core.vector_process_store import CustomVectorStore

def run_character_analysis_workflow(
    target_role: List,
    kg_entity_path: str="/Users/williamhuang/projects/storysphere/data/kg_storage/kg_entity_set.json"
):  
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
        vs = CustomVectorStore(
            collection_name='Test_collection_set',
            encode_model='all-MiniLM-L6-v2',
            data=None
        )

        results = vs.retrieve_by_filter_advanced(
            filter={
                "roles": role,
            },
            list_match_fields={"roles": "any"},  # roles 欄位使用 any 匹配
            limit=100
        )
        print(f"角色 {role} 的DB篩選結果:", results, '\n')


        # psychological analysis

        # behavioral trace analysis

        # role relationships analysis

        # 出場統計

        # words of role omnibuses
