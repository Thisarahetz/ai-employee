"use client";

import { useState } from "react";
import { useAdminAiUsage, useAdminSetTenantAi } from "@/lib/hooks/use-business-setup";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

/** Real AI spend across all businesses, from provider-reported usage. */
export function AiCostSection() {
  const [days, setDays] = useState(30);
  const q = useAdminAiUsage(days);
  const setAi = useAdminSetTenantAi();
  const [err, setErr] = useState<string | null>(null);

  if (q.isLoading) return <Card className="h-64 animate-pulse" />;
  if (q.isError || !q.data) return <ErrorState message={getErrorMessage(q.error, "Unable to load AI usage.")} onRetry={() => q.refetch()} />;
  const d = q.data;
  const max = Math.max(0.000001, ...d.daily.map((x) => x.costUsd));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>AI cost by business</CardTitle>
          <select className="rounded-md border border-line px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Period", usd(d.totals.costUsd)],
            ["Today (UTC)", usd(d.totals.costTodayUsd)],
            ["This month", usd(d.totals.costMonthUsd)],
            ["Model calls", d.totals.calls.toLocaleString()],
            ["Businesses using AI", `${d.totals.activeTenants} (${d.totals.tenantsWithOwnKeys} own keys)`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-page px-3 py-2">
              <div className="text-xs text-ink-muted">{k}</div>
              <div className="text-base font-semibold text-ink-primary">{v}</div>
            </div>
          ))}
        </div>

        {d.daily.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-ink-muted">Daily spend</div>
            <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Daily AI spend">
              {d.daily.map((x) => (
                <div
                  key={x.date}
                  title={`${x.date}: ${usd(x.costUsd)} · ${x.calls} calls`}
                  className="flex-1 rounded-t bg-brand-500"
                  style={{ height: `${Math.max(2, (x.costUsd / max) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-status-critical">{err}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-ink-muted">
              <tr>
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Month / budget</th>
                <th className="py-2 pr-3">Tasks ok / failed</th>
                <th className="py-2 pr-3">AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.byTenant.map((t) => (
                <tr key={t.tenantId}>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-ink-primary">{t.name}</div>
                    <div className="text-xs text-ink-muted">
                      {t.slug} {t.usesOwnKeys && <Badge color="purple">own keys</Badge>}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{usd(t.costUsd)}</td>
                  <td className="py-2 pr-3">
                    {usd(t.costMonthUsd)} / {t.monthlyBudgetUsd == null ? "no limit" : usd(t.monthlyBudgetUsd)}
                    {t.monthlyBudgetUsedPct != null && t.monthlyBudgetUsedPct >= 80 && (
                      <Badge color={t.monthlyBudgetUsedPct >= 100 ? "red" : "amber"}>{t.monthlyBudgetUsedPct}%</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {t.tasksCompleted} / {t.tasksFailed}
                    {t.tasksBlocked > 0 && <span className="text-xs text-ink-muted"> · {t.tasksBlocked} blocked</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <Button
                      size="sm"
                      variant={t.aiEnabled ? "secondary" : "primary"}
                      isLoading={setAi.isPending && setAi.variables?.tenantId === t.tenantId}
                      onClick={async () => {
                        if (t.aiEnabled && !confirm(`Switch off the AI workforce for ${t.name}? Their tasks and schedules stop until it is switched back on.`)) return;
                        setErr(null);
                        try {
                          await setAi.mutateAsync({ tenantId: t.tenantId, aiEnabled: !t.aiEnabled });
                        } catch (e) {
                          setErr(getErrorMessage(e));
                        }
                      }}
                    >
                      {t.aiEnabled ? "Switch off" : "Switch on"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!d.byTenant.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-ink-muted">
                    No AI usage in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {d.byModel.length > 0 && (
          <div className="text-xs text-ink-secondary">
            <span className="font-semibold text-ink-primary">By model: </span>
            {d.byModel.map((m) => `${m.model} ${usd(m.costUsd)} (${m.calls})`).join(" · ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
