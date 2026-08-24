-- Enable pgvector for RAG document_chunks.embedding before Prisma migrations run.
CREATE EXTENSION IF NOT EXISTS vector;
