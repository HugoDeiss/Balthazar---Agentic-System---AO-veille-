-- Track the pgvector ID of RAG chunks inserted via user feedback.
-- Enables deactivateRAGChunk to delete the vector from the store.
ALTER TABLE ao_feedback ADD COLUMN IF NOT EXISTS chunk_vector_id TEXT;

COMMENT ON COLUMN ao_feedback.chunk_vector_id IS
  'ID du vecteur pgvector inséré pour les corrections de type rag_chunk (format: feedback_{id}). Utilisé par deactivateRAGChunk pour supprimer le chunk du vector store.';

CREATE INDEX IF NOT EXISTS idx_ao_feedback_chunk_vector_id
  ON ao_feedback(chunk_vector_id)
  WHERE chunk_vector_id IS NOT NULL;
