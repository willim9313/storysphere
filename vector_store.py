from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

class VectorStore:
    def __init__(self):
        """Initialize the vector store with Qdrant client and encoder."""
        self.client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", 6333))
        )
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
        self.collection_name = "novels"
        self._ensure_collection()

    def _ensure_collection(self):
        """Ensure the collection exists with the correct settings."""
        collections = self.client.get_collections().collections
        exists = any(col.name == self.collection_name for col in collections)
        
        if exists:
            self.client.delete_collection(collection_name=self.collection_name)
            
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=models.VectorParams(
                size=self.encoder.get_sentence_embedding_dimension(),
                distance=models.Distance.COSINE
            )
        )

    def store_chunks(self, doc_id: str, chunks: List[str], metadata: Dict) -> None:
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
                id=i,  # Using integer IDs
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

    def search(self, query: str, limit: int = 5, doc_id: Optional[str] = None) -> List[Dict]:
        """
        Search for relevant text chunks.
        
        Args:
            query: Search query
            limit: Maximum number of results
            doc_id: Optional document ID to filter results
            
        Returns:
            List of relevant chunks with their metadata
        """
        query_vector = self.encoder.encode(query).tolist()
        
        # Prepare filter if doc_id is provided
        filter_param = None
        if doc_id:
            filter_param = models.Filter(
                must=[models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))]
            )
        
        # Search in Qdrant
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=limit,
            query_filter=filter_param
        )
        
        # Format results
        return [{
            "text": hit.payload["text"],
            "score": hit.score,
            "metadata": {k: v for k, v in hit.payload.items() if k != "text"}
        } for hit in results]

    def get_document_chunks(self, doc_id: str) -> List[Dict]:
        """
        Retrieve all chunks for a specific document.
        
        Args:
            doc_id: Document identifier
            
        Returns:
            List of chunks with their metadata
        """
        results = self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=models.Filter(
                must=[models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))]
            ),
            limit=1000  # Adjust based on your needs
        )[0]
        
        return [{
            "text": point.payload["text"],
            "metadata": {k: v for k, v in point.payload.items() if k != "text"}
        } for point in results]
