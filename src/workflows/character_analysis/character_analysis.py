"""
角色分析功能完整實現
在指定角色下，完成所有相關的分析功能
"""
from src.pipelines.kg.entity_attribute_extraction_pipeline import (
    create_entity_attribute_pipeline
)
from typing import Dict, List, Any, Optional, Union
 
def run_character_analysis_workflow(
    target_role: List,
    kg_entity_path: str="/Users/williamhuang/projects/storysphere/data/kg_storage/kg_entity_set.json"
):  
    for role in target_role:
        print(f"正在處理角色: {role}")

        # character basic info
        pipeline = create_entity_attribute_pipeline(kg_entity_path)
        entity_type = "Person"  # 假設角色都是 Person 類型

        # 獲取實體類型摘要, 後面可以關閉
        print("實體類型摘要:", pipeline.get_entity_summary_by_type())

        # 提取特定角色的屬性
        character_attrs = pipeline.extract_entity_attributes(
            target_entities=role,
            entity_type=entity_type
        )
        print("角色屬性:", character_attrs)

        # archetype analysis

        # psychological analysis

        # behavioral trace analysis

        # role relationships analysis

        # 出場統計

        # words of role omnibuses



if __name__ == "__main__":
    # 後續這邊要能提供一個參數接口，處理對應提取的角色名稱代入
    target_entities=["Major", "Mr. Jones"],

    run_character_analysis_workflow(
        target_role=target_entities,
        kg_entity_path="./data/kg_storage/kg_entity_set.json"
    )