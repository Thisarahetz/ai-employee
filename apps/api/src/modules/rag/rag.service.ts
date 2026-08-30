import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DocumentSourceType, DocumentStatus } from '@prisma/client';
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
      const text = await this.extractText(document.sourceType, document.fileUrl);
      const chunks = this.chunkText(text);

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
    topK = 5,
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
   */
  async searchTenant(
    tenantId: string,
    query: string,
    topK = 5,
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
   * Extracts raw text to chunk/embed. TEXT/FAQ sources are read directly.
   * PDF/DOCX/URL are real extraction targets that need a proper
   * parser/fetcher — scaffolded as a raw-text passthrough for now so the
   * ingestion pipeline still runs end-to-end.
   */
  private async extractText(sourceType: DocumentSourceType, fileUrl: string | null): Promise<string> {
    if (!fileUrl) return '';

    if (sourceType === DocumentSourceType.PDF || sourceType === DocumentSourceType.DOCX) {
      // TODO: integrate pdf-parse / mammoth / fetch+strip-html — scaffold
      // uses raw text passthrough for now so the pipeline still runs
      // end-to-end. This will mangle real PDF/DOCX binary content until a
      // proper parser is wired in.
      return this.readStoredFileAsText(fileUrl);
    }

    if (sourceType === DocumentSourceType.URL) {
      // TODO: integrate fetch+strip-html — scaffold treats the fetched bytes
      // as UTF-8 text for now.
      const res = await fetch(fileUrl);
      return await res.text();
    }

    // TEXT / FAQ: fileUrl points at a locally-stored (or s3://) plain text file.
    return this.readStoredFileAsText(fileUrl);
  }

  private async readStoredFileAsText(fileUrl: string): Promise<string> {
    if (fileUrl.startsWith('s3://')) {
      // TODO: fetch the object back via @aws-sdk/client-s3 GetObjectCommand —
      // scaffold does not round-trip S3 content during ingestion yet.
      this.logger.warn(`Skipping S3 content extraction for ${fileUrl} (not implemented in scaffold).`);
      return '';
    }
    const buffer = await readFile(fileUrl);
    return buffer.toString('utf-8');
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
