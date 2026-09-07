"use client";

import Link from "next/link";
import { Activity, BarChart3, Bot, Building2, DollarSign, MessageSquare, RefreshCw, Zap } from "lucide-react";

import { useAdminUsage } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminUsagePage() {
  const usageQuery = useAdminUsage();
  const usage = usageQuery.data;

  const totalActivities = usage?.activitiesByCategory.reduce((acc, c) => acc + c.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Platform Usage & Analytics</h1>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              Aggregated Metrics
            </span>
          </div>
          <p className="text-sm text-ink-secondary mt-1">
            Real-time consumption telemetry across tokens, AI actions, messages, and model expenditures.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => usageQuery.refetch()}
          isLoading={usageQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {usageQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-page" />
          ))}
        </div>
      ) : usageQuery.isError || !usage ? (
        <ErrorState
          message={getErrorMessage(usageQuery.error, "Unable to load platform usage statistics.")}
          onRetry={() => usageQuery.refetch()}
        />
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total AI Tokens</span>
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                  <Zap className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold tracking-tight text-ink-primary">
                  {usage.tokens.total.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 text-xs text-ink-muted">
                {usage.tokens.inputTokens.toLocaleString()} prompt · {usage.tokens.outputTokens.toLocaleString()} completion
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Estimated AI Spend</span>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold tracking-tight text-emerald-700">
                  ${usage.tokens.estimatedCostUsd.toFixed(4)}
                </span>
              </div>
              <div className="mt-2 text-xs text-ink-muted">
                {usage.tokens.totalInvocations.toLocaleString()} total API invocations
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Conversations Handled</span>
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold tracking-tight text-ink-primary">
                  {usage.volumes.conversations.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 text-xs text-ink-muted">Inbound customer sessions</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Messages</span>
                <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                  <Activity className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold tracking-tight text-ink-primary">
                  {usage.volumes.messages.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 text-xs text-ink-muted">Platform customer & AI exchanges</div>
            </Card>
          </div>

          {/* 2-Column Section: Action Breakdown & Top Tenants */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* AI Action Categories */}
            <Card>
              <CardHeader>
                <CardTitle>Autonomous AI Actions by Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!usage.activitiesByCategory.length ? (
                  <p className="text-xs text-ink-muted py-4">No AI employee activities logged yet.</p>
                ) : (
                  usage.activitiesByCategory.map((item) => {
                    const percent = totalActivities > 0 ? Math.round((item.count / totalActivities) * 100) : 0;
                    return (
                      <div key={item.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold uppercase tracking-wider text-ink-primary">
                            {item.category}
                          </span>
                          <span className="text-ink-secondary">
                            {item.count} actions ({percent}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-page">
                          <div className="h-full bg-brand-600 rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Top Businesses by Volume */}
            <Card>
              <CardHeader>
                <CardTitle>Top Businesses by Activity Volume</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-line">
                  {usage.topTenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-4 hover:bg-surface-page/50">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <Link
                            href={`/admin/tenants/${t.id}`}
                            className="font-semibold text-xs text-ink-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                          <p className="text-[11px] text-ink-muted capitalize">
                            {t.plan} plan · {t.aiEmployeesCount} AI employees
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <span className="font-semibold text-ink-primary">{t.conversationsCount} convos</span>
                        <p className="text-[11px] text-ink-muted">{t.messagesCount} messages</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
