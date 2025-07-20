from src.pipelines.kg.entity_attribute_extraction_pipeline import (
    create_entity_attribute_pipeline
)
from src.workflows.character_analysis.character_analysis import (
    run_character_analysis_workflow
)

# # 範例1: 從JSON文件創建管道
# kg_entity_path = "/Users/williamhuang/projects/storysphere/data/kg_storage/kg_entity_set.json"

# pipeline = create_entity_attribute_pipeline(kg_entity_path)

# # 獲取實體類型摘要
# print("實體類型摘要:", pipeline.get_entity_summary_by_type())

# # 提取特定角色的屬性
# character_attrs = pipeline.extract_entity_attributes(
#     target_entities=["Major", "Mr. Jones"],
#     entity_type="Person"
# )
# print("角色屬性:", character_attrs)

# # 提取所有Person類型實體的屬性
# all_persons = pipeline.extract_attributes_by_type("Person", limit=5)
# print("所有角色:", all_persons)

# # 根據關鍵字搜索實體
# search_results = pipeline.search_entities_with_attributes(
#     search_keywords=["farm", "animal"],
#     entity_type="Location"
# )
# print("搜索結果:", search_results)

target_entities = ["Major", "Mr. Jones"]

run_character_analysis_workflow(
    target_role=target_entities,
    kg_entity_path="./data/kg_storage/kg_entity_set.json"
)