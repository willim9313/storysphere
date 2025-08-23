from src.workflows.character_analysis.character_analysis import run_character_analysis_workflow
from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")

# 後續這邊要能提供一個參數接口，處理對應提取的角色名稱代入
# target_entities=["Major", "Mr. Jones"]
target_entities=["Major"]

run_character_analysis_workflow(
    target_role=target_entities,
    api_key=API_KEY,
    model_name=MODEL_NAME,
    kg_entity_path="./data/kg_storage/kg_entity_set.json",
    archetype_type="jung",
    language="en"
)