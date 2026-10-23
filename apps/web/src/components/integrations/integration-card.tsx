"use client";

import { useState } from "react";

import {
  useDeleteIntegration,
  useIntegrationActions,
  useRenewDeveloperKit,
  useTestIntegration,
  useUpdateIntegration,
} from "@/lib/hooks/use-integrations";
import type { Integration } from "@/lib/types";
import type { DeveloperKit } from "@/lib/developer-guide";
import { Input } from "@/components/ui/input";
import { DeveloperKitPanel } from "@/components/integrations/developer-kit-panel";
import { integrationStatusStyles } from "@/lib/status-styles";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export function IntegrationCard({ integration }: { integration: Integration }) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [kit, setKit] = useState<DeveloperKit | null>(null);
  const test = useTestIntegration(integration.id);
  const update = useUpdateIntegration();
  const renew = useRenewDeveloperKit();
  const deleteIntegration = useDeleteIntegration();
  const actionsQuery = useIntegrationActions(integration.id, actionsVisible);

  const style = integrationStatusStyles[integration.status];

  async function runTest() {
    setMessage(null);
    try {
      const r = await test.mutateAsync(integration.id);
      setMessage({ ok: r.ok, text: r.message });
    } catch (err) {
      setMessage({ ok: false, text: getErrorMessage(err, "Could not test the connection.") });
    }
  }

  async function saveBaseUrl() {
    const url = baseUrl.trim().replace(/\/+$/, "").replace(/\/ai(\/actions)?$/, "");
    if (!url) return;
    try {
      await update.mutateAsync({ id: integration.id, baseUrl: url });
      await runTest();
    } catch (err) {
      setMessage({ ok: false, text: getErrorMessage(err, "Could not save the Base URL.") });
    }
  }

  async function newKit() {
    if (!window.confirm("Create new keys? The current keys stop working right away, so your developer must update them.")) return;
    try {
      const r = await renew.mutateAsync(integration.id);
      setKit({ name: integration.name, apiKey: r.apiKey, webhookUrl: r.webhookUrl, webhookSecret: r.webhookSecret });
    } catch (err) {
      setMessage({ ok: false, text: getErrorMessage(err, "Could not create new keys.") });
    }
  }

  return (
    <Card>
      <CardHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {integration.baseUrl && (
              <Button size="sm" variant="secondary" isLoading={test.isPending} onClick={runTest}>
                Test connection
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setActionsVisible((v) => !v)}>
              {actionsVisible ? "Hide actions" : "Actions"}
            </Button>
            <Button size="sm" variant="ghost" isLoading={renew.isPending} onClick={newKit}>
              New developer kit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isLoading={deleteIntegration.isPending}
              onClick={() => window.confirm(`Remove ${integration.name}? AI employees will no longer use it.`) && deleteIntegration.mutate(integration.id)}
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
        <CardDescription>{integration.baseUrl ?? "Waiting for the Base URL from your developer"}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 border-b border-line text-sm">
        <ul className="grid gap-1 text-ink-secondary sm:grid-cols-3">
          <li>{integration.actionsCount ? `✓ ${integration.actionsCount} action(s) available` : "○ No actions yet"}</li>
          <li>{integration.lastKnowledgeSyncAt ? `✓ Knowledge synced ${formatDateTime(integration.lastKnowledgeSyncAt)}` : "○ Knowledge not synced"}</li>
          <li>
            {integration.lastEventAt
              ? `✓ Last event ${integration.lastEventType} ${formatDateTime(integration.lastEventAt)}`
              : "○ No events received yet"}
          </li>
        </ul>
        {!integration.baseUrl && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <Input
                label="Base URL from your developer"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.yourapp.com"
              />
            </div>
            <Button size="sm" isLoading={update.isPending || test.isPending} onClick={saveBaseUrl}>
              Save and test
            </Button>
          </div>
        )}
        {message && <p className={message.ok ? "text-emerald-700" : "text-status-critical"}>{message.text}</p>}
        {kit && <DeveloperKitPanel kit={kit} />}
      </CardContent>

      {actionsVisible && (
        <CardContent>
          {actionsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded bg-surface-page" />
          ) : actionsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(actionsQuery.error, "Unable to load actions.")}
              onRetry={() => actionsQuery.refetch()}
            />
          ) : !actionsQuery.data?.length ? (
            <EmptyState title="No actions yet" description='Click "Test connection" once the Base URL is added.' />
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
