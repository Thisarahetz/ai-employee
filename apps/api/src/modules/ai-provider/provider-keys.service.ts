import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiProviderName } from '@prisma/client';
import { createProviderWithKey, getProvider, type AIProvider, type AIProviderName } from '@ai-employee/ai-core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { decrypt, encrypt } from '../../common/crypto/encryption.util';

export const toCoreName = (p: AiProviderName): AIProviderName =>
  p === AiProviderName.ANTHROPIC ? 'anthropic' : p === AiProviderName.GEMINI ? 'gemini' : 'openai';

const ENV_KEY: Record<AiProviderName, string> = { OPENAI: 'OPENAI_API_KEY', ANTHROPIC: 'ANTHROPIC_API_KEY', GEMINI: 'GEMINI_API_KEY' };
const TEST_MODEL: Record<AiProviderName, string> = { OPENAI: 'gpt-4o-mini', ANTHROPIC: 'claude-haiku-4-5', GEMINI: 'gemini-2.5-flash' };

/** Platform keys may be used by businesses without their own key (AI_ALLOW_PLATFORM_KEYS=false to require BYOK). */
export const platformKeysAllowed = (env: NodeJS.ProcessEnv = process.env) => env.AI_ALLOW_PLATFORM_KEYS !== 'false';

/**
 * Per-business AI provider keys (bring your own key). Stored AES-256-GCM
 * encrypted; the API only ever returns the last four characters.
 */
@Injectable()
export class ProviderKeysService {
  private readonly logger = new Logger(ProviderKeysService.name);
  private lastTouched = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.tenantAiProviderKey.findMany({ where: { tenantId }, orderBy: { provider: 'asc' } });
    return {
      platformKeysAllowed: platformKeysAllowed(),
      providers: (Object.values(AiProviderName) as AiProviderName[]).map((p) => {
        const row = rows.find((r) => r.provider === p);
        return {
          provider: p,
          hasOwnKey: Boolean(row),
          keyHint: row ? `…${row.keyHint}` : null,
          lastUsedAt: row?.lastUsedAt ?? null,
          lastError: row?.lastError ?? null,
          updatedAt: row?.updatedAt ?? null,
          platformKeyAvailable: platformKeysAllowed() && Boolean(process.env[ENV_KEY[p]]?.trim()),
        };
      }),
    };
  }

  async set(tenantId: string, userId: string, provider: string, apiKey: string, opts: { validate?: boolean } = {}) {
    const p = String(provider ?? '').toUpperCase() as AiProviderName;
    if (!(Object.values(AiProviderName) as string[]).includes(p)) throw new BadRequestException('provider must be OPENAI, ANTHROPIC or GEMINI');
    const key = String(apiKey ?? '').trim();
    if (key.length < 20 || key.length > 300 || /\s/.test(key)) throw new BadRequestException('That does not look like a valid API key.');
    if (opts.validate !== false) {
      try {
        await createProviderWithKey(toCoreName(p), key).complete({ model: TEST_MODEL[p], messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 5, temperature: 0 });
      } catch (err) {
        const msg = (err as Error).message ?? '';
        // Quota/rate errors still prove the key authenticates.
        if (!/429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg)) {
          throw new BadRequestException(`The provider rejected this key: ${msg.split('\n')[0]!.slice(0, 200)}`);
        }
      }
    }
    await this.prisma.tenantAiProviderKey.upsert({
      where: { tenantId_provider: { tenantId, provider: p } },
      create: { tenantId, provider: p, encryptedKey: encrypt(key), keyHint: key.slice(-4), createdByUserId: userId },
      update: { encryptedKey: encrypt(key), keyHint: key.slice(-4), createdByUserId: userId, lastError: null },
    });
    await this.audit.record(tenantId, userId, 'ai_provider_key.saved', 'TenantAiProviderKey', p, { provider: p, keyHint: key.slice(-4) });
    return this.list(tenantId);
  }

  async remove(tenantId: string, userId: string, provider: string) {
    const p = String(provider ?? '').toUpperCase() as AiProviderName;
    const row = await this.prisma.tenantAiProviderKey.findFirst({ where: { tenantId, provider: p } });
    if (!row) throw new NotFoundException('No key saved for that provider');
    await this.prisma.tenantAiProviderKey.delete({ where: { id: row.id } });
    await this.audit.record(tenantId, userId, 'ai_provider_key.deleted', 'TenantAiProviderKey', p, { provider: p });
    return this.list(tenantId);
  }

  /** The provider client to use for this tenant: their own key, else the platform key (if allowed). */
  async resolve(tenantId: string, provider: AiProviderName): Promise<{ client: AIProvider; source: 'tenant' | 'platform'; keyId?: string }> {
    const row = await this.prisma.tenantAiProviderKey.findFirst({ where: { tenantId, provider } });
    if (row) {
      this.touch(row.id);
      return { client: createProviderWithKey(toCoreName(provider), decrypt(row.encryptedKey)), source: 'tenant', keyId: row.id };
    }
    if (!platformKeysAllowed()) {
      throw new Error(`No ${provider} API key is configured for this business. Add one under Settings → AI provider keys.`);
    }
    return { client: getProvider(toCoreName(provider)), source: 'platform' };
  }

  async recordError(keyId: string, err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    if (/401|403|invalid.*key|API key not valid|unauthorized|permission/i.test(msg)) {
      await this.prisma.tenantAiProviderKey.update({ where: { id: keyId }, data: { lastError: msg.slice(0, 300) } }).catch(() => undefined);
    }
  }

  /** lastUsedAt, written at most every 5 minutes per key. */
  private touch(id: string) {
    const now = Date.now();
    if (now - (this.lastTouched.get(id) ?? 0) < 5 * 60_000) return;
    this.lastTouched.set(id, now);
    this.prisma.tenantAiProviderKey.update({ where: { id }, data: { lastUsedAt: new Date(now) } }).catch((e) => this.logger.warn(e.message));
  }
}
