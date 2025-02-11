
# from llama_index import SimpleDirectoryReader, ServiceContext, VectorStoreIndex
# from llama_index.node_parser import SentenceSplitter
# from llama_index.embeddings.huggingface import HuggingFaceEmbedding
# from llama_index.vector_stores.qdrant import QdrantVectorStore
# from llama_index.storage.storage_context import StorageContext


# formal area
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
import os

from llama_index.core.node_parser import SentenceSplitter
from llama_index.core import Document
from typing import List, Dict, Optional


class VectorStore:
    def __init__(self, 
                 collection_name="novels", 
                 encode_model='all-MiniLM-L6-v2',
                 data=[]):
        """
        Initialize the vector store with Qdrant client and encoder.
        """
        self.client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333))
        )
        self.encoder = SentenceTransformer(encode_model)
        self.collection_name = collection_name
        self._ensure_collection()

        self.chapter_data = data
        self.data_chunk = []
        self.document = []
        self.sections = []
        self.metadata_base = []

    def _ensure_collection(self):
        """
        Ensure the collection exists with the correct settings.
        """
        collections = self.client.get_collections().collections
        exists = any(col.name == self.collection_name for col in collections)
        
        if exists:
            print(f'collection: {self.collection_name} already exist')
            # self.client.delete_collection(collection_name=self.collection_name)
        else:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.encoder.get_sentence_embedding_dimension(),
                    distance=models.Distance.COSINE
                )
            )
    def chunk_data(self):
        """
        Chunk the input data into several data point
        """
        splitter = SentenceSplitter(chunk_size=1024, chunk_overlap=100)
        sections = splitter.split_text(self.chapter_data)
        
        documents = [Document(text=section) for section in sections]

        # 這邊應該要存放好切完的部分
        self.document = documents
        self.data_chunk = sections
        return documents, sections
    
    def store_chunks(self, 
                     doc_id: str, 
                     chunks: List[str], 
                     metadata: Dict) -> None:
        """
        Store text chunks in the vector database.
        
        Args:
            doc_id: Unique identifier for the document
            chunks: List of text chunks to store
            metadata: Document metadata
        """
        # Encode chunks
        embeddings = self.encoder.encode(chunks)
        
        # Prepare points for insertion
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            points.append(models.PointStruct(
                id=doc_id*1000 +i,  # Using integer IDs
                vector=embedding.tolist(),
                payload={
                    "text": chunk,
                    "doc_id": doc_id,
                    "chunk_index": i,
                    **metadata
                }
            ))
        
        # Upload to Qdrant
        self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )