import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'kb-'));
process.env.LOCAL_STORAGE_DIR = root;

/* eslint-disable @typescript-eslint/no-var-requires */
const { extractDocumentText } = require('../src/modules/rag/document-text-extractor');

describe('knowledge-base text extraction', () => {
  before(() => {
    mkdirSync(join(root, 'tenantA'), { recursive: true });
    mkdirSync(join(root, 'tenantB'), { recursive: true });
    writeFileSync(join(root, 'tenantA', 'policy.txt'), 'Cancellations need 12 hours notice.');
    writeFileSync(join(root, 'tenantB', 'secret.txt'), 'B only');
    writeFileSync(join(root, 'tenantA', 'binary.txt'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02]));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  test("reads the tenant's own stored text", async () => {
    assert.equal(await extractDocumentText('tenantA', 'TEXT', join(root, 'tenantA', 'policy.txt')), 'Cancellations need 12 hours notice.');
  });

  test('refuses server files and other tenants’ files', async () => {
    await assert.rejects(() => extractDocumentText('tenantA', 'TEXT', '/etc/passwd'), /not allowed/);
    await assert.rejects(() => extractDocumentText('tenantA', 'TEXT', join(root, 'tenantB', 'secret.txt')), /not allowed/);
    await assert.rejects(() => extractDocumentText('tenantA', 'TEXT', join(root, 'tenantA', '..', 'tenantB', 'secret.txt')), /not allowed/);
    await assert.rejects(() => extractDocumentText('tenantA', 'TEXT', 's3://other-bucket/tenantA/x.txt'), /not allowed/);
  });

  test('refuses private-network URLs (SSRF)', async () => {
    await assert.rejects(() => extractDocumentText('tenantA', 'URL', 'http://169.254.169.254/latest/meta-data'));
    await assert.rejects(() => extractDocumentText('tenantA', 'URL', 'http://localhost:5432'));
  });

  test('does not index binary garbage as text', async () => {
    await assert.rejects(() => extractDocumentText('tenantA', 'TEXT', join(root, 'tenantA', 'binary.txt')), /not plain text/);
  });

  test('extracts real text from a PDF and rejects a corrupt one', async () => {
    const samples = join(require.resolve('pdf-parse/package.json'), '..', 'test', 'data');
    writeFileSync(join(root, 'tenantA', 'doc.pdf'), readFileSync(join(samples, '01-valid.pdf')));
    const text = await extractDocumentText('tenantA', 'PDF', join(root, 'tenantA', 'doc.pdf'));
    assert.ok(text.trim().length > 100, 'text extracted, not raw bytes');
    assert.doesNotMatch(text, /%PDF|endobj/);

    writeFileSync(join(root, 'tenantA', 'bad.pdf'), readFileSync(join(samples, '03-invalid.pdf')));
    await assert.rejects(() => extractDocumentText('tenantA', 'PDF', join(root, 'tenantA', 'bad.pdf')), /Could not read the PDF/);
  });
});
