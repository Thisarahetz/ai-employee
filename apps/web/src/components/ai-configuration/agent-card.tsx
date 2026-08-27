"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useUpdateAgentConfiguration } from "@/lib/hooks/use-ai-agents";
import type { AgentType, AiAgent, AiProviderName } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PROVIDERS: AiProviderName[] = ["OPENAI", "ANTHROPIC", "GEMINI"];

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  ROUTER: "Classifies intent and hands off to the right specialist agent.",
  SUPPORT: "Handles general customer-support conversation.",
  KNOWLEDGE: "Answers questions using the tenant's knowledge base (RAG).",
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

export function AgentConfigCard({ type, agent }: { type: AgentType; agent: AiAgent }) {
  const updateConfiguration = useUpdateAgentConfiguration(type);

  const [provider, setProvider] = useState<AiProviderName>(agent.configuration?.provider ?? "GEMINI");
  const [model, setModel] = useState(agent.configuration?.model ?? "gemini-2.5-flash");
  const [temperature, setTemperature] = useState(agent.configuration?.temperature ?? 0.3);
  const [maxTokens, setMaxTokens] = useState(agent.configuration?.maxTokens ?? 1024);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setProvider(agent.configuration?.provider ?? "GEMINI");
    setModel(agent.configuration?.model ?? "gemini-2.5-flash");
    setTemperature(agent.configuration?.temperature ?? 0.3);
    setMaxTokens(agent.configuration?.maxTokens ?? 1024);
    setSystemPrompt(agent.systemPrompt ?? "");
  }, [agent]);

  function handleProviderChange(newProvider: AiProviderName) {
    setProvider(newProvider);
    // If the model matches any provider default or is empty, suggest the new default
    const isOldDefault = Object.values(DEFAULT_MODELS).includes(model) || !model;
    if (isOldDefault) {
      setModel(DEFAULT_MODELS[newProvider]);
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
    <div className="flex flex-col rounded-xl border border-slate-700/50 bg-[#1e2130] text-white shadow-xl overflow-hidden transition-all duration-300">
      {/* Top half: Avatar area */}
      <div className="relative flex h-32 items-center justify-center bg-[#252838] border-b border-slate-700/30">
        <div className={`absolute h-20 w-20 rounded-full blur-xl opacity-40 ${glowColor}`} />
        <img src={avatarUrl} alt={name} className="relative z-10 h-16 w-16 rounded-xl object-cover bg-white/10 shadow-md" />
      </div>

      {/* Bottom half: Info area */}
      <div className="flex flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded bg-slate-700/50 px-2 py-1 text-xs font-medium text-slate-300">
            {name}
          </span>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            {isEditing ? 'Close' : 'Configure ⚙️'}
          </button>
        </div>
        
        <h3 className="mb-1 text-base font-semibold text-white">
          {type.charAt(0) + type.slice(1).toLowerCase()} Agent
        </h3>
        
        <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] mb-3">
          {AGENT_DESCRIPTIONS[type]}
        </p>

        {/* Active Configuration Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-300 border border-blue-500/30">
            {agent.configuration?.provider ?? "GEMINI"}
          </span>
          <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[11px] font-mono text-purple-300 border border-purple-500/30 truncate max-w-[130px]" title={agent.configuration?.model ?? "gemini-2.5-flash"}>
            {agent.configuration?.model ?? "gemini-2.5-flash"}
          </span>
          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
            t: {agent.configuration?.temperature ?? 0.3}
          </span>
        </div>

        {savedAt && Date.now() - savedAt < 5000 && !isEditing && (
          <p className="mt-3 text-xs text-emerald-400 font-medium">✓ Changes saved</p>
        )}
      </div>

      {/* Expandable config form */}
      {isEditing && (
        <div className="border-t border-slate-700/50 bg-[#191b28] p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 border border-red-500/20">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProviderName)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={DEFAULT_MODELS[provider]}
                  required
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Temperature</label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Max tokens</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">System prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" size="sm" isLoading={updateConfiguration.isPending} className="bg-blue-600 text-white hover:bg-blue-700">
                Save changes
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-white">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

