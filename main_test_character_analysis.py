from src.workflows.character_analysis.character_analysis import run_character_analysis_workflow

# 後續這邊要能提供一個參數接口，處理對應提取的角色名稱代入
target_entities=["Major", "Mr. Jones"]

run_character_analysis_workflow(
    target_role=target_entities,
    kg_entity_path="./data/kg_storage/kg_entity_set.json"
)