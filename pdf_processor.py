# import PyPDF2
from pypdf import PdfReader
from typing import List, Dict
import hashlib
import os
import streamlit as st

class PDFProcessor:
    def __init__(self, chunk_size: int = 1000):
        """Initialize the PDF processor with a specified chunk size."""
        self.chunk_size = chunk_size

    # @st.cache_data
    def process_pdf(self, file_path: str) -> Dict:
        """
        Process a PDF file and return its content and metadata.
        This function is cached to avoid reprocessing the same file.
        """
        try:
            text_content = self._extract_text(file_path)
            metadata = self._extract_metadata(file_path)
            chunks = self._chunk_text(text_content)
            
            return {
                "text": text_content,
                "metadata": metadata,
                "chunks": chunks
            }
        except Exception as e:
            print(f"Error processing PDF: {e}")
            return None

    # @st.cache_data
    def _generate_document_id(self, file_path: str) -> str:
        """Generate a unique identifier for the document."""
        with open(file_path, 'rb') as file:
            content = file.read()
            return hashlib.sha256(content).hexdigest()[:16]

    # @st.cache_data
    def _extract_text(self, file_path: str) -> str:
        """Extract text content from PDF file. Cached for performance."""
        text = ""
        with open(file_path, 'rb') as file:
            pdf_reader = PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text

    def _chunk_text(self, text: str) -> List[str]:
        """Split text into chunks of approximately equal size."""
        words = text.split()
        chunks = []
        current_chunk = []
        current_length = 0

        for word in words:
            current_length += len(word) + 1  # +1 for space
            if current_length > self.chunk_size:
                chunks.append(' '.join(current_chunk))
                current_chunk = [word]
                current_length = len(word)
            else:
                current_chunk.append(word)

        if current_chunk:
            chunks.append(' '.join(current_chunk))

        return chunks

    # @st.cache_data
    def _extract_metadata(self, file_path: str) -> Dict:
        """Extract metadata from the PDF file."""
        with open(file_path, 'rb') as file:
            pdf_reader = PdfReader(file)
            metadata = {
                "filename": os.path.basename(file_path),
                "num_pages": len(pdf_reader.pages),
                "title": pdf_reader.metadata.get('/Title', ''),
                "author": pdf_reader.metadata.get('/Author', ''),
                "creation_date": pdf_reader.metadata.get('/CreationDate', '')
            }
        return metadata
