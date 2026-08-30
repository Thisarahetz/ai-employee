"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useUpdateAgentConfiguration } from "@/lib/hooks/use-ai-agents";
import type { AgentType, AiAgent, AiProviderName } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PROVIDERS: AiProviderName[] = ["OPENAI", "ANTHROPIC", "GEMINI"];

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  ROUTER: "Classifies intent and hands off to the right specialist agent.",
  SUPPORT: "Handles general customer-support conversation.",
  KNOWLEDGE: "Answers questions from every knowledge base in this workspace, synced ones included (RAG).",
  ACTION: "Executes actions against connected external systems.",
  HUMAN: "Represents a human agent — not AI-configurable.",
};

const AGENT_NAMES: Record<AgentType, string> = {
  ROUTER: "Daniel",
  SUPPORT: "Zoe",
  KNOWLEDGE: "Jean",
  ACTION: "Felix",
  HUMAN: "Human",
};

const AGENT_COLORS: Record<AgentType, string> = {
  ROUTER: "bg-blue-500",
  SUPPORT: "bg-emerald-500",
  KNOWLEDGE: "bg-purple-500",
  ACTION: "bg-orange-500",
  HUMAN: "bg-gray-500",
};

const DEFAULT_MODELS: Record<AiProviderName, string> = {
  GEMINI: "gemini-2.5-flash",
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-3-5-sonnet-20241022",
};

export const PROVIDER_MODELS: Record<AiProviderName, { value: string; label: string }[]> = {
  GEMINI: [
    { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash (Latest)" },
    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (Fast & Ultra-cheap)" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  OPENAI: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "o1", label: "o1" },
    { value: "o3-mini", label: "o3-mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  ANTHROPIC: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { value: "claude-opus-5", label: "Claude Opus 5" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
};

export function AgentConfigCard({ type, agent }: { type: AgentType; agent: AiAgent }) {
  const updateConfiguration = useUpdateAgentConfiguration(type);

  const [provider, setProvider] = useState<AiProviderName>(agent.configuration?.provider ?? "GEMINI");
  const [model, setModel] = useState(agent.configuration?.model ?? "gemini-2.5-flash");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [temperature, setTemperature] = useState(agent.configuration?.temperature ?? 0.3);
  const [maxTokens, setMaxTokens] = useState(agent.configuration?.maxTokens ?? 1024);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Reset the form to the agent's saved values whenever it changes or the
  // modal is (re)opened, so a cancelled edit never lingers.
  useEffect(() => {
    const currentProvider = agent.configuration?.provider ?? "GEMINI";
    const currentModel = agent.configuration?.model ?? "gemini-2.5-flash";
    setProvider(currentProvider);
    setModel(currentModel);
    const available = PROVIDER_MODELS[currentProvider] ?? [];
    setIsCustomModel(!available.some((m) => m.value === currentModel));
    setTemperature(agent.configuration?.temperature ?? 0.3);
    setMaxTokens(agent.configuration?.maxTokens ?? 1024);
    setSystemPrompt(agent.systemPrompt ?? "");
  }, [agent, isEditing]);

  function handleProviderChange(newProvider: AiProviderName) {
    setProvider(newProvider);
    const newDefault = DEFAULT_MODELS[newProvider];
    setModel(newDefault);
    setIsCustomModel(false);
  }

  function handleModelChange(selectedModel: string) {
    if (selectedModel === "__custom__") {
      setIsCustomModel(true);
    } else {
      setIsCustomModel(false);
      setModel(selectedModel);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await updateConfiguration.mutateAsync({ provider, model, temperature, maxTokens, systemPrompt });
      setSavedAt(Date.now());
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "Could not save this agent's configuration."));
    }
  }

  const name = agent.name || AGENT_NAMES[type] || type;
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  const glowColor = AGENT_COLORS[type];

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-700/50 bg-[#1e2130] text-white shadow-xl">
      {/* Top half: Avatar area */}
      <div className="relative flex h-32 items-center justify-center border-b border-slate-700/30 bg-[#252838]">
        <div className={`absolute h-20 w-20 rounded-full opacity-40 blur-xl ${glowColor}`} />
        {/* eslint-disable-next-line @next/next/no-img-element -- remote dicebear SVG, no Next loader */}
        <img
          src={avatarUrl}
          alt={name}
          className="relative z-10 h-16 w-16 rounded-xl bg-white/10 object-cover shadow-md"
        />
      </div>

      {/* Bottom half: Info area */}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded bg-slate-700/50 px-2 py-1 text-xs font-medium text-slate-300">{name}</span>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
          >
            Configure ⚙️
          </button>
        </div>

        <h3 className="mb-1 text-base font-semibold text-white">
          {type.charAt(0) + type.slice(1).toLowerCase()} Agent
        </h3>

        <p className="mb-3 line-clamp-2 min-h-[32px] text-xs text-slate-400">{AGENT_DESCRIPTIONS[type]}</p>

        {/* Active configuration badges */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          <span className="rounded border border-blue-500/30 bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-300">
            {agent.configuration?.provider ?? "GEMINI"}
          </span>
          <span
            className="max-w-[130px] truncate rounded border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 font-mono text-[11px] text-purple-300"
            title={agent.configuration?.model ?? "gemini-2.5-flash"}
          >
            {agent.configuration?.model ?? "gemini-2.5-flash"}
          </span>
          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
            t: {agent.configuration?.temperature ?? 0.3}
          </span>
        </div>

        {savedAt && Date.now() - savedAt < 5000 && !isEditing && (
          <p className="mt-3 text-xs font-medium text-emerald-400">✓ Changes saved</p>
        )}
      </div>

      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title={`Configure ${type.charAt(0) + type.slice(1).toLowerCase()} Agent`}
        description={AGENT_DESCRIPTIONS[type]}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProviderName)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Select
              label="Model"
              value={isCustomModel ? "__custom__" : model}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {(PROVIDER_MODELS[provider] ?? []).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="__custom__">Custom model...</option>
            </Select>
          </div>

          {isCustomModel && (
            <Input
              label="Custom Model Name"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gpt-4o-2024-08-06"
              required
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            label="System prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsEditing(false)} disabled={updateConfiguration.isPending}>
              Cancel
            </Button>
            <Button type="submit" isLoading={updateConfiguration.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
