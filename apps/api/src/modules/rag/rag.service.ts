import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DocumentSourceType, DocumentStatus } from '@prisma/client';
import { ExtractionError, extractDocumentText } from './document-text-extractor';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';

// No tokenizer dependency — approximate 1 token ~= 4 characters, which is
// close enough for chunk sizing and the tokenCount we persist for display.
const CHARS_PER_TOKEN = 4;
const CHUNK_TOKEN_SIZE = 500;
const CHUNK_CHAR_SIZE = CHUNK_TOKEN_SIZE * CHARS_PER_TOKEN;

/**
 * RagService — chunk/embed/search over the Document/DocumentChunk tables.
 * Every query is tenant-filtered; search() never returns chunks from another
 * tenant's knowledge base regardless of knowledgeBaseId.
 *
 * DocumentChunk.embedding is an `Unsupported("vector(1536)")` Prisma field
 * (pgvector), so Prisma Client can't read/write it directly — inserts and
 * similarity search both go through $executeRaw/$queryRaw.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProviderService: AiProviderService,
  ) {}

  async ingestDocument(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.PROCESSING, errorMessage: null },
    });

    try {
      const text = await extractDocumentText(document.tenantId, document.sourceType, document.fileUrl);
      const chunks = this.chunkText(text);
      if (!chunks.length) throw new ExtractionError('No readable text was found in this document.');

      // Re-ingestion case: drop any previously inserted chunks for this doc.
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];
        const { embedding } = await this.aiProviderService.embed(document.tenantId, chunkContent);
        const vectorLiteral = this.toVectorLiteral(embedding);
        const id = randomUUID();
        const tokenCount = Math.max(1, Math.ceil(chunkContent.length / CHARS_PER_TOKEN));

        await this.prisma.$executeRaw`
          INSERT INTO document_chunks (id, "tenantId", "documentId", "knowledgeBaseId", content, embedding, "chunkIndex", "tokenCount", "createdAt")
          VALUES (${id}, ${document.tenantId}, ${documentId}, ${document.knowledgeBaseId}, ${chunkContent}, ${vectorLiteral}::vector, ${i}, ${tokenCount}, now())
        `;
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.READY },
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown ingestion error';
      this.logger.error(`ingestDocument(${documentId}) failed: ${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED, errorMessage: message },
      });
      throw err;
    }
  }

  async search(
    tenantId: string,
    knowledgeBaseId: string,
    query: string,
    topK = 3,
  ): Promise<{ content: string; documentId: string }[]> {
    const { embedding } = await this.aiProviderService.embed(tenantId, query);
    const vectorLiteral = this.toVectorLiteral(embedding);

    return this.prisma.$queryRaw<{ content: string; documentId: string }[]>`
      SELECT content, "documentId" FROM document_chunks
      WHERE "tenantId" = ${tenantId} AND "knowledgeBaseId" = ${knowledgeBaseId}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `;
  }

  /**
   * Like search(), but across every KnowledgeBase the tenant owns — used by the
   * Knowledge Agent, which answers from all of the tenant's knowledge (hand-authored
   * docs + integration-synced ones) rather than a single KB. Still tenant-filtered.
   * Default topK=3 bounds context injection to ~300-500 tokens (RTK compression).
   */
  async searchTenant(
    tenantId: string,
    query: string,
    topK = 3,
  ): Promise<{ content: string; documentId: string }[]> {
    const { embedding } = await this.aiProviderService.embed(tenantId, query);
    const vectorLiteral = this.toVectorLiteral(embedding);

    return this.prisma.$queryRaw<{ content: string; documentId: string }[]>`
      SELECT content, "documentId" FROM document_chunks
      WHERE "tenantId" = ${tenantId}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `;
  }

  /**
   * searchTenant() for several phrasings of one question (e.g. the customer's
   * Sinhala text and its English translation). Returns the closest distinct
   * chunks across all of them.
   */
  async searchTenantMulti(
    tenantId: string,
    queries: string[],
    topK = 3,
  ): Promise<{ content: string; documentId: string }[]> {
    const distinct = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
    if (distinct.length <= 1) return this.searchTenant(tenantId, distinct[0] ?? '', topK);

    const perQuery = await Promise.all(
      distinct.map(async (query) => {
        const { embedding } = await this.aiProviderService.embed(tenantId, query);
        const vectorLiteral = this.toVectorLiteral(embedding);
        return this.prisma.$queryRaw<{ id: string; content: string; documentId: string; distance: number }[]>`
          SELECT id, content, "documentId", (embedding <=> ${vectorLiteral}::vector) AS distance FROM document_chunks
          WHERE "tenantId" = ${tenantId}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${topK}
        `;
      }),
    );

    const best = new Map<string, { content: string; documentId: string; distance: number }>();
    for (const row of perQuery.flat()) {
      const prev = best.get(row.id);
      if (!prev || Number(row.distance) < prev.distance) {
        best.set(row.id, { content: row.content, documentId: row.documentId, distance: Number(row.distance) });
      }
    }
    return [...best.values()]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK)
      .map(({ content, documentId }) => ({ content, documentId }));
  }

  /**
   * Simple whitespace/sentence-based splitter, approximating ~500 tokens per
   * chunk by character count. No tokenizer dependency needed for a scaffold.
   */
  private chunkText(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const sentences = normalized.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (current.length > 0 && current.length + sentence.length + 1 > CHUNK_CHAR_SIZE) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    // Hard-split fallback for any chunk that's still oversized (e.g. one
    // giant "sentence" with no punctuation at all).
    return chunks.flatMap((chunk) =>
      chunk.length <= CHUNK_CHAR_SIZE ? [chunk] : (chunk.match(new RegExp(`.{1,${CHUNK_CHAR_SIZE}}`, 'g')) ?? [chunk]),
    );
  }

  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
