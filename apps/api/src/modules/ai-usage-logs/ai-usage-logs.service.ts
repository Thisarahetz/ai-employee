import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentType } from '@prisma/client';

@Injectable()
export class AiUsageLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(tenantId: string, days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Fetch logs
    const logs = await this.prisma.aiUsageLog.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: cutoffDate,
        },
      },
    });

    // Initialize counts
    const totalsByAgentType = {
      [AgentType.ROUTER]: 0,
      [AgentType.SUPPORT]: 0,
      [AgentType.KNOWLEDGE]: 0,
      [AgentType.ACTION]: 0,
      [AgentType.HUMAN]: 0,
    } as Record<AgentType, number>;

    // We'll aggregate daily usage in a map keyed by YYYY-MM-DD
    const dailyMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();

    // Pre-fill the last N days so the chart has empty days instead of missing data
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyMap.set(dateStr, { inputTokens: 0, outputTokens: 0, costUsd: 0 });
    }

    // Process logs
    for (const log of logs) {
      // Increment agent type count
      totalsByAgentType[log.agentType] = (totalsByAgentType[log.agentType] || 0) + 1;

      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (dailyMap.has(dateStr)) {
        const dayStats = dailyMap.get(dateStr)!;
        dayStats.inputTokens += log.inputTokens;
        dayStats.outputTokens += log.outputTokens;
        dayStats.costUsd += Number(log.estimatedCostUsd);
      }
    }

    // Convert map to array sorted by date (Map iteration order is insertion order, which is already chronological)
    const dailyUsage = Array.from(dailyMap.entries()).map(([date, stats]) => ({
      date,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      costUsd: stats.costUsd,
    }));

    return {
      totalsByAgentType,
      dailyUsage,
    };
  }
}
