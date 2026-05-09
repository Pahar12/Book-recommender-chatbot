"""
BookWise AI — Vector Embeddings & RAG
Handles document chunking, embedding generation, and semantic search.
"""
import json
import numpy as np
from typing import List, Tuple, Optional
from sentence_transformers import SentenceTransformer
import faiss

# ═══════════════════════════════════════════════════════════════
#  DOCUMENT CHUNKING
# ═══════════════════════════════════════════════════════════════

def chunk_document(text: str, chunk_size: int = 500, overlap: int = 100) -> List[Tuple[str, int, int]]:
    """
    Split document into overlapping chunks for RAG.
    
    Args:
        text: Document content
        chunk_size: Characters per chunk
        overlap: Character overlap between chunks
        
    Returns:
        List of (chunk_text, start_char, end_char)
    """
    chunks = []
    start = 0
    
    while start < len(text):
        end = min(start + chunk_size, len(text))
        
        # Try to end at sentence boundary for better semantics
        if end < len(text):
            last_period = text.rfind('.', start, end)
            if last_period > start + chunk_size * 0.7:
                end = last_period + 1
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append((chunk, start, end))
        
        start = end - overlap if end < len(text) else len(text)
    
    return chunks


# ═══════════════════════════════════════════════════════════════
#  EMBEDDINGS
# ═══════════════════════════════════════════════════════════════

class EmbeddingManager:
    """Handle semantic embeddings for RAG"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """Initialize embedding model"""
        self.model_name = model_name
        try:
            self.model = SentenceTransformer(model_name)
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
            print(f"✅ Embedding model loaded: {model_name} ({self.embedding_dim}D)")
        except Exception as e:
            print(f"⚠️  Could not load embedding model: {e}")
            self.model = None
    
    def embed(self, texts: List[str]) -> Optional[np.ndarray]:
        """Generate embeddings for texts"""
        if not self.model:
            return None
        try:
            embeddings = self.model.encode(texts, convert_to_tensor=False)
            return embeddings.astype(np.float32)
        except Exception as e:
            print(f"Error generating embeddings: {e}")
            return None
    
    def embed_single(self, text: str) -> Optional[np.ndarray]:
        """Generate embedding for single text"""
        embeddings = self.embed([text])
        if embeddings is not None:
            return embeddings[0]
        return None


# ═══════════════════════════════════════════════════════════════
#  VECTOR SEARCH WITH FAISS
# ═══════════════════════════════════════════════════════════════

class VectorStore:
    """FAISS-based vector database for semantic search"""
    
    def __init__(self, embedding_dim: int = 384):
        """Initialize FAISS index"""
        self.embedding_dim = embedding_dim
        self.index = faiss.IndexFlatL2(embedding_dim)
        self.texts = []  # Store original texts
    
    def add_texts(self, texts: List[str], embeddings: np.ndarray):
        """Add texts and embeddings to index"""
        if embeddings.shape[0] != len(texts):
            raise ValueError("Number of embeddings must match number of texts")
        
        self.index.add(embeddings)
        self.texts.extend(texts)
    
    def search(self, query_embedding: np.ndarray, k: int = 5) -> List[Tuple[str, float]]:
        """
        Search for similar texts.
        
        Returns:
            List of (text, distance) sorted by relevance
        """
        if len(self.texts) == 0:
            return []
        
        distances, indices = self.index.search(query_embedding.reshape(1, -1), min(k, len(self.texts)))
        
        results = []
        for idx, dist in zip(indices[0], distances[0]):
            if idx < len(self.texts):
                results.append((self.texts[idx], float(dist)))
        
        return results
    
    def clear(self):
        """Clear the vector store"""
        self.index = faiss.IndexFlatL2(self.embedding_dim)
        self.texts = []


# ═══════════════════════════════════════════════════════════════
#  RETRIEVAL AUGMENTED GENERATION
# ═══════════════════════════════════════════════════════════════

class RAGPipeline:
    """End-to-end RAG system"""
    
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2"):
        self.embeddings = EmbeddingManager(embedding_model)
        self.vector_store = VectorStore(
            embedding_dim=self.embeddings.embedding_dim if self.embeddings.model else 384
        )
    
    def ingest_document(self, text: str, chunk_size: int = 500, overlap: int = 100) -> bool:
        """
        Process and index a document.
        
        Returns:
            True if successful
        """
        if not self.embeddings.model:
            print("⚠️  Embedding model not available, skipping RAG indexing")
            return False
        
        try:
            # Chunk document
            chunks = chunk_document(text, chunk_size, overlap)
            chunk_texts = [chunk[0] for chunk in chunks]
            
            # Generate embeddings
            embeddings = self.embeddings.embed(chunk_texts)
            
            # Add to vector store
            self.vector_store.add_texts(chunk_texts, embeddings)
            
            print(f"✅ Ingested {len(chunks)} chunks into RAG")
            return True
        except Exception as e:
            print(f"Error ingesting document: {e}")
            return False
    
    def retrieve(self, query: str, k: int = 5) -> List[str]:
        """
        Retrieve relevant chunks for a query.
        
        Returns:
            List of relevant text chunks
        """
        if not self.embeddings.model:
            return []
        
        try:
            query_embedding = self.embeddings.embed_single(query)
            if query_embedding is None:
                return []
            
            results = self.vector_store.search(query_embedding, k)
            return [text for text, _ in results]
        except Exception as e:
            print(f"Error retrieving: {e}")
            return []
    
    def get_rag_context(self, query: str, max_context_chars: int = 2000) -> str:
        """
        Get RAG context for a query as formatted string.
        
        Returns:
            Formatted context string
        """
        chunks = self.retrieve(query)
        
        if not chunks:
            return ""
        
        context = "## Relevant Document Context:\n"
        total_chars = 0
        
        for i, chunk in enumerate(chunks, 1):
            if total_chars + len(chunk) > max_context_chars:
                break
            context += f"\n[Section {i}]\n{chunk}\n"
            total_chars += len(chunk)
        
        return context
    
    def clear(self):
        """Clear the RAG pipeline"""
        self.vector_store.clear()


# Global RAG instance
rag_pipeline = RAGPipeline() if True else None  # Can be toggled
