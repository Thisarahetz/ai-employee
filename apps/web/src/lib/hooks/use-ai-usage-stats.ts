"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { AgentType } from "@/lib/types";

/**
 * TODO: GET /ai-usage-logs/stats is NOT in the documented REST contract —
 * it's invented here so the dashboard's stat tiles ("actions executed") and
 * token-usage/cost chart have a real shape to query against. It should
 * aggregate `AiUsageLog` rows (see prisma/schema.prisma) server-side:
 *   - totalsByAgentType: count of usage-log rows per AgentType
 *   - dailyUsage: input/output tokens + estimated cost, bucketed by day
 * Once the backend adds the real endpoint (or an equivalent), only this
 * hook needs to change.
 */
export interface AiUsageDailyPoint {
  date: string; // ISO date, e.g. "2026-08-20"
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiUsageStats {
  totalsByAgentType: Record<AgentType, number>;
  dailyUsage: AiUsageDailyPoint[];
}

export function useAiUsageStats(days = 14) {
  return useQuery({
    queryKey: ["ai-usage-stats", days],
    queryFn: async () => (await apiClient.get<AiUsageStats>("/ai-usage-logs/stats", { params: { days } })).data,
  });
}
