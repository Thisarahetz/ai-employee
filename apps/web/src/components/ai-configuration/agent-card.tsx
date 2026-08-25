"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useUpdateAgentConfiguration } from "@/lib/hooks/use-ai-agents";
import type { AgentType, AiAgent, AiProviderName } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PROVIDERS: AiProviderName[] = ["OPENAI", "ANTHROPIC", "GEMINI"];

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  ROUTER: "Classifies intent and hands off to the right specialist agent.",
  SUPPORT: "Handles general customer-support conversation.",
  KNOWLEDGE: "Answers questions using the tenant's knowledge base (RAG).",
  ACTION: "Executes actions against connected external systems.",
  HUMAN: "Represents a human agent — not AI-configurable.",
};

export function AgentConfigCard({ type, agent }: { type: AgentType; agent: AiAgent }) {
  const updateConfiguration = useUpdateAgentConfiguration(type);

  const [provider, setProvider] = useState<AiProviderName>(agent.configuration?.provider ?? "OPENAI");
  const [model, setModel] = useState(agent.configuration?.model ?? "");
  const [temperature, setTemperature] = useState(agent.configuration?.temperature ?? 0.3);
  const [maxTokens, setMaxTokens] = useState(agent.configuration?.maxTokens ?? 1024);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync local form state if the agent refetches with new server data.
  useEffect(() => {
    setProvider(agent.configuration?.provider ?? "OPENAI");
    setModel(agent.configuration?.model ?? "");
    setTemperature(agent.configuration?.temperature ?? 0.3);
    setMaxTokens(agent.configuration?.maxTokens ?? 1024);
    setSystemPrompt(agent.systemPrompt ?? "");
  }, [agent]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await updateConfiguration.mutateAsync({ provider, model, temperature, maxTokens, systemPrompt });
      setSavedAt(Date.now());
    } catch (err) {
      setError(getErrorMessage(err, "Could not save this agent's configuration."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{agent.name || type}</CardTitle>
          <Badge color={agent.isEnabled ? "green" : "gray"}>{agent.isEnabled ? "Enabled" : "Disabled"}</Badge>
        </div>
        <CardDescription>{AGENT_DESCRIPTIONS[type]}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value as AiProviderName)}>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
            <Input
              label="Max tokens"
              type="number"
              min={1}
              step={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
            />
          </div>

          <Textarea
            label="System prompt / business instructions"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
          />

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" isLoading={updateConfiguration.isPending}>
              Save changes
            </Button>
            {savedAt && !updateConfiguration.isPending && (
              <span className="text-xs text-status-good">Saved</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
