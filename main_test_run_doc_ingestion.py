from dotenv import load_dotenv
import os
from src.workflows.indexing.run_doc_ingestion import run_ingestion_pipeline
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY", 'No Key')
model = os.getenv("GEMINI_MODEL", 'No Model')

# 目前沒有做好目錄下多檔案的處理
# 這是測試正常資料流程用途
run_ingestion_pipeline(
    input_dir="./data/novella",
    collection_name="Test_10p_AnimalFarm",
    api_key=api_key,
    model_name=model,
    limit_pages=6
)
