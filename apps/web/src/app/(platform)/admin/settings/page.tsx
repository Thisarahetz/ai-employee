"use client";

import { useAdminSettings } from "@/lib/hooks/use-admin";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type Row = { value: unknown; env: string };

const LABELS: Record<string, string> = {
  defaultProvider: "Default AI provider",
  defaultModel: "Default model",
  platformKeysAllowed: "Businesses may use the platform's AI keys",
  dailyBudgetUsd: "Daily AI budget per business (USD)",
  monthlyBudgetUsd: "Monthly AI budget per business (USD)",
  maxTaskCostUsd: "Max cost per task (USD)",
  maxTaskSteps: "Max steps per task",
  maxConcurrentTasks: "Tasks at the same time per business",
  maxTasksPerDay: "Tasks per day per business",
  maxSchedules: "Active schedules per business",
  rateLimitPerMinute: "API requests per minute per IP",
  corsOrigins: "Allowed web origins",
  integrationPrivateNetwork: "Integrations may reach private networks",
  runsWorker: "This instance runs background workers",
  concurrency: "Worker concurrency",
};

const show = (v: unknown) => (v === null ? "No limit" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

function Section({ title, rows }: { title: string; rows: Record<string, Row> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-line text-sm">
          {Object.entries(rows).map(([k, r]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <dt className="text-ink-secondary">{LABELS[k] ?? k}</dt>
              <dd className="flex items-center gap-3">
                <span className="font-medium text-ink-primary">{show(r.value)}</span>
                <code className="rounded bg-surface-page px-1.5 py-0.5 text-[11px] text-ink-muted">{r.env}</code>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * Effective platform configuration. Values come from environment variables so
 * every instance behaves the same and changes ship with deployments — this
 * page shows them, it does not change them.
 */
export default function AdminSettingsPage() {
  const q = useAdminSettings();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Platform settings</h1>
        <p className="text-sm text-ink-secondary">
          The configuration this platform is running with. Change a value by setting the environment variable shown and redeploying.
          {q.data ? ` ${q.data.perTenantOverrides}` : ""}
        </p>
      </div>
      {q.isLoading ? (
        <Card className="h-64 animate-pulse" />
      ) : q.isError || !q.data ? (
        <ErrorState message={getErrorMessage(q.error, "Unable to load platform settings.")} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Section title="AI" rows={q.data.ai as unknown as Record<string, Row>} />
          <Section title="Default limits for every business" rows={q.data.defaultTenantLimits as Record<string, Row>} />
          <Section title="Security" rows={q.data.security as Record<string, Row>} />
          <Section title="Background workers" rows={q.data.workers as Record<string, Row>} />
          <Card>
            <CardHeader>
              <CardTitle>Removing data</CardTitle>
              <CardDescription>
                There is no &quot;wipe everything&quot; button. To remove one business permanently (for example a data-erasure request),
                delete it from Tenants, or run <code>scripts/delete-tenant.ts</code>, which shows exactly what will be removed first.
              </CardDescription>
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}
