import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encrypt } from '../../common/crypto/encryption.util';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateChannelCredentialDto } from './dto/create-channel-credential.dto';

@Injectable()
export class ChannelService {
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

  findAll(tenantId: string) {
    return this.prisma.channel.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id, tenantId } });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    return channel;
  }

  async update(tenantId: string, id: string, dto: UpdateChannelDto) {
    await this.findOne(tenantId, id);
    return this.prisma.channel.update({
      where: { id },
      data: {
        ...dto,
        config: dto.config !== undefined ? (dto.config as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
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
