"use client";

import Link from "next/link";

import { useConversations } from "@/lib/hooks/use-conversations";
import { useAiUsageStats } from "@/lib/hooks/use-ai-usage-stats";
import { useHumanHandoffs, useResolveHandoff } from "@/lib/hooks/use-human-handoffs";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { StatTile } from "@/components/dashboard/stat-tile";
import { UsageChart } from "@/components/dashboard/usage-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardPage() {
  const totalConversations = useConversations("ALL", 1);
  const aiHandling = useConversations("AI_HANDLING", 1);
  const humanHandling = useConversations("HUMAN_HANDLING", 1);
  // TODO: /ai-usage-logs/stats is an invented endpoint — see src/lib/hooks/use-ai-usage-stats.ts.
  const usageStats = useAiUsageStats(14);
  const pendingHandoffs = useHumanHandoffs("PENDING");
  const resolveHandoff = useResolveHandoff();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Dashboard</h1>
        <p className="text-sm text-ink-secondary">A snapshot of conversations, AI activity, and automation.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total conversations"
          value={totalConversations.data?.total ?? 0}
          isLoading={totalConversations.isLoading}
        />
        <StatTile
          label="AI handling"
          value={aiHandling.data?.total ?? 0}
          isLoading={aiHandling.isLoading}
          hint="Currently owned by an AI agent"
        />
        <StatTile
          label="Human handling"
          value={humanHandling.data?.total ?? 0}
          isLoading={humanHandling.isLoading}
          hint="Taken over by a human agent"
        />
        <StatTile
          label="Actions executed"
          value={usageStats.data?.totalsByAgentType.ACTION ?? 0}
          isLoading={usageStats.isLoading}
          hint="Action-agent invocations, last 14 days"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Token usage &amp; cost</CardTitle>
            <CardDescription>Last 14 days, across all AI agents.</CardDescription>
          </CardHeader>
          <CardContent>
            {usageStats.isError ? (
              <ErrorState
                message={getErrorMessage(usageStats.error, "Unable to load usage data.")}
                onRetry={() => usageStats.refetch()}
              />
            ) : (
              <UsageChart data={usageStats.data?.dailyUsage ?? []} isLoading={usageStats.isLoading} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending handoffs</CardTitle>
            <CardDescription>Conversations waiting for a human agent.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingHandoffs.isLoading ? (
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded bg-surface-page" />
                <div className="h-10 animate-pulse rounded bg-surface-page" />
              </div>
            ) : pendingHandoffs.isError ? (
              <ErrorState
                message={getErrorMessage(pendingHandoffs.error, "Unable to load handoffs.")}
                onRetry={() => pendingHandoffs.refetch()}
              />
            ) : !pendingHandoffs.data?.length ? (
              <EmptyState title="Nothing pending" description="All conversations are handled." />
            ) : (
              <ul className="divide-y divide-line">
                {pendingHandoffs.data.map((handoff) => (
                  <li key={handoff.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link
                        href={`/conversations/${handoff.conversationId}`}
                        className="truncate text-sm font-medium text-brand-600 hover:underline"
                      >
                        {handoff.reason.replaceAll("_", " ").toLowerCase()}
                      </Link>
                      <p className="text-xs text-ink-muted">{formatDateTime(handoff.requestedAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={resolveHandoff.isPending && resolveHandoff.variables === handoff.id}
                      onClick={() => resolveHandoff.mutate(handoff.id)}
                    >
                      Resolve
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
