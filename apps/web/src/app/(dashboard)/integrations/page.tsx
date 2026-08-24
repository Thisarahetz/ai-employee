"use client";

import { useState } from "react";

import { useIntegrations } from "@/lib/hooks/use-integrations";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConnectIntegrationForm } from "@/components/integrations/connect-integration-form";
import { IntegrationCard } from "@/components/integrations/integration-card";

export default function IntegrationsPage() {
  const integrationsQuery = useIntegrations();
  const [isConnectOpen, setIsConnectOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Integrations</h1>
          <p className="text-sm text-ink-secondary">External business systems the Action Agent can call.</p>
        </div>
        <Button onClick={() => setIsConnectOpen((v) => !v)}>{isConnectOpen ? "Close" : "+ Connect integration"}</Button>
      </div>

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
      ) : !integrationsQuery.data?.length ? (
        <EmptyState
          title="No integrations connected"
          description="Connect an external system so the AI can look up data and take action on your behalf."
        />
      ) : (
        <div className="space-y-4">
          {integrationsQuery.data.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      )}
    </div>
  );
}
