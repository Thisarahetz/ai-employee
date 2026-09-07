import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListActivitiesFilter {
  employeeId?: string;
  category?: string;
  branchId?: string;
  limit?: number;
}

@Injectable()
export class AiEmployeeActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async listActivities(tenantId: string, filter?: ListActivitiesFilter) {
    const limit = filter?.limit ? Math.min(filter.limit, 100) : 50;

    return this.prisma.aiEmployeeActivity.findMany({
      where: {
        tenantId,
        ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter?.category ? { category: filter.category } : {}),
        ...(filter?.branchId ? { branchId: filter.branchId } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            role: true,
            department: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async logActivity(
    tenantId: string,
    employeeId: string,
    action: string,
    category: string = 'CUSTOMER',
    details: string = '',
    status: string = 'SUCCESS',
    branchId?: string,
  ) {
    return this.prisma.aiEmployeeActivity.create({
      data: {
        tenantId,
        employeeId,
        action,
        category,
        details,
        status,
        branchId: branchId ?? null,
      },
    });
  }
}
