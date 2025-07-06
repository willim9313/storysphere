'''generate hierarchical keywords for a book using a vector store and an LLM client.'''
# ==standard imports==
import os
import sys
sys.path.append("src")
sys.path.append("src/pipelines")  # Add this line to ensure 'pipelines' is in the path

# ==third-party imports==
from dotenv import load_dotenv

# ==local imports==
from src.core.nlp_utils import LlmOperator
from src.core.vector_process_store import CustomVectorStore
from src.core.llm.gemini_client import GeminiClient
from src.pipelines.nlp.hierarchical_process import HierarchicalAggregator
from src.pipelines.nlp.keyword_aggregator import KeywordAggregator

load_dotenv()
TARGET_COLLECTION_DOC_ID = "f0b16578-b3fb-4979-8a0a-19e1f6338b53"
SOURCE_COLLECTION = "Test_30p_Animal_Farm"
OMNI_CHAPTERS_COLLECTION = "omni_chapter_keywords"
OMNI_BOOKS_COLLECTION = "omni_book_keywords"
ENCODE_MODEL = 'all-MiniLM-L6-v2'

def gen_hierarchical_chapter_keywords(
    target_collection_doc_id: str = TARGET_COLLECTION_DOC_ID,
    source_collection: str = SOURCE_COLLECTION,
    omni_chapters_collection: str = OMNI_CHAPTERS_COLLECTION,
    encode_model: str = ENCODE_MODEL
) -> None:
    """Generate hierarchical chapter keywords."""
    vs = CustomVectorStore(
        collection_name=source_collection,
        encode_model=encode_model,
        data=None)

    kw_aggregator = KeywordAggregator(top_n=10)   

    aggregator = HierarchicalAggregator(
        doc_id=target_collection_doc_id,
        vector_store=vs,
        aggregation_fn=kw_aggregator.aggregate,
        input_type="keyword_scores",
        input_field='keyword_scores',
        output_type="chapter_keywords",
        output_field="keyword_scores",
        json_output_path="./data/art/keyword_outputs",
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

def gen_hierarchical_book_keywords(
    target_collection_doc_id: str = TARGET_COLLECTION_DOC_ID,
    source_collection: str = SOURCE_COLLECTION,
    omni_chapters_collection: str = OMNI_CHAPTERS_COLLECTION,
    omni_books_collection: str = OMNI_BOOKS_COLLECTION,
    encode_model: str = ENCODE_MODEL
) -> None:
    """Generate hierarchical book keywords."""
    vs = CustomVectorStore(
        collection_name=source_collection,
        encode_model=encode_model,
        data=None)
    
    kw_aggregator = KeywordAggregator(top_n=10)    

    aggregator = HierarchicalAggregator(
        doc_id=target_collection_doc_id,
        vector_store=vs,
        aggregation_fn=kw_aggregator.aggregate,
        input_type="keyword_scores",
        input_field='keyword_scores',
        output_type="book_keyword",
        output_field="keyword_scores",
        json_output_path="./data/art/keyword_outputs",
        read_collection=omni_chapters_collection,
        write_collection=omni_books_collection
    )

    aggregator.aggregate_book(
        doc_id=target_collection_doc_id,
        store_to_qdrant=True
    )
