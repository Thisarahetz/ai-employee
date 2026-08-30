"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { CredentialType, Integration, IntegrationAction, IntegrationType } from "@/lib/types";

export function useIntegrations() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async () => (await apiClient.get<Integration[]>("/integrations")).data,
  });
}

export interface CreateIntegrationInput {
  name: string;
  type: IntegrationType;
  baseUrl?: string;
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIntegrationInput) => (await apiClient.post<Integration>("/integrations", input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/integrations/${id}`);
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export interface SetCredentialsInput {
  integrationId: string;
  type: CredentialType;
  payload: Record<string, unknown>;
}

export function useSetIntegrationCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ integrationId, type, payload }: SetCredentialsInput) => {
      await apiClient.post(`/integrations/${integrationId}/credentials`, { type, payload });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["integration-actions", variables.integrationId] });
    },
  });
}

export function useDiscoverActions(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ actions: IntegrationAction[] }>(`/integrations/${integrationId}/discover`)).data.actions,
    onSuccess: (actions) => {
      queryClient.setQueryData(["integration-actions", integrationId], actions);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
}

export function useIntegrationActions(integrationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["integration-actions", integrationId],
    queryFn: async () => (await apiClient.get<IntegrationAction[]>(`/integrations/${integrationId}/actions`)).data,
    enabled: !!integrationId && enabled,
  });
}

export interface SyncKnowledgeResult {
  integrationId: string;
  knowledgeBaseId: string;
  created: number;
  updated: number;
  removed: number;
  locationsCreated: number;
  locationsUpdated: number;
}

export function useSyncIntegrationKnowledge(integrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<SyncKnowledgeResult>(`/integrations/${integrationId}/knowledge/sync`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
  });
}
