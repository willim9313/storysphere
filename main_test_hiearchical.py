from src.workflows.nlp.generate_hierarchical_summary import (
    gen_hierarchical_chapter_summary,
    gen_hierarchical_book_summary
)
from src.workflows.nlp.generate_hierarchical_keywords import (
    gen_hierarchical_chapter_keywords,
    gen_hierarchical_book_keywords
)

from src.workflows.kg.run_full_kg_workflow import run_full_kg_workflow

# ==standard imports==
import os
# ==third-party imports==
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")
TARGET_COLLECTION_DOC_ID = "f0b16578-b3fb-4979-8a0a-19e1f6338b53"
SOURCE_COLLECTION = "Test_30p_Animal_Farm"
OMNI_CHAPTERS_COLLECTION = "omni_chapter_summaries"
OMNI_BOOKS_COLLECTION = "omni_book_summaries"
ENCODE_MODEL = 'all-MiniLM-L6-v2'


gen_hierarchical_chapter_summary(
    target_collection_doc_id=TARGET_COLLECTION_DOC_ID,
    source_collection=SOURCE_COLLECTION,
    omni_chapters_collection=OMNI_CHAPTERS_COLLECTION,
    api_key=API_KEY,
    model_name=MODEL_NAME,
    encode_model=ENCODE_MODEL
)


gen_hierarchical_book_summary(
    target_collection_doc_id=TARGET_COLLECTION_DOC_ID,
    omni_chapters_collection=OMNI_CHAPTERS_COLLECTION,
    omni_books_collection=OMNI_BOOKS_COLLECTION,
    api_key=API_KEY,
    model_name=MODEL_NAME,
    encode_model=ENCODE_MODEL
)
print("Hierarchical summaries generated successfully.")


ARGET_COLLECTION_DOC_ID = "f0b16578-b3fb-4979-8a0a-19e1f6338b53"
SOURCE_COLLECTION = "Test_30p_Animal_Farm"
OMNI_CHAPTERS_COLLECTION = "omni_chapter_keywords"
OMNI_BOOKS_COLLECTION = "omni_book_keywords"
ENCODE_MODEL = 'all-MiniLM-L6-v2'

gen_hierarchical_chapter_keywords(
    target_collection_doc_id=TARGET_COLLECTION_DOC_ID,
    source_collection=SOURCE_COLLECTION,
    omni_chapters_collection=OMNI_CHAPTERS_COLLECTION,
    encode_model=ENCODE_MODEL
)

gen_hierarchical_book_keywords(
    target_collection_doc_id=TARGET_COLLECTION_DOC_ID,
    source_collection=SOURCE_COLLECTION,
    omni_chapters_collection=OMNI_CHAPTERS_COLLECTION,
    omni_books_collection=OMNI_BOOKS_COLLECTION,
    encode_model=ENCODE_MODEL
)
    
print("Hierarchical keywords generated successfully.")
