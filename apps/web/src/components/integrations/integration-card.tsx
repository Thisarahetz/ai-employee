"use client";

import { useState } from "react";

import {
  useDeleteIntegration,
  useDiscoverActions,
  useIntegrationActions,
  useSyncIntegrationKnowledge,
} from "@/lib/hooks/use-integrations";
import type { Integration } from "@/lib/types";
import { integrationStatusStyles } from "@/lib/status-styles";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export function IntegrationCard({ integration }: { integration: Integration }) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const discoverActions = useDiscoverActions(integration.id);
  const syncKnowledge = useSyncIntegrationKnowledge(integration.id);
  const deleteIntegration = useDeleteIntegration();
  const actionsQuery = useIntegrationActions(integration.id, actionsVisible);

  const style = integrationStatusStyles[integration.status];

  async function handleDiscover() {
    await discoverActions.mutateAsync();
    setActionsVisible(true);
  }

  async function handleSyncKnowledge() {
    setSyncResult(null);
    setSyncError(null);
    try {
      const result = await syncKnowledge.mutateAsync();
      const docs = `Documents: ${result.created} added, ${result.updated} updated, ${result.removed} removed`;
      const locs =
        result.locationsCreated || result.locationsUpdated
          ? `. Locations: ${result.locationsCreated} added, ${result.locationsUpdated} updated`
          : "";
      setSyncResult(`Synced from ${integration.name} — ${docs}${locs}.`);
    } catch (err) {
      setSyncError(getErrorMessage(err, "Could not sync knowledge from this integration."));
    }
  }

  return (
    <Card>
      <CardHeader
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              isLoading={syncKnowledge.isPending}
              onClick={handleSyncKnowledge}
            >
              Sync knowledge base
            </Button>
            <Button size="sm" variant="secondary" isLoading={discoverActions.isPending} onClick={handleDiscover}>
              Discover actions
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isLoading={deleteIntegration.isPending}
              onClick={() => deleteIntegration.mutate(integration.id)}
            >
              Remove
            </Button>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <CardTitle>{integration.name}</CardTitle>
          <StatusBadge {...style} />
        </div>
        <CardDescription>
          {integration.type}
          {integration.baseUrl ? ` · ${integration.baseUrl}` : ""}
          {integration.lastKnowledgeSyncAt
            ? ` · knowledge synced ${formatDateTime(integration.lastKnowledgeSyncAt)}`
            : ""}
        </CardDescription>
      </CardHeader>

      {(syncResult || syncError) && (
        <CardContent className="border-b border-line">
          {syncError ? (
            <p className="text-sm text-status-critical">{syncError}</p>
          ) : (
            <p className="text-sm text-ink-secondary">{syncResult}</p>
          )}
        </CardContent>
      )}

      {(actionsVisible || discoverActions.isError) && (
        <CardContent>
          {discoverActions.isError ? (
            <ErrorState message={getErrorMessage(discoverActions.error, "Could not discover actions.")} />
          ) : actionsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded bg-surface-page" />
          ) : actionsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(actionsQuery.error, "Unable to load actions.")}
              onRetry={() => actionsQuery.refetch()}
            />
          ) : !actionsQuery.data?.length ? (
            <EmptyState title="No actions discovered yet" description='Click "Discover actions" to query this system.' />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Action</th>
                  <th className="py-1.5 pr-2 font-medium">Description</th>
                  <th className="py-1.5 pr-2 font-medium">Enabled</th>
                  <th className="py-1.5 font-medium">Discovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {actionsQuery.data.map((action) => (
                  <tr key={action.id}>
                    <td className="py-2 pr-2 font-mono text-xs font-medium text-ink-primary">{action.name}</td>
                    <td className="py-2 pr-2 text-ink-secondary">{action.description}</td>
                    <td className="py-2 pr-2 text-ink-secondary">{action.isEnabled ? "Yes" : "No"}</td>
                    <td className="py-2 text-ink-secondary">{formatDateTime(action.lastDiscoveredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      )}
    </Card>
  );
}
