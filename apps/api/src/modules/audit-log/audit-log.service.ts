import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Opportunistic — other modules may call this on notable mutations; not mandatory everywhere. */
  record(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    changes: Record<string, unknown> = {},
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        entityType,
        entityId,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  list(tenantId: string, entityType?: string) {
    return this.prisma.auditLog.findMany({
      where: { tenantId, entityType },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
