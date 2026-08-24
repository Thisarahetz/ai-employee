"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { AgentType, AiAgent, AiProviderName } from "@/lib/types";

export function useAiAgents() {
  return useQuery({
    queryKey: ["ai-agents"],
    queryFn: async () => (await apiClient.get<AiAgent[]>("/ai-agents")).data,
  });
}

export interface UpdateAgentConfigurationInput {
  provider: AiProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export function useUpdateAgentConfiguration(type: AgentType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAgentConfigurationInput) =>
      (await apiClient.patch<AiAgent>(`/ai-agents/${type}/configuration`, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents"] }),
  });
}
