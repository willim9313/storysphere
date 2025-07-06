
from src.workflows.kg.run_full_kg_workflow import run_full_kg_workflow

# ==standard imports==
import os
# ==third-party imports==
from dotenv import load_dotenv

load_dotenv()
KG_ENTITY_SET_PATH = "./data/kg_storage/kg_entity_set.json"
KG_RELATION_SET_PATH = "./data/kg_storage/kg_relation_set.json"
ENCODE_MODEL = 'all-MiniLM-L6-v2'

run_full_kg_workflow(
    entity_path=KG_ENTITY_SET_PATH,
    relation_path=KG_RELATION_SET_PATH,
    model_name=ENCODE_MODEL,
    threshold=0.95,
    strategy='longest'
)
print("Knowledge graph workflow completed successfully.")
