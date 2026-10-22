"use client";

import { useAiAgents } from "@/lib/hooks/use-ai-agents";
import { CONFIGURABLE_AGENT_TYPES } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentConfigCard } from "@/components/ai-configuration/agent-card";
import { ProviderKeysCard } from "@/components/ai-configuration/provider-keys-card";

export default function AiConfigurationPage() {
  const agentsQuery = useAiAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">AI Configuration</h1>
        <p className="text-sm text-ink-secondary">Provider, model, and business instructions per agent.</p>
      </div>

      <ProviderKeysCard />

      {agentsQuery.isLoading ? (
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      ) : agentsQuery.isError ? (
        <ErrorState
          message={getErrorMessage(agentsQuery.error, "Unable to load AI agents.")}
          onRetry={() => agentsQuery.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
          {CONFIGURABLE_AGENT_TYPES.map((type) => {
            const agent = agentsQuery.data?.find((a) => a.type === type);
            return agent ? (
              <AgentConfigCard key={type} type={type} agent={agent} />
            ) : (
              <EmptyState key={type} title={`${type} agent not configured`} description="This agent hasn't been created for this tenant yet." />
            );
          })}
        </div>
      )}
    </div>
  );
}
