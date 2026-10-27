import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CredentialType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt, encrypt } from '../../common/crypto/encryption.util';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateChannelCredentialDto } from './dto/create-channel-credential.dto';

/** Decrypted channel credential — `type` plus whatever payload fields were stored for it. */
export type DecryptedChannelCredential = { type: CredentialType } & Record<string, unknown>;

/** Is the channel's setup complete? (Says nothing about whether a message has arrived yet.) */
export function isSetUp(type: string, config: Record<string, unknown>, hasKey: boolean): boolean {
  const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  switch (type) {
    case 'WHATSAPP':
      return config.provider === 'waha' || filled(config.wahaSession) ? filled(config.wahaSession) : filled(config.phoneNumberId) && hasKey;
    case 'VOICE':
      return hasKey || filled(process.env.TWILIO_AUTH_TOKEN);
    case 'WEBSITE_CHAT':
      return true;
    default:
      return false;
  }
}

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateChannelDto) {
    return this.prisma.channel.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        businessId: dto.businessId,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Every channel with two derived facts for the dashboard: `connected` (setup is
   * complete: ids and keys are in place) and `lastMessageAt` (the last time a
   * customer actually reached us on it, which is the real proof it works).
   */
  async findAll(tenantId: string) {
    const [channels, credentials, activity] = await Promise.all([
      this.prisma.channel.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.channelCredential.groupBy({ by: ['channelId'], where: { tenantId }, _count: true }),
      this.prisma.conversation.groupBy({ by: ['channelId'], where: { tenantId }, _max: { lastMessageAt: true } }),
    ]);
    const hasKey = new Set(credentials.map((c) => c.channelId));
    const last = new Map(activity.map((a) => [a.channelId, a._max.lastMessageAt]));
    return channels.map((c) => ({
      ...c,
      connected: isSetUp(c.type, (c.config ?? {}) as Record<string, unknown>, hasKey.has(c.id)),
      lastMessageAt: last.get(c.id) ?? null,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { credentials: true } } },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    const { _count, ...rest } = channel;
    // `hasCredentials` lets the UI show connection status without ever
    // exposing the encrypted payload itself.
    return { ...rest, hasCredentials: _count.credentials > 0 };
  }

  /**
   * Loads + decrypts the most recent credential for a channel, for outbound
   * delivery (WhatsApp access token, ...). Mirrors
   * ExternalActionService.buildAuthHeaders. Returns null (never throws) when
   * there's no credential or it can't be decrypted — outbound delivery is
   * best-effort and must not break the caller.
   */
  async getDecryptedCredential(
    tenantId: string,
    channelId: string,
  ): Promise<DecryptedChannelCredential | null> {
    const credential = await this.prisma.channelCredential.findFirst({
      where: { tenantId, channelId },
      orderBy: { createdAt: 'desc' },
    });
    if (!credential) return null;

    try {
      return JSON.parse(decrypt(credential.encryptedPayload)) as DecryptedChannelCredential;
    } catch (error) {
      this.logger.warn(
        `Failed to decrypt credential for channel ${channelId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Derived connection details for the channel detail page — webhook URL /
   * verify token for WhatsApp, embed snippet for website chat. Never returns
   * secrets (only `hasCredentials`).
   */
  async getConnectionInfo(tenantId: string, id: string) {
    const channel = await this.findOne(tenantId, id);
    const config = (channel.config ?? {}) as Record<string, unknown>;
    const apiBase = (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');

    const base = {
      channelId: channel.id,
      type: channel.type,
      hasCredentials: channel.hasCredentials,
      webhookUrl: null as string | null,
      verifyToken: null as string | null,
      phoneNumberId: null as string | null,
      widgetUrl: null as string | null,
      widgetSnippet: null as string | null,
    };

    if (channel.type === 'WHATSAPP') {
      return {
        ...base,
        webhookUrl: `${apiBase}/webhooks/whatsapp`,
        verifyToken: typeof config.verifyToken === 'string' ? config.verifyToken : null,
        phoneNumberId: typeof config.phoneNumberId === 'string' ? config.phoneNumberId : null,
      };
    }

    if (channel.type === 'WEBSITE_CHAT') {
      const widgetUrl = `${apiBase}/channels/website-chat/widget.js`;
      return {
        ...base,
        widgetUrl,
        widgetSnippet: `<script src="${widgetUrl}" data-channel-id="${channel.id}" async></script>`,
      };
    }

    if (channel.type === 'VOICE') {
      return { ...base, webhookUrl: `${apiBase}/webhooks/voice/twilio/incoming/${channel.id}` };
    }

    return base;
  }

  async update(tenantId: string, id: string, dto: UpdateChannelDto) {
    const existing = await this.findOne(tenantId, id);
    return this.prisma.channel.update({
      where: { id },
      data: {
        ...dto,
        // Shallow-merge config so a settings form can PATCH just the keys it
        // owns (e.g. { verifyToken } or { accentColor }) without clobbering
        // the rest.
        config:
          dto.config !== undefined
            ? ({
                ...((existing.config as Record<string, unknown>) ?? {}),
                ...dto.config,
              } as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    // `Conversation.channel` has no cascade — deleting a channel with history
    // would hit an FK error. Guard with a clear message and point at
    // deactivation (PATCH status: INACTIVE) as the non-destructive option.
    const conversationCount = await this.prisma.conversation.count({ where: { tenantId, channelId: id } });
    if (conversationCount > 0) {
      throw new ConflictException(
        `This channel has ${conversationCount} conversation(s). Set it to inactive instead of deleting it.`,
      );
    }

    // ChannelCredential cascades on channel delete (see schema.prisma).
    await this.prisma.channel.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Encrypts `dto.payload` (see IntegrationService.addCredential for the equivalent
   * pattern). `dto.type` has nowhere to live on `ChannelCredential` (no `type` column on
   * that model — see the note on CreateChannelCredentialDto), so it's folded into the
   * encrypted JSON itself rather than dropped silently.
   */
  async addCredential(tenantId: string, channelId: string, dto: CreateChannelCredentialDto) {
    await this.findOne(tenantId, channelId);
    const encryptedPayload = encrypt(JSON.stringify({ type: dto.type, ...dto.payload }));
    const credential = await this.prisma.channelCredential.create({
      data: { tenantId, channelId, encryptedPayload },
    });
    // Never echo the encrypted payload back to the caller.
    const { encryptedPayload: _omit, ...safe } = credential;
    return safe;
  }
}
