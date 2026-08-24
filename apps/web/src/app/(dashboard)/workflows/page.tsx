"use client";

import Link from "next/link";

import { useToggleWorkflow, useWorkflows } from "@/lib/hooks/use-workflows";
import { getErrorMessage } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";

export default function WorkflowsPage() {
  const workflowsQuery = useWorkflows();
  const toggleWorkflow = useToggleWorkflow();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Workflows</h1>
        <p className="text-sm text-ink-secondary">n8n automations triggered by AI Employee&apos;s internal event bus.</p>
      </div>

      <Card>
        {workflowsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : workflowsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(workflowsQuery.error, "Unable to load workflows.")}
              onRetry={() => workflowsQuery.refetch()}
            />
          </div>
        ) : !workflowsQuery.data?.length ? (
          <div className="p-5">
            <EmptyState title="No workflows" description="Workflows created in n8n and registered with AI Employee will appear here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">n8n workflow ID</th>
                  <th className="px-5 py-3 font-medium">Trigger event</th>
                  <th className="px-5 py-3 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {workflowsQuery.data.map((workflow) => (
                  <tr key={workflow.id} className="hover:bg-surface-page">
                    <td className="px-5 py-3">
                      <Link href={`/workflows/${workflow.id}`} className="font-medium text-brand-600 hover:underline">
                        {workflow.name}
                      </Link>
                      {workflow.description && <p className="text-xs text-ink-muted">{workflow.description}</p>}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-secondary">{workflow.n8nWorkflowId}</td>
                    <td className="px-5 py-3">
                      <Badge color="gray">{workflow.triggerEventType}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={workflow.isEnabled}
                        onClick={() =>
                          toggleWorkflow.mutate({ id: workflow.id, isEnabled: !workflow.isEnabled })
                        }
                        disabled={toggleWorkflow.isPending}
                        className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-60 ${
                          workflow.isEnabled ? "bg-brand-600" : "bg-ink-muted/30"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                            workflow.isEnabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
