"""
RAG (Retrieval-Augmented Generation) module using ChromaDB.
Indexes assignment descriptions, syllabus content, and course materials.
Provides semantic search for the LLM to find relevant context.
"""

import chromadb
from chromadb.utils import embedding_functions
from config import config

# Use the lightweight all-MiniLM-L6-v2 model for embeddings (~80MB, fast)
_embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_client = chromadb.PersistentClient(path=config.CHROMA_PERSIST_DIR)

_collection = _client.get_or_create_collection(
    name="school_ai_content",
    embedding_function=_embedding_fn,
    metadata={"hnsw:space": "cosine"},
)


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks for better retrieval."""
    if not text or len(text) <= chunk_size:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def index_assignment(course_id: int, assignment_id: int, name: str, description: str) -> int:
    """
    Index an assignment's description into ChromaDB.
    Returns the number of chunks indexed.
    """
    if not description or description.strip() == "No description available.":
        return 0

    doc_id_prefix = f"assignment_{course_id}_{assignment_id}"

    # Remove existing chunks for this assignment (re-index)
    try:
        existing = _collection.get(where={"doc_id_prefix": doc_id_prefix})
        if existing and existing["ids"]:
            _collection.delete(ids=existing["ids"])
    except Exception:
        pass

    chunks = _chunk_text(description)
    if not chunks:
        return 0

    ids = [f"{doc_id_prefix}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id_prefix": doc_id_prefix,
            "course_id": course_id,
            "assignment_id": assignment_id,
            "assignment_name": name,
            "chunk_index": i,
            "source_type": "assignment",
        }
        for i in range(len(chunks))
    ]

    _collection.upsert(ids=ids, documents=chunks, metadatas=metadatas)
    return len(chunks)


def index_syllabus(course_id: int, course_name: str, syllabus_text: str) -> int:
    """
    Index a course syllabus into ChromaDB.
    Returns the number of chunks indexed.
    """
    if not syllabus_text:
        return 0

    doc_id_prefix = f"syllabus_{course_id}"

    try:
        existing = _collection.get(where={"doc_id_prefix": doc_id_prefix})
        if existing and existing["ids"]:
            _collection.delete(ids=existing["ids"])
    except Exception:
        pass

    chunks = _chunk_text(syllabus_text)
    if not chunks:
        return 0

    ids = [f"{doc_id_prefix}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id_prefix": doc_id_prefix,
            "course_id": course_id,
            "course_name": course_name,
            "chunk_index": i,
            "source_type": "syllabus",
        }
        for i in range(len(chunks))
    ]

    _collection.upsert(ids=ids, documents=chunks, metadatas=metadatas)
    return len(chunks)


def search(query: str, k: int = 5) -> list[dict]:
    """
    Semantic search across all indexed content.
    Returns top-k results with text, metadata, and relevance score.
    """
    if not query:
        return []

    try:
        results = _collection.query(query_texts=[query], n_results=k)
    except Exception:
        return []

    if not results or not results["documents"] or not results["documents"][0]:
        return []

    output = []
    for i, doc in enumerate(results["documents"][0]):
        meta = results["metadatas"][0][i] if results["metadatas"] else {}
        distance = results["distances"][0][i] if results["distances"] else None
        output.append(
            {
                "text": doc,
                "source_type": meta.get("source_type", "unknown"),
                "assignment_name": meta.get("assignment_name", meta.get("course_name", "")),
                "course_id": meta.get("course_id"),
                "relevance_score": round(1 - distance, 4) if distance is not None else None,
            }
        )

    return output


def get_stats() -> dict:
    """Get statistics about the indexed content."""
    count = _collection.count()
    return {"total_chunks": count}
