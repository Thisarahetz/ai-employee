import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.business.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  }

  async get(tenantId: string, id: string) {
    const business = await this.prisma.business.findFirst({ where: { id, tenantId } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  create(tenantId: string, dto: CreateBusinessDto) {
    return this.prisma.business.create({
      data: { tenantId, ...dto, settings: dto.settings as Prisma.InputJsonValue },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateBusinessDto) {
    await this.get(tenantId, id);
    return this.prisma.business.update({
      where: { id },
      data: { ...dto, settings: dto.settings as Prisma.InputJsonValue },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.business.delete({ where: { id } });
    return { success: true };
  }
}
