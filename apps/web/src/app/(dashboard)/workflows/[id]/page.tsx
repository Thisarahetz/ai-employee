"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useWorkflowExecutions, useWorkflows } from "@/lib/hooks/use-workflows";
import { workflowExecutionStatusStyles } from "@/lib/status-styles";
import { formatDateTime, formatDuration, getErrorMessage } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function WorkflowExecutionsPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params.id;

  // The contract doesn't expose GET /workflows/:id, so the workflow's own
  // details are found from the already-fetched list rather than a second call.
  const workflowsQuery = useWorkflows();
  const executionsQuery = useWorkflowExecutions(workflowId);

  const workflow = workflowsQuery.data?.find((w) => w.id === workflowId);

  if (workflowsQuery.isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/workflows" className="text-xs font-medium text-brand-600 hover:underline">
          &larr; All workflows
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-primary">{workflow?.name ?? "Workflow"}</h1>
        {workflow && (
          <p className="text-sm text-ink-secondary">
            {workflow.n8nWorkflowId} · triggers on <span className="font-mono">{workflow.triggerEventType}</span>
          </p>
        )}
      </div>

      <Card>
        {executionsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : executionsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(executionsQuery.error, "Unable to load executions.")}
              onRetry={() => executionsQuery.refetch()}
            />
          </div>
        ) : !executionsQuery.data?.length ? (
          <div className="p-5">
            <EmptyState title="No executions yet" description="Executions will appear here once this workflow is triggered." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Started</th>
                  <th className="px-5 py-3 font-medium">Finished</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">n8n execution ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {executionsQuery.data.map((execution) => {
                  const style = workflowExecutionStatusStyles[execution.status];
                  return (
                    <tr key={execution.id}>
                      <td className="px-5 py-3">
                        <StatusBadge {...style} />
                        {execution.status === "FAILED" && execution.errorMessage && (
                          <p className="mt-1 max-w-xs text-xs text-status-critical">{execution.errorMessage}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">{formatDateTime(execution.startedAt)}</td>
                      <td className="px-5 py-3 text-ink-secondary">{formatDateTime(execution.finishedAt)}</td>
                      <td className="px-5 py-3 text-ink-secondary">{formatDuration(execution.startedAt, execution.finishedAt)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-secondary">{execution.n8nExecutionId ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
