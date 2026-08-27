import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DocumentSourceType, DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const LOCAL_STORAGE_DIR = join(process.cwd(), 'storage');

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  create(tenantId: string, dto: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({
      data: { tenantId, name: dto.name, description: dto.description },
    });
  }

  list(tenantId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { tenantId },
      include: {
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!kb) {
      throw new NotFoundException(`Knowledge base ${id} not found`);
    }
    return kb;
  }

  async update(tenantId: string, id: string, dto: UpdateKnowledgeBaseDto) {
    await this.assertKnowledgeBaseExists(tenantId, id);
    return this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.assertKnowledgeBaseExists(tenantId, id);
    // Delete chunks
    await this.prisma.$executeRaw`DELETE FROM document_chunks WHERE "knowledgeBaseId" = ${id} AND "tenantId" = ${tenantId}`;
    // Delete documents
    await this.prisma.document.deleteMany({ where: { knowledgeBaseId: id, tenantId } });
    // Delete knowledge base
    return this.prisma.knowledgeBase.delete({ where: { id } });
  }

  async listDocuments(tenantId: string, knowledgeBaseId: string) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);
    return this.prisma.document.findMany({
      where: { tenantId, knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocument(tenantId: string, knowledgeBaseId: string, docId: string) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);
    const document = await this.prisma.document.findFirst({
      where: { id: docId, knowledgeBaseId, tenantId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    // Load chunks
    const chunks = await this.prisma.$queryRaw<{ id: string; content: string; chunkIndex: number; tokenCount: number }[]>`
      SELECT id, content, "chunkIndex", "tokenCount"
      FROM document_chunks
      WHERE "documentId" = ${docId} AND "tenantId" = ${tenantId}
      ORDER BY "chunkIndex" ASC
    `;

    // Try reading text content if file exists
    let content = '';
    if (document.fileUrl && !document.fileUrl.startsWith('s3://') && !document.fileUrl.startsWith('http')) {
      try {
        content = await readFile(document.fileUrl, 'utf-8');
      } catch (err) {
        this.logger.debug(`Could not read file for doc ${docId}: ${(err as Error).message}`);
      }
    }

    return {
      ...document,
      content: content || chunks.map((c) => c.content).join('\n\n'),
      chunks,
    };
  }

  async updateDocument(tenantId: string, knowledgeBaseId: string, docId: string, dto: UpdateDocumentDto) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);
    const document = await this.prisma.document.findFirst({
      where: { id: docId, knowledgeBaseId, tenantId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    let fileUrl = document.fileUrl;
    if (dto.content !== undefined) {
      const buffer = Buffer.from(dto.content, 'utf-8');
      const filename = `${(dto.title || document.title).toLowerCase().replace(/[^a-z0-9]/g, '-')}.txt`;
      fileUrl = await this.storeBuffer(tenantId, filename, buffer, 'text/plain');
    }

    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: {
        title: dto.title ?? document.title,
        fileUrl,
        status: DocumentStatus.PENDING,
      },
    });

    // Re-ingest
    this.ragService.ingestDocument(docId).catch((err) => {
      this.logger.error(`Re-ingest failed for doc ${docId}: ${(err as Error).message}`);
    });

    return updated;
  }

  async deleteDocument(tenantId: string, knowledgeBaseId: string, docId: string) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);
    const document = await this.prisma.document.findFirst({
      where: { id: docId, knowledgeBaseId, tenantId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${docId} not found`);
    }

    await this.prisma.$executeRaw`DELETE FROM document_chunks WHERE "documentId" = ${docId} AND "tenantId" = ${tenantId}`;
    return this.prisma.document.delete({ where: { id: docId } });
  }

  async uploadDocument(
    tenantId: string,
    knowledgeBaseId: string,
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
  ) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);

    let fileUrl: string | null = null;
    const sourceType =
      dto.sourceType ?? (file ? this.inferSourceType(file.originalname) : DocumentSourceType.TEXT);

    if (file) {
      fileUrl = await this.storeFile(tenantId, file);
    } else if (dto.content) {
      const buffer = Buffer.from(dto.content, 'utf-8');
      const filename = `${(dto.title || 'document').toLowerCase().replace(/[^a-z0-9]/g, '-')}.txt`;
      fileUrl = await this.storeBuffer(tenantId, filename, buffer, 'text/plain');
    } else if (dto.url) {
      fileUrl = dto.url;
    } else {
      throw new NotFoundException('Please provide a file, text content, or URL.');
    }

    const document = await this.prisma.document.create({
      data: {
        tenantId,
        knowledgeBaseId,
        title: dto.title ?? file?.originalname ?? 'Untitled Document',
        sourceType,
        fileUrl,
        status: DocumentStatus.PENDING,
      },
    });

    // Fire-and-forget: don't block the upload response on chunking/embedding.
    // ingestDocument() moves the row through PROCESSING -> READY/FAILED itself.
    this.ragService.ingestDocument(document.id).catch((err) => {
      this.logger.error(`ingestDocument failed for document ${document.id}: ${(err as Error).message}`);
    });

    return document;
  }

  private async storeBuffer(tenantId: string, filename: string, buffer: Buffer, mimetype: string): Promise<string> {
    const file: Express.Multer.File = {
      buffer,
      originalname: filename,
      mimetype,
      fieldname: 'file',
      encoding: '7bit',
      size: buffer.length,
      stream: null as any,
      destination: '',
      filename,
      path: '',
    };
    return this.storeFile(tenantId, file);
  }

  private async assertKnowledgeBaseExists(tenantId: string, knowledgeBaseId: string) {
    const kb = await this.prisma.knowledgeBase.findFirst({ where: { id: knowledgeBaseId, tenantId } });
    if (!kb) {
      throw new NotFoundException(`Knowledge base ${knowledgeBaseId} not found`);
    }
    return kb;
  }

  private inferSourceType(filename: string): DocumentSourceType {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return DocumentSourceType.PDF;
      case 'docx':
        return DocumentSourceType.DOCX;
      default:
        return DocumentSourceType.TEXT;
    }
  }

  /**
   * Persists the raw uploaded file and returns a fileUrl to store on the
   * Document row. Content extraction happens later, in
   * RagService.ingestDocument.
   */
  private async storeFile(tenantId: string, file: Express.Multer.File): Promise<string> {
    if (
      process.env.STORAGE_DRIVER === 's3' &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
    ) {
      return this.storeToS3(tenantId, file);
    }
    return this.storeToLocalDisk(tenantId, file);
  }

  private async storeToLocalDisk(tenantId: string, file: Express.Multer.File): Promise<string> {
    const dir = join(LOCAL_STORAGE_DIR, tenantId);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}-${file.originalname}`;
    const fullPath = join(dir, filename);
    await writeFile(fullPath, file.buffer);
    return fullPath;
  }

  private async storeToS3(tenantId: string, file: Express.Multer.File): Promise<string> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });

    const key = `${tenantId}/${randomUUID()}-${file.originalname}`;
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `s3://${process.env.S3_BUCKET}/${key}`;
  }
}
