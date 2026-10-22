import { readFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve } from 'path';
import { DocumentSourceType } from '@prisma/client';
import { fetchPublicPage } from '../ai-workforce/safe-web-fetch';

/** Where uploaded knowledge-base files live on local disk (per-tenant sub-folders). */
export const LOCAL_STORAGE_DIR = resolve(process.env.LOCAL_STORAGE_DIR || join(process.cwd(), 'storage'));
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export class ExtractionError extends Error {}

/**
 * Turns a stored knowledge-base document into plain text.
 *
 * Security: a document's `fileUrl` is only ever read from the owning tenant's
 * own storage area (local `storage/<tenantId>/` or `s3://<bucket>/<tenantId>/`),
 * and URLs go through the SSRF-safe public fetcher — a crafted fileUrl can't
 * read server files, another tenant's files, or internal network services.
 */
export async function extractDocumentText(tenantId: string, sourceType: DocumentSourceType, fileUrl: string | null): Promise<string> {
  if (!fileUrl) throw new ExtractionError('The document has no stored content.');

  if (sourceType === DocumentSourceType.URL) {
    const page = await fetchPublicPage(fileUrl);
    if (page.status >= 400) throw new ExtractionError(`The page responded with HTTP ${page.status}.`);
    return [page.title, page.metaDescription, ...page.headings.h1, ...page.headings.h2, (page as { text?: string }).text]
      .filter(Boolean)
      .join('\n\n');
  }

  const buffer = await readTenantFile(tenantId, fileUrl);

  switch (sourceType) {
    case DocumentSourceType.PDF: {
      // Import the library entry directly: pdf-parse's index runs a debug harness when required.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
      const out = await pdfParse(buffer).catch((e: Error) => {
        throw new ExtractionError(`Could not read the PDF: ${e.message}`);
      });
      return out.text;
    }
    case DocumentSourceType.DOCX: {
      const mammoth = await import('mammoth');
      const out = await mammoth.extractRawText({ buffer }).catch((e: Error) => {
        throw new ExtractionError(`Could not read the Word document: ${e.message}`);
      });
      return out.value;
    }
    default: {
      if (looksBinary(buffer)) throw new ExtractionError('This file is not plain text. Upload it as a PDF or Word document.');
      return buffer.toString('utf-8');
    }
  }
}

async function readTenantFile(tenantId: string, fileUrl: string): Promise<Buffer> {
  if (fileUrl.startsWith('s3://')) {
    const bucket = process.env.S3_BUCKET;
    const [, , b, ...keyParts] = fileUrl.split('/');
    const key = keyParts.join('/');
    if (!bucket || b !== bucket || !key.startsWith(`${tenantId}/`)) throw new ExtractionError('Document storage location is not allowed.');
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (Number(res.ContentLength ?? 0) > MAX_FILE_BYTES) throw new ExtractionError('The file is too large (max 25 MB).');
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new ExtractionError('The stored file is empty.');
    return Buffer.from(bytes);
  }

  const tenantDir = join(LOCAL_STORAGE_DIR, tenantId);
  const full = resolve(fileUrl);
  const rel = relative(tenantDir, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new ExtractionError('Document storage location is not allowed.');
  const buf = await readFile(full);
  if (buf.length > MAX_FILE_BYTES) throw new ExtractionError('The file is too large (max 25 MB).');
  return buf;
}

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  let suspicious = 0;
  for (const byte of sample) if (byte === 0 || (byte < 8 && byte !== 0)) suspicious++;
  return suspicious > 0;
}
