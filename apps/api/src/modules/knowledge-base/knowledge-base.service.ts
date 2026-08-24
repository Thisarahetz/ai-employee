import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DocumentSourceType, DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

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
      orderBy: { createdAt: 'desc' },
    });
  }

  async listDocuments(tenantId: string, knowledgeBaseId: string) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);
    return this.prisma.document.findMany({
      where: { tenantId, knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(
    tenantId: string,
    knowledgeBaseId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
  ) {
    await this.assertKnowledgeBaseExists(tenantId, knowledgeBaseId);

    if (!file) {
      throw new NotFoundException('No file was uploaded (expected multipart field "file").');
    }

    const fileUrl = await this.storeFile(tenantId, file);
    const sourceType = dto.sourceType ?? this.inferSourceType(file.originalname);

    const document = await this.prisma.document.create({
      data: {
        tenantId,
        knowledgeBaseId,
        title: dto.title ?? file.originalname,
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
    if (process.env.STORAGE_DRIVER === 's3') {
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
