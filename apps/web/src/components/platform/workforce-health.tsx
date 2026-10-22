"use client";

import { useAdminSystemHealth } from "@/lib/hooks/use-business-setup";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

/** AI workforce health across all tenants: queue, stuck work and recent failures. */
export function WorkforceHealth() {
  const q = useAdminSystemHealth();
  if (q.isLoading) return <Card className="h-40 animate-pulse" />;
  if (q.isError || !q.data) return <ErrorState message={getErrorMessage(q.error, "Unable to load AI workforce health.")} onRetry={() => q.refetch()} />;
  const h = q.data;
  const tiles: [string, number, boolean][] = [
    ["Running now", h.tasks.running, false],
    ["Stale (worker down?)", h.tasks.staleRunning, h.tasks.staleRunning > 0],
    ["Queued > 10 min", h.tasks.overdueQueued, h.tasks.overdueQueued > 0],
    ["Failed (24h)", h.tasks.failedLast24h, h.tasks.failedLast24h > 0],
    ["Blocked by limits", h.tasks.blockedByLimits, false],
    ["Rules with errors", h.automationRulesWithErrors, h.automationRulesWithErrors > 0],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>AI workforce</CardTitle>
          <Badge color={h.status === "healthy" ? "green" : "amber"}>{h.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {h.issues.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
            {h.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {tiles.map(([label, n, warn]) => (
            <div key={label} className="rounded-lg bg-surface-page px-3 py-2 text-center">
              <div className="text-xs text-ink-muted">{label}</div>
              <div className={warn ? "text-lg font-semibold text-status-critical" : "text-lg font-semibold text-ink-primary"}>{n}</div>
            </div>
          ))}
        </div>
        {h.recentFailures.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink-primary">Recent failures</h4>
            <ul className="divide-y divide-line text-xs">
              {h.recentFailures.map((f) => (
                <li key={f.id} className="py-2">
                  <span className="font-medium text-ink-primary">{f.tenant.name}</span> · {f.title} ·{" "}
                  <span className="text-ink-muted">{formatDateTime(f.updatedAt)}</span>
                  <div className="text-status-critical">{f.error}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
