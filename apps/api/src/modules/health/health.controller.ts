import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(@Res() res: Response) {
    const startedAt = Date.now();
    let dbStatus = 'down';
    let isHealthy = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch (err) {
      isHealthy = false;
      dbStatus = 'down';
    }

    const payload = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      responseTimeMs: Date.now() - startedAt,
      services: {
        database: dbStatus,
        api: 'up',
      },
    };

    return res
      .status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(payload);
  }
}
