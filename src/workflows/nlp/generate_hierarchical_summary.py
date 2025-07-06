'''generate_hierarchical_summary.py'''
# ==standard imports==
import os
import sys
# sys.path.append("src")
# sys.path.append("src/pipelines")  # Add this line to ensure 'pipelines' is in the path

# ==third-party imports==
from dotenv import load_dotenv

# ==local imports==
from src.core.nlp_utils import LlmOperator
from src.core.vector_process_store import CustomVectorStore
from src.core.llm.gemini_client import GeminiClient
from src.pipelines.nlp.hierarchical_process import HierarchicalAggregator

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL")
TARGET_COLLECTION_DOC_ID = "f0b16578-b3fb-4979-8a0a-19e1f6338b53"
SOURCE_COLLECTION = "Test_30p_Animal_Farm"
OMNI_CHAPTERS_COLLECTION = "omni_chapter_summaries"
OMNI_BOOKS_COLLECTION = "omni_book_summaries"
ENCODE_MODEL = 'all-MiniLM-L6-v2'

def gen_hierarchical_chapter_summary(
    target_collection_doc_id: str = TARGET_COLLECTION_DOC_ID,
    source_collection: str = SOURCE_COLLECTION,
    omni_chapters_collection: str = OMNI_CHAPTERS_COLLECTION,
    api_key: str = API_KEY,
    model_name: str = MODEL_NAME,
    encode_model: str = ENCODE_MODEL
) -> None:
    """Generate hierarchical chapter summaries."""
    vs = CustomVectorStore(
        collection_name=source_collection,
        encode_model=encode_model,
        data=None)

    client = LlmOperator(GeminiClient(api_key, model_name))

    aggregator = HierarchicalAggregator(
        doc_id=target_collection_doc_id,
        vector_store=vs,
        aggregation_fn=client.summarize,
        input_type="summary",
        input_field='summary',
        output_type="chapter_summary",
        output_field="summary",
        json_output_path="./data/art/summary_outputs",
        read_collection=source_collection,
        write_collection=omni_chapters_collection
    )

    # 這邊用chapter_seq來找，因為chapter_number可能為空
    res = vs.get_unique_metadata_values(key='chapter_seq')
    chapter_seqs = list(res)

    aggregator.aggregate_chapters(
        chapter_seqs=chapter_seqs,
        store_to_qdrant=True
    )

def gen_hierarchical_book_summary(
    target_collection_doc_id: str = TARGET_COLLECTION_DOC_ID,
    # source_collection: str = SOURCE_COLLECTION,
    omni_chapters_collection: str = OMNI_CHAPTERS_COLLECTION,
    omni_books_collection: str = OMNI_BOOKS_COLLECTION,
    api_key: str = API_KEY,
    model_name: str = MODEL_NAME,
    encode_model: str = ENCODE_MODEL
) -> None:
    """Generate hierarchical book summaries."""
    vs = CustomVectorStore(
        collection_name=omni_chapters_collection,
        encode_model=encode_model,
        data=None
        )

    client = LlmOperator(GeminiClient(api_key, model_name))

    aggregator = HierarchicalAggregator(
        doc_id=target_collection_doc_id,
        vector_store=vs,
        aggregation_fn=client.summarize,
        input_type="summary",
        input_field='summary',
        output_type="book_summary",
        output_field="summary",
        json_output_path="./data/art/summary_outputs",
        read_collection=omni_chapters_collection,
        write_collection=omni_books_collection
    )

    aggregator.aggregate_book(
        doc_id=target_collection_doc_id,
        store_to_qdrant=True
    )

if __name__ == "__main__":
    # Example usage
    gen_hierarchical_chapter_summary()
    gen_hierarchical_book_summary()
    print("Hierarchical summaries generated successfully.")