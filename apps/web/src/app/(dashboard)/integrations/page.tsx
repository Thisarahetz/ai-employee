"use client";

import { useEffect, useState } from "react";

import { useIntegrations } from "@/lib/hooks/use-integrations";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ConnectIntegrationForm } from "@/components/integrations/connect-integration-form";
import { IntegrationCard } from "@/components/integrations/integration-card";

export default function IntegrationsPage() {
  const integrationsQuery = useIntegrations();
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const list = integrationsQuery.data ?? [];
  // Connecting software is a required setup step: with nothing added yet, start the steps right away.
  // Opened once and kept open, so the one-time keys stay on screen after the list changes.
  const firstTime = integrationsQuery.isSuccess && list.length === 0;
  useEffect(() => {
    if (firstTime) setIsConnectOpen(true);
  }, [firstTime]);
  const notConnected = integrationsQuery.isSuccess && !list.some((i) => i.status === "CONNECTED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Integrations</h1>
          <p className="text-sm text-ink-secondary">
            Connect the software your business runs on (bookings, orders, CRM). AI employees can then look things up,
            take actions, answer from your real data, and react when something happens.
          </p>
        </div>
        {!firstTime && (
          <Button onClick={() => setIsConnectOpen((v) => !v)}>{isConnectOpen ? "Close" : "+ Connect your software"}</Button>
        )}
      </div>

      {notConnected && (
        <p className="rounded-md bg-status-warning/10 px-3 py-2 text-sm text-ink-primary">
          <strong>Required setup step.</strong>{" "}
          {list.length
            ? "Finish connecting below: paste the Base URL your developer sent and click Test connection."
            : "Connect your booking or business software so your AI employees work with real data."}
        </p>
      )}

      {isConnectOpen && <ConnectIntegrationForm onDone={() => setIsConnectOpen(false)} />}

      {integrationsQuery.isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      ) : integrationsQuery.isError ? (
        <ErrorState
          message={getErrorMessage(integrationsQuery.error, "Unable to load integrations.")}
          onRetry={() => integrationsQuery.refetch()}
        />
      ) : !list.length ? null : (
        <div className="space-y-4">
          {list.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      )}
    </div>
  );
}
